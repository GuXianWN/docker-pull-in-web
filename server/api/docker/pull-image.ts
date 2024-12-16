import axios from "axios";
import { getProxyAgent } from "~/utils/proxy";
import { createWriteStream, existsSync, mkdirSync, statSync } from "fs";
import { join } from "path";
import { promises as fs } from "fs";

const enableCache = process.env.ENABLE_CACHE !== 'false'; // 默认启用缓存

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

export default defineEventHandler(async (event) => {
  // 设置SSE响应头
  setHeader(event, "Content-Type", "text/event-stream");
  setHeader(event, "Cache-Control", "no-cache");
  setHeader(event, "Connection", "keep-alive");

  const query = getQuery(event);
  const { imageName, token, layers: layersJson } = query as unknown as QueryParams;

  if (!token) {
    throw createError({
      statusCode: 401,
      message: "未提供token",
    });
  }

  const layers = JSON.parse(layersJson) as DockerLayer[];

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
  };

  // 下载单个层
  const downloadLayer = async (layer: DockerLayer): Promise<LayerDownloadResult> => {
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

      const httpsAgent = getProxyAgent();
      const response = await axios.get(
        `https://registry-1.docker.io/v2/library/${imageName}/blobs/${layer.digest}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: "stream",
          ...(httpsAgent && { httpsAgent }),
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
      return {
        success: false,
        digest: layer.digest,
        error: error.message,
      };
    }
  };

  try {
    // 创建下载队列
    const queue = layers.slice();
    const activeDownloads = new Set<string>();
    const results: LayerDownloadResult[] = [];

    // 处理下一个下载任务
    const processNextLayer = async () => {
      if (queue.length === 0) return;

      const layer = queue.shift()!;
      activeDownloads.add(layer.digest);

      try {
        const result = await downloadLayer(layer);
        results.push(result);
      } finally {
        activeDownloads.delete(layer.digest);

        if (queue.length > 0) {
          processNextLayer();
        }
      }
    };

    // 启动初始并发下载
    const initialDownloads = Math.min(CONCURRENT_DOWNLOADS, layers.length);
    const downloadPromises = Array(initialDownloads)
      .fill(null)
      .map(() => processNextLayer());

    // 等待所有下载完成
    await Promise.all(downloadPromises);

    // 检查下载结果
    const failedDownloads = results.filter((result) => !result.success);
    if (failedDownloads.length > 0) {
      throw new Error(
        `部分层下载失败: ${failedDownloads.map((f) => f.digest).join(", ")}`
      );
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

    // 发送下载汇总信息后，判断是否需要清理缓存
    if (!enableCache) {
      try {
        await fs.rm(downloadDir, { recursive: true, force: true });
        console.log(`已清理下载缓存: ${downloadDir}`);
      } catch (e) {
        console.warn('清理下载缓存失败:', e);
      }
    }

    return;
  } catch (error: any) {
    throw createError({
      statusCode: 500,
      message: error.message,
    });
  }
}); 