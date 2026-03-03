<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  points: number[]
  stroke?: string
}>()

const width = 320
const height = 110
const padding = 8

const chartPoints = computed(() => {
  if (props.points.length < 2) {
    return ''
  }

  const min = Math.min(...props.points)
  const max = Math.max(...props.points)
  const range = max - min || 1

  return props.points
    .map((point, index) => {
      const x = padding + (index * (width - padding * 2)) / (props.points.length - 1)
      const y = height - padding - ((point - min) / range) * (height - padding * 2)
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
})

const areaPath = computed(() => {
  if (!chartPoints.value) {
    return ''
  }

  const firstX = padding
  const lastX = width - padding
  const lineSegments = chartPoints.value
    .split(' ')
    .map((point) => `L ${point}`)
    .join(' ')
  return `M ${firstX} ${height - padding} ${lineSegments} L ${lastX} ${height - padding} Z`
})

const gradientId = `spark-gradient-${Math.random().toString(36).slice(2, 8)}`
</script>

<template>
  <svg :viewBox="`0 0 ${width} ${height}`" class="sparkline" role="img" aria-label="Evolution du prix">
    <defs>
      <linearGradient :id="gradientId" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" :stop-color="stroke || '#37b0ff'" stop-opacity="0.35" />
        <stop offset="100%" :stop-color="stroke || '#37b0ff'" stop-opacity="0" />
      </linearGradient>
    </defs>
    <path :d="areaPath" :fill="`url(#${gradientId})`" />
    <polyline :points="chartPoints" :stroke="stroke || '#37b0ff'" stroke-width="3" fill="none" stroke-linecap="round" />
  </svg>
</template>

<style scoped>
.sparkline {
  width: 100%;
  height: 110px;
}
</style>
