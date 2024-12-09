import axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";

interface QueryParams {
  imageName?: string;
  scope?: string;
}

interface DockerAuthResponse {
  token: string;
  expires_in: number;
  issued_at: string;
}

interface ApiResponse {
  token: string;
}

export default defineEventHandler(async (event): Promise<ApiResponse> => {
  const query = getQuery(event) as QueryParams;
  const imageName = query.imageName || 'nginx';
  const scope = query.scope || 'pull';

  const httpsAgent = new HttpsProxyAgent("http://127.0.0.1:7890");

  const response = await axios.get<DockerAuthResponse>("https://auth.docker.io/token", {
    params: {
      service: "registry.docker.io",
      scope: `repository:library/${imageName}:${scope}`,
    },
    httpsAgent,
  });

  return {
    token: response.data.token,
  };
}); 