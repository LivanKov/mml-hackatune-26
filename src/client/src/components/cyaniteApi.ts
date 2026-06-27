const BASE_URL = "/cyanite"

export interface ApiTrackItem {
  track: { id: string; title: string }
  score: number
}

export async function fetchSimilar(cyaniteId: string, limit = 5): Promise<ApiTrackItem[]> {
  const params = new URLSearchParams({ limit: String(limit) })
  const resp = await fetch(
    `${BASE_URL}/private-alpha/library-tracks/${cyaniteId}/similar?${params}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    },
  )
  if (!resp.ok) throw new Error(`Similar search failed: ${resp.status}`)
  const data = await resp.json()
  return (data.items ?? []).slice(0, limit)
}

export async function fetchTags(
  trackId: string,
  models: string[],
): Promise<Record<string, Record<string, unknown>> | null> {
  const query = models.map((m) => `model=${m}`).join("&")
  const resp = await fetch(`${BASE_URL}/library-tracks/${trackId}/models?${query}`)
  if (!resp.ok) return null
  const data = await resp.json()
  return Object.fromEntries(
    (data.items ?? []).map((m: { version: string }) => [m.version, m]),
  )
}
