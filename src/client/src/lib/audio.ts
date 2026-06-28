import type { CyaniteLibraryTrack, SimilarTrackItem } from "@/lib/cyanite"
import { tracks } from "@/lib/tracks"

export type PlayableTrack =
  | string
  | CyaniteLibraryTrack
  | SimilarTrackItem
  | null
  | undefined

const cyaniteToJamendoId = new Map(tracks.map((track) => [track.cyanite_id, track.track_id]))

function jamendoIdFromTitle(title: string | undefined | null) {
  if (!title) return null

  const filename = title.split(".mp3")[0]
  return /^\d+$/.test(filename) ? filename : null
}

function normalizeJamendoId(value: string | undefined | null) {
  if (!value) return null

  return /^\d+$/.test(value) ? value : null
}

export function toJamendoId(track: PlayableTrack): string | null {
  if (!track) return null

  if (typeof track === "string") {
    if (track.startsWith("libtr_")) {
      return cyaniteToJamendoId.get(track) ?? null
    }

    return normalizeJamendoId(track)
  }

  if ("track" in track) {
    return toJamendoId(track.track)
  }

  const titleId = jamendoIdFromTitle(track.title)
  if (titleId) return titleId

  const externalId = normalizeJamendoId(track.externalId)
  if (externalId) return externalId

  return toJamendoId(track.id)
}

export function jamendoMp3Url(jamendoId: string) {
  return `/jamendo-audio/download/track/${encodeURIComponent(jamendoId)}/mp32/`
}
