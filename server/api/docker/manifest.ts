// 请求参数接口
import axiosInstance from "~/server/config/axios";
import { normalizeImageName } from "~/server/utils/imageName";
import { logger } from "~/server/utils/logger";

type QueryParams = {
  imageName: string;
  tag: string;
  token: string;
};

// Docker平台接口
type DockerPlatform = {
  architecture: string;
  os: string;
  variant?: string;
};

// Docker清单接口
type DockerManifest = {
  digest: string;
  mediaType: string;
  platform: DockerPlatform;
  size: number;
};

// API响应接口
type ManifestResponse = {
  manifests: DockerManifest[];
  mediaType: string;
  schemaVersion: number;
};

type SingleManifestResponse = {
  config: {
    digest: string;
    mediaType: string;
    size: number;
  };
  layers: Array<{
    digest: string;
    mediaType: string;
    size: number;
  }>;
  mediaType: string;
  schemaVersion: number;
};

export default defineEventHandler(async (event): Promise<ManifestResponse> => {
  const query = getQuery(event) as QueryParams;
  const rawImageName = query.imageName || "";
  const imageName = normalizeImageName(rawImageName);
  const { tag, token } = query;

  logger.info("manifest request", { imageName, tag });

  const fetchManifest = async () => {
    const response = await axiosInstance.get<
      ManifestResponse | SingleManifestResponse
    >(
      `https://registry-1.docker.io/v2/${imageName}/manifests/${tag}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept:
            "application/vnd.docker.distribution.manifest.list.v2+json,application/vnd.oci.image.index.v1+json",
        },
      }
    );
    return response.data;
  };

  try {
    const result = await fetchManifest();
    if ("manifests" in result && Array.isArray(result.manifests)) {
      logger.info("manifest success", {
        imageName,
        tag,
        count: result.manifests.length,
      });
      return result;
    }

    const normalized: ManifestResponse = {
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
    logger.info("manifest success (single)", {
      imageName,
      tag,
      count: normalized.manifests.length,
    });
    return normalized;
  } catch (error: any) {
    logger.error("manifest failed", { imageName, tag, message: error.message });
    throw createError({
      statusCode: error.response?.status || 500,
      message: error.message,
    });
  }
}); 
