export interface OpenAiStructuredTestResult {
  ok: boolean
  status: "pass" | "warning" | "fail"
  message: string
  next_steps: string[]
}

export interface OpenAiStructuredTestResponse {
  model: string
  result: OpenAiStructuredTestResult
  usage?: Record<string, unknown> | null
}

export interface TrackExplanation {
  id: string
  explanation: string
}

export type RecommendationTraitBucket = "high" | "medium" | "low"

export interface RecommendationTraitSummaryModel {
  model: string
  score: number
  seedValues: unknown[]
  recommendationValues: unknown[]
}

export async function generateSimilarTrackSummary(
  seedSummaries: Record<string, unknown>[],
  tracks: Array<{ id: string; title: string; artist: string; summary: Record<string, unknown> }>,
): Promise<{ explanations: TrackExplanation[] }> {
  const response = await fetch("/api/track-summary", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ seedSummaries, tracks }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(error?.error ?? "Could not generate track summary.")
  }

  return await response.json() as { explanations: TrackExplanation[] }
}

export async function generateRecommendationTraitBucketSummary(
  bucket: RecommendationTraitBucket,
  models: RecommendationTraitSummaryModel[],
): Promise<{ bucket: RecommendationTraitBucket; summary: string }> {
  const response = await fetch("/api/recommendation-trait-summary", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ bucket, models }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(error?.error ?? "Could not generate recommendation trait summary.")
  }

  return await response.json() as { bucket: RecommendationTraitBucket; summary: string }
}

export async function refineToFilter(
  userMessage: string,
  seedSummaries: Record<string, unknown>[],
  currentSummaries: Record<string, unknown>[],
): Promise<{ filter: Record<string, unknown>; reasoning: string }> {
  const response = await fetch("/api/refine-filter", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userMessage, seedSummaries, currentSummaries }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(error?.error ?? "Could not refine filter.")
  }

  return await response.json() as { filter: Record<string, unknown>; reasoning: string }
}

export async function testOpenAiStructuredOutput() {
  const response = await fetch("/api/openai-test", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({}),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(error?.error ?? "Could not run OpenAI structured output test.")
  }

  return await response.json() as OpenAiStructuredTestResponse
}
