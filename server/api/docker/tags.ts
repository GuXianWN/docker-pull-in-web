import axiosInstance from "~/server/config/axios";
import { normalizeImageName } from "~/server/utils/imageName";

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
  next?: string | null;
  previous?: string | null;
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

export default defineEventHandler(async (event): Promise<ApiTagResponse> => {
  const query = getQuery(event) as QueryParams;
  const rawImageName = (query.imageName || "").toString().trim();
  const imageName = normalizeImageName(rawImageName);
  const q = (query.query || "").toString().trim();

  if (!imageName) {
    return { count: 0, results: [] };
  }

  const page = Math.max(1, parseInt(query.page || "1", 10));
  const pageSize = Math.min(25, Math.max(1, parseInt(query.pageSize || "10", 10)));

  const [namespace, ...rest] = imageName.split("/");
  const repo = rest.join("/");

  if (!namespace || !repo) {
    return { count: 0, results: [] };
  }

  try {
    const response = await axiosInstance.get<HubTagResponse>(
      `https://hub.docker.com/v2/repositories/${namespace}/${repo}/tags`,
      {
        params: {
          page,
          page_size: pageSize,
          name: q || undefined,
        },
      }
    );

    const mapped = response.data.results.map((item) => ({
      name: item.name,
      last_updated: item.last_updated,
    }));

    const sorted = mapped.sort((a, b) => {
      if (a.name === "latest") return -1;
      if (b.name === "latest") return 1;
      return b.name.localeCompare(a.name, undefined, { numeric: true });
    });

    return {
      count: response.data.count ?? mapped.length,
      results: sorted,
    };
  } catch (error: any) {
    const statusCode = error.response?.status || 500;
    if (statusCode === 404) {
      return { count: 0, results: [] };
    }
    throw createError({
      statusCode,
      message: error.message,
    });
  }
});
