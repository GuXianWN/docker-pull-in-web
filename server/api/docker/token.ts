// 请求参数接口
import axiosInstance from "~/server/config/axios";

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
    const response = await axiosInstance.get<DockerAuthResponse>(
      "https://auth.docker.io/token",
      {
        params: {
          service: "registry.docker.io",
          scope: `repository:${imageName}:${scope}`,
        },
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