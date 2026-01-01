<template>
  <UInputMenu
    :model-value="selectedValue"
    :query="query"
    :options="options"
    :loading="loading"
    option-attribute="label"
    value-attribute="value"
    placeholder="镜像名称（支持搜索）"
    class="w-full"
    @update:model-value="handleSelect"
    @update:query="handleQueryUpdate"
    @focus="handleFocus"
  >
    <template #option="{ option }">
      <div class="flex flex-col">
        <div class="text-sm text-gray-900 font-medium">
          {{ option.label }}
          <span v-if="option.isOfficial" class="ml-1 text-xs text-green-600">官方</span>
        </div>
        <div class="text-xs text-gray-500 truncate">
          <span v-if="option.description">{{ option.description }}</span>
          <span v-else>暂无描述</span>
          <span v-if="typeof option.pulls === 'number'" class="ml-2">
            下载量 {{ formatCount(option.pulls) }}
          </span>
        </div>
      </div>
    </template>
    <template #empty>
      <span v-if="error" class="text-red-500">{{ error }}</span>
      <span v-else-if="query.trim().length < 2" class="text-gray-500">
        请输入至少 2 个字符
      </span>
      <span v-else class="text-gray-500">未找到匹配的镜像</span>
    </template>
  </UInputMenu>
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from "vue";
import { useVModel } from "@vueuse/core";
import debounce from "lodash/debounce";
import type { DockerSearchResponse } from "~/types/docker";

type SearchOption = {
  label: string;
  value: string;
  description?: string;
  isOfficial?: boolean;
  pulls?: number;
};

const props = defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

const inputValue = useVModel(props, "modelValue", emit);
const query = ref(inputValue.value || "");
const selectedValue = ref<string | null>(null);
const options = ref<SearchOption[]>([]);
const loading = ref(false);
const error = ref("");
const ignoreNextQueryClear = ref(false);

const fetchSearch = async (q: string) => {
  const trimmed = q.trim();
  if (trimmed.length < 2) {
    options.value = [];
    error.value = "";
    loading.value = false;
    return;
  }
  loading.value = true;
  error.value = "";
  try {
    const response = await $fetch<DockerSearchResponse>("/api/docker/search", {
      params: {
        query: trimmed,
        pageSize: 10,
      },
    });
    options.value = response.results.map((item) => ({
      label: item.fullName,
      value: item.fullName,
      description: item.description,
      isOfficial: item.is_official,
      pulls: item.pull_count,
    }));
  } catch (e) {
    console.error("搜索镜像失败:", e);
    error.value = "搜索失败，请稍后重试";
    options.value = [];
  } finally {
    loading.value = false;
  }
};

const debouncedSearch = debounce(fetchSearch, 300);

const formatCount = (value?: number) => {
  if (value === undefined || value === null) return "";
  return new Intl.NumberFormat("zh-CN").format(value);
};

const handleSelect = (value: string) => {
  ignoreNextQueryClear.value = true;
  selectedValue.value = value;
  inputValue.value = value;
  query.value = value;
};

const handleQueryUpdate = (value: string) => {
  if (value === "" && ignoreNextQueryClear.value) {
    ignoreNextQueryClear.value = false;
    return;
  }
  ignoreNextQueryClear.value = false;
  query.value = value;
  inputValue.value = value;
  if (selectedValue.value && selectedValue.value !== value) {
    selectedValue.value = null;
  }
  debouncedSearch(value);
};

const handleFocus = () => {
  if (query.value.trim().length >= 2) {
    debouncedSearch(query.value);
  }
};

watch(
  () => inputValue.value,
  (value) => {
    if (value !== query.value) {
      query.value = value || "";
    }
    if (selectedValue.value && selectedValue.value !== value) {
      selectedValue.value = null;
    }
  }
);

onBeforeUnmount(() => {
  debouncedSearch.cancel();
});
</script>
