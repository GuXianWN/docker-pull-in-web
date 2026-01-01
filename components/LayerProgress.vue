<template>
  <Transition
    appear
    enter-active-class="transition-all duration-300 ease-out"
    enter-from-class="opacity-0 -translate-y-4"
    enter-to-class="opacity-100 translate-y-0"
  >
    <div class="mt-5 p-3 bg-gray-50 border-2 border-gray-300 rounded-lg">
      <div
        v-for="(progress, digest) in progressData"
        :key="digest"
        class="py-1"
      >
        <div class="flex items-center">
          <span class="w-32 text-gray-600 shrink-0">{{ formatDigest(digest) }}:</span>
          <div class="flex-1 flex items-center gap-2 min-w-0">
            <span ref="barContainer" class="progress-bar font-mono">
              {{ formatProgressBar(progress) }}
            </span>
            <span class="text-gray-600 shrink-0 font-mono">{{ formatSize(progress) }}</span>
          </div>
        </div>
      </div>
      <span ref="charMeasure" class="absolute opacity-0 pointer-events-none font-mono">0</span>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useElementSize } from "@vueuse/core";
import type { DownloadProgress } from "~/types/docker";

const props = defineProps<{
  progressData: Record<string, DownloadProgress>;
}>();

const formatDigest = (digest: string): string =>
  digest.replace("sha256:", "").substring(0, 12);

const barContainer = ref<HTMLElement | null>(null);
const charMeasure = ref<HTMLElement | null>(null);
const { width: barWidth } = useElementSize(barContainer);
const { width: charWidth } = useElementSize(charMeasure);

const barLength = computed(() => {
  const containerWidth = barWidth.value || 0;
  const singleChar = charWidth.value || 0;
  if (containerWidth <= 0 || singleChar <= 0) return 30;
  const available = Math.floor(containerWidth / singleChar) - 4;
  return Math.max(10, available);
});

const formatProgressBar = (progress: DownloadProgress): string => {
  const total = barLength.value;
  const filled = Math.floor((progress.percentage / 100) * total);
  const clamped = Math.min(Math.max(filled, 0), total);
  if (clamped >= total) {
    return `[${"=".repeat(total)}]`;
  }
  const empty = Math.max(total - clamped - 1, 0);
  return `[${"=".repeat(clamped)}>${" ".repeat(empty)}]`;
};

const formatSize = (progress: DownloadProgress): string => {
  const downloaded = (progress.downloadedSize / 1024 / 1024).toFixed(2);
  const total = (progress.totalSize / 1024 / 1024).toFixed(2);
  return `${downloaded}MB/${total}MB`;
};
</script>

<style scoped>
.progress-bar {
  display: block;
  flex: 1;
  min-width: 0;
  white-space: pre;
}
</style> 
