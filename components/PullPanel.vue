<template>
  <div class="space-y-6">
    <Transition
      appear
      enter-active-class="transition duration-700 ease-out"
      enter-from-class="opacity-0 -translate-y-4"
      enter-to-class="opacity-100 translate-y-0"
    >
      <div class="bg-gray-50 p-6 rounded-xl transition-shadow duration-300 hover:shadow-md">
        <div class="grid grid-cols-2 gap-4 mb-4">
          <ImageSearchInput v-model="imageName" />
          <TagSearchInput v-model="tag" :image-name="imageName" />
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
      <div v-if="platforms.length" class="bg-gray-50 p-6 rounded-xl transition-shadow duration-300 hover:shadow-md">
        <PlatformSelector
          :platforms="platforms"
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
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-4"
    >
      <UAlert
        v-if="error"
        color="red"
        variant="soft"
        title="Error"
        :description="error"
      />
    </Transition>

    <Transition
      enter-active-class="transition-all duration-300 ease-out"
      enter-from-class="opacity-0 -translate-y-4"
      enter-to-class="opacity-100 translate-y-0"
    >
      <UCard
        v-if="downloadComplete"
        class="bg-gray-50 transition-shadow duration-300 hover:shadow-md"
      >
        <template #header>
          <h3 class="text-lg font-bold">Download Complete!</h3>
        </template>

        <div class="space-y-2">
          <p class="text-gray-700">
            Total: {{ downloadSummary?.total }} layers
            <span class="text-sm text-gray-500">
              (New Download: {{ downloadSummary?.downloaded }},
              Already Exists: {{ downloadSummary?.skipped }})
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
        v-if="Object.keys(downloadProgress).length > 0 && !downloadComplete"
        :progress-data="downloadProgress"
      />
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from "vue";
import type {
  TokenResponse,
  ManifestResponse,
  ManifestDetailResponse,
  DockerPlatform,
  DownloadProgress,
} from "~/types/docker";

const imageName = ref("");
const tag = ref("");
const loading = ref(false);
const error = ref("");
const platforms = ref<DockerPlatform[]>([]);
const selectedPlatform = ref<DockerPlatform | null>(null);
const downloadProgress = ref<Record<string, DownloadProgress>>({});
const activeDownloads = ref(new Set<string>());
const currentToken = ref("");
const currentManifest = ref<any>(null);
const downloadComplete = ref(false);
const downloadSummary = ref<{
  total: number;
  skipped: number;
  downloaded: number;
} | null>(null);
const activeEventSource = ref<EventSource | null>(null);

const canPull = computed(
  () =>
    imageName.value &&
    tag.value &&
    selectedPlatform.value?.architecture &&
    selectedPlatform.value?.os
);

const canFetchPlatforms = computed(
  () => imageName.value && tag.value && !loading.value
);

const resetState = () => {
  if (activeEventSource.value) {
    activeEventSource.value.close();
    activeEventSource.value = null;
  }
  activeDownloads.value.clear();
  platforms.value = [];
  selectedPlatform.value = null;
  error.value = "";
  downloadProgress.value = {};
  downloadComplete.value = false;
  downloadSummary.value = null;
};

watch([imageName, tag], () => {
  resetState();
});

const handlePlatformSelect = (platform: DockerPlatform) => {
  selectedPlatform.value = platform;
};

const fetchToken = async () => {
  const response = await $fetch<TokenResponse>("/api/docker/token", {
    params: {
      imageName: imageName.value,
      scope: "pull",
    },
  });
  currentToken.value = response.token;
};

const fetchManifests = async () => {
  const response = await $fetch<ManifestResponse>("/api/docker/manifest", {
    params: {
      imageName: imageName.value,
      tag: tag.value,
      token: currentToken.value,
    },
  });
  platforms.value = response.manifests.map((m) => m.platform);
  return response;
};

const fetchManifestDetail = async (targetManifest: any) => {
  return await $fetch<ManifestDetailResponse>("/api/docker/manifest-detail", {
    params: {
      imageName: imageName.value,
      digest: targetManifest.digest,
      token: currentToken.value,
      mediaType: targetManifest.mediaType,
    },
  });
};

const handleDownloadProgress = async (eventSource: EventSource, layers: any[]) => {
  return new Promise((resolve, reject) => {
    eventSource.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      if (data.summary) {
        eventSource.close();
        layers.forEach((layer) => {
          activeDownloads.value.delete(layer.digest);
        });

        downloadComplete.value = true;
        downloadSummary.value = data.summary;

        if (currentManifest.value) {
          await assembleImage();
        }
        resolve(null);
      } else {
        downloadProgress.value[data.layerDigest] = {
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
        activeDownloads.value.delete(layer.digest);
      });
      reject(err);
    };
  });
};

const downloadAllLayers = async (layers: any[]) => {
  if (activeDownloads.value.size > 0) return;

  const eventSource = new EventSource(
    `/api/docker/pull-image?${new URLSearchParams({
      imageName: imageName.value,
      token: currentToken.value,
      layers: JSON.stringify(layers),
    })}`
  );

  activeEventSource.value = eventSource;

  layers.forEach((layer) => {
    activeDownloads.value.add(layer.digest);
    downloadProgress.value[layer.digest] = {
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
        imageName: imageName.value,
        tag: tag.value,
        token: currentToken.value,
        manifest: JSON.stringify({
          config: currentManifest.value.detail.config,
          layers: currentManifest.value.detail.layers,
          platform: currentManifest.value.platform.platform,
        }),
      },
      responseType: "blob",
    });

    const buffer = await (response as unknown as Response).arrayBuffer();
    const blob = new Blob([buffer], { type: "application/x-tar" });

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeName = imageName.value.replaceAll("/", "_");
    a.download = `${safeName}-${tag.value}.tar`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  } catch (e) {
    console.error("组装镜像时出错:", e);
    error.value = "组装镜像失败";
  }
};

const handlePull = async () => {
  if (!canPull.value) return;

  loading.value = true;
  error.value = "";
  downloadProgress.value = {};
  currentManifest.value = null;
  downloadComplete.value = false;
  downloadSummary.value = null;

  try {
    await fetchToken();
    const manifests = await fetchManifests();
    const targetManifest = manifests.manifests.find(
      (m) =>
        m.platform.architecture === selectedPlatform.value?.architecture &&
        m.platform.os === selectedPlatform.value?.os
    );

    if (!targetManifest) {
      throw new Error(
        `未找到 ${selectedPlatform.value?.architecture}/${selectedPlatform.value?.os} 平台的镜像`
      );
    }

    const detail = await fetchManifestDetail(targetManifest);
    currentManifest.value = { platform: targetManifest, detail };
    await downloadAllLayers(detail.layers);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "拉取失败";
    console.error("拉取失败:", e);
  } finally {
    loading.value = false;
  }
};

const initPlatforms = async () => {
  if (!canFetchPlatforms.value) {
    error.value = "请输入镜像名称和标签";
    return;
  }

  loading.value = true;
  error.value = "";
  platforms.value = [];
  selectedPlatform.value = null;

  try {
    await fetchToken();
    const manifests = await fetchManifests();
    platforms.value = manifests.manifests.map((m) => m.platform);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "获取平台信息失败";
    console.error("获取平台信息失败:", e);
  } finally {
    loading.value = false;
  }
};

onBeforeUnmount(() => {
  if (activeEventSource.value) {
    activeEventSource.value.close();
    activeEventSource.value = null;
  }
});
</script>
