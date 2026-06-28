<script setup lang="ts">
import { computed, ref } from "vue"
import {
  AlertCircle,
  Check,
  Clock,
  Disc3,
  ExternalLink,
  Loader2,
  Music2,
  Pause,
  Play,
  Sparkles,
  UserRound,
} from "lucide-vue-next"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  CYANITE_MODEL_OUTPUTS,
  findSimilarLibraryTracks,
  getLibraryTrackModels,
  searchByPrompt,
  type SimilarTrackItem,
} from "@/lib/cyanite"
import { jamendoMp3Url, toJamendoId, type PlayableTrack } from "@/lib/audio"
import { fetchJamendoTracks, type JamendoTrack } from "@/lib/jamendo"
import {
  generateSimilarTrackSummary,
} from "@/lib/openai"
import { tracks, type Track } from "@/lib/tracks"
import { users, type User } from "@/lib/users"
import RecommendationMap from "@/components/RecommendationMap.vue"

interface ModelOutputTarget {
  id: string
  title: string
  subtitle: string
  source: "Liked track" | "Similar track"
  localTrackId?: string
}

const tracksById = new Map(tracks.map((track) => [track.track_id, track]))
const tracksByCyaniteId = new Map(tracks.map((track) => [track.cyanite_id, track]))

const selectedUserId = ref(users[0]?.user_id ?? "")
const listScrollTop = ref(0)
const trackListRef = ref<HTMLElement | null>(null)
const selectedSeedTrackIds = ref<string[]>([])
const similarTracks = ref<SimilarTrackItem[]>([])
const similarError = ref("")
const isFindingSimilar = ref(false)
const selectedModelOutputTarget = ref<ModelOutputTarget | null>(null)
const modelOutputJson = ref("")
const modelOutputError = ref("")
const isFetchingModelOutput = ref(false)
let modelOutputRequestId = 0
const chatInput = ref("")
const isChatLoading = ref(false)
const chatError = ref("")
const currentFilter = ref<Record<string, unknown> | null>(null)
let currentSeedSummaries: Record<string, unknown>[] = []
const promptHistory = ref<string[]>([])
const trackExplanations = ref<Record<string, string>>({})

const trackColorMap = ref<Record<string, string>>({})
const hoveredTrackId = ref<string | null>(null)
const playingJamendoId = ref<string | null>(null)
const audioError = ref("")
let audioEl: HTMLAudioElement | null = null
let audioRequestId = 0
const jamendoNames = ref<Map<string, JamendoTrack>>(new Map())

function stopAudio() {
  audioRequestId += 1
  if (audioEl) {
    audioEl.pause()
    audioEl.removeAttribute("src")
    audioEl.load()
    audioEl = null
  }
  playingJamendoId.value = null
}

function resetAudioIfCurrent(requestId: number, audio: HTMLAudioElement) {
  if (requestId !== audioRequestId || audioEl !== audio) return
  audioEl = null
  playingJamendoId.value = null
}

function toggleAudio(track: PlayableTrack, event: MouseEvent) {
  event.stopPropagation()
  const jamendoTrackId = toJamendoId(track)
  if (!jamendoTrackId) {
    audioError.value = "No Jamendo audio is available for this track."
    return
  }

  if (playingJamendoId.value === jamendoTrackId) {
    stopAudio()
    return
  }

  stopAudio()
  audioError.value = ""

  const requestId = audioRequestId + 1
  audioRequestId = requestId
  playingJamendoId.value = jamendoTrackId
  const nextAudio = new Audio(jamendoMp3Url(jamendoTrackId))
  audioEl = nextAudio
  nextAudio.addEventListener("ended", () => resetAudioIfCurrent(requestId, nextAudio))
  nextAudio.addEventListener("error", () => {
    if (requestId !== audioRequestId) return
    audioError.value = `Could not load audio for track ${jamendoTrackId}.`
    resetAudioIfCurrent(requestId, nextAudio)
  })
  nextAudio.play().catch(() => {
    if (requestId !== audioRequestId) return
    audioError.value = `Could not play audio for track ${jamendoTrackId}.`
    resetAudioIfCurrent(requestId, nextAudio)
  })
}

