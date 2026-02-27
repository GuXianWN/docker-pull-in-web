import {
  CONCURRENT_DOWNLOADS,
  createLayerDownloader,
  initSse,
  parsePullContext,
  reportFailures,
  runDownloadQueue,
  writeSseData,
  ensureDownloadDir,
  type DownloadProgress,
} from "~/server/utils/pull-image";
import { getErrorMessage } from "~/server/utils/http-error";
import { logger } from "~/server/utils/logger";

export default defineEventHandler(async (event) => {
  const res = initSse(event);
  const { imageName, token, layers } = parsePullContext(event);

  logger.info("pull start", {
    imageName,
    layers: layers.length,
    concurrency: CONCURRENT_DOWNLOADS,
  });

  const downloadDir = ensureDownloadDir(imageName);
  const sendProgress = (progress: DownloadProgress) => writeSseData(res, progress);
  const sendError = (message: string, details?: string[]) => {
    writeSseData(res, { error: message, details });
    res.end();
  };

  try {
    const downloadLayer = createLayerDownloader(
      imageName,
      token,
      downloadDir,
      sendProgress
    );
    const results = await runDownloadQueue(layers, downloadLayer);

    if (reportFailures(imageName, results.filter((result) => !result.success), sendError)) {
      return;
    }

    const skipped = results.filter((result) => result.skipped).length;
    writeSseData(res, {
      summary: {
        total: results.length,
        skipped,
        downloaded: results.length - skipped,
      },
    });
    res.end();

    logger.info("pull complete", {
      imageName,
      total: results.length,
      skipped,
      downloaded: results.length - skipped,
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    logger.error("pull failed", { imageName, message });
    throw createError({ statusCode: 500, message });
  }
});
