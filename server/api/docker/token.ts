import axiosInstance from "~/server/config/axios";
import { getErrorMessage, getErrorStatusCode } from "~/server/utils/http-error";
import { normalizeImageName } from "~/server/utils/imageName";
import { logger } from "~/server/utils/logger";

type QueryParams = {
  imageName?: string;
  scope?: string;
};

type DockerAuthResponse = {
  token: string;
  expires_in: number;
  issued_at: string;
};

type ApiResponse = {
  token: string;
};

const DEFAULT_IMAGE_NAME = "nginx";
const DEFAULT_SCOPE = "pull";

export default defineEventHandler(async (event): Promise<ApiResponse> => {
  const query = getQuery(event) as QueryParams;
  const imageName = normalizeImageName(query.imageName || DEFAULT_IMAGE_NAME);
  const scope = query.scope || DEFAULT_SCOPE;

  logger.info("token request", { imageName, scope });

  try {
    const response = await axiosInstance.get<DockerAuthResponse>(
      "https://auth.docker.io/token",
      {
        params: {
          service: "registry.docker.io",
          scope: `repository:${imageName}:${scope}`,
        },
      }
    );

    logger.info("token success", { imageName, scope });
    return { token: response.data.token };
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    logger.error("token failed", { imageName, scope, message });
    throw createError({
      statusCode: getErrorStatusCode(error),
      message,
    });
  }
});
