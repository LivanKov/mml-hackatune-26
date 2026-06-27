import path from "node:path"
import { fileURLToPath } from "node:url"

import vue from "@vitejs/plugin-vue"
import { defineConfig, loadEnv } from "vite"

const dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(dirname, "../..")

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, "")
  const apiUrl = env.VITE_API_URL || env.VITE_BACKEND_URL || "http://127.0.0.1:8001"
  const cyaniteApiKey = env.VITE_CYANITE_API_KEY || env.CYANITE_API_KEY || ""
  const cyaniteBaseUrl = "https://rest-api.cyanite.ai/v1"
  const proxy = {
    "/api": {
      target: apiUrl,
      changeOrigin: true,
    },
    "/cyanite": {
      target: cyaniteBaseUrl,
      changeOrigin: true,
      headers: cyaniteApiKey ? { "x-api-key": cyaniteApiKey } : {},
      rewrite: (requestPath: string) => requestPath.replace(/^\/cyanite/, ""),
    },
  }

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        "@": path.resolve(dirname, "src"),
      },
    },
    server: {
      fs: {
        allow: [dirname, repoRoot],
      },
      proxy,
    },
    preview: {
      proxy,
    },
  }
})
