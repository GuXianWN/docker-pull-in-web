import axiosInstance from "~/server/config/axios";
import { getErrorMessage, getErrorStatusCode } from "~/server/utils/http-error";
import { normalizeImageName } from "~/server/utils/imageName";
import { logger } from "~/server/utils/logger";

type QueryParams = {
  imageName: string;
  tag: string;
  token: string;
};

type DockerPlatform = {
  architecture: string;
  os: string;
  variant?: string;
};

type DockerManifest = {
  digest: string;
  mediaType: string;
  platform: DockerPlatform;
  size: number;
};

type ManifestResponse = {
  manifests: DockerManifest[];
  mediaType: string;
  schemaVersion: number;
};

type SingleManifestResponse = {
  mediaType: string;
  schemaVersion: number;
};

const MANIFEST_LIST_ACCEPT =
  "application/vnd.docker.distribution.manifest.list.v2+json,application/vnd.oci.image.index.v1+json";

const normalizeManifest = (
  tag: string,
  result: ManifestResponse | SingleManifestResponse
): ManifestResponse => {
  if ("manifests" in result && Array.isArray(result.manifests)) {
    return result;
  }

  return {
    manifests: [
      {
        digest: tag,
        mediaType: result.mediaType,
        platform: {
          architecture: "unknown",
          os: "unknown",
        },
        size: 0,
      },
    ],
    mediaType: result.mediaType,
    schemaVersion: result.schemaVersion ?? 2,
  };
};

export default defineEventHandler(async (event): Promise<ManifestResponse> => {
  const query = getQuery(event) as QueryParams;
  const imageName = normalizeImageName(query.imageName || "");
  const { tag, token } = query;

  logger.info("manifest request", { imageName, tag });

  try {
    const response = await axiosInstance.get<ManifestResponse | SingleManifestResponse>(
      `https://registry-1.docker.io/v2/${imageName}/manifests/${tag}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: MANIFEST_LIST_ACCEPT,
        },
      }
    );

    const normalized = normalizeManifest(tag, response.data);
    logger.info("manifest success", {
      imageName,
      tag,
      count: normalized.manifests.length,
    });
    return normalized;
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    logger.error("manifest failed", { imageName, tag, message });
    throw createError({
      statusCode: getErrorStatusCode(error),
      message,
    });
  }
});
