<template>
  <Transition
    appear
    enter-active-class="transition-all duration-300 ease-out"
    enter-from-class="opacity-0 -translate-y-4"
    enter-to-class="opacity-100 translate-y-0"
  >
    <div class="flex gap-3">
      <USelect
        v-model="selectedArch"
        :options="availableArchitectures"
        placeholder="选择架构"
        class="flex-1 focus:border-gray-400 border-gray-200 !ring-0"
        @update:model-value="handleChange"
      />
      <USelect
        v-model="selectedOS"
        :options="availableOS"
        placeholder="选择操作系统"
        class="flex-1 focus:border-gray-400 border-gray-200 !ring-0"
        @update:model-value="handleChange"
      />
    </div>
  </Transition>
</template>

<script setup lang="ts">
interface Platform {
  architecture: string;
  os: string;
}

const props = defineProps<{
  platforms: Platform[];
}>();

const emit = defineEmits<{
  (e: 'update:platform', platform: { architecture: string; os: string; }): void;
}>();

const selectedArch = ref('');
const selectedOS = ref('');

// 从manifests中提取可用的架构和操作系统
const availableArchitectures = computed(() => 
  [...new Set(props.platforms.map(p => p.architecture))]
);

const availableOS = computed(() => 
  [...new Set(props.platforms.map(p => p.os))]
);

const handleChange = () => {
  if (selectedArch.value && selectedOS.value) {
    emit('update:platform', {
      architecture: selectedArch.value,
      os: selectedOS.value
    });
  }
};
</script> 