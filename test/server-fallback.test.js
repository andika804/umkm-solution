import test from 'node:test'
import assert from 'node:assert/strict'
import { createAssistantHandler } from '../server/assistantHandler.js'
import { answerLocal, buildBusinessContext } from '../src/lib/assistant.js'

const ctx = () => buildBusinessContext({ products: [{ id: 'p1', name: 'Mouse', cost: 5000, price: 9000, stock: 1, min: 4 }], today: '2026-10-18' })
const body = (q = 'stok') => ({ question: q, context: ctx() })
const resp = (status, json) => ({ ok: status >= 200 && status < 300, status, json: async () => json })
const logs = () => { const lines = []; return { lines, logger: { warn: (m) => lines.push(m) } } }

test('log server menyamarkan API key dan tidak memuat isi respons upstream', async () => {
  const { lines, logger } = logs()
  const h = createAssistantHandler({ apiKey: 'sk-rahasia-xyz', logger, fetchImpl: async () => resp(401, { error: 'invalid key sk-rahasia-xyz' }) })
  const r = await h({ method: 'POST', body: body() })
  assert.equal(r.status, 502)
  assert.equal(lines.length, 1)
  assert.match(lines[0], /HTTP 401/)
  assert.match(lines[0], /ANTHROPIC_API_KEY/)
  assert.ok(!lines.join('\n').includes('sk-rahasia-xyz'))
})

test('pesan log yang kebetulan memuat key disamarkan', async () => {
  const { lines, logger } = logs()
  const h = createAssistantHandler({ apiKey: 'sk-rahasia-xyz', logger, fetchImpl: async () => { throw Object.assign(new Error('gagal sk-rahasia-xyz'), { name: 'TypeError' }) } })
  assert.equal((await h({ method: 'POST', body: body() })).status, 504)
  assert.ok(!lines.join('\n').includes('sk-rahasia-xyz'))
})

test('fallback: jawaban berlabel rules, bukan llm, untuk semua jalur gagal', async () => {
  const cases = [
    ['', async () => { throw new Error('tidak dipanggil') }, 'not_configured'],
    ['k', async () => resp(500, {}), 'upstream_error'],
    ['k', async () => resp(200, { content: [] }), 'upstream_error'],
    ['k', async () => { throw new Error('ECONNRESET') }, 'unavailable'],
  ]
  for (const [apiKey, fetchImpl, reason] of cases) {
    const h = createAssistantHandler({ apiKey, fetchImpl, fallback: answerLocal, logger: { warn() {} } })
    const r = await h({ method: 'POST', body: body() })
    assert.equal(r.status, 200, reason)
    assert.equal(r.json.source, 'rules')
    assert.equal(r.json.fallbackReason, reason)
    assert.match(r.json.text, /Mouse/)
  }
})

test('fallback yang melempar error tidak menjatuhkan server: kembali ke kode error biasa', async () => {
  const { lines, logger } = logs()
  const h = createAssistantHandler({ apiKey: '', fallback: () => { throw new Error('bug fallback') }, logger })
  const r = await h({ method: 'POST', body: body() })
  assert.equal(r.status, 503)
  assert.match(lines[0], /fallback aturan gagal/)
})

test('fallback yang mengembalikan teks kosong diabaikan', async () => {
  const h = createAssistantHandler({ apiKey: '', fallback: () => ({ text: '  ' }), logger: { warn() {} } })
  assert.equal((await h({ method: 'POST', body: body() })).status, 503)
})

test('validasi tetap berlaku sebelum fallback (input rusak -> 400, bukan jawaban)', async () => {
  const h = createAssistantHandler({ apiKey: '', fallback: answerLocal, logger: { warn() {} } })
  assert.equal((await h({ method: 'POST', body: { question: '', context: ctx() } })).status, 400)
  assert.equal((await h({ method: 'POST', body: { question: 'x' } })).status, 400)
})

test('pembatasan laju berlaku juga untuk jawaban fallback', async () => {
  let t = 0
  const h = createAssistantHandler({ apiKey: '', fallback: answerLocal, rateLimit: { max: 2, windowMs: 1000 }, now: () => t, logger: { warn() {} } })
  assert.equal((await h({ method: 'POST', body: body(), ip: 'a' })).status, 200)
  assert.equal((await h({ method: 'POST', body: body(), ip: 'a' })).status, 200)
  assert.equal((await h({ method: 'POST', body: body(), ip: 'a' })).status, 429)
})

test('status: mode sesuai konfigurasi dan tidak memuat key', async () => {
  const run = async (opts) => (await createAssistantHandler({ logger: { warn() {} }, ...opts })({ method: 'GET', path: '/status' })).json
  assert.deepEqual(await run({ apiKey: 'sk-1', model: 'm1' }), { configured: true, mode: 'llm', model: 'm1', fallback: false })
  assert.deepEqual(await run({ apiKey: '', fallback: answerLocal }), { configured: false, mode: 'rules', model: null, fallback: true })
  assert.deepEqual(await run({ apiKey: '' }), { configured: false, mode: 'unavailable', model: null, fallback: false })
})

test('rute: path tak dikenal 404, GET selain /status 405', async () => {
  const h = createAssistantHandler({ apiKey: 'k', logger: { warn() {} } })
  assert.equal((await h({ method: 'POST', path: '/x', body: body() })).status, 404)
  assert.equal((await h({ method: 'GET', path: '/' })).status, 405)
  assert.equal((await h({ method: 'DELETE', path: '/' })).status, 405)
})

test('rate limiter: tetap melayani setelah ratusan IP berbeda dan jendela waktu berlalu (pembersihan memori tidak diukur langsung)', async () => {
  let t = 0
  const h = createAssistantHandler({ apiKey: '', fallback: answerLocal, rateLimit: { max: 5, windowMs: 1000 }, now: () => t, logger: { warn() {} } })
  for (let i = 0; i < 600; i++) await h({ method: 'POST', body: body(), ip: `10.0.${Math.floor(i / 250)}.${i % 250}` })
  t = 5000
  // pemanggilan berikutnya memicu pembersihan; semua IP lama kini bebas dan tetap dilayani
  assert.equal((await h({ method: 'POST', body: body(), ip: '10.0.0.1' })).status, 200)
})
