import {HttpsProxyAgent} from "https-proxy-agent";
import axios, {AxiosInstance} from "axios";

const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY

const axiosInstance: AxiosInstance = proxyUrl
  ? axios.create({
      httpsAgent: new HttpsProxyAgent(proxyUrl),
      proxy: false,
    })
  : axios.create();

export default axiosInstance
