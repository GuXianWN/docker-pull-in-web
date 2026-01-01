import { createWriteStream, existsSync, mkdirSync, statSync } from "fs";
import { join } from "path";
import axiosInstance from "~/server/config/axios";
import { normalizeImageName } from "~/server/utils/imageName";
import { logger } from "~/server/utils/logger";

// 请求参数接口
type QueryParams = {
  imageName: string;
  token: string;
  layers: string;
};

// Docker层接口
type DockerLayer = {
  digest: string;
  size: number;
  mediaType: string;
};

// 下载进度接口
type DownloadProgress = {
  layerDigest: string;
  downloadedSize: number;
  totalSize: number;
  percentage: number;
};

// 层下载结果接口
type LayerDownloadResult = {
  success: boolean;
  fileName?: string;
  digest: string;
  error?: string;
  skipped?: boolean;
};

// 文件信息接口
type FileInfo = {
  exists: boolean;
  path: string;
  size?: number;
};

const CONCURRENT_DOWNLOADS = 3;
const LAYER_TIMEOUT_MS = Math.max(
  1000,
  parseInt(process.env.PULL_LAYER_TIMEOUT_MS || "600000", 10)
);

export default defineEventHandler(async (event) => {
  // 设置SSE响应头
  setHeader(event, "Content-Type", "text/event-stream");
  setHeader(event, "Cache-Control", "no-cache");
  setHeader(event, "Connection", "keep-alive");
  event.node.res.flushHeaders?.();

  const query = getQuery(event);
  const { imageName: rawImageName, token, layers: layersJson } = query as unknown as QueryParams;
  const imageName = normalizeImageName(rawImageName || "");

  if (!token) {
    throw createError({
      statusCode: 401,
      message: "未提供token",
    });
  }

  const layers = JSON.parse(layersJson) as DockerLayer[];
  logger.info("pull start", { imageName, layers: layers.length, concurrency: CONCURRENT_DOWNLOADS });

  // 创建下载目录
  const downloadDir = join(process.cwd(), "downloads", imageName);
  if (!existsSync(downloadDir)) {
    mkdirSync(downloadDir, { recursive: true });
  }

  // 检查层文件是否存在
  const checkLayerFile = (layer: DockerLayer): FileInfo => {
    const fileName = `${layer.digest.replace(":", "_")}.tar`;
    const filePath = join(downloadDir, fileName);

    if (existsSync(filePath)) {
      const stats = statSync(filePath);
      if (stats.size === layer.size) {
        return {
          exists: true,
          path: filePath,
          size: stats.size,
        };
      }
    }

    return {
      exists: false,
      path: filePath,
    };
  };

  // 发送进度更新
  const sendProgress = (progress: DownloadProgress) => {
    event.node.res.write(`data: ${JSON.stringify(progress)}\n\n`);
    (event.node.res as any).flush?.();
  };
  const sendError = (message: string, details?: string[]) => {
    event.node.res.write(
      `data: ${JSON.stringify({
        error: message,
        details,
      })}\n\n`
    );
    (event.node.res as any).flush?.();
  };

  // 下载单个层
  const downloadLayer = async (layer: DockerLayer): Promise<LayerDownloadResult> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort(new Error("timeout"));
    }, LAYER_TIMEOUT_MS);
    try {
      const fileInfo = checkLayerFile(layer);

      if (fileInfo.exists) {
        sendProgress({
          layerDigest: layer.digest,
          downloadedSize: layer.size,
          totalSize: layer.size,
          percentage: 100,
        });

        return {
          success: true,
          fileName: fileInfo.path,
          digest: layer.digest,
          skipped: true,
        };
      }

      const response = await axiosInstance.get(
        `https://registry-1.docker.io/v2/${imageName}/blobs/${layer.digest}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: "stream",
          signal: controller.signal,
        }
      );

      if (response.status !== 200) {
        throw new Error(`HTTP状态码 ${response.status}`);
      }

      const writeStream = createWriteStream(fileInfo.path);
      let downloadedSize = 0;
      const totalSize = parseInt(
        response.headers["content-length"] || layer.size.toString()
      );

      response.data.on("data", (chunk: Buffer) => {
        downloadedSize += chunk.length;
        const percentage = Math.round((downloadedSize / totalSize) * 100);

        sendProgress({
          layerDigest: layer.digest,
          downloadedSize,
          totalSize,
          percentage,
        });
      });

      await new Promise((resolve, reject) => {
        const onAbort = () => reject(new Error("timeout"));
        controller.signal.addEventListener("abort", onAbort, { once: true });
        writeStream.on("finish", resolve);
        writeStream.on("error", reject);
        response.data.on("error", reject);
        response.data.pipe(writeStream);
      });

      return {
        success: true,
        fileName: fileInfo.path,
        digest: layer.digest,
        skipped: false,
      };
    } catch (error: any) {
      if (String(error?.message).toLowerCase().includes("timeout")) {
        return {
          success: false,
          digest: layer.digest,
          error: "timeout",
        };
      }
      return {
        success: false,
        digest: layer.digest,
        error: error.message,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  };

  try {
    // 创建下载队列
    const queue = layers.slice();
    const activeDownloads = new Set<string>();
    const results: LayerDownloadResult[] = [];

    // 处理下载任务（worker loop）
    const processQueue = async () => {
      while (true) {
        const layer = queue.shift();
        if (!layer) return;

        activeDownloads.add(layer.digest);
        try {
          const result = await downloadLayer(layer);
          results.push(result);
        } finally {
          activeDownloads.delete(layer.digest);
        }
      }
    };

    // 启动初始并发下载
    const initialDownloads = Math.min(CONCURRENT_DOWNLOADS, layers.length);
    const downloadPromises = Array(initialDownloads)
      .fill(null)
      .map(() => processQueue());

    // 等待所有下载完成
    await Promise.all(downloadPromises);

    // 检查下载结果
    const failedDownloads = results.filter((result) => !result.success);
    if (failedDownloads.length > 0) {
      const timedOut = failedDownloads.filter((f) => f.error === "timeout");
      if (timedOut.length > 0) {
        sendError(
          `部分层下载超时（${timedOut.length} 个），请重试`,
          timedOut.map((f) => f.digest)
        );
        logger.warn("pull timeout", {
          imageName,
          timedOut: timedOut.length,
        });
        return;
      }
      sendError(
        `部分层下载失败（${failedDownloads.length} 个），请重试`,
        failedDownloads.map((f) => f.digest)
      );
      logger.error("pull failed layers", {
        imageName,
        failed: failedDownloads.length,
      });
      return;
    }

    // 发送下载汇总信息
    const skippedLayers = results.filter((r) => r.skipped).length;
    const downloadedLayers = results.filter((r) => !r.skipped).length;

    event.node.res.write(
      `data: ${JSON.stringify({
        summary: {
          total: results.length,
          skipped: skippedLayers,
          downloaded: downloadedLayers,
        },
      })}\n\n`
    );
    (event.node.res as any).flush?.();
    logger.info("pull complete", {
      imageName,
      total: results.length,
      skipped: skippedLayers,
      downloaded: downloadedLayers,
    });


    return;
  } catch (error: any) {
    logger.error("pull failed", { imageName, message: error.message });
    throw createError({
      statusCode: 500,
      message: error.message,
    });
  }
}); 
