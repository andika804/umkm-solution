/**
 * assistant.js — Asisten bisnis UMKM Solution.
 *
 * Dua mode, dan UI wajib menampilkan mode yang sedang dipakai:
 *   1) "llm"   : jawaban dari model AI lewat endpoint server /api/assistant.
 *                API key hanya ada di server (lihat server/assistantHandler.js).
 *   2) "rules" : fallback lokal berbasis aturan dan perhitungan dari data toko.
 *                BUKAN AI/machine learning dan tidak boleh dilabeli sebagai AI.
 *
 * Data yang dikirim ke server hanyalah ringkasan agregat (buildBusinessContext),
 * bukan seluruh isi localStorage, dan tidak memuat kata sandi atau email.
 */

const DAY = 86400000
const nf = new Intl.NumberFormat('id-ID')
const rp = (n) => (n < 0 ? '-' : '') + 'Rp' + nf.format(Math.abs(Math.round(n || 0)))
const pad = (n) => String(n).padStart(2, '0')
const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const addDays = (s, n) => {
  const [y, m, d] = s.split('-').map(Number)
  return dateStr(new Date(y, m - 1, d + n))
}
const PURCHASE = 'Pembelian barang'

export const SUGGESTED_QUESTIONS = [
  'Produk apa yang paling laris?',
  'Stok mana yang perlu segera dibeli?',
  'Bagaimana laba bersih saya?',
  'Pengeluaran apa yang terbesar?',
  'Apakah penjualan naik atau turun?',
  'Beri saran prioritas untuk minggu ini',
]

function periodStats(transactions, expenses, start, end) {
  let revenue = 0, cogs = 0, count = 0, pending = 0, opex = 0, purchases = 0
  for (const t of transactions) {
    if (t.date < start || t.date > end) continue
    if (t.status === 'Selesai') { revenue += t.total; cogs += t.cogs; count++ }
    else if (t.status === 'Pending') pending++
  }
  for (const e of expenses) {
    if (e.date < start || e.date > end) continue
    if (e.category === PURCHASE) purchases += e.amount
    else opex += e.amount
  }
  const gross = revenue - cogs
  return { revenue, cogs, gross, opex, purchases, net: gross - opex, cashflow: revenue - opex - purchases, transactions: count, pending }
}

/** Ringkasan agregat dari data toko. Murni dan deterministik (today bisa diinjeksi untuk pengujian). */
export function buildBusinessContext({ products = [], transactions = [], expenses = [], today = dateStr(new Date()), businessName = 'Toko' } = {}) {
  const start = addDays(today, -29)
  const prevEnd = addDays(start, -1)
  const prevStart = addDays(prevEnd, -29)
  const cur = periodStats(transactions, expenses, start, today)
  const prev = periodStats(transactions, expenses, prevStart, prevEnd)

  const sold = new Map()
  const methods = {}
  const daily = {}
  for (let i = 13; i >= 0; i--) daily[addDays(today, -i)] = 0
  for (const t of transactions) {
    if (t.status !== 'Selesai' || t.date < start || t.date > today) continue
    methods[t.method] = (methods[t.method] || 0) + t.total
    if (t.date in daily) daily[t.date] += t.total
    for (const i of t.items) {
      const key = i.productId || `manual:${i.name}`
      const row = sold.get(key) || { name: i.name, productId: i.productId || '', qty: 0, revenue: 0, grossProfit: 0 }
      row.qty += i.qty
      row.revenue += i.qty * i.price
      row.grossProfit += i.qty * (i.price - (i.cost || 0))
      sold.set(key, row)
    }
  }
  const topProducts = [...sold.values()].sort((a, b) => b.qty - a.qty || b.revenue - a.revenue).slice(0, 8)
  const soldIds = new Set([...sold.values()].map((s) => s.productId))
  const byCat = {}
  for (const e of expenses) if (e.date >= start && e.date <= today) byCat[e.category] = (byCat[e.category] || 0) + e.amount

  const lowStock = products
    .filter((p) => p.stock <= p.min)
    .map((p) => {
      const s = topProducts.find((x) => x.productId === p.id) || sold.get(p.id)
      const perDay = s ? s.qty / 30 : 0
      return {
        name: p.name, stock: p.stock, min: p.min,
        soldLast30Days: s ? s.qty : 0,
        daysOfStockLeft: perDay > 0 ? Math.floor(p.stock / perDay) : null,
        suggestedRestock: Math.max(p.min * 2 - p.stock, 1),
      }
    })
    .sort((a, b) => a.stock - b.stock)

  return {
    business: businessName,
    asOf: today,
    period: { start, end: today, previousStart: prevStart, previousEnd: prevEnd },
    current: cur,
    previous: prev,
    revenueChangePct: prev.revenue > 0 ? ((cur.revenue - prev.revenue) / prev.revenue) * 100 : null,
    topProducts,
    lowStock,
    slowMoving: products.filter((p) => p.stock > 0 && !soldIds.has(p.id) && p.stock * p.cost >= 100000).map((p) => ({ name: p.name, stock: p.stock, capitalTied: p.stock * p.cost })).slice(0, 5),
    expensesByCategory: Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([category, amount]) => ({ category, amount })),
    paymentMethods: Object.entries(methods).map(([method, total]) => ({ method, total, demo: method.startsWith('QRIS') })),
    dailyRevenueLast14Days: Object.entries(daily).map(([date, revenue]) => ({ date, revenue })),
    inventory: {
      products: products.length,
      costValue: products.reduce((s, p) => s + p.stock * p.cost, 0),
      outOfStock: products.filter((p) => p.stock <= 0).length,
    },
    dataQuality: {
      completedTransactionsLast30Days: cur.transactions,
      limited: cur.transactions < 5,
      note: 'Pembayaran QRIS pada aplikasi ini adalah simulasi (DEMO). Data tersimpan di browser pengguna.',
    },
  }
}

