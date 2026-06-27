<script setup lang="ts">
import { computed, ref } from "vue"
import { Clock, Disc3, ExternalLink, Hash, Music2, UserRound } from "lucide-vue-next"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { tracks } from "@/lib/tracks"
import { users, type User } from "@/lib/users"

const tracksById = new Map(tracks.map((track) => [track.track_id, track]))

const selectedUserId = ref(users[0]?.user_id ?? "")
const listScrollTop = ref(0)
const trackListRef = ref<HTMLElement | null>(null)

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
          <div class="border-b p-4">
            <h2 class="text-sm font-semibold">Track IDs</h2>
            <p class="mt-1 truncate text-sm text-muted-foreground">
              Liked by <span class="font-mono">{{ selectedUser?.user_id }}</span>
            </p>
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
                    class="h-full w-full justify-start gap-3 px-3 py-2 text-left"
                    :class="selectedTrack?.track_id === track.track_id ? 'bg-accent text-accent-foreground' : ''"
                    @click="selectedTrackId = track.track_id"
                  >
                    <Hash class="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span class="min-w-0">
                      <span class="block truncate font-mono text-sm">{{ track.track_id }}</span>
                      <span class="block truncate text-xs font-normal text-muted-foreground">
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
          <Card v-if="selectedTrack" class="h-full">
            <CardHeader>
              <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div class="min-w-0">
                  <CardDescription>Selected track</CardDescription>
                  <CardTitle class="mt-2 break-words">{{ selectedTrack.name }}</CardTitle>
                </div>
                <Badge variant="outline" class="w-fit font-mono">
                  {{ selectedTrack.track_id }}
                </Badge>
              </div>
            </CardHeader>

            <CardContent>
              <dl class="grid gap-4 sm:grid-cols-2">
                <div class="rounded-md border p-4">
                  <dt class="text-sm font-medium text-muted-foreground">Artist</dt>
                  <dd class="mt-2 text-lg font-semibold">{{ selectedTrack.artist_name }}</dd>
                </div>

                <div class="rounded-md border p-4">
                  <dt class="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Clock class="h-4 w-4" aria-hidden="true" />
                    Duration
                  </dt>
                  <dd class="mt-2 text-lg font-semibold">
                    {{ formatDuration(selectedTrack.duration) }}
                  </dd>
                </div>

                <div class="rounded-md border p-4 sm:col-span-2">
                  <dt class="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Disc3 class="h-4 w-4" aria-hidden="true" />
                    Cyanite ID
                  </dt>
                  <dd class="mt-2 break-all font-mono text-sm">{{ selectedTrack.cyanite_id }}</dd>
                </div>

                <div class="rounded-md border p-4 sm:col-span-2">
                  <dt class="text-sm font-medium text-muted-foreground">License</dt>
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
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  </main>
</template>
