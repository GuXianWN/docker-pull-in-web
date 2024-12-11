// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: true },
  modules: [
    '@unocss/nuxt',
  ],
  unocss: {
    // presets
    uno: true, // 启用默认预设
    icons: true, // 启用图标
    attributify: true, // 启用属性化模式
    
    // core options
    shortcuts: {
      'btn': 'px-4 py-2 rounded-lg cursor-pointer disabled:cursor-not-allowed disabled:opacity-50',
      'btn-blue': 'btn bg-blue-500 text-white hover:bg-blue-600 disabled:bg-gray-400',
      'btn-green': 'btn bg-green-500 text-white hover:bg-green-600 disabled:bg-gray-400',
      'input-base': 'px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500',
    },
  },
})