/* ---------------------------------------------------------------------
   Fallback lokal berbasis aturan. Jujur: bukan AI.
   --------------------------------------------------------------------- */
const has = (q, words) => words.some((w) => q.includes(w))

function answerTop(c) {
  if (!c.topProducts.length) return 'Belum ada penjualan selesai dalam 30 hari terakhir, jadi produk terlaris belum bisa ditentukan.'
  const lines = c.topProducts.slice(0, 3).map((p, i) => `${i + 1}. ${p.name}: ${p.qty} unit, penjualan ${rp(p.revenue)}, laba kotor ${rp(p.grossProfit)}`)
  const best = c.topProducts[0]
  const low = c.lowStock.find((l) => l.name === best.name)
  return `Produk terlaris 30 hari terakhir:\n${lines.join('\n')}\n\n` +
    (low ? `Perhatian: stok ${best.name} tinggal ${low.stock} unit (minimum ${low.min}). Sebaiknya restock sekitar ${low.suggestedRestock} unit.` : `Pastikan stok ${best.name} tetap aman karena produk ini paling menggerakkan penjualan.`)
}

function answerStock(c) {
  if (!c.lowStock.length) return 'Semua produk masih di atas batas minimum stok. Belum ada yang mendesak untuk dibeli.'
  const lines = c.lowStock.slice(0, 5).map((l) => {
    const habis = l.stock <= 0 ? 'HABIS' : `sisa ${l.stock}`
    const cover = l.daysOfStockLeft !== null && l.stock > 0 ? `, perkiraan cukup ${l.daysOfStockLeft} hari` : ''
    return `- ${l.name}: ${habis} (minimum ${l.min})${cover}. Saran restock ± ${l.suggestedRestock} unit.`
  })
  const more = c.lowStock.length > 5 ? `\n(+${c.lowStock.length - 5} produk lain di bawah minimum)` : ''
  return `Produk yang perlu segera dibeli:\n${lines.join('\n')}${more}\n\nSaran restock dihitung sederhana: 2 × batas minimum − stok saat ini.`
}

function answerProfit(c) {
  const k = c.current
  if (k.revenue === 0) return 'Belum ada pendapatan selesai dalam 30 hari terakhir, jadi laba belum bisa dihitung.'
  const margin = (k.net / k.revenue) * 100
  return `Ringkasan 30 hari terakhir:\n- Pendapatan: ${rp(k.revenue)}\n- Harga pokok penjualan: ${rp(k.cogs)}\n- Laba kotor: ${rp(k.gross)}\n- Biaya operasional: ${rp(k.opex)}\n- Estimasi laba bersih: ${rp(k.net)} (margin ${margin.toFixed(1).replace('.', ',')}%)\n\n` +
    `Pembelian barang ${rp(k.purchases)} tidak mengurangi laba karena biaya barang sudah masuk lewat HPP; angka itu hanya memengaruhi arus kas (arus kas bersih ${rp(k.cashflow)}).` +
    (k.net < 0 ? '\n\nLaba bersih negatif: biaya operasional lebih besar dari laba kotor.' : '')
}

