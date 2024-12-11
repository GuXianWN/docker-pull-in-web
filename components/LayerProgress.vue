<template>
  <div class="progress-container">
    <div
      v-for="(progress, digest) in progressData"
      :key="digest"
      class="layer-progress"
    >
      <div class="progress-line">
        <span class="digest">{{ formatDigest(digest) }}:</span>
        <span class="progress-text">{{ formatProgress(progress) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { DownloadProgress } from "~/types/docker";

const props = defineProps<{
  progressData: Record<string, DownloadProgress>;
}>();

const formatDigest = (digest: string): string =>
  digest.replace("sha256:", "").substring(0, 12);

const formatProgress = (progress: DownloadProgress): string => {
  const downloaded = (progress.downloadedSize / 1024 / 1024).toFixed(2);
  const total = (progress.totalSize / 1024 / 1024).toFixed(2);
  const bar = "=".repeat(Math.floor(progress.percentage / 2));
  const space = " ".repeat(50 - Math.floor(progress.percentage / 2));
  return `[${bar}>${space}] ${downloaded}MB/${total}MB`;
};
</script>

<style scoped>
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