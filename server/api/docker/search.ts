import axiosInstance from "~/server/config/axios";

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
  next?: string | null;
  previous?: string | null;
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

export default defineEventHandler(async (event): Promise<ApiSearchResponse> => {
  const query = getQuery(event) as QueryParams;
  const q = (query.query || "").toString().trim();

  if (!q) {
    return { count: 0, results: [] };
  }

  const page = Math.max(1, parseInt(query.page || "1", 10));
  const pageSize = Math.min(25, Math.max(1, parseInt(query.pageSize || "10", 10)));

  try {
    const response = await axiosInstance.get<HubSearchResponse>(
      "https://hub.docker.com/v2/search/repositories/",
      {
        params: {
          query: q,
          page,
          page_size: pageSize,
        },
      }
    );

    const mapped = response.data.results.map((item) => ({
      name: item.name,
      namespace: item.namespace,
      fullName: item.repo_name || `${item.namespace}/${item.name}`,
      description: item.description || "",
      is_official: item.is_official || false,
      star_count: item.star_count || 0,
      pull_count: item.pull_count || 0,
    }));

    return {
      count: response.data.count ?? mapped.length,
      results: mapped,
    };
  } catch (error: any) {
    throw createError({
      statusCode: error.response?.status || 500,
      message: error.message,
    });
  }
});
