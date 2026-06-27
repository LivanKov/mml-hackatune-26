import path from "node:path"
import { fileURLToPath } from "node:url"

import vue from "@vitejs/plugin-vue"
import { defineConfig, loadEnv } from "vite"

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(dirname, "../.."), "")

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        "@": path.resolve(dirname, "src"),
      },
    },
    server: {
      fs: {
        allow: [dirname, path.resolve(dirname, "../..")],
      },
      proxy: {
        "/api/cyanite": {
          target: "https://rest-api.cyanite.ai/v1",
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/cyanite/, ""),
          headers: {
            "x-api-key": env.CYANITE_API_KEY ?? "",
          },
        },
      },
    },
  }
})
