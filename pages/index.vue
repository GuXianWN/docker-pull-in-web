<template>
  <UContainer class="max-w-2xl py-10">
    <Transition
      appear
      enter-active-class="transition duration-700 ease-out"
      enter-from-class="opacity-0 -translate-y-4"
      enter-to-class="opacity-100 translate-y-0"
    >
      <div class="text-center mb-12">
        <h1 class="text-3xl font-bold tracking-tight">Docker Registry Puller</h1>
        <p class="text-gray-500 mt-2">Pull and download Docker images from registry</p>
      </div>
    </Transition>
    
    <div class="space-y-6">
      <Transition
        appear
        enter-active-class="transition duration-500 delay-200 ease-out"
        enter-from-class="opacity-0 -translate-y-4"
        enter-to-class="opacity-100 translate-y-0"
      >
        <div class="bg-gray-50 p-6 rounded-xl transition-shadow duration-300 hover:shadow-md">
          <div class="grid grid-cols-2 gap-4 mb-4">
            <UInput
              v-model="state.imageName"
              placeholder="Image Name (e.g., nginx)"
              class="w-full"
              @input="handleImageChange"
            />
            <UInput
              v-model="state.tag"
              placeholder="Tag (e.g., latest)"
              class="w-full focus:border-gray-400 border-gray-200 !ring-0"
              @input="handleImageChange"
            />
          </div>
          
          <UButton
            block
            @click="initPlatforms"
            :disabled="!canFetchPlatforms"
            color="gray"
            variant="solid"
            class="transition-all duration-200 active:scale-[0.98]"
          >
            获取平台信息
          </UButton>
        </div>
      </Transition>

      <Transition
        enter-active-class="transition-all duration-300 ease-out"
        enter-from-class="opacity-0 -translate-y-4"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition-all duration-200 ease-in"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 -translate-y-4"
      >
        <div v-if="state.platforms.length" class="bg-gray-50 p-6 rounded-xl transition-shadow duration-300 hover:shadow-md">
          <PlatformSelector
            :platforms="state.platforms"
            @update:platform="handlePlatformSelect"
          />
          
          <UButton
            block
            class="mt-4 transition-all duration-200 active:scale-[0.98]"
            @click="handlePull"
            :disabled="!canPull"
            color="gray"
            variant="solid"
          >
            拉取镜像
          </UButton>
        </div>
      </Transition>

      <Transition
        enter-active-class="transition-all duration-300 ease-out"
        enter-from-class="opacity-0 -translate-y-4"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition-all duration-200 ease-in"
        leave-from-class="opacity-0"
        leave-to-class="opacity-0 -translate-y-4"
      >
        <UAlert
          v-if="state.error"
          color="red"
          variant="soft"
          title="Error"
          :description="state.error"
        />
      </Transition>

      <Transition
        enter-active-class="transition-all duration-300 ease-out"
        enter-from-class="opacity-0 -translate-y-4"
        enter-to-class="opacity-100 translate-y-0"
      >
        <UCard
          v-if="state.downloadComplete"
          class="bg-gray-50 transition-shadow duration-300 hover:shadow-md"
        >
          <template #header>
            <h3 class="text-lg font-bold">Download Complete!</h3>
          </template>

          <div class="space-y-2">
            <p class="text-gray-700">
              Total: {{ state.downloadSummary?.total }} layers
              <span class="text-sm text-gray-500">
                (New Download: {{ state.downloadSummary?.downloaded }},
                Already Exists: {{ state.downloadSummary?.skipped }})
              </span>
            </p>
            <p class="text-sm text-gray-500">
              Image file has started downloading, please check your browser download list.
            </p>
          </div>
        </UCard>
      </Transition>

      <Transition
        enter-active-class="transition-all duration-300 ease-out"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
      >
        <LayerProgress
          v-if="Object.keys(state.downloadProgress).length > 0 && !state.downloadComplete"
          :progress-data="state.downloadProgress"
        />
      </Transition>
    </div>
  </UContainer>
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

// 状态处理
const state = reactive({
  imageName: "",
  tag: "",
  loading: false,
  error: "",
  platforms: [] as DockerPlatform[],
  selectedPlatform: null as DockerPlatform | null,
  downloadProgress: {} as Record<string, DownloadProgress>,
  activeDownloads: new Set<string>(),
  currentToken: "",
  currentManifest: null as any,
  downloadComplete: false,
  downloadSummary: null as {
    total: number;
    skipped: number;
    downloaded: number;
  } | null,
});

// 计算属性
const canPull = computed(
  () =>
    state.imageName &&
    state.tag &&
    state.selectedPlatform?.architecture &&
    state.selectedPlatform?.os
);

const canFetchPlatforms = computed(() => 
  state.imageName && state.tag && !state.loading
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
        
        // 设置下载完成状态和汇总信息
        state.downloadComplete = true;
        state.downloadSummary = data.summary;
        
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
  state.downloadComplete = false;
  state.downloadSummary = null;

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

// 初始化平台信息
const initPlatforms = async () => {
  if (!canFetchPlatforms.value) {
    state.error = "请输入镜像名称和标签";
    return;
  }

  state.loading = true;
  state.error = "";
  state.platforms = [];
  state.selectedPlatform = null;
  
  try {
    await fetchToken();
    const manifests = await fetchManifests();
    state.platforms = manifests.manifests.map((m) => m.platform);
  } catch (e) {
    state.error = e instanceof Error ? e.message : "获取平台信息失败";
    console.error("获取平台信息失败:", e);
  } finally {
    state.loading = false;
  }
};

// 新增处理函数
const handleImageChange = () => {
  state.platforms = [];
  state.selectedPlatform = null;
  state.error = "";
  state.downloadProgress = {};
  state.downloadComplete = false;
  state.downloadSummary = null;
};
</script>

<style>
.page-enter-active,
.page-leave-active {
  transition: all 0.3s ease-out;
}

.page-enter-from,
.page-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.u-button {
  position: relative;
  overflow: hidden;
}

.u-button::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 5px;
  height: 5px;
  background: rgba(255, 255, 255, 0.5);
  opacity: 0;
  border-radius: 100%;
  transform: scale(1, 1) translate(-50%);
  transform-origin: 50% 50%;
}

.u-button:active::after {
  animation: ripple 0.4s ease-out;
}

@keyframes ripple {
  0% {
    transform: scale(0, 0);
    opacity: 0.5;
  }
  100% {
    transform: scale(20, 20);
    opacity: 0;
  }
}
</style>
