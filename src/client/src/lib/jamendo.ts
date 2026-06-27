export interface JamendoTrack {
  name: string
  artistName: string
}

const cache = new Map<string, JamendoTrack>()

export async function fetchJamendoTracks(ids: string[]): Promise<Map<string, JamendoTrack>> {
  const clientId = import.meta.env.VITE_JAMENDO_CLIENT_ID as string | undefined
  console.log("[jamendo] client_id:", clientId, "ids:", ids)
  if (!clientId || ids.length === 0) return new Map()

  const uncached = ids.filter((id) => !cache.has(id))

  if (uncached.length > 0) {
    const params = new URLSearchParams({ client_id: clientId, format: "json" })
    uncached.forEach((id) => params.append("id[]", id))

    try {
      const url = `/jamendo/v3.0/tracks/?${params}`
      console.log("[jamendo] fetching", url)
      const response = await fetch(url)
      console.log("[jamendo] status", response.status)
      if (response.ok) {
        const data = await response.json() as {
          results: Array<{ id: string; name: string; artist_name: string }>
        }
        console.log("[jamendo] results", data.results.length, data.results)
        for (const t of data.results) {
          cache.set(t.id, { name: t.name, artistName: t.artist_name })
        }
      } else {
        const text = await response.text()
        console.error("[jamendo] error response", response.status, text)
      }
    } catch (err) {
      console.error("[jamendo] fetch failed", err)
    }
  }

  const result = new Map<string, JamendoTrack>()
  for (const id of ids) {
    const hit = cache.get(id)
    if (hit) result.set(id, hit)
  }
  return result
}
