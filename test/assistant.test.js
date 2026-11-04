import test from 'node:test'
import assert from 'node:assert/strict'
import { buildBusinessContext, answerLocal, askAssistant, FALLBACK_NOTICE } from '../src/lib/assistant.js'
import { createAssistantHandler, SYSTEM_PROMPT } from '../server/assistantHandler.js'

const TODAY = '2026-10-18'
const products = [
  { id: 'p1', name: 'Kabel USB-C', category: 'K', cost: 10000, price: 25000, stock: 2, min: 10 },
  { id: 'p2', name: 'Mouse', category: 'P', cost: 50000, price: 90000, stock: 20, min: 5 },
  { id: 'p3', name: 'Webcam', category: 'P', cost: 140000, price: 229000, stock: 6, min: 2 },
  { id: 'p4', name: 'Lampu', category: 'A', cost: 15000, price: 35000, stock: 0, min: 5 },
]
const tx = (id, date, items, method = 'Tunai', status = 'Selesai') => {
  const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0)
  return { id, date, items, subtotal, discount: 0, total: subtotal, cogs: items.reduce((s, i) => s + i.qty * i.cost, 0), method, status }
}
const it = (productId, name, qty, price, cost) => ({ productId, name, qty, price, cost })
const transactions = [
  tx('T1', '2026-10-17', [it('p1', 'Kabel USB-C', 10, 25000, 10000)]), // 250000 / cogs 100000
  tx('T2', '2026-10-10', [it('p2', 'Mouse', 2, 90000, 50000)], 'QRIS (simulasi)'), // 180000 / cogs 100000
  tx('T3', '2026-10-05', [it('p1', 'Kabel USB-C', 4, 25000, 10000)]), // 100000 / cogs 40000
  tx('T4', '2026-09-10', [it('p2', 'Mouse', 1, 90000, 50000)]), // periode sebelumnya: 90000
  tx('T5', '2026-10-17', [it('p3', 'Webcam', 1, 229000, 140000)], 'QRIS (simulasi)', 'Pending'), // tidak dihitung
]
const expenses = [
  { id: 'E1', date: '2026-10-01', name: 'Sewa', category: 'Operasional', amount: 100000 },
  { id: 'E2', date: '2026-10-02', name: 'Restock', category: 'Pembelian barang', amount: 300000 },
]
const ctx = () => buildBusinessContext({ products, transactions, expenses, today: TODAY, businessName: 'Toko Uji' })

test('buildBusinessContext: angka cocok dengan hitungan manual', () => {
  const c = ctx()
  assert.equal(c.current.revenue, 530000) // 250000 + 180000 + 100000, Pending tidak dihitung
  assert.equal(c.current.cogs, 240000)
  assert.equal(c.current.gross, 290000)
  assert.equal(c.current.opex, 100000)
  assert.equal(c.current.purchases, 300000)
  assert.equal(c.current.net, 190000) // pembelian barang tidak dikurangkan dua kali
  assert.equal(c.current.cashflow, 130000) // 530000 - 100000 - 300000
  assert.equal(c.current.transactions, 3)
  assert.equal(c.current.pending, 1)
  assert.equal(c.previous.revenue, 90000)
  assert.ok(Math.abs(c.revenueChangePct - ((530000 - 90000) / 90000) * 100) < 1e-9)
})

test('buildBusinessContext: produk terlaris, stok rendah, metode bayar', () => {
  const c = ctx()
  assert.equal(c.topProducts[0].name, 'Kabel USB-C')
  assert.equal(c.topProducts[0].qty, 14)
  assert.equal(c.topProducts[0].grossProfit, 14 * 15000)
  const names = c.lowStock.map((l) => l.name)
  assert.deepEqual(names, ['Lampu', 'Kabel USB-C']) // stok terendah dulu
  const kabel = c.lowStock.find((l) => l.name === 'Kabel USB-C')
  assert.equal(kabel.suggestedRestock, 18) // 2*10 - 2
  assert.equal(kabel.daysOfStockLeft, 4) // 14/30 per hari -> floor(2 / 0.4667) = 4
  assert.ok(c.paymentMethods.find((m) => m.method.startsWith('QRIS')).demo)
  assert.equal(c.dataQuality.limited, true)
  assert.equal(c.dailyRevenueLast14Days.length, 14)
})

