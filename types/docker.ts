// Docker平台接口
export type DockerPlatform = {
  architecture: string;
  os: string;
  variant?: string;
};

// Docker配置接口
export type DockerConfig = {
  digest: string;
  mediaType: string;
  size: number;
};

// Docker层接口
export type DockerLayer = {
  digest: string;
  mediaType: string;
  size: number;
};

// Docker清单接口
export type DockerManifest = {
  digest: string;
  mediaType: string;
  platform: DockerPlatform;
  size: number;
};

// 下载进度接口
export type DownloadProgress = {
  downloadedSize: number;
  totalSize: number;
  percentage: number;
};

// API响应接口
export type TokenResponse = {
  token: string;
};

export type ManifestResponse = {
  manifests: DockerManifest[];
  mediaType: string;
  schemaVersion: number;
};

export type ManifestDetailResponse = {
  config: DockerConfig;
  layers: DockerLayer[];
  mediaType: string;
  schemaVersion: number;
};

export type DownloadSummary = {
  total: number;
  skipped: number;
  downloaded: number;
}; 