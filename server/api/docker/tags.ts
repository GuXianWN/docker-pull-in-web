import axiosInstance from "~/server/config/axios";
import { getErrorMessage, getErrorStatusCode } from "~/server/utils/http-error";
import { normalizeImageName } from "~/server/utils/imageName";
import { logger } from "~/server/utils/logger";

type QueryParams = {
  imageName?: string;
  query?: string;
  pageSize?: string;
  page?: string;
};

type HubTagResult = {
  name: string;
  last_updated?: string;
};

type HubTagResponse = {
  count: number;
  results: HubTagResult[];
};

type ApiTagResult = {
  name: string;
  last_updated?: string;
};

type ApiTagResponse = {
  count: number;
  results: ApiTagResult[];
};

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 25;

const parsePositiveInt = (value: string | undefined, fallback: number) => {
  const parsed = parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseRepoPath = (imageName: string) => {
  const [namespace, ...rest] = imageName.split("/");
  const repo = rest.join("/");
  return namespace && repo ? { namespace, repo } : null;
};

export default defineEventHandler(async (event): Promise<ApiTagResponse> => {
  const query = getQuery(event) as QueryParams;
  const imageName = normalizeImageName((query.imageName || "").trim());
  if (!imageName) {
    return { count: 0, results: [] };
  }

  const repoPath = parseRepoPath(imageName);
  if (!repoPath) {
    return { count: 0, results: [] };
  }

  const keyword = (query.query || "").trim();
  const page = parsePositiveInt(query.page, DEFAULT_PAGE);
  const pageSize = Math.min(MAX_PAGE_SIZE, parsePositiveInt(query.pageSize, DEFAULT_PAGE_SIZE));

  logger.info("tags request", { imageName, page, pageSize });

  try {
    const response = await axiosInstance.get<HubTagResponse>(
      `https://hub.docker.com/v2/repositories/${repoPath.namespace}/${repoPath.repo}/tags`,
      {
        params: {
          page,
          page_size: pageSize,
          name: keyword || undefined,
        },
      }
    );

    const results = response.data.results
      .map((item) => ({
        name: item.name,
        last_updated: item.last_updated,
      }))
      .sort((a, b) => {
        if (a.name === "latest") return -1;
        if (b.name === "latest") return 1;
        return b.name.localeCompare(a.name, undefined, { numeric: true });
      });

    return {
      count: response.data.count ?? results.length,
      results,
    };
  } catch (error: unknown) {
    const statusCode = getErrorStatusCode(error);
    if (statusCode === 404) {
      return { count: 0, results: [] };
    }

    const message = getErrorMessage(error);
    logger.error("tags failed", { imageName, page, pageSize, message });
    throw createError({ statusCode, message });
  }
});
