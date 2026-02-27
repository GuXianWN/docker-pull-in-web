// 请求参数接口
import axiosInstance from "~/server/config/axios";
import { normalizeImageName } from "~/server/utils/imageName";
import { getErrorMessage, getErrorStatusCode } from "~/server/utils/http-error";
import { logger } from "~/server/utils/logger";

type QueryParams = {
  imageName: string;
  digest: string;
  token: string;
  mediaType: string;
};

// Docker配置接口
type DockerConfig = {
  digest: string;
  mediaType: string;
  size: number;
};

// Docker层接口
type DockerLayer = {
  digest: string;
  mediaType: string;
  size: number;
};

// API响应接口
type ManifestDetailResponse = {
  config: DockerConfig;
  layers: DockerLayer[];
  mediaType: string;
  schemaVersion: number;
};

export default defineEventHandler(
  async (event): Promise<ManifestDetailResponse> => {
    const query = getQuery(event) as QueryParams;
    const rawImageName = query.imageName || "";
    const imageName = normalizeImageName(rawImageName);
    const { digest, token, mediaType } = query;

    logger.info("manifest detail request", { imageName, digest });

    const fetchManifestDetail = async () => {
      const response = await axiosInstance.get<ManifestDetailResponse>(
        `https://registry-1.docker.io/v2/${imageName}/manifests/${digest}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: mediaType,
          }
        }
      );
      return response.data;
    };

    try {
      const result = await fetchManifestDetail();
      logger.info("manifest detail success", {
        imageName,
        digest,
        layers: result.layers?.length || 0,
      });
      return result;
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
  }
); 