function handleSimilarPlayClick(item: SimilarTrackItem, event: MouseEvent) {
  toggleAudio(item, event)
}

function handleColorMap(map: Record<string, string>) {
  trackColorMap.value = map
}

async function enrichSimilarTrackNames(items: SimilarTrackItem[]) {
  const ids = items
    .filter((item) => !getSimilarTrackLocalMatch(item))
    .map((item) => getSimilarTrackJamendoId(item))
    .filter((id): id is string => id !== null)
  if (ids.length === 0) return
  const fetched = await fetchJamendoTracks(ids)
  if (fetched.size > 0) {
    jamendoNames.value = new Map([...jamendoNames.value, ...fetched])
  }
}

const trackRowHeight = 60
const overscanRows = 6
const visibleRows = 18

const selectedUser = computed(
  () => users.find((user) => user.user_id === selectedUserId.value) ?? users[0],
)

const likedTracks = computed(() => getLikedTracks(selectedUser.value))
const selectedTrackId = ref(likedTracks.value[0]?.track_id ?? "")

const selectedTrack = computed(
  () =>
    likedTracks.value.find((track) => track.track_id === selectedTrackId.value) ??
    likedTracks.value[0],
)

const selectedSeedTracks = computed(() =>
  selectedSeedTrackIds.value.flatMap((trackId) => {
    const track = tracksById.get(trackId)
    return track ? [track] : []
  }),
)

const canFindSimilarTracks = computed(
  () => selectedSeedTracks.value.length > 0 && !isFindingSimilar.value,
)

const totalListHeight = computed(() => likedTracks.value.length * trackRowHeight)

const firstVisibleIndex = computed(() =>
  Math.max(0, Math.floor(listScrollTop.value / trackRowHeight) - overscanRows),
)

const lastVisibleIndex = computed(() =>
  Math.min(likedTracks.value.length, firstVisibleIndex.value + visibleRows + overscanRows * 2),
)

const visibleTracks = computed(() =>
  likedTracks.value.slice(firstVisibleIndex.value, lastVisibleIndex.value),
)

const visibleOffset = computed(() => firstVisibleIndex.value * trackRowHeight)

function handleListScroll(event: Event) {
  listScrollTop.value = (event.currentTarget as HTMLElement).scrollTop
}

function getLikedTracks(user: User | undefined) {
  return user?.liked_track_ids.flatMap((trackId) => {
    const track = tracksById.get(trackId)
    return track ? [track] : []
  }) ?? []
}

function selectUser(user: User) {
  selectedUserId.value = user.user_id
  listScrollTop.value = 0
  if (trackListRef.value) {
    trackListRef.value.scrollTop = 0
  }
  selectedTrackId.value = getLikedTracks(user)[0]?.track_id ?? ""
  selectedSeedTrackIds.value = []
  similarTracks.value = []
  similarError.value = ""
  chatError.value = ""
  currentFilter.value = null
  currentSeedSummaries = []
  promptHistory.value = []
  trackExplanations.value = {}
  audioError.value = ""
  stopAudio()
  clearModelOutput()
}

function isTrackSelected(trackId: string) {
  return selectedSeedTrackIds.value.includes(trackId)
}

function toggleSeedTrack(trackId: string) {
  selectedTrackId.value = trackId

  if (isTrackSelected(trackId)) {
    selectedSeedTrackIds.value = selectedSeedTrackIds.value.filter((id) => id !== trackId)
    similarTracks.value = []
    similarError.value = ""
    return
  }

  if (selectedSeedTrackIds.value.length >= 10) {
    similarError.value = "Select up to 10 liked tracks."
    return
  }

  selectedSeedTrackIds.value = [...selectedSeedTrackIds.value, trackId]
  similarTracks.value = []
  similarError.value = ""
}

function getSimilarTrackLocalMatch(item: SimilarTrackItem) {
  const byCyanite = tracksByCyaniteId.get(item.track.id)
  if (byCyanite) return byCyanite
  const jamendoId = toJamendoId(item.track)
  if (jamendoId) return tracksById.get(jamendoId)
  return undefined
}

