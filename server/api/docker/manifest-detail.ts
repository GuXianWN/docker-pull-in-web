import axiosInstance from "~/server/config/axios";
import { getErrorMessage, getErrorStatusCode } from "~/server/utils/http-error";
import { normalizeImageName } from "~/server/utils/imageName";
import { logger } from "~/server/utils/logger";

type QueryParams = {
  imageName: string;
  digest: string;
  token: string;
  mediaType: string;
};

type DockerConfig = {
  digest: string;
  mediaType: string;
  size: number;
};

type DockerLayer = {
  digest: string;
  mediaType: string;
  size: number;
};

type ManifestDetailResponse = {
  config: DockerConfig;
  layers: DockerLayer[];
  mediaType: string;
  schemaVersion: number;
};

export default defineEventHandler(async (event): Promise<ManifestDetailResponse> => {
  const query = getQuery(event) as QueryParams;
  const imageName = normalizeImageName(query.imageName || "");
  const { digest, token, mediaType } = query;

  logger.info("manifest detail request", { imageName, digest });

  try {
    const response = await axiosInstance.get<ManifestDetailResponse>(
      `https://registry-1.docker.io/v2/${imageName}/manifests/${digest}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: mediaType,
        },
      }
    );

    logger.info("manifest detail success", {
      imageName,
      digest,
      layers: response.data.layers.length,
    });
    return response.data;
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    logger.error("manifest detail failed", {
      imageName,
      digest,
      message,
    });
    throw createError({
      statusCode: getErrorStatusCode(error),
      message,
    });
  }
});
