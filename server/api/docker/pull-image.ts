import axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";
import { createWriteStream, existsSync, mkdirSync, statSync } from "fs";
import { join } from "path";

interface QueryParams {
  imageName: string;
  token: string;
  layers: string;
}

interface Layer {
  digest: string;
  size: number;
  mediaType: string;
}

interface DownloadProgress {
  layerDigest: string;
  downloadedSize: number;
  totalSize: number;
  percentage: number;
}

interface LayerDownloadResult {
  success: boolean;
  fileName?: string;
  digest: string;
  error?: string;
  skipped?: boolean;
}

const CONCURRENT_DOWNLOADS = 3;

export default defineEventHandler(async (event) => {
  console.log('开始处理下载请求...');
  
  setHeader(event, 'Content-Type', 'text/event-stream');
  setHeader(event, 'Cache-Control', 'no-cache');
  setHeader(event, 'Connection', 'keep-alive');

  const query = getQuery(event);
  const { imageName, token, layers: layersJson } = query as unknown as QueryParams;
  
  if (!token) {
    console.error('未提供token');
    throw createError({
      statusCode: 401,
      message: '未提供token'
    });
  }

  const layers = JSON.parse(layersJson) as Layer[];
  console.log(`准备下载镜像 ${imageName}，共 ${layers.length} 层`);

  const downloadDir = join(process.cwd(), 'downloads', imageName);
  if (!existsSync(downloadDir)) {
    mkdirSync(downloadDir, { recursive: true });
  }

  async function downloadLayer(layer: Layer): Promise<LayerDownloadResult> {
    try {
      const fileInfo = checkLayerFile(layer);
      
      if (fileInfo.exists) {
        event.node.res.write(`data: ${JSON.stringify({
          layerDigest: layer.digest,
          downloadedSize: layer.size,
          totalSize: layer.size,
          percentage: 100
        })}\n\n`);
        
        return {
          success: true,
          fileName: fileInfo.path,
          digest: layer.digest,
          skipped: true
        };
      }

      const httpsAgent = new HttpsProxyAgent("http://127.0.0.1:7890");
      const response = await axios({
        method: 'get',
        url: `https://registry-1.docker.io/v2/library/${imageName}/blobs/${layer.digest}`,
        headers: {
          Authorization: `Bearer ${token}`
        },
        responseType: 'stream',
        httpsAgent,
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });

      if (response.status !== 200) {
        throw new Error(`HTTP状态码 ${response.status}`);
      }

      const writeStream = createWriteStream(fileInfo.path);
      let downloadedSize = 0;
      const totalSize = parseInt(response.headers['content-length'] || layer.size.toString());

      response.data.on('data', (chunk: Buffer) => {
        downloadedSize += chunk.length;
        const percentage = Math.round((downloadedSize / totalSize) * 100);
        
        event.node.res.write(`data: ${JSON.stringify({
          layerDigest: layer.digest,
          downloadedSize,
          totalSize,
          percentage
        })}\n\n`);
      });

      await new Promise((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
        response.data.on('error', reject);
        response.data.pipe(writeStream);
      });

      return {
        success: true,
        fileName: fileInfo.path,
        digest: layer.digest,
        skipped: false
      };
    } catch (error: any) {
      return {
        success: false,
        digest: layer.digest,
        error: error.message
      };
    }
  }

  function checkLayerFile(layer: Layer) {
    const fileName = `${layer.digest.replace(':', '_')}.tar`;
    const filePath = join(downloadDir, fileName);
    
    if (existsSync(filePath)) {
      const stats = statSync(filePath);
      if (stats.size === layer.size) {
        return {
          exists: true,
          path: filePath,
          size: stats.size
        };
      }
    }
    
    return {
      exists: false,
      path: filePath
    };
  }

  try {
    // 创建一个队列来管理下载任务
    const queue = layers.slice();
    const activeDownloads = new Set<string>();
    const results: LayerDownloadResult[] = [];
    
    // 处理单个下载任务
    async function processNextLayer() {
      if (queue.length === 0) return;
      
      const layer = queue.shift()!;
      activeDownloads.add(layer.digest);
      
      try {
        const result = await downloadLayer(layer);
        results.push(result);
      } finally {
        activeDownloads.delete(layer.digest);
        
        // 如果队列还有任务，继续处理
        if (queue.length > 0) {
          processNextLayer();
        }
      }
    }

    // 启动初始的并发下载
    const initialDownloads = Math.min(CONCURRENT_DOWNLOADS, layers.length);
    const downloadPromises = Array(initialDownloads)
      .fill(null)
      .map(() => processNextLayer());

    // 等待所有下载完成
    await Promise.all(downloadPromises);

    // 检查是否有失败的下载
    const failedDownloads = results.filter(result => !result.success);
    if (failedDownloads.length > 0) {
      throw new Error(`部分层下载失败: ${failedDownloads.map(f => f.digest).join(', ')}`);
    }

    const skippedLayers = results.filter(r => r.skipped).length;
    const downloadedLayers = results.filter(r => !r.skipped).length;

    console.log(`下载完成！跳过: ${skippedLayers}, 下载: ${downloadedLayers}`);

    event.node.res.write(`data: ${JSON.stringify({
      summary: {
        total: results.length,
        skipped: skippedLayers,
        downloaded: downloadedLayers
      }
    })}\n\n`);

    return;
  } catch (error: any) {
    console.error('下载过程出错:', error);
    throw createError({
      statusCode: 500,
      message: error.message
    });
  }
}); 