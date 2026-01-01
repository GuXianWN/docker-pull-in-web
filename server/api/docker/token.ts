// 请求参数接口
import axiosInstance from "~/server/config/axios";
import { normalizeImageName } from "~/server/utils/imageName";
import { logger } from "~/server/utils/logger";

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
  const rawImageName = query.imageName || "nginx";
  const imageName = normalizeImageName(rawImageName);
  const scope = query.scope || "pull";

  logger.info("token request", { imageName, scope });

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
    logger.info("token success", { imageName, scope });
    return {
      token: authResponse.token,
    };
  } catch (error: any) {
    logger.error("token failed", { imageName, scope, message: error.message });
    throw createError({
      statusCode: error.response?.status || 500,
      message: error.message,
    });
  }
}); 
