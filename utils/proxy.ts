import { HttpsProxyAgent } from "https-proxy-agent";

export const getProxyAgent = () => {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  return proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;
}; 