<script setup lang="ts">
import { formatTimeAgo } from '@vueuse/core'
import { logoOverrides, subLogosMatch } from '~~/shared/constants'
import type { ReleaseInfo } from '~~/types'

const props = defineProps<{
  item: ReleaseInfo
  prev?: ReleaseInfo
}>()

const timeDiffHours = computed(() => {
  if (!props.prev) {
    return 0
  }
  const diff = Math.abs(new Date(props.prev.created_at).getTime() - new Date(props.item.created_at).getTime())
  const hours = diff / 1000 / 60 / 60
  return hours
})

const config = useRuntimeConfig()

const subImage = computed(() => {
  if (!props.item.repo.startsWith(`${config.public.login}/`)) {
    return ''
  }
  if (logoOverrides[props.item.repo]) {
    return ''
  }
  const name = props.item.repo.split('/')[1]!
  for (const [re, img] of subLogosMatch) {
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
    lt-sm="gap-6"
    :class="timeDiffHours > 14 ? 'mt-8' : ''"
  >
    <a
      :href="`https://github.com/${item.repo}`" target="_blank"
      relative flex-none
    >
      <img
        :src="logoOverrides[item.repo] || `https://github.com/${item.repo.split('/')[0]}.png`"
        h-12 w-12 :alt="item.repo"
        lt-sm="h-14 w-14"
        border="~ gray/5" bg-gray:5
        :class="item.isOrg === false && !logoOverrides[props.item.repo] ? 'rounded-full' : 'rounded'"
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

    <div flex="~ row gap-2 auto items-center" lt-sm="flex-col items-start">
      <div flex-auto flex="~ col">
        <div flex="~ gap-2 items-center">
          <a
            flex="~ col wrap"
            :href="`https://github.com/${item.repo}`" target="_blank"
          >
            <div op50>{{ item.repo.split('/')[0] }}<span op75>/</span></div>
            <div mt--0.5 text-1.4rem>{{ item.repo.split('/')[1] }}</div>
          </a>
        </div>
        <a :href="item.commit" target="_blank" flex="~ gap-0.5 items-center" ml--1 op50 lt-sm="hidden">
          <div i-ph-git-commit-duotone rotate-90 />
          {{ item.title }}
        </a>
      </div>
      <div flex="~ col items-end" lt-sm="flex-row gap-2" text-end>
        <a
          text-1.1rem font-mono
          :href="`https://github.com/${item.repo}/releases/tag/v${item.version}`" target="_blank"
        >
          v{{ item.version }}
        </a>
        <time op50 :datatime="item.created_at">{{ formatTimeAgo(new Date(item.created_at)) }}</time>
      </div>
    </div>
  </div>
</template>