function answerExpense(c) {
  if (!c.expensesByCategory.length) return 'Belum ada pengeluaran tercatat dalam 30 hari terakhir.'
  const total = c.expensesByCategory.reduce((s, e) => s + e.amount, 0)
  const lines = c.expensesByCategory.slice(0, 4).map((e) => `- ${e.category}: ${rp(e.amount)} (${Math.round((e.amount / total) * 100)}%)`)
  return `Pengeluaran 30 hari terakhir (total ${rp(total)}):\n${lines.join('\n')}`
}

function answerTrend(c) {
  if (c.revenueChangePct === null) return `Pendapatan 30 hari terakhir ${rp(c.current.revenue)}. Periode sebelumnya belum punya data, sehingga tren naik/turun belum bisa dihitung.`
  const ch = c.revenueChangePct
  const arah = Math.abs(ch) < 2 ? 'relatif stabil' : ch > 0 ? 'naik' : 'turun'
  return `Pendapatan 30 hari terakhir ${rp(c.current.revenue)} dibanding ${rp(c.previous.revenue)} pada 30 hari sebelumnya: ${arah} ${Math.abs(ch).toFixed(1).replace('.', ',')}%.` +
    (c.dataQuality.limited ? '\n\nCatatan: data masih terbatas, jadi tren ini belum kuat.' : '')
}

function answerPayment(c) {
  if (!c.paymentMethods.length) return 'Belum ada transaksi selesai untuk dianalisis metode pembayarannya.'
  const total = c.paymentMethods.reduce((s, m) => s + m.total, 0)
  const lines = c.paymentMethods.sort((a, b) => b.total - a.total).map((m) => `- ${m.method}${m.demo ? ' [DEMO]' : ''}: ${rp(m.total)} (${Math.round((m.total / total) * 100)}%)`)
  return `Komposisi metode pembayaran 30 hari terakhir:\n${lines.join('\n')}\n\nQRIS pada versi ini adalah simulasi, bukan pembayaran sungguhan.`
}

function answerSummary(c) {
  const parts = []
  const out = c.lowStock.filter((l) => l.stock <= 0)
  if (out.length) parts.push(`Restock produk habis: ${out.slice(0, 3).map((l) => l.name).join(', ')}.`)
  const low = c.lowStock.filter((l) => l.stock > 0)
  if (low.length) parts.push(`Siapkan pembelian untuk produk mendekati minimum: ${low.slice(0, 3).map((l) => `${l.name} (sisa ${l.stock})`).join(', ')}.`)
  if (c.revenueChangePct !== null && c.revenueChangePct <= -10) parts.push(`Pendapatan turun ${Math.abs(c.revenueChangePct).toFixed(1).replace('.', ',')}%: tinjau produk terlaris dan pertimbangkan promo paket.`)
  if (c.current.revenue > 0 && c.current.net < 0) parts.push('Laba bersih negatif: tinjau harga jual dan tekan biaya operasional.')
  if (c.expensesByCategory[0]) parts.push(`Pos pengeluaran terbesar: ${c.expensesByCategory[0].category} (${rp(c.expensesByCategory[0].amount)}).`)
  if (c.slowMoving.length) parts.push(`Stok lambat bergerak: ${c.slowMoving.slice(0, 2).map((s) => s.name).join(', ')} (modal tertahan ${rp(c.slowMoving.reduce((s, x) => s + x.capitalTied, 0))}).`)
  if (!parts.length) return 'Tidak ada masalah mendesak dari data saat ini. Pertahankan pencatatan harian agar analisis tetap akurat.'
  return `Prioritas minggu ini:\n${parts.slice(0, 5).map((p, i) => `${i + 1}. ${p}`).join('\n')}`
}

const HELP = 'Saya bisa membantu menganalisis data toko Anda. Coba tanyakan:\n- produk terlaris\n- stok yang perlu dibeli\n- laba bersih\n- pengeluaran terbesar\n- tren penjualan naik/turun\n- metode pembayaran\n- saran prioritas minggu ini'

