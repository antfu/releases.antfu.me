import process from 'node:process'

const name = process.env.GITHUB_NAME || 'Anthony Fu'
const login = process.env.GITHUB_LOGIN || 'antfu'
const website = process.env.WEBSITE_DOMAIN || 'https://releases.antfu.me'

export default defineNuxtConfig({
  modules: [
    '@vueuse/nuxt',
    '@unocss/nuxt',
    '@nuxt/eslint',
    '@nuxthub/core',
  ],

  runtimeConfig: {
    githubToken: process.env.GITHUB_TOKEN,
    public: {
      name,
      login,
      website,
    },
  },

  hub: {
    kv: true,
  },

  experimental: {
    renderJsonPayloads: true,
    typedPages: true,
  },

  css: [
    '@unocss/reset/tailwind.css',
  ],

  app: {
    head: {
      title: `${name} is Releasing...`,
      viewport: 'width=device-width,initial-scale=1',
      link: [
        { rel: 'icon', href: '/favicon.png' },
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'alternate', type: 'application/rss+xml', title: `${name}'s recent releases`, href: '/feed.xml' },
      ],
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: `${name}'s recent releases` },
        { name: 'theme-color', media: '(prefers-color-scheme: light)', content: 'white' },
        { name: 'theme-color', media: '(prefers-color-scheme: dark)', content: '#222222' },
        { property: 'og:image', content: `${website}/og.png` },
        { property: 'og:image:alt', content: `${name} is Releasing...` },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:image', content: `${website}/og.png` },
        { name: 'twitter:image:alt', content: `${name} is Releasing...` },
      ],
    },
  },

  devtools: {
    enabled: true,
  },

  eslint: {
    config: {
      standalone: false,
    },
  },

  future: {
    compatibilityVersion: 4,
  },

  compatibilityDate: '2024-08-14',
})