function getSimilarTrackJamendoId(item: SimilarTrackItem): string | null {
  return toJamendoId(item)
}

function getSimilarTrackTitle(item: SimilarTrackItem) {
  const local = getSimilarTrackLocalMatch(item)
  if (local) return local.name
  const jamendoId = getSimilarTrackJamendoId(item)
  if (jamendoId) return jamendoNames.value.get(jamendoId)?.name ?? `Song ${jamendoId}`
  return `Song ${item.track.id}`
}

function getSimilarTrackArtist(item: SimilarTrackItem) {
  const local = getSimilarTrackLocalMatch(item)
  if (local) return local.artist_name
  const jamendoId = getSimilarTrackJamendoId(item)
  if (jamendoId) return jamendoNames.value.get(jamendoId)?.artistName ?? ""
  return ""
}

function summarizeModelOutputs(data: unknown): Record<string, unknown> {
  const items: unknown[] = []

  if (data && typeof data === "object" && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>
    const found = ["items", "data", "models", "results"].find((key) => Array.isArray(obj[key]))
    if (found) {
      items.push(...(obj[found] as unknown[]))
    } else {
      for (const v of Object.values(obj)) {
        if (v && typeof v === "object" && !Array.isArray(v) && "version" in v) {
          items.push(v)
        }
      }
    }
  } else if (Array.isArray(data)) {
    items.push(...data)
  }

  const summary: Record<string, unknown> = {}
  for (const mo of items) {
    if (!mo || typeof mo !== "object" || Array.isArray(mo)) continue
    const item = mo as Record<string, unknown>
    const version = typeof item.version === "string" ? item.version : "?"
    if (item.tags !== undefined) {
      summary[version] = item.tags
    } else if ("tag" in item) {
      summary[version] = item.tag
    } else if ("description" in item) {
      summary[version] = item.description
    }
  }

  return summary
}

function clearModelOutput() {
  modelOutputRequestId += 1
  selectedModelOutputTarget.value = null
  modelOutputJson.value = ""
  modelOutputError.value = ""
  isFetchingModelOutput.value = false
}

async function fetchModelOutput(target: ModelOutputTarget) {
  const requestId = modelOutputRequestId + 1
  modelOutputRequestId = requestId
  selectedModelOutputTarget.value = target
  modelOutputJson.value = ""
  modelOutputError.value = ""
  isFetchingModelOutput.value = true

  try {
    const data = await getLibraryTrackModels(target.id)

    if (requestId !== modelOutputRequestId) {
      return
    }

    modelOutputJson.value = JSON.stringify(summarizeModelOutputs(data), null, 2)
  } catch (error) {
    if (requestId !== modelOutputRequestId) {
      return
    }

    modelOutputError.value =
      error instanceof Error ? error.message : "Could not fetch inferred AI models."
  } finally {
    if (requestId === modelOutputRequestId) {
      isFetchingModelOutput.value = false
    }
  }
}

function selectLikedTrack(track: Track) {
  toggleSeedTrack(track.track_id)
  void fetchModelOutput({
    id: track.cyanite_id,
    title: track.name,
    subtitle: track.artist_name,
    source: "Liked track",
    localTrackId: track.track_id,
  })
}

function selectSimilarTrack(item: SimilarTrackItem) {
  const localTrack = getSimilarTrackLocalMatch(item)

  void fetchModelOutput({
    id: item.track.id,
    title: getSimilarTrackTitle(item),
    subtitle: getSimilarTrackArtist(item),
    source: "Similar track",
    localTrackId: localTrack?.track_id,
  })
}


