import axios from "axios";
import { getProxyAgent } from "~/utils/proxy";

// 请求参数接口
type QueryParams = {
  imageName?: string;
  scope?: string;
};

// Docker认证响应接口
type DockerAuthResponse = {
  token: string;
  expires_in: number;
  issued_at: string;
};

// API响应接口
type ApiResponse = {
  token: string;
};

export default defineEventHandler(async (event): Promise<ApiResponse> => {
  const query = getQuery(event) as QueryParams;
  const imageName = query.imageName || "nginx";
  const scope = query.scope || "pull";

  const fetchToken = async () => {
    const httpsAgent = getProxyAgent();
    const response = await axios.get<DockerAuthResponse>(
      "https://auth.docker.io/token",
      {
        params: {
          service: "registry.docker.io",
          scope: `repository:library/${imageName}:${scope}`,
        },
        ...(httpsAgent && { httpsAgent }),
      }
    );
    return response.data;
  };

  try {
    const authResponse = await fetchToken();
    return {
      token: authResponse.token,
    };
  } catch (error: any) {
    throw createError({
      statusCode: error.response?.status || 500,
      message: error.message,
    });
  }
}); 