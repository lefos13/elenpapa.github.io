<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, useAttrs } from 'vue'

const props = defineProps<{
  name: string
  width?: number
  height?: number
  ariaHidden?: boolean
}>()

const attrs = useAttrs()

const svgContent = ref('')
let controller: AbortController | null = null

const src = computed(() => {
  // allow either 'chevron-left' or 'chevron-left.svg'
  return `/images/common/${props.name.endsWith('.svg') ? props.name : props.name + '.svg'}`
})

onMounted(async () => {
  controller = new AbortController()
  try {
    const res = await fetch(src.value, { signal: controller.signal })
    if (res.ok) svgContent.value = await res.text()
  } catch {
    svgContent.value = ''
  }
})

onBeforeUnmount(() => {
  controller?.abort()
})
</script>

<template>
  <span
    v-if="svgContent"
    v-html="svgContent"
    :class="attrs.class ?? 'svg-icon'"
    :aria-hidden="props.ariaHidden ? 'true' : undefined"
    :style="{
      display: 'inline-block',
      width: props.width ? props.width + 'px' : '1em',
      height: props.height ? props.height + 'px' : '1em',
      lineHeight: 0,
    }"
  ></span>
  <span
    v-else
    :class="attrs.class ?? 'svg-icon'"
    :style="{
      display: 'inline-block',
      width: props.width ? props.width + 'px' : '1em',
      height: props.height ? props.height + 'px' : '1em',
      lineHeight: 0,
    }"
    aria-hidden="true"
  ></span>
</template>

<style scoped src="../styles/components/svg-icon.css"></style>
