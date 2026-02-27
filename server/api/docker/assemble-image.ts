import { writeFileSync, promises as fs } from "fs";
import { join } from "path";
import { Readable } from "node:stream";
import type { H3Event } from "h3";
import { sendStream } from "h3";
import * as tar from "tar";
import axiosInstance from "~/server/config/axios";
import { getErrorMessage } from "~/server/utils/http-error";
import {
  getRepoTagName,
  getSafeFileBaseName,
  normalizeImageName,
} from "~/server/utils/imageName";
import { logger } from "~/server/utils/logger";

type AssembleParams = {
  imageName: string;
  tag: string;
  token: string;
  manifest: string;
};

type DockerConfig = {
  digest: string;
  mediaType: string;
  size: number;
};

type DockerLayer = {
  digest: string;
  mediaType: string;
  size: number;
};

type DockerPlatform = {
  architecture: string;
  os: string;
};

type DockerManifest = {
  config: DockerConfig;
  layers: DockerLayer[];
  platform: DockerPlatform;
};

type LayerJson = {
  id: string;
  parent?: string;
  created: string;
  container_config: { Cmd: string[] };
  architecture: string;
  os: string;
};

type AssembleContext = {
  imageName: string;
  repoTagName: string;
  fileBaseName: string;
  tag: string;
  token: string;
  manifest: DockerManifest;
};

const stripSha256 = (digest: string) => digest.replace("sha256:", "");
const TAR_OPTIONS = {
  preservePaths: true,
  follow: true,
  noPax: true,
  noMtime: true,
  gzip: false,
} as const;

const parseAssembleContext = (event: H3Event): AssembleContext => {
  const query = getQuery(event) as unknown as AssembleParams;
  const imageName = normalizeImageName(query.imageName || "");
  if (!query.tag || !query.token || !query.manifest) {
    throw createError({ statusCode: 400, message: "缺少必要参数" });
  }
  return {
    imageName,
    repoTagName: getRepoTagName(query.imageName || imageName),
    fileBaseName: getSafeFileBaseName(query.imageName || imageName),
    tag: query.tag,
    token: query.token,
    manifest: JSON.parse(query.manifest) as DockerManifest,
  };
};

const fetchConfigJson = async (imageName: string, token: string, digest: string) => {
  const response = await axiosInstance.get(
    `https://registry-1.docker.io/v2/${imageName}/blobs/${digest}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return response.data;
};

const processLayer = async (
  tmpDir: string,
  imageName: string,
  manifest: DockerManifest,
  layer: DockerLayer,
  index: number
) => {
  const layerId = stripSha256(layer.digest);
  const parentLayer = index > 0 ? manifest.layers[index - 1] : undefined;
  const layerDir = join(tmpDir, layerId);

  await fs.mkdir(layerDir, { recursive: true });
  writeFileSync(join(layerDir, "VERSION"), "1.0");

  const layerJson: LayerJson = {
    id: layerId,
    parent: parentLayer ? stripSha256(parentLayer.digest) : undefined,
    created: new Date().toISOString(),
    container_config: { Cmd: ["baselayer"] },
    architecture: manifest.platform.architecture,
    os: manifest.platform.os,
  };

  writeFileSync(join(layerDir, "json"), JSON.stringify(layerJson, null, 2));

  const sourceFile = join(
    process.cwd(),
    "downloads",
    imageName,
    `${layer.digest.replace(":", "_")}.tar`
  );
  await fs.copyFile(sourceFile, join(layerDir, "layer.tar"));
};

const writeMetadataFiles = (
  tmpDir: string,
  manifest: DockerManifest,
  repoTagName: string,
  tag: string,
  configFileName: string,
  configJson: unknown
) => {
  const dockerManifest = [
    {
      Config: `${configFileName}.json`,
      RepoTags: [`${repoTagName}:${tag}`],
      Layers: manifest.layers.map((layer) => `${stripSha256(layer.digest)}/layer.tar`),
    },
  ];

  const repositories = { [repoTagName]: { [tag]: configFileName } };

  writeFileSync(join(tmpDir, "manifest.json"), JSON.stringify(dockerManifest, null, 2));
  writeFileSync(join(tmpDir, `${configFileName}.json`), JSON.stringify(configJson, null, 2));
  writeFileSync(join(tmpDir, "repositories"), JSON.stringify(repositories, null, 2));
};

export default defineEventHandler(async (event) => {
  const ctx = parseAssembleContext(event);
  const { imageName, repoTagName, fileBaseName, tag, token, manifest } = ctx;
  const startedAt = Date.now();

  logger.info("assemble start", { imageName, tag, layers: manifest.layers.length });

  const tmpDir = join(process.cwd(), "tmp", `${imageName}-${Date.now()}`);
  await fs.mkdir(tmpDir, { recursive: true });

  const cleanup = async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  };

  try {
    const configJson = await fetchConfigJson(imageName, token, manifest.config.digest);
    const configFileName = stripSha256(manifest.config.digest);

    await Promise.all(
      manifest.layers.map((layer, index) => processLayer(tmpDir, imageName, manifest, layer, index))
    );

    writeMetadataFiles(tmpDir, manifest, repoTagName, tag, configFileName, configJson);

    setHeader(event, "Content-Type", "application/x-tar");
    setHeader(
      event,
      "Content-Disposition",
      `attachment; filename="${fileBaseName}-${tag}.tar"`
    );

    const tarStream = tar.create({ cwd: tmpDir, ...TAR_OPTIONS }, ["."]);

    tarStream.on("close", async () => {
      await cleanup();
      logger.info("assemble complete", { imageName, tag, elapsedMs: Date.now() - startedAt });
    });
    tarStream.on("error", async (error: unknown) => {
      await cleanup();
      logger.error("assemble stream error", {
        imageName,
        tag,
        message: getErrorMessage(error),
      });
    });

    return sendStream(event, tarStream as unknown as Readable);
  } catch (error: unknown) {
    try {
      await cleanup();
    } catch (cleanupError: unknown) {
      logger.warn("assemble cleanup failed", {
        imageName,
        tag,
        message: getErrorMessage(cleanupError),
      });
    }

    const message = getErrorMessage(error);
    logger.error("assemble failed", { imageName, tag, message, elapsedMs: Date.now() - startedAt });
    throw createError({ statusCode: 500, message });
  }
});
