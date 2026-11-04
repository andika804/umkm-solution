import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { createAssistantMiddleware } from './server/assistantHandler.js'
import { answerLocal } from './src/lib/assistant.js'

// Endpoint /api/assistant berjalan di server Vite (npm run dev dan npm run preview).
// ANTHROPIC_API_KEY dibaca dari file .env atau environment, TANPA awalan VITE_,
// sehingga tidak pernah masuk ke bundle frontend.
// Jika key belum ada (atau layanan AI gagal), server menjawab dengan analisis
// berbasis aturan lokal yang diberi label "rules" (bukan AI).
function assistantApi(env) {
  const apiKey = (env.ANTHROPIC_API_KEY || '').trim()
  const middleware = createAssistantMiddleware({
    apiKey,
    model: env.ASSISTANT_MODEL || undefined,
    baseUrl: env.ASSISTANT_API_BASE || undefined,
    fallback: answerLocal,
  })
  const announce = (server) => {
    server.config.logger.info(
      apiKey
        ? '  Asisten AI: aktif (API key terbaca dari environment server).'
        : '  Asisten AI: ANTHROPIC_API_KEY belum diatur, memakai analisis berbasis aturan (bukan AI).'
    )
  }
  return {
    name: 'umkm-assistant-api',
    configureServer(server) {
      server.middlewares.use('/api/assistant', middleware)
      announce(server)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/assistant', middleware)
      announce(server)
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), assistantApi(env)],
  }
})
