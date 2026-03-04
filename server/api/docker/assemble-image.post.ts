import { randomUUID } from "node:crypto";
import { writeFileSync, promises as fs } from "node:fs";
import { join } from "node:path";
import * as tar from "tar";
import axiosInstance from "~/server/config/axios";
import { getErrorMessage } from "~/server/utils/http-error";
import {
  getRepoTagName,
  getSafeFileBaseName,
  normalizeImageName,
} from "~/server/utils/imageName";
import { logger } from "~/server/utils/logger";

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

type AssembleBody = {
  imageName: string;
  tag: string;
  token: string;
  manifest: DockerManifest;
};

type AssembleResponse = {
  downloadId: string;
  fileName: string;
};

type LayerJson = {
  id: string;
  parent?: string;
  created: string;
  container_config: { Cmd: string[] };
  architecture: string;
  os: string;
};

const stripSha256 = (digest: string) => digest.replace("sha256:", "");
const TAR_OPTIONS = {
  preservePaths: true,
  follow: true,
  noPax: true,
  noMtime: true,
  gzip: false,
} as const;

const parseAssembleBody = (body: Partial<AssembleBody>) => {
  const imageName = normalizeImageName((body.imageName || "").trim());
  const tag = (body.tag || "").trim();
  const token = (body.token || "").trim();
  if (!imageName || !tag || !token || !body.manifest) {
    throw createError({ statusCode: 400, message: "缺少必要参数" });
  }
  return {
    imageName,
    tag,
    token,
    manifest: body.manifest,
    repoTagName: getRepoTagName(body.imageName || imageName),
    fileBaseName: getSafeFileBaseName(body.imageName || imageName),
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

export default defineEventHandler(async (event): Promise<AssembleResponse> => {
  const body = await readBody<Partial<AssembleBody>>(event);
  const { imageName, tag, token, manifest, repoTagName, fileBaseName } = parseAssembleBody(body);
  const startedAt = Date.now();
  const tempId = randomUUID();
  const tmpDir = join(process.cwd(), "tmp", `${imageName}-${Date.now()}`);
  const assembleDir = join(process.cwd(), "tmp", "assembled");
  const tarPath = join(assembleDir, `${tempId}.tar`);
  const metaPath = join(assembleDir, `${tempId}.json`);
  const fileName = `${fileBaseName}-${tag}.tar`;

  logger.info("assemble start", { imageName, tag, layers: manifest.layers.length });
  await fs.mkdir(tmpDir, { recursive: true });
  await fs.mkdir(assembleDir, { recursive: true });

  try {
    const configJson = await fetchConfigJson(imageName, token, manifest.config.digest);
    const configFileName = stripSha256(manifest.config.digest);
    await Promise.all(
      manifest.layers.map((layer, index) => processLayer(tmpDir, imageName, manifest, layer, index))
    );
    writeMetadataFiles(tmpDir, manifest, repoTagName, tag, configFileName, configJson);
    await tar.create({ cwd: tmpDir, file: tarPath, ...TAR_OPTIONS }, ["."]);
    await fs.writeFile(metaPath, JSON.stringify({ fileName }, null, 2), "utf-8");
    await fs.rm(tmpDir, { recursive: true, force: true });

    logger.info("assemble complete", {
      imageName,
      tag,
      downloadId: tempId,
      elapsedMs: Date.now() - startedAt,
    });
    return { downloadId: tempId, fileName };
  } catch (error: unknown) {
    await fs.rm(tmpDir, { recursive: true, force: true });
    await fs.rm(tarPath, { force: true });
    await fs.rm(metaPath, { force: true });
    const message = getErrorMessage(error);
    logger.error("assemble failed", { imageName, tag, message, elapsedMs: Date.now() - startedAt });
    throw createError({ statusCode: 500, message });
  }
});
