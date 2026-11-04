import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { createAssistantMiddleware } from '../server/assistantHandler.js'
import { askAssistant, getAssistantStatus, answerLocal, buildBusinessContext } from '../src/lib/assistant.js'

const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)))
const close = (server) => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve) })
const silent = { warn() {} }

let upstream, upstreamPort, upstreamMode = 'ok', upstreamSeen = []
const servers = {}

/** Meniru Connect: server.middlewares.use('/api/assistant', mw) memotong awalan rute dari req.url. */
const mount = (mw) =>
  http.createServer((req, res) => {
    if (!req.url.startsWith('/api/assistant')) { res.statusCode = 404; return res.end() }
    req.url = req.url.slice('/api/assistant'.length) || '/'
    mw(req, res)
  })

before(async () => {
  upstream = http.createServer((req, res) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      upstreamSeen.push({ url: req.url, headers: req.headers, body: JSON.parse(raw || '{}') })
      res.setHeader('content-type', 'application/json')
      if (upstreamMode === 'error') { res.statusCode = 500; return res.end('{"error":"boom"}') }
      if (upstreamMode === 'denied') { res.statusCode = 401; return res.end('{"error":"invalid x-api-key"}') }
      res.end(JSON.stringify({ model: 'claude-sonnet-5-5', content: [{ type: 'text', text: 'Jawaban dari upstream palsu' }] }))
    })
  })
  upstreamPort = await listen(upstream)
  const base = `http://127.0.0.1:${upstreamPort}`
  const defs = {
    live: { apiKey: 'kunci-uji-123', baseUrl: base, logger: silent },
    liveFallback: { apiKey: 'kunci-uji-123', baseUrl: base, logger: silent, fallback: answerLocal },
    noKey: { apiKey: '', logger: silent },
    noKeyFallback: { apiKey: '', logger: silent, fallback: answerLocal },
  }
  for (const [name, opts] of Object.entries(defs)) {
    servers[name] = { server: mount(createAssistantMiddleware(opts)) }
    servers[name].port = await listen(servers[name].server)
  }
})
after(async () => { await Promise.all([close(upstream), ...Object.values(servers).map((s) => close(s.server))]) })

const url = (name, sub = '') => `http://127.0.0.1:${servers[name].port}/api/assistant${sub}`
const ctx = () => buildBusinessContext({ products: [{ id: 'p1', name: 'Kabel', cost: 1000, price: 2000, stock: 0, min: 3 }], transactions: [], expenses: [], today: '2026-10-18' })
const post = (name, body, raw = false) => fetch(url(name), { method: 'POST', headers: { 'content-type': 'application/json' }, body: raw ? body : JSON.stringify(body) })
const ask = (q = 'stok apa yang harus dibeli?') => ({ question: q, context: ctx() })

test('HTTP: metode selain GET/POST ditolak 405, sub-path tak dikenal 404', async () => {
  assert.equal((await fetch(url('live'))).status, 405)
  assert.equal((await fetch(url('live'), { method: 'PUT' })).status, 405)
  assert.equal((await fetch(url('live', '/lain'))).status, 404)
  assert.equal((await fetch(url('live', '/lain'), { method: 'POST', body: '{}' })).status, 404)
})

test('HTTP: GET /status melaporkan mode tanpa membocorkan key', async () => {
  const cases = [['live', 'llm', true], ['liveFallback', 'llm', true], ['noKey', 'unavailable', false], ['noKeyFallback', 'rules', false]]
  for (const [name, mode, configured] of cases) {
    const r = await fetch(url(name, '/status'))
    assert.equal(r.status, 200)
    const text = await r.text()
    const json = JSON.parse(text)
    assert.equal(json.mode, mode)
    assert.equal(json.configured, configured)
    assert.ok(!text.includes('kunci-uji-123'))
  }
})

test('HTTP: tanpa API key dan tanpa fallback -> 503 not_configured', async () => {
  const r = await post('noKey', ask())
  assert.equal(r.status, 503)
  assert.equal((await r.json()).error, 'not_configured')
})

test('HTTP: tanpa API key dengan fallback -> 200 berlabel rules (bukan AI) dan upstream tidak dipanggil', async () => {
  upstreamSeen = []
  const r = await post('noKeyFallback', ask())
  assert.equal(r.status, 200)
  const json = await r.json()
  assert.equal(json.source, 'rules')
  assert.equal(json.fallbackReason, 'not_configured')
  assert.match(json.text, /Kabel: HABIS/)
  assert.equal(json.model, undefined)
  assert.equal(upstreamSeen.length, 0)
})

