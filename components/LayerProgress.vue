<template>
  <Transition
    appear
    enter-active-class="transition-all duration-300 ease-out"
    enter-from-class="opacity-0 -translate-y-4"
    enter-to-class="opacity-100 translate-y-0"
  >
    <div class="mt-5 p-3 bg-gray-50 border-2 border-gray-300 rounded-lg font-mono">
      <div
        v-for="(progress, digest) in progressData"
        :key="digest"
        class="py-1"
      >
        <div class="flex items-center whitespace-pre">
          <span class="w-32 text-gray-600 shrink-0">{{ formatDigest(digest) }}:</span>
          <div class="flex-1 flex items-center">
            <span class="progress-bar">{{ formatProgressBar(progress) }}</span>
            <span class="ml-2 text-gray-600 shrink-0">{{ formatSize(progress) }}</span>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import type { DownloadProgress } from "~/types/docker";

const props = defineProps<{
  progressData: Record<string, DownloadProgress>;
}>();

const formatDigest = (digest: string): string =>
  digest.replace("sha256:", "").substring(0, 12);

const formatProgressBar = (progress: DownloadProgress): string => {
  const bar = "=".repeat(Math.floor(progress.percentage / 2));
  const space = " ".repeat(50 - Math.floor(progress.percentage / 2));
  return `[${bar}>${space}]`;
};

const formatSize = (progress: DownloadProgress): string => {
  const downloaded = (progress.downloadedSize / 1024 / 1024).toFixed(2);
  const total = (progress.totalSize / 1024 / 1024).toFixed(2);
  return `${downloaded}MB/${total}MB`;
};
</script>

<style scoped>
.progress-bar {
  font-family: monospace;
  white-space: pre;
}
</style> 