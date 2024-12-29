import { writeFileSync, promises as fs } from "fs";
import { join } from "path";
import * as tar from "tar";
import axiosInstance from "~/server/config/axios";

// 请求参数接口
type AssembleParams = {
  imageName: string;
  tag: string;
  token: string;
  manifest: string;
};

// Docker配置接口
type DockerConfig = {
  digest: string;
  mediaType: string;
  size: number;
};

// Docker层接口
type DockerLayer = {
  digest: string;
  mediaType: string;
  size: number;
};

// Docker平台接口
type DockerPlatform = {
  architecture: string;
  os: string;
};

// Docker清单接口
type DockerManifest = {
  config: DockerConfig;
  layers: DockerLayer[];
  platform: DockerPlatform;
};

// 层JSON配置接口
type LayerJson = {
  id: string;
  parent?: string;
  created: string;
  container_config: {
    Cmd: string[];
  };
  architecture: string;
  os: string;
};

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const {
    imageName,
    tag,
    token,
    manifest: manifestJson,
  } = query as unknown as AssembleParams;
  const manifest = JSON.parse(manifestJson) as DockerManifest;

  // 创建临时目录
  const tmpDir = join(process.cwd(), "tmp", `${imageName}-${Date.now()}`);
  await fs.mkdir(tmpDir, { recursive: true });

  // 获取配置文件
  const fetchConfig = async () => {
    const response = await axiosInstance.get(
      `https://registry-1.docker.io/v2/${imageName}/blobs/${manifest.config.digest}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    return response.data;
  };

  // 处理单个层
  const processLayer = async (layer: DockerLayer, index: number) => {
    const layerId = layer.digest.replace("sha256:", "");
    const layerDir = join(tmpDir, layerId);

    await fs.mkdir(layerDir, { recursive: true });

    // 写入版本文件
    writeFileSync(join(layerDir, "VERSION"), "1.0");

    // 创建层配置
    const layerJson: LayerJson = {
      id: layerId,
      parent:
        index > 0
          ? manifest.layers[index - 1].digest.replace("sha256:", "")
          : undefined,
      created: new Date().toISOString(),
      container_config: {
        Cmd: ["baselayer"],
      },
      architecture: manifest.platform.architecture,
      os: manifest.platform.os,
    };

    // 写入层配置
    writeFileSync(join(layerDir, "json"), JSON.stringify(layerJson, null, 2));

    // 复制层文件
    const sourceFile = join(
      process.cwd(),
      "downloads",
      imageName,
      `${layer.digest.replace(":", "_")}.tar`
    );
    await fs.copyFile(sourceFile, join(layerDir, "layer.tar"));
  };

  try {
    // 获取配置
    const configJson = await fetchConfig();
    const configFileName = manifest.config.digest.replace("sha256:", "");

    // 处理所有层
    await Promise.all(
      manifest.layers.map((layer, index) => processLayer(layer, index))
    );

    // 写入manifest.json
    const manifestJson = [
      {
        Config: `${configFileName}.json`,
        RepoTags: [`${imageName}:${tag}`],
        Layers: manifest.layers.map(
          (layer) => `${layer.digest.replace("sha256:", "")}/layer.tar`
        ),
      },
    ];
    writeFileSync(
      join(tmpDir, "manifest.json"),
      JSON.stringify(manifestJson, null, 2)
    );

    // 写入配置文件
    writeFileSync(
      join(tmpDir, `${configFileName}.json`),
      JSON.stringify(configJson, null, 2)
    );

    // 写入repositories文件
    const repositoriesJson = {
      [imageName]: {
        [tag]: configFileName,
      },
    };
    writeFileSync(
      join(tmpDir, "repositories"),
      JSON.stringify(repositoriesJson, null, 2)
    );

    // 设置响应头
    setHeader(event, "Content-Type", "application/x-tar");
    setHeader(
      event,
      "Content-Disposition",
      `attachment; filename="${imageName}-${tag}.tar"`
    );

    // 创建tar流并转换为buffer
    const createTarBuffer = async () => {
      const tarStream = tar.create(
        {
          cwd: tmpDir,
          preservePaths: true,
          follow: true,
          noPax: true,
          noMtime: true,
          gzip: false,
        },
        ["."]
      );

      const chunks: Buffer[] = [];
      for await (const chunk of tarStream) {
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    };

    const buffer = await createTarBuffer();

    // 清理临时目录
    await fs.rm(tmpDir, { recursive: true, force: true });

    return buffer;
  } catch (error: any) {
    // 清理临时目录
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch (e) {
      console.warn("清理临时目录失败:", e);
    }

    throw createError({
      statusCode: 500,
      message: error.message,
    });
  }
});