async function generateSummary() {
  const seeds = selectedSeedTracks.value
  const similar = similarTracks.value
  if (!seeds.length || !similar.length) return

  isChatLoading.value = true
  chatError.value = ""

  try {
    const [seedOutputs, similarOutputs] = await Promise.all([
      Promise.all(seeds.map((t) => getLibraryTrackModels(t.cyanite_id).catch(() => null))),
      Promise.all(similar.map((item) => getLibraryTrackModels(item.track.id).catch(() => null))),
    ])

    currentSeedSummaries = seedOutputs.filter(Boolean).map((data) => summarizeModelOutputs(data))

    const tracks = similar.map((item, i) => ({
      id: item.track.id,
      title: getSimilarTrackTitle(item),
      artist: getSimilarTrackArtist(item),
      summary: similarOutputs[i] ? summarizeModelOutputs(similarOutputs[i]) : {},
    }))

    const result = await generateSimilarTrackSummary(currentSeedSummaries, tracks)
    const explanations: Record<string, string> = {}
    result.explanations.forEach((exp, i) => {
      const track = similar[i]
      if (track) explanations[track.track.id] = exp.explanation
    })
    trackExplanations.value = explanations
  } catch (error) {
    chatError.value = error instanceof Error ? error.message : "Could not generate summary."
  } finally {
    isChatLoading.value = false
  }
}

async function sendChatMessage() {
  const message = chatInput.value.trim()
  if (!message || isChatLoading.value) return

  chatInput.value = ""
  isChatLoading.value = true
  chatError.value = ""
  trackExplanations.value = {}

  try {
    promptHistory.value.push(message)
    const combinedQuery = promptHistory.value.join(", and also ")
    const result = await searchByPrompt(combinedQuery, 10)
    similarTracks.value = result.items ?? []
    void enrichSimilarTrackNames(similarTracks.value)
    await generateSummary()
  } catch (error) {
    chatError.value = error instanceof Error ? error.message : "Could not process request."
    isChatLoading.value = false
  }
}

async function fetchSimilarTracks() {
  if (!canFindSimilarTracks.value) {
    return
  }

  isFindingSimilar.value = true
  similarError.value = ""
  chatError.value = ""
  currentFilter.value = null
  promptHistory.value = []
  trackExplanations.value = {}

  try {
    const result = await findSimilarLibraryTracks(
      selectedSeedTracks.value.map((track) => track.cyanite_id),
      10,
    )
    similarTracks.value = result.items ?? []
    void enrichSimilarTrackNames(similarTracks.value)
    void generateSummary()
  } catch (error) {
    similarError.value = error instanceof Error ? error.message : "Could not fetch similar tracks."
  } finally {
    isFindingSimilar.value = false
  }
}