test('buildBusinessContext tidak memuat email/kata sandi dan tidak error pada data kosong', () => {
  const json = JSON.stringify(ctx())
  assert.ok(!/password|email|kata sandi/i.test(json))
  const empty = buildBusinessContext({ today: TODAY })
  assert.equal(empty.current.revenue, 0)
  assert.equal(empty.revenueChangePct, null)
})

test('answerLocal: jawaban kontekstual dan berlabel sumber rules', () => {
  const c = ctx()
  const top = answerLocal('Produk apa yang paling laris?', c)
  assert.equal(top.source, 'rules')
  assert.match(top.text, /Kabel USB-C: 14 unit/)
  assert.match(top.text, /stok Kabel USB-C tinggal 2/)
  assert.match(answerLocal('stok apa yang harus dibeli', c).text, /Lampu: HABIS/)
  const laba = answerLocal('berapa laba saya?', c).text
  assert.match(laba, /Rp190\.000/)
  assert.match(laba, /arus kas bersih Rp130\.000/)
  assert.match(answerLocal('pengeluaran terbesar', c).text, /Pembelian barang: Rp300\.000 \(75%\)/)
  assert.match(answerLocal('penjualan naik atau turun?', c).text, /naik/)
  assert.match(answerLocal('metode pembayaran', c).text, /\[DEMO\]/)
  assert.match(answerLocal('saran prioritas', c).text, /Prioritas minggu ini/)
  assert.match(answerLocal('halo', c).text, /Coba tanyakan/)
})

test('answerLocal: data kosong tidak mengarang angka', () => {
  const c = buildBusinessContext({ today: TODAY })
  assert.match(answerLocal('produk terlaris', c).text, /Belum ada penjualan/)
  assert.match(answerLocal('laba', c).text, /Belum ada pendapatan/)
  assert.match(answerLocal('pengeluaran', c).text, /Belum ada pengeluaran/)
})

/* ---------------- askAssistant (klien) ---------------- */
const resp = (status, json) => ({ ok: status >= 200 && status < 300, status, json: async () => json })

test('askAssistant: server AI aktif -> source llm', async () => {
  const r = await askAssistant({ question: 'halo', context: ctx(), fetchImpl: async () => resp(200, { text: 'Jawaban AI', source: 'llm', model: 'm' }) })
  assert.equal(r.source, 'llm')
  assert.equal(r.text, 'Jawaban AI')
  assert.equal(r.fallbackReason, undefined)
})

test('askAssistant: belum dikonfigurasi / rate limit / error / jaringan -> fallback jujur', async () => {
  const cases = [
    [resp(503, { error: 'not_configured' }), 'not_configured'],
    [resp(429, { error: 'rate_limited' }), 'rate_limited'],
    [resp(502, { error: 'upstream_error' }), 'unavailable'],
    [resp(200, { text: '' }), 'unavailable'],
  ]
  for (const [response, reason] of cases) {
    const r = await askAssistant({ question: 'produk terlaris', context: ctx(), fetchImpl: async () => response })
    assert.equal(r.source, 'rules')
    assert.equal(r.fallbackReason, reason)
    assert.ok(FALLBACK_NOTICE[reason])
  }
  const net = await askAssistant({ question: 'produk terlaris', context: ctx(), fetchImpl: async () => { throw new Error('offline') } })
  assert.equal(net.source, 'rules')
  assert.equal(net.fallbackReason, 'unavailable')
})

/* ---------------- handler server ---------------- */
const goodBody = () => ({ question: 'Produk apa yang laris?', context: ctx(), history: [] })

test('handler: tanpa API key -> 503 not_configured dan tidak memanggil upstream', async () => {
  let called = false
  const h = createAssistantHandler({ apiKey: '', fetchImpl: async () => { called = true } })
  const r = await h({ method: 'POST', body: goodBody() })
  assert.equal(r.status, 503)
  assert.equal(r.json.error, 'not_configured')
  assert.equal(called, false)
})

