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

const similarTracksCache = new Map<string, SimilarTracksResponse>()

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
