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
