import axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";

interface QueryParams {
  imageName: string;
  digest: string;
  token: string;
  mediaType: string;
}

interface ManifestDetailResponse {
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
}

export default defineEventHandler(async (event): Promise<ManifestDetailResponse> => {
  const query = getQuery(event) as QueryParams;
  const { imageName, digest, token, mediaType } = query;

  const httpsAgent = new HttpsProxyAgent("http://127.0.0.1:7890");

  const response = await axios.get<ManifestDetailResponse>(
    `https://registry-1.docker.io/v2/library/${imageName}/manifests/${digest}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: mediaType
      },
      httpsAgent
    }
  );

  return response.data;
}); 