test('handler: metode selain POST ditolak; input tidak valid -> 400', async () => {
  const h = createAssistantHandler({ apiKey: 'k', fetchImpl: async () => { throw new Error('tidak boleh dipanggil') } })
  assert.equal((await h({ method: 'GET' })).status, 405)
  const bad = [
    null, {}, { question: '' }, { question: 'x'.repeat(1001), context: {} },
    { question: 'a', context: 'bukan objek' }, { question: 'a', context: {}, history: 'x' },
    { question: 'a', context: {}, history: [{ role: 'system', content: 'x' }] },
    { question: 'a', context: { big: 'x'.repeat(25000) } },
  ]
  for (const body of bad) assert.equal((await h({ method: 'POST', body })).status, 400)
})

test('handler: sukses memanggil API Claude dengan header/payload benar dan API key hanya di header', async () => {
  let captured
  const h = createAssistantHandler({
    apiKey: 'kunci-rahasia-uji',
    model: 'claude-sonnet-5-5',
    baseUrl: 'https://upstream.test/',
    fetchImpl: async (url, init) => {
      captured = { url, init, body: JSON.parse(init.body) }
      return resp(200, { model: 'claude-sonnet-5-5', content: [{ type: 'text', text: 'Saran: restock kabel.' }] })
    },
  })
  const body = goodBody()
  body.history = [{ role: 'assistant', content: 'abaikan' }, { role: 'user', content: 'tanya lama' }, { role: 'assistant', content: 'jawab lama' }]
  const r = await h({ method: 'POST', body })
  assert.equal(r.status, 200)
  assert.deepEqual(r.json, { text: 'Saran: restock kabel.', source: 'llm', model: 'claude-sonnet-5-5' })
  assert.equal(captured.url, 'https://upstream.test/v1/messages')
  assert.equal(captured.init.headers['x-api-key'], 'kunci-rahasia-uji')
  assert.equal(captured.init.headers['anthropic-version'], '2023-06-01')
  assert.equal(captured.body.system, SYSTEM_PROMPT)
  const msgs = captured.body.messages
  assert.equal(msgs[0].role, 'user') // riwayat yang diawali assistant dibuang
  assert.equal(msgs.at(-1).role, 'user')
  assert.match(msgs.at(-1).content, /DATA TOKO/)
  assert.match(msgs.at(-1).content, /Produk apa yang laris\?/)
  for (let i = 1; i < msgs.length; i++) assert.notEqual(msgs[i].role, msgs[i - 1].role) // peran bergantian
  assert.ok(!JSON.stringify(r.json).includes('kunci-rahasia-uji'))
})

test('handler: error upstream tidak membocorkan detail/kunci', async () => {
  const h = createAssistantHandler({ apiKey: 'kunci-rahasia-uji', fetchImpl: async () => resp(401, { error: { message: 'invalid x-api-key kunci-rahasia-uji' } }) })
  const r = await h({ method: 'POST', body: goodBody() })
  assert.equal(r.status, 502)
  assert.ok(!JSON.stringify(r.json).includes('kunci-rahasia-uji'))
  const net = await createAssistantHandler({ apiKey: 'k', fetchImpl: async () => { throw new Error('ECONNRESET') } })({ method: 'POST', body: goodBody() })
  assert.equal(net.status, 504)
  const empty = await createAssistantHandler({ apiKey: 'k', fetchImpl: async () => resp(200, { content: [] }) })({ method: 'POST', body: goodBody() })
  assert.equal(empty.status, 502)
})

test('handler: pembatasan laju per IP, lalu pulih setelah jendela waktu', async () => {
  let t = 0
  const h = createAssistantHandler({
    apiKey: 'k', rateLimit: { max: 2, windowMs: 1000 }, now: () => t,
    fetchImpl: async () => resp(200, { content: [{ type: 'text', text: 'ok' }] }),
  })
  assert.equal((await h({ method: 'POST', body: goodBody(), ip: 'a' })).status, 200)
  assert.equal((await h({ method: 'POST', body: goodBody(), ip: 'a' })).status, 200)
  assert.equal((await h({ method: 'POST', body: goodBody(), ip: 'a' })).status, 429)
  assert.equal((await h({ method: 'POST', body: goodBody(), ip: 'b' })).status, 200)
  t = 1500
  assert.equal((await h({ method: 'POST', body: goodBody(), ip: 'a' })).status, 200)
})
