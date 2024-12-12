// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: true },
  modules: [
    '@unocss/nuxt',
    '@nuxt/ui'
  ],
  css: ['~/assets/css/main.css'],
  unocss: {
    uno: true,
    icons: false,
    attributify: true,
  },
  colorMode: {
    preference: 'light'
  },
  ui: {
    global: true
  }
})
