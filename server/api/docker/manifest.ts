import axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";

interface QueryParams {
  imageName: string;
  tag: string;
  token: string;
}

interface ManifestResponse {
  manifests: Array<{
    digest: string;
    mediaType: string;
    platform: {
      architecture: string;
      os: string;
      variant?: string;
    };
    size: number;
  }>;
  mediaType: string;
  schemaVersion: number;
}

export default defineEventHandler(async (event): Promise<ManifestResponse> => {
  const query = getQuery(event) as QueryParams;
  const { imageName, tag, token } = query;

  const httpsAgent = new HttpsProxyAgent("http://127.0.0.1:7890");

  const response = await axios.get<ManifestResponse>(
    `https://registry-1.docker.io/v2/library/${imageName}/manifests/${tag}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.docker.distribution.manifest.list.v2+json,application/vnd.oci.image.index.v1+json'
      },
      httpsAgent
    }
  );

  return response.data;
}); 