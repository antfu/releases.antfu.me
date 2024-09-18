<script setup lang="ts">
function toTop() {
  window.scrollTo({
    top: 0,
    behavior: 'smooth',
  })
}

const { y: scroll } = useWindowScroll()
</script>

<template>
  <button
    title="Scroll to top"
    fixed bottom-3 right-3 z-100 h-10 w-10 flex items-center justify-center rounded-full text-center transition duration-300 print:hidden hover-bg-hex-8883 hover:op100
    :class="scroll > 300 ? 'op30' : 'op0! pointer-events-none'"
    @click="toTop()"
  >
    <div i-carbon-arrow-up />
  </button>
</template>
