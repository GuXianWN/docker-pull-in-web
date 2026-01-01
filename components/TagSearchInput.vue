<template>
  <USelectMenu
    v-model="inputValue"
    :options="options"
    :loading="loading"
    option-attribute="label"
    value-attribute="value"
    placeholder="选择 Tag"
    class="w-full"
    @open="handleOpen"
  >
    <template #option="{ option }">
      <div class="flex flex-col">
        <span class="text-sm text-gray-900 font-medium">{{ option.label }}</span>
        <span v-if="option.lastUpdated" class="text-xs text-gray-500">
          更新于 {{ formatTime(option.lastUpdated) }}
        </span>
      </div>
    </template>
    <template #empty>
      <span v-if="error" class="text-red-500">{{ error }}</span>
      <span v-else-if="!imageName.trim()" class="text-gray-500">请先输入镜像名称</span>
      <span v-else class="text-gray-500">暂无可用标签</span>
    </template>
  </USelectMenu>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { useVModel } from "@vueuse/core";
import type { DockerTagResponse } from "~/types/docker";

type TagOption = {
  label: string;
  value: string;
  lastUpdated?: string;
};

const props = defineProps<{
  modelValue: string;
  imageName: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

const inputValue = useVModel(props, "modelValue", emit);
const options = ref<TagOption[]>([]);
const loading = ref(false);
const error = ref("");

const fetchTags = async (pageSize = 50) => {
  if (!props.imageName.trim()) {
    options.value = [];
    error.value = "请先输入镜像名称";
    loading.value = false;
    return;
  }
  loading.value = true;
  error.value = "";
  try {
    const response = await $fetch<DockerTagResponse>("/api/docker/tags", {
      params: {
        imageName: props.imageName,
        query: "",
        pageSize,
      },
    });
    options.value = response.results.map((item) => ({
      label: item.name,
      value: item.name,
      lastUpdated: item.last_updated,
    }));
  } catch (e) {
    console.error("获取标签失败:", e);
    error.value = "获取失败，请稍后重试";
    options.value = [];
  } finally {
    loading.value = false;
  }
};

const handleOpen = () => {
  if (!options.value.length && !loading.value) {
    fetchTags(50);
  }
};

const formatTime = (value?: string) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

watch(
  () => props.imageName,
  () => {
    options.value = [];
    error.value = "";
    loading.value = false;
  }
);
</script>
