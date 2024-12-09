<template>
  <div class="container">
    <div class="form-section">
      <div class="input-group">
        <input v-model="imageName" placeholder="镜像名称 (例如: nginx)" />
        <input v-model="tag" placeholder="标签 (例如: latest)" />
      </div>
      <div class="select-group">
        <select v-model="selectedArch">
          <option value="">选择架构</option>
          <option value="amd64">amd64</option>
          <option value="arm64">arm64</option>
          <option value="arm">arm</option>
        </select>
        <select v-model="selectedOS">
          <option value="">选择操作系统</option>
          <option value="linux">linux</option>
          <option value="windows">windows</option>
        </select>
      </div>
      <button @click="fetchAndPull" :disabled="loading || !canPull">
        {{ loading ? "处理中..." : "拉取镜像" }}
      </button>
    </div>

    <div v-if="error" class="error-message">
      {{ error }}
    </div>

    <div v-if="Object.keys(downloadProgress).length > 0" class="progress-container">
      <div v-for="(progress, digest) in downloadProgress" :key="digest" class="layer-progress">
        <div class="progress-line">
          <span class="digest">{{ formatDigest(digest) }}:</span>
          <span class="progress-text">{{ formatProgress(progress) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface TokenResponse {
  token: string;
}

interface ManifestResponse {
  manifests: Array<{
    digest: string;
    mediaType: string;
    platform: {
      architecture: string;
      os: string;
      variant?: string;
    };
    size: number;
  }>;
  mediaType: string;
  schemaVersion: number;
}

interface ManifestDetailResponse {
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
  mediaType: string;
  schemaVersion: number;
}

interface DownloadProgress {
  downloadedSize: number;
  totalSize: number;
  percentage: number;
}

interface DownloadSummary {
  total: number;
  skipped: number;
  downloaded: number;
}

const imageName = ref("nginx");
const tag = ref("latest");
const selectedArch = ref("");
const selectedOS = ref("");
const loading = ref(false);
const error = ref<string>();
const downloadProgress = ref<Record<string, DownloadProgress>>({});
const activeDownloads = ref<Set<string>>(new Set());
const manifestData = ref<ManifestResponse>();
const manifestDetails = ref<Record<string, ManifestDetailResponse>>({});
let currentToken = '';
let currentManifest: any = null;

// 计算属性：是否可以拉取
const canPull = computed(() => 
  imageName.value && 
  tag.value && 
  selectedArch.value && 
  selectedOS.value
);

// 格式化digest显示
function formatDigest(digest: string) {
  return digest.replace('sha256:', '').substring(0, 12);
}

// 格式化进度显示
function formatProgress(progress: DownloadProgress) {
  const downloaded = (progress.downloadedSize / 1024 / 1024).toFixed(2);
  const total = (progress.totalSize / 1024 / 1024).toFixed(2);
  const bar = '='.repeat(Math.floor(progress.percentage / 2));
  const space = ' '.repeat(50 - Math.floor(progress.percentage / 2));
  return `[${bar}>${space}] ${downloaded}MB/${total}MB`;
}

// 获取并拉取镜像
async function fetchAndPull() {
  if (!canPull.value) return;
  
  loading.value = true;
  error.value = undefined;
  downloadProgress.value = {};
  currentManifest = null;
  
  try {
    // 1. 获取token
    const tokenResponse = await $fetch<TokenResponse>("/api/docker/token", {
      params: {
        imageName: imageName.value,
        scope: "pull",
      },
    });
    // 保存token
    currentToken = tokenResponse.token;

    // 2. 获取manifest列表
    const manifests = await $fetch<ManifestResponse>("/api/docker/manifest", {
      params: {
        imageName: imageName.value,
        tag: tag.value,
        token: currentToken,
      },
    });

    // 3. 找到匹配的manifest
    const targetManifest = manifests.manifests.find(m => 
      m.platform.architecture === selectedArch.value && 
      m.platform.os === selectedOS.value
    );

    if (!targetManifest) {
      throw new Error(`未找到 ${selectedArch.value}/${selectedOS.value} 平台的镜像`);
    }

    // 4. 获取manifest详情
    const detail = await $fetch<ManifestDetailResponse>("/api/docker/manifest-detail", {
      params: {
        imageName: imageName.value,
        digest: targetManifest.digest,
        token: currentToken,
        mediaType: targetManifest.mediaType
      },
    });

    // 保存manifest信息用于后续组装
    currentManifest = {
      platform: targetManifest,
      detail: detail
    };

    // 开始下载层
    await downloadAllLayers(detail.layers);

  } catch (e) {
    error.value = e instanceof Error ? e.message : "拉取失败";
    console.error("拉取失败:", e);
  } finally {
    loading.value = false;
  }
}

function isDownloading(digest: string) {
  return activeDownloads.value.has(digest);
}

async function downloadLayer(layer: { digest: string; size: number }) {
  if (isDownloading(layer.digest)) return;
  
  activeDownloads.value.add(layer.digest);
  
  try {
    const eventSource = new EventSource(`/api/docker/download-layer?` + 
      new URLSearchParams({
        imageName: imageName.value,
        token: currentToken,
        digest: layer.digest,
        size: layer.size.toString()
      })
    );

    eventSource.onmessage = (event) => {
      const progress = JSON.parse(event.data);
      downloadProgress.value[layer.digest] = progress;
    };

    eventSource.onerror = () => {
      eventSource.close();
      activeDownloads.value.delete(layer.digest);
    };
  } catch (e) {
    console.error(`下载层 ${layer.digest} 失败:`, e);
    activeDownloads.value.delete(layer.digest);
  }
}

const isDownloadingAny = computed(() => activeDownloads.value.size > 0);

async function downloadAllLayers(layers: Array<{ digest: string; size: number; mediaType: string }>) {
  if (isDownloadingAny.value) return;
  
  console.log('开始下载所有层...');
  console.log('层信息:', layers);
  
  try {
    const eventSource = new EventSource(`/api/docker/pull-image?` + 
      new URLSearchParams({
        imageName: imageName.value,
        token: currentToken,
        layers: JSON.stringify(layers)
      })
    );

    layers.forEach(layer => {
      console.log(`初始化层 ${layer.digest} 的下载状态`);
      activeDownloads.value.add(layer.digest);
      downloadProgress.value[layer.digest] = {
        downloadedSize: 0,
        totalSize: layer.size,
        percentage: 0
      };
    });

    eventSource.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      console.log('收到进度更新:', data);
      
      if (data.summary) {
        console.log('下载完成，收到汇总信息:', data.summary);
        eventSource.close();
        layers.forEach(layer => {
          activeDownloads.value.delete(layer.digest);
        });
        
        if (currentManifest) {
          console.log('开始组装镜像...');
          await assembleImage(currentManifest.platform, currentManifest.detail);
        }
      } else {
        // 更新单个层的进度
        downloadProgress.value[data.layerDigest] = {
          downloadedSize: data.downloadedSize,
          totalSize: data.totalSize,
          percentage: data.percentage
        };
      }
    };

    eventSource.onerror = (err) => {
      console.error('EventSource错误:', err);
      eventSource.close();
      
      // 清理下载状态
      layers.forEach(layer => {
        activeDownloads.value.delete(layer.digest);
      });
    };
  } catch (e) {
    console.error('下载过程出错:', e);
    // 清理下载状态
    layers.forEach(layer => {
      activeDownloads.value.delete(layer.digest);
    });
  }
}

async function assembleImage(platformManifest: any, detailManifest: any) {
  try {
    const response = await $fetch('/api/docker/assemble-image', {
      params: {
        imageName: imageName.value,
        tag: tag.value,
        token: currentToken,
        manifest: JSON.stringify({
          config: detailManifest.config,
          layers: detailManifest.layers,
          platform: platformManifest.platform
        })
      },
      responseType: 'blob'
    });

    // 创建下载链接
    const blob = new Blob([response as BlobPart]);
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${imageName.value}-${tag.value}.tar`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

  } catch (e) {
    console.error('组装镜像时出错:', e);
  }
}

// 初始加载时获取一次
onMounted(() => {
  if (canPull.value) {
    fetchAndPull();
  }
});
</script>

<style scoped>
.container {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
  font-family: monospace;
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;
}

.input-group, .select-group {
  display: flex;
  gap: 10px;
}

input, select {
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-family: monospace;
  flex: 1;
}

button {
  padding: 8px 16px;
  background-color: #2196F3;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-family: monospace;
}

button:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}

.error-message {
  color: red;
  margin: 10px 0;
  padding: 10px;
  background-color: #ffebee;
  border-radius: 4px;
}

.progress-container {
  border: 2px solid #ddd;
  border-radius: 4px;
  padding: 10px;
  margin-top: 20px;
  background-color: #f8f9fa;
}

.layer-progress {
  padding: 5px 0;
}

.progress-line {
  display: flex;
  align-items: center;
  white-space: pre;
}

.digest {
  color: #666;
  width: 100px;
  display: inline-block;
}

.progress-text {
  flex: 1;
  font-family: monospace;
}
</style>
