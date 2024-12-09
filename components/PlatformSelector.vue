<template>
  <div class="select-group">
    <select v-model="selectedArch" @change="handleChange">
      <option value="">选择架构</option>
      <option 
        v-for="arch in availableArchitectures" 
        :key="arch" 
        :value="arch"
      >
        {{ arch }}
      </option>
    </select>
    <select v-model="selectedOS" @change="handleChange">
      <option value="">选择操作系统</option>
      <option 
        v-for="os in availableOS" 
        :key="os" 
        :value="os"
      >
        {{ os }}
      </option>
    </select>
  </div>
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

<style scoped>
.select-group {
  display: flex;
  gap: 10px;
}

select {
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-family: monospace;
  flex: 1;
}
</style> 