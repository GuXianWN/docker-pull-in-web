import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { sendStream } from "h3";
import { getErrorMessage } from "~/server/utils/http-error";
import { logger } from "~/server/utils/logger";

type DownloadQuery = {
  downloadId?: string;
};

type DownloadMeta = {
  fileName: string;
};

const DOWNLOAD_ID_PATTERN = /^[a-f0-9-]{36}$/i;

export default defineEventHandler(async (event) => {
  const query = getQuery(event) as DownloadQuery;
  const downloadId = (query.downloadId || "").trim();
  if (!DOWNLOAD_ID_PATTERN.test(downloadId)) {
    throw createError({ statusCode: 400, message: "无效下载ID" });
  }

  const assembleDir = join(process.cwd(), "tmp", "assembled");
  const tarPath = join(assembleDir, `${downloadId}.tar`);
  const metaPath = join(assembleDir, `${downloadId}.json`);

  try {
    const metaRaw = await fs.readFile(metaPath, "utf-8");
    const meta = JSON.parse(metaRaw) as DownloadMeta;

    setHeader(event, "Content-Type", "application/x-tar");
    setHeader(event, "Content-Disposition", `attachment; filename="${meta.fileName}"`);

    const tarStream = createReadStream(tarPath);
    tarStream.on("close", async () => {
      await fs.rm(tarPath, { force: true });
      await fs.rm(metaPath, { force: true });
    });
    tarStream.on("error", async (error: unknown) => {
      logger.error("download stream failed", { downloadId, message: getErrorMessage(error) });
      await fs.rm(tarPath, { force: true });
      await fs.rm(metaPath, { force: true });
    });

    return sendStream(event, tarStream);
  } catch (error: unknown) {
    logger.error("download failed", { downloadId, message: getErrorMessage(error) });
    throw createError({ statusCode: 404, message: "文件不存在或已失效" });
  }
});
