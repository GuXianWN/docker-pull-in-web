import {HttpsProxyAgent} from "https-proxy-agent";
import axios, {AxiosInstance} from "axios";

const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY

// @ts-ignore
let axiosInstance: AxiosInstance = undefined;
if (proxyUrl) {
    let httpsAgent = new HttpsProxyAgent(proxyUrl);
    axiosInstance = axios.create({
        httpsAgent: httpsAgent,
        proxy: false
    });
} else {
    axiosInstance = axios.create();
}

export default axiosInstance