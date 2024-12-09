import axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";
import { writeFileSync, promises as fs } from "fs";
import { join } from "path";
import * as tar from 'tar';
import { Readable } from 'stream';

interface AssembleParams {
  imageName: string;
  tag: string;
  token: string;
  manifest: string;
}

interface DockerManifest {
  config: {
    digest: string;
    mediaType: string;
    size: number;
  };
  layers: Array<{
    digest: string;
    mediaType: string;
    size: number;
  }>;
  platform: {
    architecture: string;
    os: string;
  };
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const { imageName, tag, token, manifest: manifestJson } = query as unknown as AssembleParams;
  const manifest = JSON.parse(manifestJson) as DockerManifest;

  // 创建临时目录路径
  const tmpDir = join(process.cwd(), 'tmp', `${imageName}-${Date.now()}`);
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    const httpsAgent = new HttpsProxyAgent("http://127.0.0.1:7890");

    // 获取配置文件
    const configResponse = await axios.get(
      `https://registry-1.docker.io/v2/library/${imageName}/blobs/${manifest.config.digest}`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        },
        httpsAgent
      }
    );

    const configJson = configResponse.data;
    const configFileName = manifest.config.digest.replace('sha256:', '');

    // 按顺序处理每一层
    for (const layer of manifest.layers) {
      const layerId = layer.digest.replace('sha256:', '');
      const layerDir = join(tmpDir, layerId);
      
      await fs.mkdir(layerDir, { recursive: true });
      writeFileSync(join(layerDir, 'VERSION'), '1.0');
      
      const layerJson = {
        id: layerId,
        parent: manifest.layers[manifest.layers.indexOf(layer) - 1]?.digest.replace('sha256:', ''),
        created: new Date().toISOString(),
        container_config: {
          Cmd: ['baselayer']
        },
        architecture: manifest.platform.architecture,
        os: manifest.platform.os
      };
      writeFileSync(join(layerDir, 'json'), JSON.stringify(layerJson, null, 2));
      
      const sourceFile = join(process.cwd(), 'downloads', imageName, `${layer.digest.replace(':', '_')}.tar`);
      await fs.copyFile(sourceFile, join(layerDir, 'layer.tar'));
    }

    // 写入 manifest.json
    const manifestJson = [{
      Config: `${configFileName}.json`,
      RepoTags: [`${imageName}:${tag}`],
      Layers: manifest.layers.map((layer: DockerManifest['layers'][0]) => 
        `${layer.digest.replace('sha256:', '')}/layer.tar`
      )
    }];
    writeFileSync(join(tmpDir, 'manifest.json'), JSON.stringify(manifestJson, null, 2));

    // 写入配置文件
    writeFileSync(join(tmpDir, `${configFileName}.json`), JSON.stringify(configJson, null, 2));

    // 写入 repositories 文件
    const repositoriesJson = {
      [imageName]: {
        [tag]: configFileName
      }
    };
    writeFileSync(join(tmpDir, 'repositories'), JSON.stringify(repositoriesJson, null, 2));

    // 设置响应头
    setHeader(event, 'Content-Type', 'application/x-tar');
    setHeader(event, 'Content-Disposition', `attachment; filename="${imageName}-${tag}.tar"`);

    // 创建tar流
    const tarStream = tar.create(
      {
        cwd: tmpDir,
        preservePaths: true,
        follow: true,
        noPax: true,
        noMtime: true,
        gzip: false
      },
      ['.']
    );

    // 将tar流转换为buffer
    const chunks: Buffer[] = [];
    for await (const chunk of tarStream) {
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);

    // 清理临时目录
    await fs.rm(tmpDir, { recursive: true, force: true });

    // 返回buffer
    return buffer;

  } catch (error: any) {
    // 清理临时目录
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch (e) {
      console.warn('清理临时目录失败:', e);
    }

    throw createError({
      statusCode: 500,
      message: error.message
    });
  }
}); 