/** Jawaban lokal berbasis aturan. Mengembalikan teks; sumbernya selalu "rules". */
export function answerLocal(question, context) {
  const q = String(question || '').toLowerCase()
  let text
  if (has(q, ['terlaris', 'laris', 'paling banyak terjual', 'best seller', 'top produk'])) text = answerTop(context)
  else if (has(q, ['stok', 'restock', 'habis', 'persediaan', 'kulakan', 'beli barang'])) text = answerStock(context)
  else if (has(q, ['laba', 'untung', 'profit', 'margin', 'rugi'])) text = answerProfit(context)
  else if (has(q, ['pengeluaran', 'biaya', 'boros', 'hemat'])) text = answerExpense(context)
  else if (has(q, ['qris', 'pembayaran', 'metode', 'tunai', 'transfer'])) text = answerPayment(context)
  else if (has(q, ['penjualan', 'pendapatan', 'omzet', 'tren', 'turun', 'naik'])) text = answerTrend(context)
  else if (has(q, ['saran', 'rekomendasi', 'prioritas', 'ringkas', 'ringkasan', 'harus'])) text = answerSummary(context)
  else text = HELP
  return { text, source: 'rules' }
}

/**
 * Menanyakan asisten. Mencoba server AI dulu, lalu jatuh ke aturan lokal bila
 * server tidak tersedia / belum dikonfigurasi. Hasil selalu memuat `source`.
 */
export async function askAssistant({ question, context, history = [], fetchImpl = globalThis.fetch, endpoint = '/api/assistant', timeoutMs = 25000 } = {}) {
  const local = (reason) => ({ ...answerLocal(question, context), fallbackReason: reason })
  if (typeof fetchImpl !== 'function') return local('unavailable')
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null
  try {
    const res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question, context, history: history.slice(-6) }),
      signal: controller ? controller.signal : undefined,
    })
    if (!res.ok) {
      let code = ''
      try { code = (await res.json()).error || '' } catch { /* abaikan */ }
      if (res.status === 503 && code === 'not_configured') return local('not_configured')
      if (res.status === 429) return local('rate_limited')
      return local('unavailable')
    }
    const data = await res.json()
    if (!data || typeof data.text !== 'string' || !data.text.trim()) return local('unavailable')
    // Server bisa menjawab sendiri dengan aturan lokal (source: "rules"). Label dari server dihormati.
    if (data.source === 'rules') {
      const known = ['not_configured', 'rate_limited']
      return { text: data.text, source: 'rules', fallbackReason: known.includes(data.fallbackReason) ? data.fallbackReason : 'unavailable' }
    }
    return { text: data.text, source: 'llm', model: data.model || null }
  } catch {
    return local('unavailable')
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Status asisten dari server, untuk badge di UI sebelum pertanyaan pertama.
 * mode: "llm" (AI aktif) | "rules" (API key belum diatur, memakai aturan lokal) | "unavailable" (server tidak terjangkau).
 */
export async function getAssistantStatus({ fetchImpl = globalThis.fetch, endpoint = '/api/assistant', timeoutMs = 5000 } = {}) {
  const down = { mode: 'unavailable', configured: false, model: null }
  if (typeof fetchImpl !== 'function') return down
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null
  try {
    const res = await fetchImpl(`${endpoint}/status`, { method: 'GET', signal: controller ? controller.signal : undefined })
    if (!res.ok) return down
    const data = await res.json()
    if (!data || !['llm', 'rules', 'unavailable'].includes(data.mode)) return down
    return { mode: data.mode, configured: Boolean(data.configured), model: data.model || null }
  } catch {
    return down
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export const FALLBACK_NOTICE = {
  not_configured: 'Asisten AI belum dihubungkan (ANTHROPIC_API_KEY belum diatur di server). Jawaban ini dibuat oleh analisis berbasis aturan, bukan AI.',
  rate_limited: 'Terlalu banyak permintaan ke asisten AI. Jawaban ini dibuat oleh analisis berbasis aturan, bukan AI.',
  unavailable: 'Server asisten AI tidak dapat dihubungi. Jawaban ini dibuat oleh analisis berbasis aturan, bukan AI.',
}
