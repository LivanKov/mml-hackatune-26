export interface CyaniteLibraryTrack {
  id: string
  title?: string
}

export interface SimilarTrackItem {
  track: CyaniteLibraryTrack
  score?: number
}

export interface SimilarTracksResponse {
  items: SimilarTrackItem[]
  pageInfo?: Record<string, unknown>
}

export const CYANITE_MODEL_OUTPUTS = [
  "AiMusicDetectionV1",
  "AudioFileInfoV1",
  "AugmentedKeywordsV3",
  "AutoDescriptionV2",
  "BpmV2",
  "CharacterV2",
  "FreeGenreV3",
  "InstrumentsV2",
  "KeyV2",
  "MainGenreV2",
  "MoodAdvancedV2",
  "MoodSimpleV2",
  "MovementV2",
  "MusicForV1",
  "MusicalEraV2",
  "RepresentativeSegmentV2",
  "SubgenreV2",
  "TempoV1",
  "TimeSignatureV2",
  "ValenceArousalV2",
  "VocalsV2",
  "VocalStyleV1",
  "VoiceoverV2",
] as const

const similarTracksCache = new Map<string, SimilarTracksResponse>()
const libraryTrackModelsCache = new Map<string, unknown>()

async function readResponseBody(response: Response) {
  const text = await response.text()

  if (!text) {
    return null
  }

  try {
    return JSON.parse(text) as unknown
  } catch {
    return { raw: text }
  }
}

function getErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    const error = "error" in payload ? payload.error : undefined
    const message = "message" in payload ? payload.message : undefined

    if (typeof error === "string") {
      return error
    }

    if (typeof message === "string") {
      return message
    }
  }

  return fallback
}

export async function findSimilarLibraryTracks(trackIds: string[], limit = 20) {
  const seedIds = trackIds.slice(0, 10)
  const cacheKey = `${limit}:${seedIds.join("|")}`
  const cached = similarTracksCache.get(cacheKey)

  if (cached) {
    return cached
  }

  const response = await fetch("/api/similar-tracks", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ trackIds: seedIds, limit }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(error?.error ?? "Could not fetch similar tracks.")
  }

  const data = await response.json() as SimilarTracksResponse
  similarTracksCache.set(cacheKey, data)

  return data
}

export async function getLibraryTrackModels(libraryTrackId: string) {
  const cached = libraryTrackModelsCache.get(libraryTrackId)

  if (cached) {
    return cached
  }

  const url = new URL(
    `/cyanite/library-tracks/${encodeURIComponent(libraryTrackId)}/models`,
    window.location.origin,
  )
  CYANITE_MODEL_OUTPUTS.forEach((model) => {
    url.searchParams.append("model", model)
  })

  const response = await fetch(url)
  const data = await readResponseBody(response)

  if (!response.ok) {
    throw new Error(getErrorMessage(data, "Could not fetch inferred AI models."))
  }

  libraryTrackModelsCache.set(libraryTrackId, data)

  return data
}
