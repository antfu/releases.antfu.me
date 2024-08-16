<script setup lang="ts">
import { formatTimeAgo } from '@vueuse/core'
import type { ReleaseInfo } from '../../types'

const { data = [] } = await useFetch<ReleaseInfo[]>('/api/releases')
</script>

<template>
  <div flex="~ col gap-8" mxa max-w-180 p10 font-sans lt-sm:px6>
    <div flex="~ col">
      <h1 text-3xl flex="~ gap-2 wrap justify-center items-center">
        <a href="https://github.com/antfu" target="_blank" flex="~ items-center gap-2">
          <img src="https://github.com/antfu.png" mr1 w-12 rounded-full>
          Anthony Fu
        </a>
        is <span animate-pulse>Releasing...</span>
      </h1>
      <p mt1 text-center op75>
        <a href="https://github.com/antfu" target="_blank">
          Anthony Fu's recent releases commits on GitHub
        </a>
      </p>

      <div p5>
        <hr ma w-20 op25>
      </div>
    </div>

    <div v-for="item of data" :key="item.id" flex="~ gap-2 items-center">
      <a
        :href="`https://github.com/${item.repo}`" target="_blank"
        flex-none
      >
        <img
          :src="`https://github.com/${item.repo.split('/')[0]}.png`"
          h-10 w-10 rounded :alt="item.repo"
          border="~ gray/5" bg-gray:5
        >
      </a>

      <div flex-auto>
        <div flex="~ gap-2 items-center">
          <a
            flex="~ gap-1 wrap items-center" text-xl
            :href="`https://github.com/${item.repo}`" target="_blank"
          >
            <div op75>{{ item.repo.split('/')[0] }}</div>
            <div op50>/</div>
            <div>{{ item.repo.split('/')[1] }}</div>
          </a>
        </div>
        <a op50 :href="item.commit" target="_blank">
          {{ item.title }}
        </a>
      </div>
      <div flex="~ col items-end" text-end>
        <a
          font-mono
          :href="`https://github.com/${item.repo}/tags/v${item.version}`" target="_blank"
        >

          v{{ item.version }}
        </a>
        <time op50 :datatime="item.created_at">{{ formatTimeAgo(new Date(item.created_at)) }}</time>
      </div>
    </div>
  </div>
</template>
