<script setup lang="ts">
import type { ReleaseInfo } from '../../types'

const isDark = useDark()

const { data = [] } = await useFetch<ReleaseInfo[]>('/api/releases')

const config = useRuntimeConfig()
</script>

<template>
  <div flex="~ col gap-8" mxa max-w-180 p10 font-sans lt-sm="px6">
    <div flex="~ col gap-4">
      <h1 flex="~ gap-2 col justify-center items-center">
        <a :href="`https://github.com/${config.public.login}`" target="_blank">
          <img :src="`https://github.com/${config.public.login}.png`" mr1 w-18 rounded-full shadow>
        </a>
        <div flex="~ col">
          <div text-3xl>
            <a :href="`https://github.com/${config.public.login}`" target="_blank">
              {{ config.public.name }}
            </a>
            is <span animate-pulse>Releasing...</span>
          </div>
          <p flex items-center justify-center gap-2 op50>
            <a :href="`https://github.com/${config.public.login}`" target="_blank">
              <span font-mono>@{{ config.public.login }}</span>'s recent releases commits on GitHub
            </a>
          </p>
        </div>
      </h1>

      <div flex items-center justify-center gap-3 text-lg>
        <button title="Toggle Dark Mode" @click="isDark = !isDark">
          <span i-ph-sun-duotone dark:i-ph-moon-stars-duotone flex />
        </button>
        <a href="https://github.com/antfu/releases.antfu.me" target="_blank" title="GitHub Source Code">
          <span i-ph-github-logo-duotone flex />
        </a>
        <a href="/feed.xml" target="_blank" title="RSS Feed">
          <span i-ph-rss-simple-duotone flex />
        </a>
      </div>

      <div p2>
        <hr ma w-20 op25>
      </div>
    </div>

    <TheItem
      v-for="item of data"
      :key="item.id"
      :item="item"
    />
  </div>
</template>
