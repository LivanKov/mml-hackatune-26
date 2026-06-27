<script setup lang="ts">
import { computed, ref } from "vue"
import {
  AlertCircle,
  Braces,
  Check,
  Clock,
  Disc3,
  ExternalLink,
  Hash,
  Loader2,
  Music2,
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
  type SimilarTrackItem,
} from "@/lib/cyanite"
import {
  testOpenAiStructuredOutput,
  type OpenAiStructuredTestResponse,
} from "@/lib/openai"
import { tracks, type Track } from "@/lib/tracks"
import { users, type User } from "@/lib/users"

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
const openAiTest = ref<OpenAiStructuredTestResponse | null>(null)
const openAiTestError = ref("")
const isTestingOpenAi = ref(false)
const selectedModelOutputTarget = ref<ModelOutputTarget | null>(null)
const modelOutputJson = ref("")
const modelOutputError = ref("")
const isFetchingModelOutput = ref(false)
let modelOutputRequestId = 0

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
  return tracksByCyaniteId.get(item.track.id)
}

function getSimilarTrackTitle(item: SimilarTrackItem) {
  return getSimilarTrackLocalMatch(item)?.name ?? item.track.title ?? item.track.id
}

function getSimilarTrackArtist(item: SimilarTrackItem) {
  return getSimilarTrackLocalMatch(item)?.artist_name ?? "Cyanite library track"
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

    modelOutputJson.value = JSON.stringify(data, null, 2)
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

async function fetchSimilarTracks() {
  if (!canFindSimilarTracks.value) {
    return
  }

  isFindingSimilar.value = true
  similarError.value = ""

  try {
    const result = await findSimilarLibraryTracks(
      selectedSeedTracks.value.map((track) => track.cyanite_id),
      20,
    )
    similarTracks.value = result.items ?? []
  } catch (error) {
    similarError.value = error instanceof Error ? error.message : "Could not fetch similar tracks."
  } finally {
    isFindingSimilar.value = false
  }
}

async function runOpenAiTest() {
  isTestingOpenAi.value = true
  openAiTestError.value = ""

  try {
    openAiTest.value = await testOpenAiStructuredOutput()
  } catch (error) {
    openAiTest.value = null
    openAiTestError.value =
      error instanceof Error ? error.message : "Could not run OpenAI structured output test."
  } finally {
    isTestingOpenAi.value = false
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
    <div class="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
      <header class="mb-6 flex flex-col gap-3 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div class="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Music2 class="h-4 w-4 text-primary" aria-hidden="true" />
            Hackatune tracks
          </div>
          <h1 class="text-3xl font-semibold tracking-normal text-foreground">Track browser</h1>
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
              <h2 class="text-sm font-semibold">Liked Track IDs</h2>
              <p class="mt-1 truncate text-sm text-muted-foreground">
                Liked by <span class="font-mono">{{ selectedUser?.user_id }}</span>
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
                  class="pb-1"
                  :style="{ height: `${trackRowHeight}px` }"
                >
                  <Button
                    type="button"
                    variant="ghost"
                    :aria-pressed="isTrackSelected(track.track_id)"
                    class="h-full w-full justify-start gap-3 px-3 py-2 text-left"
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
                        : 'border-border text-muted-foreground'"
                    >
                      <Check
                        v-if="isTrackSelected(track.track_id)"
                        class="h-3.5 w-3.5"
                        aria-hidden="true"
                      />
                      <Hash v-else class="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                    <span class="min-w-0">
                      <span class="block truncate font-mono text-sm">{{ track.track_id }}</span>
                      <span
                        class="block truncate text-xs font-normal"
                        :class="isTrackSelected(track.track_id)
                          ? 'text-primary-foreground/80'
                          : 'text-muted-foreground'"
                      >
                        {{ track.name }}
                      </span>
                    </span>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="min-h-[420px]">
          <Card class="h-full">
            <CardHeader>
              <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div class="min-w-0">
                  <CardDescription>Recommendation seeds</CardDescription>
                  <CardTitle class="mt-2 break-words">Similar tracks</CardTitle>
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
                  <button
                    v-for="item in similarTracks"
                    :key="item.track.id"
                    type="button"
                    class="block w-full p-3 text-left transition-colors hover:bg-accent hover:text-accent-foreground"
                    :class="selectedModelOutputTarget?.id === item.track.id ? 'bg-accent text-accent-foreground' : ''"
                    @click="selectSimilarTrack(item)"
                  >
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <div class="truncate text-sm font-medium">
                          {{ getSimilarTrackTitle(item) }}
                        </div>
                        <div class="mt-1 truncate text-xs text-muted-foreground">
                          {{ getSimilarTrackArtist(item) }}
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
                    <div class="mt-2 truncate font-mono text-xs text-muted-foreground">
                      {{ item.track.id }}
                    </div>
                  </button>
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

              <section class="space-y-3 border-t pt-5">
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div class="min-w-0">
                    <h2 class="text-sm font-semibold">OpenAI Structured Output</h2>
                    <p class="mt-1 text-sm text-muted-foreground">
                      Server-side API key test
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    class="w-fit gap-2"
                    :disabled="isTestingOpenAi"
                    @click="runOpenAiTest"
                  >
                    <Loader2
                      v-if="isTestingOpenAi"
                      class="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                    <Braces v-else class="h-4 w-4" aria-hidden="true" />
                    {{ isTestingOpenAi ? "Testing" : "Test OpenAI" }}
                  </Button>
                </div>

                <div
                  v-if="openAiTestError"
                  class="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
                >
                  <AlertCircle class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{{ openAiTestError }}</span>
                </div>

                <div v-if="openAiTest" class="rounded-md border p-3">
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <div class="text-sm font-medium">{{ openAiTest.result.message }}</div>
                      <div class="mt-1 truncate font-mono text-xs text-muted-foreground">
                        {{ openAiTest.model }}
                      </div>
                    </div>
                    <Badge variant="outline" class="shrink-0">
                      {{ openAiTest.result.status }}
                    </Badge>
                  </div>

                  <ul
                    v-if="openAiTest.result.next_steps.length"
                    class="mt-3 space-y-1 text-sm text-muted-foreground"
                  >
                    <li
                      v-for="step in openAiTest.result.next_steps"
                      :key="step"
                      class="truncate"
                    >
                      {{ step }}
                    </li>
                  </ul>
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
        </section>
      </div>
    </div>
  </main>
</template>
