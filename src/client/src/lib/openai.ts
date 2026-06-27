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