test('HTTP: JSON rusak -> 400, bukan crash server', async () => {
  const r = await post('live', '{bukan json', true)
  assert.equal(r.status, 400)
  assert.equal((await post('live', ask())).status, 200)
})

test('HTTP: input tidak valid -> 400 sebelum menyentuh upstream', async () => {
  upstreamSeen = []
  assert.equal((await post('live', { question: '', context: ctx() })).status, 400)
  assert.equal((await post('live', { question: 'x'.repeat(1001), context: ctx() })).status, 400)
  assert.equal((await post('live', { question: 'ok' })).status, 400)
  assert.equal((await post('live', [1, 2], false)).status, 400)
  assert.equal(upstreamSeen.length, 0)
})

test('HTTP: body > 64KB -> 413 diterima klien dan server tetap hidup', async () => {
  const r = await post('live', JSON.stringify({ question: 'x', context: { pad: 'y'.repeat(100 * 1024) } }), true)
  assert.equal(r.status, 413)
  assert.equal((await post('live', ask())).status, 200)
})

test('HTTP: sukses, API key ke upstream via header dan TIDAK ada di respons ke browser', async () => {
  upstreamSeen = []
  upstreamMode = 'ok'
  const r = await post('live', ask('Produk apa yang laris?'))
  assert.equal(r.status, 200)
  const text = await r.text()
  const json = JSON.parse(text)
  assert.deepEqual({ source: json.source, text: json.text }, { source: 'llm', text: 'Jawaban dari upstream palsu' })
  assert.ok(!text.includes('kunci-uji-123'))
  assert.ok(![...r.headers.values()].some((v) => v.includes('kunci-uji-123')))
  assert.equal(upstreamSeen[0].url, '/v1/messages')
  assert.equal(upstreamSeen[0].headers['x-api-key'], 'kunci-uji-123')
  assert.equal(upstreamSeen[0].headers['anthropic-version'], '2023-06-01')
  assert.equal(r.headers.get('cache-control'), 'no-store')
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff')
})

test('HTTP: upstream error tanpa fallback -> 502 tanpa membocorkan isi', async () => {
  upstreamMode = 'error'
  const r = await post('live', ask())
  assert.equal(r.status, 502)
  assert.ok(!(await r.text()).includes('boom'))
  upstreamMode = 'ok'
})

test('HTTP: upstream error / kredensial ditolak dengan fallback -> 200 rules + alasan jujur', async () => {
  for (const mode of ['error', 'denied']) {
    upstreamMode = mode
    const r = await post('liveFallback', ask())
    assert.equal(r.status, 200)
    const json = await r.json()
    assert.equal(json.source, 'rules')
    assert.equal(json.fallbackReason, 'upstream_error')
  }
  upstreamMode = 'ok'
  assert.equal((await (await post('liveFallback', ask())).json()).source, 'llm') // pulih otomatis
})

test('Klien<->server: askAssistant menghormati label dari server (llm / rules / tidak terjangkau)', async () => {
  const live = await askAssistant({ question: 'halo', context: ctx(), endpoint: url('live') })
  assert.equal(live.source, 'llm')

  const viaServerRules = await askAssistant({ question: 'stok', context: ctx(), endpoint: url('noKeyFallback') })
  assert.equal(viaServerRules.source, 'rules')
  assert.equal(viaServerRules.fallbackReason, 'not_configured')
  assert.equal(viaServerRules.model, undefined)

  const noFallback = await askAssistant({ question: 'stok', context: ctx(), endpoint: url('noKey') })
  assert.equal(noFallback.source, 'rules')
  assert.equal(noFallback.fallbackReason, 'not_configured')

  const dead = await askAssistant({ question: 'stok', context: ctx(), endpoint: 'http://127.0.0.1:1/api/assistant' })
  assert.equal(dead.source, 'rules')
  assert.equal(dead.fallbackReason, 'unavailable')
})

test('Klien: getAssistantStatus membaca mode server, dan unavailable bila server mati', async () => {
  assert.equal((await getAssistantStatus({ endpoint: url('live') })).mode, 'llm')
  assert.equal((await getAssistantStatus({ endpoint: url('noKeyFallback') })).mode, 'rules')
  assert.equal((await getAssistantStatus({ endpoint: url('noKey') })).mode, 'unavailable')
  assert.equal((await getAssistantStatus({ endpoint: 'http://127.0.0.1:1/api/assistant' })).mode, 'unavailable')
  assert.equal((await getAssistantStatus({ fetchImpl: async () => ({ ok: true, json: async () => ({ mode: 'aneh' }) }) })).mode, 'unavailable')
})
