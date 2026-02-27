import axios from "axios";

export const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return "request failed";
};

export const getErrorStatusCode = (error: unknown, fallback = 500): number => {
  if (axios.isAxiosError(error)) {
    return error.response?.status ?? fallback;
  }
  return fallback;
};
