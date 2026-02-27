import { createWriteStream, existsSync, mkdirSync, statSync } from "fs";
import type { ServerResponse } from "node:http";
import { join } from "path";
import type { H3Event } from "h3";
import axiosInstance from "~/server/config/axios";
import { getErrorMessage } from "~/server/utils/http-error";
import { normalizeImageName } from "~/server/utils/imageName";
import { logger } from "~/server/utils/logger";

export type QueryParams = { imageName: string; token: string; layers: string };
export type DockerLayer = { digest: string; size: number; mediaType: string };
export type DownloadProgress = {
  layerDigest: string;
  downloadedSize: number;
  totalSize: number;
  percentage: number;
};
export type LayerDownloadResult = {
  success: boolean;
  fileName?: string;
  digest: string;
  error?: string;
  skipped?: boolean;
};
type FileInfo = { exists: boolean; path: string; size?: number };
type FlushableResponse = ServerResponse & { flush?: () => void };
type PullContext = { imageName: string; token: string; layers: DockerLayer[] };

export const CONCURRENT_DOWNLOADS = 3;
const LAYER_TIMEOUT_MS = Math.max(1000, parseInt(process.env.PULL_LAYER_TIMEOUT_MS || "600000", 10));

export const writeSseData = (res: FlushableResponse, payload: unknown) => {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
  res.flush?.();
};

export const initSse = (event: H3Event): FlushableResponse => {
  setHeader(event, "Content-Type", "text/event-stream");
  setHeader(event, "Cache-Control", "no-cache, no-transform");
  setHeader(event, "Connection", "keep-alive");
  setHeader(event, "X-Accel-Buffering", "no");
  setHeader(event, "Content-Encoding", "identity");
  const res = event.node.res as FlushableResponse;
  res.flushHeaders?.();
  res.write(`:${" ".repeat(2048)}\n\n`);
  res.flush?.();
  return res;
};

export const parsePullContext = (event: H3Event): PullContext => {
  const query = getQuery(event) as unknown as QueryParams;
  const imageName = normalizeImageName(query.imageName || "");
  const token = query.token || "";
  if (!token) {
    throw createError({ statusCode: 401, message: "未提供token" });
  }
  return { imageName, token, layers: JSON.parse(query.layers) as DockerLayer[] };
};

export const ensureDownloadDir = (imageName: string) => {
  const downloadDir = join(process.cwd(), "downloads", imageName);
  if (!existsSync(downloadDir)) {
    mkdirSync(downloadDir, { recursive: true });
  }
  return downloadDir;
};

const checkLayerFile = (downloadDir: string, layer: DockerLayer): FileInfo => {
  const fileName = `${layer.digest.replace(":", "_")}.tar`;
  const filePath = join(downloadDir, fileName);
  if (!existsSync(filePath)) {
    return { exists: false, path: filePath };
  }
  const stats = statSync(filePath);
  if (stats.size === layer.size) {
    return { exists: true, path: filePath, size: stats.size };
  }
  return { exists: false, path: filePath };
};

export const runDownloadQueue = async (
  layers: DockerLayer[],
  worker: (layer: DockerLayer) => Promise<LayerDownloadResult>
): Promise<LayerDownloadResult[]> => {
  const queue = layers.slice();
  const results: LayerDownloadResult[] = [];
  const processQueue = async () => {
    while (true) {
      const layer = queue.shift();
      if (!layer) return;
      results.push(await worker(layer));
    }
  };
  const workers = Math.min(CONCURRENT_DOWNLOADS, layers.length);
  await Promise.all(Array.from({ length: workers }, () => processQueue()));
  return results;
};

export const createLayerDownloader = (
  imageName: string,
  token: string,
  downloadDir: string,
  sendProgress: (progress: DownloadProgress) => void
) => {
  return async (layer: DockerLayer): Promise<LayerDownloadResult> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(new Error("timeout")), LAYER_TIMEOUT_MS);
    try {
      const fileInfo = checkLayerFile(downloadDir, layer);
      if (fileInfo.exists) {
        sendProgress({
          layerDigest: layer.digest,
          downloadedSize: layer.size,
          totalSize: layer.size,
          percentage: 100,
        });
        return { success: true, fileName: fileInfo.path, digest: layer.digest, skipped: true };
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
      const totalSize = parseInt(response.headers["content-length"] || `${layer.size}`, 10);
      response.data.on("data", (chunk: Buffer) => {
        downloadedSize += chunk.length;
        sendProgress({
          layerDigest: layer.digest,
          downloadedSize,
          totalSize,
          percentage: Math.round((downloadedSize / totalSize) * 100),
        });
      });
      await new Promise((resolve, reject) => {
        controller.signal.addEventListener("abort", () => reject(new Error("timeout")), { once: true });
        writeStream.on("finish", resolve);
        writeStream.on("error", reject);
        response.data.on("error", reject);
        response.data.pipe(writeStream);
      });
      return { success: true, fileName: fileInfo.path, digest: layer.digest, skipped: false };
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      return {
        success: false,
        digest: layer.digest,
        error: message.toLowerCase().includes("timeout") ? "timeout" : message,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  };
};

export const reportFailures = (
  imageName: string,
  failedDownloads: LayerDownloadResult[],
  sendError: (message: string, details?: string[]) => void
): boolean => {
  if (failedDownloads.length === 0) return false;
  const timedOut = failedDownloads.filter((result) => result.error === "timeout");
  if (timedOut.length > 0) {
    sendError(`部分层下载超时（${timedOut.length} 个），请重试`, timedOut.map((result) => result.digest));
    logger.warn("pull timeout", { imageName, timedOut: timedOut.length });
    return true;
  }
  sendError(
    `部分层下载失败（${failedDownloads.length} 个），请重试`,
    failedDownloads.map((result) => result.digest)
  );
  logger.error("pull failed layers", { imageName, failed: failedDownloads.length });
  return true;
};
