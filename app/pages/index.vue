<script setup lang="ts">
import type { ReleaseInfo } from '../../types'

const { data = [] } = await useFetch<ReleaseInfo[]>('/api/releases')
</script>

<template>
  <div flex="~ col gap-8" mxa max-w-180 p10 font-sans lt-sm="px6">
    <div flex="~ col">
      <h1 text-3xl flex="~ gap-2 wrap justify-center items-center">
        <a href="https://github.com/antfu" target="_blank" flex="~ items-center gap-2">
          <img src="https://github.com/antfu.png" mr1 w-12 rounded-full>
          Anthony Fu
        </a>
        is <span animate-pulse>Releasing...</span>
      </h1>
      <p mt1 flex items-center justify-center gap-1 op75>
        <a href="https://github.com/antfu" target="_blank">
          Anthony Fu's recent releases commits on GitHub
        </a>
        <a href="/feed.xml" target="_blank" title="RSS Feed">
          <div i-ph-rss-simple-duotone />
        </a>
      </p>

      <div p5>
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
