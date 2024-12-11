import axios from "axios";
import { getProxyAgent } from "~/utils/proxy";

// 请求参数接口
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
    const { imageName, digest, token, mediaType } = query;

    const fetchManifestDetail = async () => {
      const httpsAgent = getProxyAgent();
      const response = await axios.get<ManifestDetailResponse>(
        `https://registry-1.docker.io/v2/library/${imageName}/manifests/${digest}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: mediaType,
          },
          ...(httpsAgent && { httpsAgent }),
        }
      );
      return response.data;
    };

    try {
      return await fetchManifestDetail();
    } catch (error: any) {
      throw createError({
        statusCode: error.response?.status || 500,
        message: error.message,
      });
    }
  }
); 