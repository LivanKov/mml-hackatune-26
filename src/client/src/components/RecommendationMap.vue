<script setup lang="ts">
import { ref, computed, watch } from "vue"
import { fetchTags } from "./cyaniteApi"
import { moodColor, trackColor, assignDiffTags, outerPos, shortenLine, midpoint } from "./mapUtils"
import type { TrackData } from "./mapUtils"

interface SimilarItem {
  id: string
  title: string
}

interface OuterTrack extends TrackData {
  title: string
}

const props = defineProps<{
  seedCyaniteIds: string[]
  similarItems: SimilarItem[]
}>()

const emit = defineEmits<{
  (e: "colorMap", map: Record<string, string>): void
}>()

const W = 900
const H = 540
const CX = W / 2
const CY = H / 2
const RADIUS = 242
const DOT_R = 13

const centerTrack = ref<TrackData | null>(null)
const outerTracks = ref<OuterTrack[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const hovered = ref<string | null>(null)

const diffLabels = computed(() =>
  centerTrack.value
    ? assignDiffTags(centerTrack.value.moodScores, outerTracks.value.map((n) => n.moodScores))
    : [],
)

// Stable keys — only re-fetch when actual IDs change, not on every parent render
const seedKey = computed(() => props.seedCyaniteIds.join(","))
const similarKey = computed(() => props.similarItems.map((i) => i.id).join(","))

let loadSeq = 0

async function loadData() {
  if (!props.seedCyaniteIds.length || !props.similarItems.length) return

  const seq = ++loadSeq
  loading.value = true
  error.value = null

  try {
    const [seedResults, similarResults] = await Promise.all([
      Promise.all(props.seedCyaniteIds.map((id) => fetchTags(id, ["MoodSimpleV2", "MainGenreV2"]))),
      Promise.all(props.similarItems.map((item) => fetchTags(item.id, ["MoodSimpleV2", "MainGenreV2"]))),
    ])

    if (seq !== loadSeq) return // stale — a newer fetch is in flight

    // Average mood scores across all seed tracks
    const avgMoodScores: Record<string, number> = {}
    let validSeeds = 0
    for (const tags of seedResults) {
      if (!tags) continue
      validSeeds++
      const scores = (tags.MoodSimpleV2 as { scores?: Record<string, number> } | undefined)?.scores ?? {}
      for (const [key, val] of Object.entries(scores)) {
        avgMoodScores[key] = (avgMoodScores[key] ?? 0) + val
      }
    }
    if (validSeeds > 0) {
      for (const key of Object.keys(avgMoodScores)) avgMoodScores[key] /= validSeeds
    }

    const topMoods = Object.entries(avgMoodScores)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([m]) => m)

    centerTrack.value = {
      id: "seed",
      score: 1,
      mood: topMoods,
      genre: [],
      moodScores: avgMoodScores,
      color: moodColor(topMoods),
    }

    outerTracks.value = props.similarItems.map((item, i) => {
      const tags = similarResults[i]
      const moodMo = tags?.MoodSimpleV2 as { scores?: Record<string, number>; tags?: string[] } | undefined
      const genreMo = tags?.MainGenreV2 as { tags?: string[] } | undefined
      return {
        id: item.id,
        title: item.title,
        score: 0,
        mood: moodMo?.tags ?? [],
        genre: genreMo?.tags ?? [],
        moodScores: moodMo?.scores ?? {},
        color: trackColor(i),
      }
    })
    emit("colorMap", Object.fromEntries(outerTracks.value.map((t) => [t.id, t.color])))
  } catch (e) {
    if (seq !== loadSeq) return
    error.value = e instanceof Error ? e.message : "Unknown error"
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

watch([seedKey, similarKey], loadData, { immediate: true })
</script>

<template>
  <section>
    <h2 class="mb-3 text-sm font-semibold">Recommendation Map</h2>

    <div v-if="loading" class="flex h-48 items-center justify-center text-sm text-muted-foreground">
      Loading map…
    </div>
    <div v-else-if="error" class="flex h-48 items-center justify-center text-sm text-destructive">
      {{ error }}
    </div>
    <div v-else-if="centerTrack" class="relative">
      <svg :viewBox="`0 0 ${W} ${H}`" class="w-full" style="height: auto; display: block;">
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="#94a3b8" />
          </marker>
        </defs>

        <!-- lines + diff labels -->
        <g v-for="(node, i) in outerTracks" :key="node.id + '-line'">
          <line
            v-bind="shortenLine(CX, CY, outerPos(i, outerTracks.length, CX, CY, RADIUS).x, outerPos(i, outerTracks.length, CX, CY, RADIUS).y, DOT_R + 2, DOT_R + 10)"
            stroke="#94a3b8"
            stroke-width="1.5"
            marker-end="url(#arrow)"
          />
          <text
            :x="midpoint(CX, CY, outerPos(i, outerTracks.length, CX, CY, RADIUS).x, outerPos(i, outerTracks.length, CX, CY, RADIUS).y).x"
            :y="midpoint(CX, CY, outerPos(i, outerTracks.length, CX, CY, RADIUS).x, outerPos(i, outerTracks.length, CX, CY, RADIUS).y).y - 6"
            font-size="17"
            fill="#64748b"
            text-anchor="middle"
          >{{ diffLabels[i]?.label }}</text>
        </g>

        <!-- outer dots (similar tracks) -->
        <circle
          v-for="(node, i) in outerTracks"
          :key="node.id"
          :cx="outerPos(i, outerTracks.length, CX, CY, RADIUS).x"
          :cy="outerPos(i, outerTracks.length, CX, CY, RADIUS).y"
          :r="hovered === node.id ? DOT_R + 3 : DOT_R"
          :fill="node.color"
          fill-opacity="0.85"
          stroke="white"
          stroke-width="1.5"
          class="cursor-pointer transition-all"
          @mouseenter="hovered = node.id"
          @mouseleave="hovered = null"
        />

        <!-- center dot (seed tracks) -->
        <circle
          :cx="CX"
          :cy="CY"
          :r="hovered === 'seed' ? DOT_R + 5 : DOT_R + 2"
          :fill="centerTrack.color"
          stroke="white"
          stroke-width="2.5"
          class="cursor-pointer transition-all"
          @mouseenter="hovered = 'seed'"
          @mouseleave="hovered = null"
        />
        <text
          :x="CX"
          :y="CY - DOT_R - 6"
          font-size="18"
          font-weight="600"
          fill="#1e293b"
          text-anchor="middle"
        >Liked</text>
      </svg>

      <!-- tooltips -->
      <div
        v-if="hovered === 'seed'"
        class="pointer-events-none absolute z-10 rounded-md border bg-popover px-3 py-2 text-xs shadow-md"
        :style="{ left: `${(CX / W) * 100}%`, top: `${(CY / H) * 100}%`, transform: 'translate(-50%, -130%)' }"
      >
        <div class="font-semibold">Liked tracks</div>
        <div v-if="centerTrack.mood.length" class="mt-1">mood: {{ centerTrack.mood.join(", ") }}</div>
      </div>

      <template v-for="(node, i) in outerTracks" :key="node.id + '-tip'">
        <div
          v-if="hovered === node.id"
          class="pointer-events-none absolute z-10 rounded-md border bg-popover px-3 py-2 text-xs shadow-md"
          :style="{
            left: `${(outerPos(i, outerTracks.length, CX, CY, RADIUS).x / W) * 100}%`,
            top: `${(outerPos(i, outerTracks.length, CX, CY, RADIUS).y / H) * 100}%`,
            transform: 'translate(-50%, -130%)',
          }"
        >
          <div class="font-semibold">{{ node.title }}</div>
          <div v-if="node.mood.length" class="mt-1">mood: {{ node.mood.join(", ") }}</div>
          <div v-if="node.genre.length">genre: {{ node.genre.join(", ") }}</div>
        </div>
      </template>
    </div>
  </section>
</template>
