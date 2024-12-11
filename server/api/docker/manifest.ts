import axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";

// 请求参数接口
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

export default defineEventHandler(async (event): Promise<ManifestResponse> => {
  const query = getQuery(event) as QueryParams;
  const { imageName, tag, token } = query;

  const fetchManifest = async () => {
    const httpsAgent = new HttpsProxyAgent("http://127.0.0.1:7890");
    const response = await axios.get<ManifestResponse>(
      `https://registry-1.docker.io/v2/library/${imageName}/manifests/${tag}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept:
            "application/vnd.docker.distribution.manifest.list.v2+json,application/vnd.oci.image.index.v1+json",
        },
        httpsAgent,
      }
    );
    return response.data;
  };

  try {
    return await fetchManifest();
  } catch (error: any) {
    throw createError({
      statusCode: error.response?.status || 500,
      message: error.message,
    });
  }
}); 