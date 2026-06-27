<script setup lang="ts">
import { ref, computed, onMounted } from "vue"
import { fetchSimilar, fetchTags } from "./cyaniteApi"
import { MOOD_COLORS, moodColor, assignDiffTags, outerPos, shortenLine, midpoint } from "./mapUtils"
import type { TrackData } from "./mapUtils"

const TEST_TRACK_ID = "libtr_01KVX1J122H6RS7K1F" // Jamendo 161535, hardcoded for testing
const CACHE_KEY = `rec_map_v3_${TEST_TRACK_ID}`

const W = 700
const H = 420
const CX = W / 2
const CY = H / 2
const RADIUS = 155
const DOT_R = 8

const tracks = ref<TrackData[]>([])
const loading = ref(true) // start true so the loading state shows on first render
const error = ref<string | null>(null)
const hovered = ref<string | null>(null)

const center = computed(() => tracks.value[0] ?? null)
const outer = computed(() => tracks.value.slice(1))
const diffLabels = computed(() =>
  center.value ? assignDiffTags(center.value.moodScores, outer.value.map((n) => n.moodScores)) : [],
)

onMounted(async () => {
  const cached = localStorage.getItem(CACHE_KEY)
  if (cached) {
    tracks.value = JSON.parse(cached)
    loading.value = false
    return
  }

  try {
    const items = await fetchSimilar(TEST_TRACK_ID)
    const enriched = await Promise.all(
      items.map(async (item) => {
        const tags = await fetchTags(item.track.id, ["MoodSimpleV2", "MainGenreV2"])
        const moodMo = tags?.MoodSimpleV2 as { scores?: Record<string, number>; tags?: string[] } | undefined
        const genreMo = tags?.MainGenreV2 as { tags?: string[] } | undefined
        const moodScores = moodMo?.scores ?? {}
        const mood = moodMo?.tags ?? []
        const genre = genreMo?.tags ?? []
        return { id: item.track.id, score: item.score, mood, genre, moodScores, color: moodColor(mood) } satisfies TrackData
      }),
    )
    tracks.value = enriched
    localStorage.setItem(CACHE_KEY, JSON.stringify(enriched))
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Unknown error"
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section class="mt-6 rounded-lg border bg-card p-4">
    <h2 class="mb-3 text-sm font-semibold">Recommendation Map</h2>

    <div v-if="loading" class="flex h-48 items-center justify-center text-sm text-muted-foreground">
      Loading recommendations…
    </div>
    <div v-else-if="error" class="flex h-48 items-center justify-center text-sm text-destructive">
      {{ error }}
    </div>
    <div v-else-if="center" class="relative">
      <svg :viewBox="`0 0 ${W} ${H}`" class="w-full" :style="{ height: `${H}px` }">
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="#94a3b8" />
          </marker>
        </defs>

        <!-- arrows + diff-tag labels -->
        <g v-for="(node, i) in outer" :key="node.id + '-arrow'">
          <line
            v-bind="shortenLine(CX, CY, outerPos(i, outer.length, CX, CY, RADIUS).x, outerPos(i, outer.length, CX, CY, RADIUS).y, DOT_R + 2, DOT_R + 10)"
            stroke="#94a3b8"
            stroke-width="1.5"
            marker-end="url(#arrow)"
          />
          <text
            :x="midpoint(CX, CY, outerPos(i, outer.length, CX, CY, RADIUS).x, outerPos(i, outer.length, CX, CY, RADIUS).y).x"
            :y="midpoint(CX, CY, outerPos(i, outer.length, CX, CY, RADIUS).x, outerPos(i, outer.length, CX, CY, RADIUS).y).y - 6"
            font-size="10"
            fill="#64748b"
            text-anchor="middle"
          >{{ diffLabels[i]?.label }}</text>
        </g>

        <!-- outer dots -->
        <circle
          v-for="(node, i) in outer"
          :key="node.id"
          :cx="outerPos(i, outer.length, CX, CY, RADIUS).x"
          :cy="outerPos(i, outer.length, CX, CY, RADIUS).y"
          :r="hovered === node.id ? DOT_R + 3 : DOT_R"
          :fill="MOOD_COLORS[diffLabels[i]?.tag] ?? node.color"
          fill-opacity="0.85"
          stroke="white"
          stroke-width="1.5"
          class="cursor-pointer transition-all"
          @mouseenter="hovered = node.id"
          @mouseleave="hovered = null"
        />

        <!-- center dot -->
        <circle
          :cx="CX"
          :cy="CY"
          :r="hovered === center.id ? DOT_R + 3 : DOT_R"
          :fill="center.color"
          stroke="white"
          stroke-width="2.5"
          class="cursor-pointer transition-all"
          @mouseenter="hovered = center.id"
          @mouseleave="hovered = null"
        />
      </svg>

      <!-- tooltips -->
      <template v-for="(node, i) in [center, ...outer]" :key="node.id + '-tip'">
        <div
          v-if="hovered === node.id"
          class="pointer-events-none absolute z-10 rounded-md border bg-popover px-3 py-2 text-xs shadow-md"
          :style="{
            left: `${((i === 0 ? CX : outerPos(i - 1, outer.length, CX, CY, RADIUS).x) / W) * 100}%`,
            top: `${((i === 0 ? CY : outerPos(i - 1, outer.length, CX, CY, RADIUS).y) / H) * 100}%`,
            transform: 'translate(-50%, -130%)',
          }"
        >
          <div class="font-mono text-[10px] text-muted-foreground">{{ node.id }}</div>
          <div class="mt-0.5 font-semibold">score {{ node.score.toFixed(3) }}</div>
          <div v-if="node.mood.length" class="mt-1">mood: {{ node.mood.join(", ") }}</div>
          <div v-if="node.genre.length">genre: {{ node.genre.join(", ") }}</div>
        </div>
      </template>
    </div>
  </section>
</template>
