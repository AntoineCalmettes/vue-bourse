<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{
  points: number[]
  stroke?: string
  labels?: string[]
}>()

const width = 320
const height = 110
const padding = 8
const hoveredIndex = ref<number | null>(null)

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

const clampedHoveredIndex = computed(() => {
  if (hoveredIndex.value === null) {
    return null
  }
  if (!props.points.length) {
    return null
  }
  return Math.min(Math.max(hoveredIndex.value, 0), props.points.length - 1)
})

const tooltipPoint = computed(() => {
  if (clampedHoveredIndex.value === null) {
    return null
  }

  const index = clampedHoveredIndex.value
  const point = props.points[index] ?? Number.NaN
  const label = props.labels?.[index]
  if (typeof point !== 'number' || !Number.isFinite(point)) {
    return null
  }

  const min = Math.min(...props.points)
  const max = Math.max(...props.points)
  const range = max - min || 1
  const x = padding + (index * (width - padding * 2)) / Math.max(props.points.length - 1, 1)
  const y = height - padding - ((point - min) / range) * (height - padding * 2)

  return {
    index,
    point,
    label: label || '',
    x,
    y
  }
})

function onMove(event: MouseEvent) {
  if (props.points.length < 2) {
    hoveredIndex.value = null
    return
  }

  const currentTarget = event.currentTarget as HTMLElement | null
  if (!currentTarget) {
    hoveredIndex.value = null
    return
  }

  const rect = currentTarget.getBoundingClientRect()
  if (rect.width <= 0) {
    hoveredIndex.value = null
    return
  }

  const x = event.clientX - rect.left
  const ratio = Math.min(Math.max(x / rect.width, 0), 1)
  hoveredIndex.value = Math.round(ratio * (props.points.length - 1))
}

function onLeave() {
  hoveredIndex.value = null
}
</script>

<template>
  <div class="sparkline-wrap" @mousemove="onMove" @mouseleave="onLeave">
    <svg :viewBox="`0 0 ${width} ${height}`" class="sparkline" role="img" aria-label="Evolution du prix">
      <defs>
        <linearGradient :id="gradientId" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" :stop-color="stroke || '#37b0ff'" stop-opacity="0.35" />
          <stop offset="100%" :stop-color="stroke || '#37b0ff'" stop-opacity="0" />
        </linearGradient>
      </defs>
      <path :d="areaPath" :fill="`url(#${gradientId})`" />
      <polyline :points="chartPoints" :stroke="stroke || '#37b0ff'" stroke-width="3" fill="none" stroke-linecap="round" />
      <line
        v-if="tooltipPoint"
        :x1="tooltipPoint.x"
        :x2="tooltipPoint.x"
        :y1="padding"
        :y2="height - padding"
        class="hover-line"
      />
      <circle v-if="tooltipPoint" :cx="tooltipPoint.x" :cy="tooltipPoint.y" r="3.5" class="hover-point" />
    </svg>
    <div v-if="tooltipPoint" class="spark-tooltip">
      <p v-if="tooltipPoint.label">{{ tooltipPoint.label }}</p>
      <p>{{ (tooltipPoint?.point ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: 6 }) }}</p>
    </div>
  </div>
</template>

<style scoped>
.sparkline-wrap {
  position: relative;
  width: 100%;
}
.sparkline {
  width: 100%;
  height: 110px;
}
.hover-line {
  stroke: #9ed6ff;
  stroke-width: 1;
  stroke-dasharray: 3 3;
  opacity: 0.7;
}
.hover-point {
  fill: #ffffff;
  stroke: #37b0ff;
  stroke-width: 2;
}
.spark-tooltip {
  position: absolute;
  right: 0.4rem;
  top: 0.35rem;
  border: 1px solid #2f3b59;
  border-radius: 0.55rem;
  background: rgba(8, 14, 30, 0.92);
  padding: 0.35rem 0.5rem;
  color: #d9eeff;
  font-size: 0.75rem;
  pointer-events: none;
}
.spark-tooltip p {
  margin: 0;
}
</style>
