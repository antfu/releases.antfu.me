<script setup lang="ts">
useDark()
</script>

<template>
  <NuxtPage />
  <ArtPlum />
</template>

<style>
html,
body,
#__nuxt {
  height: 100vh;
  margin: 0;
  padding: 0;
}

html.dark {
  color-scheme: dark;
  background: #121212;
  color: white;
}

a:hover {
  text-decoration: underline;
}
</style>
