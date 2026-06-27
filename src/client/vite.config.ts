import path from "node:path"
import { fileURLToPath } from "node:url"
import type { IncomingMessage, ServerResponse } from "node:http"

import vue from "@vitejs/plugin-vue"
import { defineConfig, loadEnv, type Plugin, type PreviewServer, type ViteDevServer } from "vite"

const dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(dirname, "../..")
const cyaniteBaseUrl = "https://rest-api.cyanite.ai/v1"

interface SimilarTracksRequest {
  trackIds?: unknown
  limit?: unknown
}

function readJsonBody(req: IncomingMessage) {
  return new Promise<unknown>((resolve, reject) => {
    let body = ""

    req.on("data", (chunk: Buffer) => {
      body += chunk.toString("utf8")

      if (body.length > 64_000) {
        reject(new Error("Request body is too large."))
        req.destroy()
      }
    })

    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch {
        reject(new Error("Request body must be valid JSON."))
      }
    })

    req.on("error", reject)
  })
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
  res.statusCode = statusCode
  res.setHeader("content-type", "application/json")
  res.end(JSON.stringify(payload))
}

function registerSimilarTracksMiddleware(
  server: ViteDevServer | PreviewServer,
  cyaniteApiKey: string | undefined,
) {
  server.middlewares.use("/api/similar-tracks", async (req, res) => {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed." })
      return
    }

    if (!cyaniteApiKey) {
      sendJson(res, 500, { error: "CYANITE_API_KEY is not configured." })
      return
    }

    try {
      const body = await readJsonBody(req) as SimilarTracksRequest
      const trackIds = Array.isArray(body.trackIds)
        ? body.trackIds.filter((trackId): trackId is string => typeof trackId === "string")
        : []

      if (trackIds.length < 1 || trackIds.length > 10) {
        sendJson(res, 400, { error: "Select between 1 and 10 tracks." })
        return
      }

      if (trackIds.some((trackId) => !trackId.startsWith("libtr_"))) {
        sendJson(res, 400, { error: "Track IDs must be Cyanite library track IDs." })
        return
      }

      const rawLimit = typeof body.limit === "number" ? body.limit : 20
      const limit = Math.min(Math.max(Math.floor(rawLimit), 1), 50)
      const response = await fetch(
        `${cyaniteBaseUrl}/private-alpha/library-tracks/similar?limit=${limit}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": cyaniteApiKey,
          },
          body: JSON.stringify({
            tracks: trackIds.map((trackId) => ({ id: trackId })),
          }),
        },
      )
      const responseBody = await response.text()

      res.statusCode = response.status
      res.setHeader("content-type", response.headers.get("content-type") ?? "application/json")
      res.end(responseBody)
    } catch (error) {
      sendJson(res, 400, {
        error: error instanceof Error ? error.message : "Could not fetch similar tracks.",
      })
    }
  })
}

function cyaniteSimilarTracksProxy(cyaniteApiKey: string | undefined): Plugin {
  return {
    name: "cyanite-similar-tracks-proxy",
    configureServer(server) {
      registerSimilarTracksMiddleware(server, cyaniteApiKey)
    },
    configurePreviewServer(server) {
      registerSimilarTracksMiddleware(server, cyaniteApiKey)
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, "")
  const cyaniteApiKey = process.env.CYANITE_API_KEY ?? env.CYANITE_API_KEY

  return {
    plugins: [cyaniteSimilarTracksProxy(cyaniteApiKey), vue()],
    resolve: {
      alias: {
        "@": path.resolve(dirname, "src"),
      },
    },
    server: {
      fs: {
        allow: [dirname, repoRoot],
      },
    },
  }
})
