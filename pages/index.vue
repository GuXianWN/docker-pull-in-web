<template>
  <div class="container">
    <div class="form-section">
      <div class="input-group">
        <input v-model="state.imageName" placeholder="镜像名称 (例如: nginx)" />
        <input v-model="state.tag" placeholder="标签 (例如: latest)" />
      </div>
      <PlatformSelector
        v-if="state.platforms.length > 0"
        :platforms="state.platforms"
        @update:platform="handlePlatformSelect"
      />
      <button
        @click="handlePull"
        :disabled="state.loading || !canPull"
        class="pull-button"
      >
        {{ state.loading ? "处理中..." : "拉取镜像" }}
      </button>
    </div>

    <div v-if="state.error" class="error-message">
      {{ state.error }}
    </div>

    <LayerProgress
      v-if="Object.keys(state.downloadProgress).length > 0"
      :progress-data="state.downloadProgress"
    />
  </div>
</template>

<script setup lang="ts">
import { reactive, computed } from "vue";
import type {
  TokenResponse,
  ManifestResponse,
  ManifestDetailResponse,
  DockerPlatform,
  DownloadProgress,
} from "~/types/docker";

// 状态管理
const state = reactive({
  imageName: "nginx",
  tag: "latest",
  loading: false,
  error: "",
  platforms: [] as DockerPlatform[],
  selectedPlatform: null as DockerPlatform | null,
  downloadProgress: {} as Record<string, DownloadProgress>,
  activeDownloads: new Set<string>(),
  currentToken: "",
  currentManifest: null as any,
});

// 计算属性
const canPull = computed(
  () =>
    state.imageName &&
    state.tag &&
    state.selectedPlatform?.architecture &&
    state.selectedPlatform?.os
);

// 事件处理
const handlePlatformSelect = (platform: DockerPlatform) => {
  state.selectedPlatform = platform;
};

// API调用
const fetchToken = async () => {
  const response = await $fetch<TokenResponse>("/api/docker/token", {
    params: {
      imageName: state.imageName,
      scope: "pull",
    },
  });
  state.currentToken = response.token;
};

const fetchManifests = async () => {
  const response = await $fetch<ManifestResponse>("/api/docker/manifest", {
    params: {
      imageName: state.imageName,
      tag: state.tag,
      token: state.currentToken,
    },
  });
  state.platforms = response.manifests.map((m) => m.platform);
  return response;
};

const fetchManifestDetail = async (targetManifest: any) => {
  return await $fetch<ManifestDetailResponse>("/api/docker/manifest-detail", {
    params: {
      imageName: state.imageName,
      digest: targetManifest.digest,
      token: state.currentToken,
      mediaType: targetManifest.mediaType,
    },
  });
};

// 下载处理
const handleDownloadProgress = async (eventSource: EventSource, layers: any[]) => {
  return new Promise((resolve, reject) => {
    eventSource.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      if (data.summary) {
        eventSource.close();
        layers.forEach((layer) => {
          state.activeDownloads.delete(layer.digest);
        });
        if (state.currentManifest) {
          await assembleImage();
        }
        resolve(null);
      } else {
        state.downloadProgress[data.layerDigest] = {
          downloadedSize: data.downloadedSize,
          totalSize: data.totalSize,
          percentage: data.percentage,
        };
      }
    };

    eventSource.onerror = (err) => {
      console.error("EventSource错误:", err);
      eventSource.close();
      layers.forEach((layer) => {
        state.activeDownloads.delete(layer.digest);
      });
      reject(err);
    };
  });
};

const downloadAllLayers = async (layers: any[]) => {
  if (state.activeDownloads.size > 0) return;

  const eventSource = new EventSource(
    `/api/docker/pull-image?${new URLSearchParams({
      imageName: state.imageName,
      token: state.currentToken,
      layers: JSON.stringify(layers),
    })}`
  );

  layers.forEach((layer) => {
    state.activeDownloads.add(layer.digest);
    state.downloadProgress[layer.digest] = {
      downloadedSize: 0,
      totalSize: layer.size,
      percentage: 0,
    };
  });

  await handleDownloadProgress(eventSource, layers);
};

const assembleImage = async () => {
  try {
    const response = await $fetch("/api/docker/assemble-image", {
      params: {
        imageName: state.imageName,
        tag: state.tag,
        token: state.currentToken,
        manifest: JSON.stringify({
          config: state.currentManifest.detail.config,
          layers: state.currentManifest.detail.layers,
          platform: state.currentManifest.platform.platform,
        }),
      },
      responseType: "blob",
    });

    const buffer = await (response as unknown as Response).arrayBuffer();
    const blob = new Blob([buffer], { type: "application/x-tar" });
    
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${state.imageName}-${state.tag}.tar`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  } catch (e) {
    console.error("组装镜像时出错:", e);
    state.error = "组装镜像失败";
  }
};

// 主要流程
const handlePull = async () => {
  if (!canPull.value) return;

  state.loading = true;
  state.error = "";
  state.downloadProgress = {};
  state.currentManifest = null;

  try {
    await fetchToken();
    const manifests = await fetchManifests();
    const targetManifest = manifests.manifests.find(
      (m) =>
        m.platform.architecture === state.selectedPlatform?.architecture &&
        m.platform.os === state.selectedPlatform?.os
    );

    if (!targetManifest) {
      throw new Error(
        `未找到 ${state.selectedPlatform?.architecture}/${state.selectedPlatform?.os} 平台的镜像`
      );
    }

    const detail = await fetchManifestDetail(targetManifest);
    state.currentManifest = { platform: targetManifest, detail };
    await downloadAllLayers(detail.layers);
  } catch (e) {
    state.error = e instanceof Error ? e.message : "拉取失败";
    console.error("拉取失败:", e);
  } finally {
    state.loading = false;
  }
};

// 初始化
onMounted(() => {
  if (canPull.value) {
    handlePull();
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

.input-group {
  display: flex;
  gap: 10px;
}

input {
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-family: monospace;
  flex: 1;
}

.pull-button {
  padding: 8px 16px;
  background-color: #2196f3;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-family: monospace;
}

.pull-button:disabled {
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
</style>