function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60

  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`
}
</script>

<template>
  <main class="min-h-screen bg-background">
    <div class="mx-auto flex w-full max-w-full flex-col px-10 py-10 sm:px- lg:px-10">
      <header class="mb-6 flex flex-col gap-3 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div class="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Music2 class="h-4 w-4 text-primary" aria-hidden="true" />
            Hackatune Cyanite Challange
          </div>
          <h1 class="text-3xl font-semibold tracking-normal text-foreground">Track Browser</h1>
        </div>
        <div class="flex flex-wrap gap-2">
          <Badge variant="secondary" class="w-fit">
            {{ users.length.toLocaleString() }} users
          </Badge>
          <Badge variant="secondary" class="w-fit">
            {{ tracks.length.toLocaleString() }} tracks
          </Badge>
        </div>
      </header>

      <div class="grid min-h-0 flex-1 gap-4 lg:grid-cols-[220px_320px_minmax(0,1fr)]">
        <section class="flex h-[360px] min-h-0 flex-col rounded-lg border bg-card lg:h-full">
          <div class="border-b p-4">
            <h2 class="text-sm font-semibold">User IDs</h2>
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto p-2">
            <Button
              v-for="user in users"
              :key="user.user_id"
              type="button"
              variant="ghost"
              class="h-11 w-full justify-start gap-3 px-3 py-2 text-left"
              :class="selectedUser?.user_id === user.user_id ? 'bg-accent text-accent-foreground' : ''"
              @click="selectUser(user)"
            >
              <UserRound class="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span class="min-w-0 truncate font-mono text-sm">{{ user.user_id }}</span>
            </Button>
          </div>
        </section>

        <section class="flex h-[520px] min-h-0 flex-col rounded-lg border bg-card lg:h-full">
          <div class="flex items-start justify-between gap-3 border-b p-4">
            <div class="min-w-0">
              <h2 class="text-sm font-semibold">Liked Tracks</h2>
              <p class="mt-1 truncate text-sm text-muted-foreground">
                Liked by user <span class="font-mono">{{ selectedUser?.user_id }}</span>
              </p>
            </div>
            <Badge variant="outline" class="shrink-0">
              {{ selectedSeedTrackIds.length }}/10
            </Badge>
          </div>

          <div
            ref="trackListRef"
            class="min-h-0 flex-1 overflow-y-auto p-2"
            @scroll="handleListScroll"
          >
            <div class="relative" :style="{ height: `${totalListHeight}px` }">
              <div
                class="absolute left-0 right-0 top-0"
                :style="{ transform: `translateY(${visibleOffset}px)` }"
              >
                <div
                  v-for="track in visibleTracks"
                  :key="track.track_id"
                  class="flex items-center gap-1 pb-1"
                  :style="{ height: `${trackRowHeight}px` }"
                >
                  <button
                    type="button"
                    class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-background text-foreground shadow-sm transition-colors hover:bg-primary hover:text-primary-foreground"
                    :aria-label="playingJamendoId === track.track_id ? 'Pause' : 'Play'"
                    @click="toggleAudio(track.track_id, $event)"
                  >
                    <Pause v-if="playingJamendoId === track.track_id" class="h-3.5 w-3.5" aria-hidden="true" />
                    <Play v-else class="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    :aria-pressed="isTrackSelected(track.track_id)"
                    class="h-full min-w-0 flex-1 justify-start gap-3 px-3 py-2 text-left"
                    :class="[
                      isTrackSelected(track.track_id)
                        ? 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground'
                        : '',
                      selectedTrack?.track_id === track.track_id && !isTrackSelected(track.track_id)
                        ? 'bg-accent text-accent-foreground'
                        : '',
                    ]"
                    @click="selectLikedTrack(track)"
                  >
                    <span
                      class="flex h-5 w-5 shrink-0 items-center justify-center rounded border"
                      :class="isTrackSelected(track.track_id)
                        ? 'border-primary-foreground bg-primary-foreground text-primary'
                        : 'border-border'"
                    >
                      <Check
                        v-if="isTrackSelected(track.track_id)"
                        class="h-3.5 w-3.5"
                        aria-hidden="true"
                      />
                    </span>
                    <span class="min-w-0">
                      <span class="block truncate text-sm font-medium">{{ track.name }}</span>
                      <span
                        class="block truncate text-xs font-normal"
                        :class="isTrackSelected(track.track_id)
                          ? 'text-primary-foreground/80'
                          : 'text-muted-foreground'"
                      >
                        {{ track.artist_name }}
                      </span>
                    </span>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="flex min-h-[420px] items-start gap-4">
          <Card class="min-w-0 flex-1">
            <CardHeader>
              <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div class="min-w-0">
                  <CardDescription>Recommendation seeds</CardDescription>
                  <CardTitle class="mt-2 break-words">Similar Tracks</CardTitle>
                </div>
                <Button
                  type="button"
                  class="w-fit gap-2"
                  :disabled="!canFindSimilarTracks"
                  @click="fetchSimilarTracks"
                >
                  <Loader2
                    v-if="isFindingSimilar"
                    class="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                  <Sparkles v-else class="h-4 w-4" aria-hidden="true" />
                  {{ isFindingSimilar ? "Finding" : "Find similar" }}
                </Button>
              </div>
            </CardHeader>

            <CardContent class="space-y-6">
              <section class="space-y-3">
                <div class="flex flex-wrap gap-2">
                  <Badge variant="outline">
                    {{ selectedSeedTracks.length }} selected
                  </Badge>
                  <Badge v-if="selectedUser" variant="secondary" class="font-mono">
                    {{ selectedUser.user_id }}
                  </Badge>
                </div>

                <div
                  v-if="selectedSeedTracks.length"
                  class="flex max-h-24 flex-wrap gap-2 overflow-y-auto"
                >
                  <Badge
                    v-for="track in selectedSeedTracks"
                    :key="track.track_id"
                    variant="secondary"
                    class="max-w-full gap-1 font-mono"
                  >
                    <span class="truncate">{{ track.track_id }}</span>
                  </Badge>
                </div>
              </section>

              <div
                v-if="similarError"
                class="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
              >
                <AlertCircle class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{{ similarError }}</span>
              </div>

              <div
                v-if="audioError"
                class="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
              >
                <AlertCircle class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{{ audioError }}</span>
              </div>

              <div v-if="similarTracks.length" class="space-y-2">
                <div
                  v-if="chatError"
                  class="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
                >
                  <AlertCircle class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{{ chatError }}</span>
                </div>
                <div class="flex gap-2">
                  <input
                    v-model="chatInput"
                    type="text"
                    placeholder="but I want something more up-beat..."
                    class="flex-1 rounded-md border bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                    :disabled="isChatLoading"
                    @keydown.enter="sendChatMessage"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    class="shrink-0 gap-2"
                    :disabled="!chatInput.trim() || isChatLoading"
                    @click="sendChatMessage"
                  >
                    <Loader2 v-if="isChatLoading" class="h-4 w-4 animate-spin" aria-hidden="true" />
                    {{ isChatLoading ? "Searching…" : "Refine" }}
                  </Button>
                </div>
              </div>

              <section class="space-y-3">
                <div class="flex items-center justify-between gap-3">
                  <h2 class="text-sm font-semibold">Similar Tracks</h2>
                  <Badge variant="outline">
                    {{ similarTracks.length }}
                  </Badge>
                </div>

                <div
                  v-if="isFindingSimilar"
                  class="flex min-h-32 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground"
                >
                  <Loader2 class="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  Finding similar tracks
                </div>

                <div v-else-if="similarTracks.length" class="divide-y rounded-md border">
                  <div
                    v-for="item in similarTracks"
                    :key="item.track.id"
                    role="button"
                    tabindex="0"
                    class="flex cursor-pointer items-start gap-3 p-3 transition-all duration-200 hover:bg-accent hover:text-accent-foreground"
                    :class="selectedModelOutputTarget?.id === item.track.id ? 'bg-accent text-accent-foreground' : ''"
                    :style="{
                      borderLeft: trackColorMap[item.track.id] ? `4px solid ${trackColorMap[item.track.id]}` : undefined,
                      ...(hoveredTrackId === item.track.id ? {
                        position: 'relative',
                        zIndex: '10',
                        transform: 'translateY(-2px)',
                        boxShadow: `0 8px 24px ${trackColorMap[item.track.id] ?? '#94a3b8'}55, 0 2px 8px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.55)`,
                      } : {}),
                    }"
                    @mouseenter="hoveredTrackId = item.track.id"
                    @mouseleave="hoveredTrackId = null"
                    @click="selectSimilarTrack(item)"
                    @keydown.enter="selectSimilarTrack(item)"
                  >
                    <button
                      type="button"
                      class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-background text-foreground shadow-sm transition-colors hover:bg-primary hover:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
                      :aria-label="playingJamendoId === getSimilarTrackJamendoId(item) ? 'Pause' : 'Play'"
                      :disabled="!getSimilarTrackJamendoId(item)"
                      @click.stop="handleSimilarPlayClick(item, $event)"
                    >
                      <Pause v-if="getSimilarTrackJamendoId(item) && playingJamendoId === getSimilarTrackJamendoId(item)" class="h-3.5 w-3.5" aria-hidden="true" />
                      <Play v-else class="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <div class="min-w-0 flex-1">
                      <div class="flex items-start justify-between gap-3">
                        <div class="min-w-0">
                          <div class="truncate text-sm font-medium">
                            {{ getSimilarTrackTitle(item) }}
                          </div>
                          <div v-if="getSimilarTrackArtist(item)" class="mt-1 truncate text-xs text-muted-foreground">
                            {{ getSimilarTrackArtist(item) }}
                          </div>
                          <div v-if="trackExplanations[item.track.id]" class="mt-1.5 text-xs text-muted-foreground leading-relaxed line-clamp-3">
                            {{ trackExplanations[item.track.id] }}
                          </div>
                        </div>
                        <Badge
                          v-if="typeof item.score === 'number'"
                          variant="outline"
                          class="shrink-0 font-mono"
                        >
                          {{ item.score.toFixed(3) }}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  v-else
                  class="flex min-h-32 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground"
                >
                  No similar tracks yet
                </div>
              </section>


              <section class="space-y-3 border-t pt-5">
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div class="min-w-0">
                    <h2 class="text-sm font-semibold">Inferred AI Models</h2>
                    <p
                      v-if="selectedModelOutputTarget"
                      class="mt-1 truncate text-sm text-muted-foreground"
                    >
                      {{ selectedModelOutputTarget.source }} - {{ selectedModelOutputTarget.title }}
                    </p>
                  </div>
                  <div class="flex shrink-0 flex-wrap gap-2">
                    <Badge variant="outline">
                      {{ CYANITE_MODEL_OUTPUTS.length }} models
                    </Badge>
                    <Badge
                      v-if="selectedModelOutputTarget"
                      variant="secondary"
                      class="font-mono"
                    >
                      {{ selectedModelOutputTarget.localTrackId ?? selectedModelOutputTarget.id }}
                    </Badge>
                  </div>
                </div>

                <div
                  v-if="modelOutputError"
                  class="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
                >
                  <AlertCircle class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{{ modelOutputError }}</span>
                </div>

                <div
                  v-if="isFetchingModelOutput"
                  class="flex min-h-32 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground"
                >
                  <Loader2 class="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  Loading model output
                </div>

                <pre
                  v-else-if="modelOutputJson"
                  class="max-h-[34rem] overflow-auto rounded-md border bg-muted/40 p-3 text-xs leading-relaxed"
                >{{ modelOutputJson }}</pre>

                <div
                  v-else
                  class="flex min-h-32 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground"
                >
                  No model output selected
                </div>
              </section>


              <section v-if="selectedTrack" class="border-t pt-5">
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div class="min-w-0">
                    <h2 class="truncate text-sm font-semibold">{{ selectedTrack.name }}</h2>
                    <p class="mt-1 truncate text-sm text-muted-foreground">
                      {{ selectedTrack.artist_name }}
                    </p>
                  </div>
                  <Badge variant="outline" class="w-fit shrink-0 font-mono">
                    {{ selectedTrack.track_id }}
                  </Badge>
                </div>

                <dl class="mt-4 grid gap-3 sm:grid-cols-2">
                  <div class="rounded-md border p-3">
                    <dt class="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <Clock class="h-4 w-4" aria-hidden="true" />
                      Duration
                    </dt>
                    <dd class="mt-2 text-sm font-semibold">
                      {{ formatDuration(selectedTrack.duration) }}
                    </dd>
                  </div>

                  <div class="rounded-md border p-3">
                    <dt class="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <Disc3 class="h-4 w-4" aria-hidden="true" />
                      Cyanite ID
                    </dt>
                    <dd class="mt-2 truncate font-mono text-sm">{{ selectedTrack.cyanite_id }}</dd>
                  </div>

                  <div class="rounded-md border p-3 sm:col-span-2">
                    <dt class="text-xs font-medium text-muted-foreground">License</dt>
                    <dd class="mt-2">
                      <a
                        :href="selectedTrack.license_ccurl"
                        target="_blank"
                        rel="noreferrer"
                        class="inline-flex max-w-full items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
                      >
                        <span class="truncate">{{ selectedTrack.license_ccurl }}</span>
                        <ExternalLink class="h-4 w-4 shrink-0" aria-hidden="true" />
                      </a>
                    </dd>
                  </div>
                </dl>
              </section>
            </CardContent>
          </Card>

          <div v-if="similarTracks.length" class="w-[45%] shrink-0 rounded-lg border bg-card p-4">
            <RecommendationMap
              :seed-cyanite-ids="selectedSeedTracks.map(t => t.cyanite_id)"
              :similar-items="similarTracks.map(item => ({ id: item.track.id, title: getSimilarTrackTitle(item) }))"
              :hovered-id="hoveredTrackId"
              @color-map="handleColorMap"
              @hover-change="(id) => { hoveredTrackId = id }"
            />
          </div>
        </section>
      </div>

    </div>
  </main>
</template>
