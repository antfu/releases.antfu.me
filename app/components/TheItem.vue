<script setup lang="ts">
import { formatTimeAgo } from '@vueuse/core'
import type { ReleaseInfo } from '~~/types'

const props = defineProps<{
  item: ReleaseInfo
}>()

const username = 'antfu'

const subimages = [
  [/^nuxt-/, 'i-logos-nuxt-icon'],
  [/^vite-/, 'i-logos-vitejs'],
  [/^eslint-/, 'i-logos-eslint'],
  [/^vscode-/, 'i-logos-visual-studio-code'],
] as const

const logoOverrides = {
  'antfu/vscode-array-index-inlay': 'https://github.com/antfu/vscode-array-index-inlay/raw/main/res/icon.png?raw=true',
  'antfu/vscode-smart-clicks': 'https://raw.githubusercontent.com/antfu/vscode-smart-clicks/main/res/icon.png',
} as Record<string, string>

const subImage = computed(() => {
  if (!props.item.repo.startsWith(`${username}/`)) {
    return ''
  }
  if (logoOverrides[props.item.repo]) {
    return ''
  }
  const name = props.item.repo.split('/')[1]!
  for (const [re, img] of subimages) {
    if (re.test(name)) {
      return img
    }
  }
  return ''
})
</script>

<template>
  <div
    flex="~ gap-4 items-center"
    lt-sm="gap-4"
  >
    <a
      :href="`https://github.com/${item.repo}`" target="_blank"
      relative flex-none
    >
      <img
        :src="logoOverrides[item.repo] || `https://github.com/${item.repo.split('/')[0]}.png`"
        h-12 w-12 :alt="item.repo"
        border="~ gray/5" bg-gray:5
        :class="item.repo.startsWith(`${username}/`) && !logoOverrides[props.item.repo] ? 'rounded-full' : 'rounded'"
      >

      <div
        v-if="subImage"
        border="~ gray/5" absolute bottom--2 right--2 rounded-full bg-gray:5 bg-white p1 dark:bg-hex-121212
      >
        <div
          border="~ gray/5"
          :class="subImage"
          h-5 w-5
        />
      </div>

    </a>

    <div flex="~ row gap-3 auto" lt-sm="flex-col">
      <div flex-auto flex="~ col gap-1">
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
        <a :href="item.commit" target="_blank" flex="~ gap-1 items-center" ml--1 op50>
          <div i-ph-git-commit-duotone rotate-90 />
          {{ item.title }}
        </a>
      </div>
      <div flex="~ col items-end" lt-sm="flex-row gap-2" text-end>
        <a
          font-mono
          :href="`https://github.com/${item.repo}/releases/tag/v${item.version}`" target="_blank"
        >
          v{{ item.version }}
        </a>
        <time op50 :datatime="item.created_at">{{ formatTimeAgo(new Date(item.created_at)) }}</time>
      </div>
    </div>
  </div>
</template>
