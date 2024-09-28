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

const HighlightedVersion = defineComponent({
  render() {
    const version = props.item.version
    const parts = version.split(/(\.)/g)

    let highlightedIndex = -1
    for (let i = parts.length - 1; i >= 0; i--) {
      if (parts[i] !== '.') {
        const num = +parts[i]!
        if (!Number.isNaN(num) && num > 0) {
          highlightedIndex = i
          break
        }
      }
    }

    const mergedParts = [
      parts.slice(0, highlightedIndex),
      parts.slice(highlightedIndex).join(''),
    ]

    const colors = [
      'text-rose-7 dark:text-rose-3 bg-rose:15',
      'text-green-7 dark:text-green-3 bg-green:15',
      'text-purple-7 dark:text-purple-3 bg-purple:15',
      'text-teal-7 dark:text-teal-3 bg-teal:15',
    ]
    const color = colors[Math.round(highlightedIndex / 2)] || colors[3]

    return h('span', ['v', ...mergedParts.map((part, i) => {
      if (i) {
        return h('span', { class: `${color} font-bold px0.8 mx--0.8 rounded` }, part)
      }
      return part
    })])
  },
})

const showReleaseContent = ref(false)
</script>

<template>
  <div>
    <button
      w-full text-left
      flex="~ gap-4 items-center"
      lt-sm="gap-6"
      :class="timeDiffHours > 11 ? 'mt-10' : ''"
      @click="showReleaseContent = !showReleaseContent"
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
              <div text-sm op50>{{ item.repo.split('/')[0] }}<span op75>/</span></div>
              <div mt--0.5 text-lg>{{ item.repo.split('/')[1] }}</div>
            </a>
          </div>
          <a :href="item.commit" target="_blank" flex="~ gap-0.5 items-center" ml--1 text-sm op50 lt-sm="hidden">
            <div i-ph-git-commit-duotone rotate-90 />
            {{ item.title }}
          </a>
        </div>
        <div flex="~ col items-end" lt-sm="flex-row gap-2" text-end>
          <a
            font-mono
            :href="`https://github.com/${item.repo}/releases/tag/v${item.version}`" target="_blank"
          >
            <HighlightedVersion />
          </a>
          <time text-sm op50 :datatime="new Date(item.created_at).toString()">{{ formatTimeAgo(new Date(item.created_at)) }}</time>
        </div>
      </div>
    </button>
    <article
      v-show="showReleaseContent"
      prose
      v-html="item.content"
    />
  </div>
</template>
