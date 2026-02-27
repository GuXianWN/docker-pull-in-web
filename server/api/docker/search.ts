import axiosInstance from "~/server/config/axios";
import { getErrorMessage, getErrorStatusCode } from "~/server/utils/http-error";
import { logger } from "~/server/utils/logger";

type QueryParams = {
  query?: string;
  page?: string;
  pageSize?: string;
};

type HubSearchResult = {
  name: string;
  namespace: string;
  description?: string;
  is_official?: boolean;
  star_count?: number;
  pull_count?: number;
  repo_name?: string;
};

type HubSearchResponse = {
  count: number;
  results: HubSearchResult[];
};

type ApiSearchResult = {
  name: string;
  namespace: string;
  fullName: string;
  description?: string;
  is_official?: boolean;
  star_count?: number;
  pull_count?: number;
};

type ApiSearchResponse = {
  count: number;
  results: ApiSearchResult[];
};

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 25;

const parsePositiveInt = (value: string | undefined, fallback: number) => {
  const parsed = parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export default defineEventHandler(async (event): Promise<ApiSearchResponse> => {
  const query = getQuery(event) as QueryParams;
  const keyword = (query.query || "").trim();
  if (!keyword) {
    return { count: 0, results: [] };
  }

  const page = parsePositiveInt(query.page, DEFAULT_PAGE);
  const pageSize = Math.min(MAX_PAGE_SIZE, parsePositiveInt(query.pageSize, DEFAULT_PAGE_SIZE));

  logger.info("search request", { query: keyword, page, pageSize });

  try {
    const response = await axiosInstance.get<HubSearchResponse>(
      "https://hub.docker.com/v2/search/repositories/",
      {
        params: {
          query: keyword,
          page,
          page_size: pageSize,
        },
      }
    );

    const results = response.data.results
      .map((item) => ({
        name: item.name,
        namespace: item.namespace,
        fullName: item.repo_name || `${item.namespace}/${item.name}`,
        description: item.description || "",
        is_official: item.is_official || false,
        star_count: item.star_count || 0,
        pull_count: item.pull_count || 0,
      }))
      .sort((a, b) => (b.pull_count || 0) - (a.pull_count || 0));

    return {
      count: response.data.count ?? results.length,
      results,
    };
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    logger.error("search failed", { query: keyword, page, pageSize, message });
    throw createError({
      statusCode: getErrorStatusCode(error),
      message,
    });
  }
});
