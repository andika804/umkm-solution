import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import './App.css'
import { DbBadge, useDbStatus, describeStorage, useRemoteSync, getBrowserId, db as cloudDb } from './lib/cloud.jsx'
import { workspaceIdFor } from './lib/db.js'

/* =====================================================================
   KONSTANTA & IDENTITAS
   ===================================================================== */
const APP_NAME = 'UMKM Solution'
const APP_TAGLINE = 'QRIS-Integrated Business & Financial Analytics'
const APP_DESC =
  'UMKM Solution: dashboard keuangan, transaksi, inventaris, analitik, dan simulasi QRIS (DEMO) untuk toko retail dan elektronik.'

const KEYS = {
  users: 'umkmsolution.users.v1',
  session: 'umkmsolution.session.v1',
  products: 'umkmsolution.products.v1',
  transactions: 'umkmsolution.transactions.v1',
  expenses: 'umkmsolution.expenses.v1',
  activity: 'umkmsolution.activity.v1',
}

const DEMO_USER = {
  id: 'usr-demo',
  name: 'Pemilik Toko Demo',
  business: 'Toko Elektronik Maju Jaya',
  email: 'demo@umkmsolution.id',
  password: 'demo1234',
}

const PURCHASE_CATEGORY = 'Pembelian barang'
const EXPENSE_CATEGORIES = ['Operasional', PURCHASE_CATEGORY, 'Transportasi', 'Listrik dan internet', 'Gaji', 'Lainnya']
const DEFAULT_PRODUCT_CATEGORIES = ['Makanan & minuman', 'Sembako', 'Elektronik', 'Fashion & pakaian', 'kecantikan & perawatan', 'Perlengkapan rumah tangga ', 'Kesehatan','lainnya']
const PAYMENT_METHODS = ['Tunai', 'Transfer', 'QRIS (simulasi)']
const TX_STATUSES = ['Selesai', 'Pending']
const PERIODS = [
  { id: '7d', label: '7 hari' },
  { id: '30d', label: '30 hari' },
  { id: 'month', label: 'Bulan ini' },
]
const PERIOD_TEXT = { '7d': '7 hari terakhir', '30d': '30 hari terakhir', month: 'bulan ini' }
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'transaksi', label: 'Transaksi', icon: 'receipt' },
  { id: 'produk', label: 'Produk & Stok', icon: 'box' },
  { id: 'pengeluaran', label: 'Pengeluaran', icon: 'wallet' },
  { id: 'analitik', label: 'Analitik', icon: 'chart' },
  { id: 'advisor', label: 'Business Advisor', icon: 'spark' },
  { id: 'pengaturan', label: 'Pengaturan', icon: 'settings' },
]
const PAGE_TITLES = {
  dashboard: 'Dashboard',
  transaksi: 'Manajemen Transaksi',
  produk: 'Produk & Inventaris',
  pengeluaran: 'Pengeluaran',
  analitik: 'Analitik',
  advisor: 'Business Advisor',
  pengaturan: 'Pengaturan',
}

/* =====================================================================
   IKON SVG SEDERHANA
   ===================================================================== */
const ICONS = {
  dashboard: 'M3 3h8v8H3z M13 3h8v5h-8z M13 10h8v11h-8z M3 13h8v8H3z',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6',
  box: 'M21 8l-9-5-9 5v8l9 5 9-5z M3 8l9 5 9-5 M12 13v8',
  wallet: 'M3 7h15a3 3 0 013 3v8a3 3 0 01-3 3H6a3 3 0 01-3-3z M3 7V6a2 2 0 012-2h11 M16 14h2',
  chart: 'M4 20V10 M10 20V4 M16 20v-7 M22 20H2',
  spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  settings: 'M4 6h10 M18 6h2 M4 12h4 M12 12h8 M4 18h12 M20 18h0 M14 4v4 M8 10v4 M16 16v4',
  bell: 'M6 9a6 6 0 1112 0c0 6 2 7 2 8H4c0-1 2-2 2-8z M10 21h4',
  search: 'M11 4a7 7 0 100 14 7 7 0 000-14z M21 21l-5-5',
  plus: 'M12 5v14 M5 12h14',
  edit: 'M4 20h4L19 9l-4-4L4 16z M13 7l4 4',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v6 M14 11v6',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 9a3 3 0 100 6 3 3 0 000-6z',
  eyeOff: 'M3 3l18 18 M10.6 6.1A9.8 9.8 0 0112 6c6 0 10 6 10 6a17 17 0 01-3.2 3.9 M6.5 6.8A17 17 0 002 12s4 7 10 7a9.6 9.6 0 004.2-1',
  close: 'M6 6l12 12 M18 6L6 18',
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  check: 'M5 12l5 5 9-10',
  alert: 'M12 3l10 18H2z M12 10v5 M12 18h0',
  arrow: 'M5 12h14 M13 6l6 6-6 6',
  qr: 'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h2v2h-2z M18 14h2 M14 18h2v2 M18 18h2v2',
  logout: 'M9 4H5a1 1 0 00-1 1v14a1 1 0 001 1h4 M16 8l4 4-4 4 M20 12H9',
  home: 'M3 11l9-8 9 8 M5 10v10h14V10',
  info: 'M12 3a9 9 0 100 18 9 9 0 000-18z M12 11v5 M12 8h0',
  trendUp: 'M3 17l6-6 4 4 8-8 M15 7h6v6',
  trendDown: 'M3 7l6 6 4-4 8 8 M15 17h6v-6',
  store: 'M4 9l1-5h14l1 5 M4 9a3 3 0 006 0 3 3 0 006 0 3 3 0 004 0 M5 12v8h14v-8 M10 20v-5h4v5',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M9 12l2 2 4-4',
  clock: 'M12 3a9 9 0 100 18 9 9 0 000-18z M12 7v5l3 2',
  reset: 'M4 12a8 8 0 108-8 M4 4v5h5',
}

function Icon({ name, size = 20 }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICONS[name]} />
    </svg>
  )
}

function Logo({ inverse }) {
  return (
    <span className={`logo${inverse ? ' logo-inverse' : ''}`}>
      <svg className="logo-mark" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="9" className="logo-bg" />
        <path d="M9 8v9.5a7 7 0 0014 0V8" className="logo-u" />
        <circle cx="23" cy="8" r="2.4" className="logo-dot" />
      </svg>
      <span className="logo-text">
        <strong>UMKM</strong> Solution
      </span>
    </span>
  )
}

/* =====================================================================
   UTILITAS: FORMAT, TANGGAL, ID
   ===================================================================== */
const nf = new Intl.NumberFormat('id-ID')
const rupiah = (n) => {
  const v = Math.round(Number(n) || 0)
  return (v < 0 ? '-' : '') + 'Rp' + nf.format(Math.abs(v))
}
const dec = (n, d = 1) => Number(n).toFixed(d).replace('.', ',')
const compactRupiah = (n) => {
  const v = Math.abs(n)
  const s = n < 0 ? '-' : ''
  if (v >= 1e9) return `${s}Rp${dec(v / 1e9)} M`
  if (v >= 1e6) return `${s}Rp${dec(v / 1e6)} jt`
  if (v >= 1e3) return `${s}Rp${Math.round(v / 1e3)} rb`
  return `${s}Rp${Math.round(v)}`
}
const pad = (n) => String(n).padStart(2, '0')
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const todayStr = () => toDateStr(new Date())
const nowTime = () => {
  const d = new Date()
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const parseDate = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const addDays = (s, n) => {
  const d = parseDate(s)
  d.setDate(d.getDate() + n)
  return toDateStr(d)
}
const diffDays = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000)
const formatDate = (s) => {
  if (!s) return '-'
  const d = parseDate(s)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}
const shortDate = (s) => {
  const d = parseDate(s)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}
const formatStamp = (ts) => {
  const d = new Date(ts)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const firstName = (n) => (n || '').trim().split(/\s+/)[0] || 'Pengguna'
const uid = (p) => p + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3)
const nextSeq = (list, prefix, width) => {
  let max = 0
  for (const item of list) {
    if (typeof item.id === 'string' && item.id.startsWith(prefix)) {
      const n = parseInt(item.id.slice(prefix.length), 10)
      if (Number.isFinite(n) && n > max) max = n
    }
  }
  return prefix + String(max + 1).padStart(width, '0')
}
const toNum = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v))
const sortTxDesc = (a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)
const txSummary = (t) => {
  if (!t.items.length) return '-'
  const first = t.items[0]
  return `${first.name} ×${first.qty}` + (t.items.length > 1 ? ` +${t.items.length - 1} item` : '')
}
const stockStatus = (p) => (p.stock <= 0 ? 'Habis' : p.stock <= p.min ? 'Rendah' : 'Aman')
const pctChange = (cur, prev) => (prev > 0 ? ((cur - prev) / prev) * 100 : null)
const inRange = (d, a, b) => d >= a && d <= b

/* =====================================================================
   PENYIMPANAN LOCALSTORAGE (AMAN TERHADAP JSON RUSAK)
   ===================================================================== */
const pendingIssues = []
let issueListener = null
function reportIssue(message) {
  if (issueListener) issueListener(message)
  else if (!pendingIssues.includes(message)) pendingIssues.push(message)
}
function readStorage(key, factory, validate) {
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null) return factory()
    const parsed = JSON.parse(raw)
    if (validate && !validate(parsed)) throw new Error('invalid')
    return parsed
  } catch {
    reportIssue('Sebagian data tersimpan rusak. Data demo dimuat ulang untuk bagian tersebut.')
    return factory()
  }
}
function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    reportIssue('Gagal menyimpan data ke penyimpanan browser. Perubahan mungkin hilang saat halaman dimuat ulang.')
  }
}
function usePersistentState(key, factory, validate) {
  const [value, setValue] = useState(() => readStorage(key, factory, validate))
  useEffect(() => {
    writeStorage(key, value)
  }, [key, value])
  return [value, setValue]
}

const validUsers = (v) => Array.isArray(v) && v.every((u) => u && typeof u.id === 'string' && typeof u.email === 'string' && typeof u.password === 'string')
const validSession = (v) => v === null || (v && typeof v.userId === 'string')
const validProducts = (v) =>
  Array.isArray(v) &&
  v.every((p) => p && typeof p.id === 'string' && typeof p.name === 'string' && [p.price, p.cost, p.stock, p.min].every(Number.isFinite))
const validTransactions = (v) =>
  Array.isArray(v) &&
  v.every((t) => t && typeof t.id === 'string' && typeof t.date === 'string' && Array.isArray(t.items) && Number.isFinite(t.total) && Number.isFinite(t.cogs))
const validExpenses = (v) => Array.isArray(v) && v.every((e) => e && typeof e.id === 'string' && typeof e.date === 'string' && Number.isFinite(e.amount))
const validActivity = (v) => Array.isArray(v) && v.every((a) => a && typeof a.text === 'string')

/* =====================================================================
   DATA DEMO (RELATIF TERHADAP HARI INI AGAR GRAFIK SELALU TERISI)
   ===================================================================== */
function createSeedProducts() {
  return [
    { id: 'prd-001', sku: 'KBL-001', name: 'Kabel USB-C 1m', category: 'Kabel & Charger', cost: 12000, price: 25000, stock: 48, min: 15 },
    { id: 'prd-002', sku: 'CHG-001', name: 'Charger 20W Fast Charging', category: 'Kabel & Charger', cost: 45000, price: 85000, stock: 22, min: 10 },
    { id: 'prd-003', sku: 'MOU-001', name: 'Mouse Wireless 2.4G', category: 'Periferal', cost: 55000, price: 99000, stock: 14, min: 8 },
    { id: 'prd-004', sku: 'KEY-001', name: 'Keyboard Mekanik Mini', category: 'Periferal', cost: 185000, price: 289000, stock: 5, min: 5 },
    { id: 'prd-005', sku: 'AUD-001', name: 'Earphone Kabel 3.5mm', category: 'Audio', cost: 18000, price: 39000, stock: 35, min: 12 },
    { id: 'prd-006', sku: 'AUD-002', name: 'Speaker Bluetooth Mini', category: 'Audio', cost: 90000, price: 159000, stock: 9, min: 6 },
    { id: 'prd-007', sku: 'PWR-001', name: 'Power Bank 10000mAh', category: 'Daya', cost: 120000, price: 185000, stock: 3, min: 6 },
    { id: 'prd-008', sku: 'STR-001', name: 'Flashdisk 32GB', category: 'Penyimpanan', cost: 38000, price: 65000, stock: 27, min: 10 },
    { id: 'prd-009', sku: 'STR-002', name: 'Memory Card 64GB', category: 'Penyimpanan', cost: 52000, price: 89000, stock: 18, min: 8 },
    { id: 'prd-010', sku: 'ACC-001', name: 'Tempered Glass Universal', category: 'Aksesori', cost: 6000, price: 20000, stock: 60, min: 20 },
    { id: 'prd-011', sku: 'ACC-002', name: 'Lampu LED USB', category: 'Aksesori', cost: 15000, price: 35000, stock: 0, min: 10 },
    { id: 'prd-012', sku: 'PRF-003', name: 'Webcam HD 720p', category: 'Periferal', cost: 140000, price: 229000, stock: 11, min: 4 },
  ]
}

function mulberry32(seed) {
  let a = seed
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function createSeedTransactions(products) {
  const rnd = mulberry32(2026)
  const customers = ['Pelanggan Umum', 'Budi Santoso', 'Siti Rahma', 'Andi Pratama', 'Dewi Lestari', 'Rizky Maulana', 'Nanda Putri', 'Agus Salim', 'Fitri Handayani', 'Toko Cahaya (reseller)']
  const today = todayStr()
  const list = []
  let seq = 1
  for (let off = 59; off >= 0; off--) {
    const date = addDays(today, -off)
    const dow = parseDate(date).getDay()
    const count = Math.floor(rnd() * 3) + (dow === 0 || dow === 6 ? 1 : 0)
    for (let i = 0; i < count; i++) {
      const lines = 1 + Math.floor(rnd() * 3)
      const used = new Set()
      const items = []
      for (let l = 0; l < lines; l++) {
        const p = products[Math.floor(rnd() * products.length)]
        if (used.has(p.id)) continue
        used.add(p.id)
        const qty = 1 + Math.floor(rnd() * (p.price < 50000 ? 4 : 2))
        items.push({ productId: p.id, name: p.name, category: p.category, qty, price: p.price, cost: p.cost })
      }
      const subtotal = items.reduce((s, it) => s + it.qty * it.price, 0)
      const cogs = items.reduce((s, it) => s + it.qty * it.cost, 0)
      const discount = rnd() < 0.12 ? Math.round((subtotal * 0.05) / 500) * 500 : 0
      const r = rnd()
      const method = r < 0.4 ? 'Tunai' : r < 0.65 ? 'Transfer' : 'QRIS (simulasi)'
      const pending = method.startsWith('QRIS') && off <= 1 && rnd() < 0.6
      list.push({
        id: 'TRX-' + String(seq++).padStart(4, '0'),
        date,
        time: `${pad(9 + Math.floor(rnd() * 11))}:${pad(Math.floor(rnd() * 60))}`,
        customer: customers[Math.floor(rnd() * customers.length)],
        items,
        subtotal,
        discount,
        total: subtotal - discount,
        cogs,
        category: items[0].category,
        method,
        status: pending ? 'Pending' : 'Selesai',
        note: '',
      })
    }
  }
  return list
}

function createSeedExpenses() {
  const today = todayStr()
  const rows = [
    [58, 'Sewa kios bulanan', 'Operasional', 1500000],
    [55, 'Restock kabel & charger', PURCHASE_CATEGORY, 2400000],
    [50, 'Tagihan listrik & internet', 'Listrik dan internet', 420000],
    [45, 'Gaji karyawan', 'Gaji', 1800000],
    [42, 'Ongkir pengiriman supplier', 'Transportasi', 85000],
    [38, 'Restock periferal', PURCHASE_CATEGORY, 3100000],
    [28, 'Sewa kios bulanan', 'Operasional', 1500000],
    [24, 'Perlengkapan kemasan', 'Operasional', 210000],
    [20, 'Tagihan listrik & internet', 'Listrik dan internet', 435000],
    [17, 'Restock audio & aksesori', PURCHASE_CATEGORY, 2650000],
    [15, 'Gaji karyawan', 'Gaji', 1800000],
    [12, 'Transportasi antar pesanan', 'Transportasi', 120000],
    [5, 'Iklan marketplace', 'Lainnya', 250000],
  ]
  return rows.map(([off, name, category, amount], i) => ({
    id: 'EXP-' + String(i + 1).padStart(4, '0'),
    date: addDays(today, -off),
    name,
    category,
    amount,
    note: '',
  }))
}

/* =====================================================================
   PERHITUNGAN KEUANGAN & ANALITIK
   Definisi:
   - Pendapatan = total transaksi berstatus Selesai (setelah diskon)
   - HPP        = harga modal barang yang terjual
   - Laba kotor = Pendapatan - HPP
   - Biaya operasional = pengeluaran selain "Pembelian barang"
   - Estimasi laba bersih = Laba kotor - Biaya operasional
   - Arus kas = Pendapatan - seluruh pengeluaran (termasuk pembelian barang)
   ===================================================================== */
function getRanges(period) {
  const end = todayStr()
  let start
  if (period === '7d') start = addDays(end, -6)
  else if (period === '30d') start = addDays(end, -29)
  else {
    const d = new Date()
    start = toDateStr(new Date(d.getFullYear(), d.getMonth(), 1))
  }
  const days = diffDays(start, end) + 1
  const prevEnd = addDays(start, -1)
  const prevStart = addDays(prevEnd, -(days - 1))
  return { start, end, days, prevStart, prevEnd }
}

function computeStats(transactions, expenses, start, end) {
  let revenue = 0, cogs = 0, count = 0, pending = 0, units = 0
  for (const t of transactions) {
    if (!inRange(t.date, start, end)) continue
    if (t.status === 'Selesai') {
      revenue += t.total
      cogs += t.cogs
      count++
      units += t.items.reduce((s, i) => s + i.qty, 0)
    } else pending++
  }
  let opex = 0, purchases = 0
  for (const e of expenses) {
    if (!inRange(e.date, start, end)) continue
    if (e.category === PURCHASE_CATEGORY) purchases += e.amount
    else opex += e.amount
  }
  const gross = revenue - cogs
  const net = gross - opex
  return {
    revenue, cogs, count, pending, units, gross, opex, purchases,
    expense: opex + purchases,
    net,
    cashflow: revenue - opex - purchases,
    grossMargin: revenue > 0 ? gross / revenue : 0,
    netMargin: revenue > 0 ? net / revenue : 0,
  }
}

function buildSeries(transactions, expenses, start, end) {
  const map = {}
  for (let d = start; d <= end; d = addDays(d, 1)) {
    map[d] = { date: d, revenue: 0, cogs: 0, expense: 0, opex: 0 }
  }
  for (const t of transactions) {
    if (t.status === 'Selesai' && map[t.date]) {
      map[t.date].revenue += t.total
      map[t.date].cogs += t.cogs
    }
  }
  for (const e of expenses) {
    if (map[e.date]) {
      map[e.date].expense += e.amount
      if (e.category !== PURCHASE_CATEGORY) map[e.date].opex += e.amount
    }
  }
  return Object.values(map)
}

function weeklyBuckets(series) {
  const buckets = []
  let cur = null
  for (const d of series) {
    const dow = parseDate(d.date).getDay()
    if (!cur || dow === 1) {
      cur = { start: d.date, end: d.date, revenue: 0, cogs: 0, expense: 0, opex: 0 }
      buckets.push(cur)
    }
    cur.end = d.date
    cur.revenue += d.revenue
    cur.cogs += d.cogs
    cur.expense += d.expense
    cur.opex += d.opex
  }
  return buckets
}

function aggregateItems(transactions, start, end) {
  const map = new Map()
  for (const t of transactions) {
    if (t.status !== 'Selesai' || !inRange(t.date, start, end)) continue
    for (const i of t.items) {
      const key = i.productId || `manual:${i.name}`
      const row = map.get(key) || { key, productId: i.productId, name: i.name, category: i.category || 'Lainnya', qty: 0, revenue: 0, profit: 0 }
      row.qty += i.qty
      row.revenue += i.qty * i.price
      row.profit += i.qty * (i.price - i.cost)
      map.set(key, row)
    }
  }
  return [...map.values()].sort((a, b) => b.qty - a.qty || b.revenue - a.revenue)
}

function groupTotals(list, keyFn, valFn) {
  const m = {}
  for (const x of list) {
    const k = keyFn(x)
    if (!m[k]) m[k] = { label: k, value: 0, count: 0 }
    m[k].value += valFn(x)
    m[k].count += 1
  }
  return Object.values(m).sort((a, b) => b.value - a.value)
}

function buildInsights({ products, transactions, expenses, period }) {
  const r = getRanges(period)
  const cur = computeStats(transactions, expenses, r.start, r.end)
  const prev = computeStats(transactions, expenses, r.prevStart, r.prevEnd)
  const sold = aggregateItems(transactions, r.start, r.end)
  const soldMap = new Map(sold.map((s) => [s.productId, s]))
  const text = PERIOD_TEXT[period]
  const out = []
  const add = (level, title, body, action) => out.push({ id: `i${out.length}`, level, title, text: body, action })
  const list = (arr) => arr.slice(0, 3).join(', ') + (arr.length > 3 ? `, dan ${arr.length - 3} lainnya` : '')

  if (cur.count < 5) {
    add('info', 'Data masih terbatas', `Baru ada ${cur.count} transaksi selesai pada ${text}. Rekomendasi akan lebih akurat setelah data transaksi bertambah.`, { label: 'Catat transaksi', modal: 'tx' })
  }

  const habis = products.filter((p) => p.stock <= 0)
  if (habis.length) {
    const sellers = habis.filter((p) => (soldMap.get(p.id)?.qty || 0) > 0)
    add(
      'danger',
      `${habis.length} produk kehabisan stok`,
      `${list(habis.map((p) => p.name))} sudah habis.` +
        (sellers.length ? ` ${list(sellers.map((p) => p.name))} terjual pada ${text}, sehingga penjualan berpotensi tertahan sampai restock.` : ''),
      { label: 'Buka inventaris', page: 'produk' }
    )
  }

  const rendah = products.filter((p) => p.stock > 0 && p.stock <= p.min)
  if (rendah.length) {
    const detail = rendah
      .slice(0, 3)
      .map((p) => `${p.name} (sisa ${p.stock}, minimum ${p.min}, restock ± ${Math.max(p.min * 2 - p.stock, 1)} unit)`)
      .join('; ')
    add('warning', `${rendah.length} produk mendekati batas minimum`, `${detail}${rendah.length > 3 ? `; dan ${rendah.length - 3} produk lain` : ''}.`, { label: 'Buka inventaris', page: 'produk' })
  }

  if (sold.length) {
    const t = sold[0]
    const totalItemRev = sold.reduce((s, x) => s + x.revenue, 0)
    const share = totalItemRev > 0 ? Math.round((t.revenue / totalItemRev) * 100) : 0
    const prod = products.find((p) => p.id === t.productId)
    const rate = t.qty / r.days
    const cover = prod && prod.stock > 0 && rate > 0 ? Math.floor(prod.stock / rate) : null
    if (cover !== null && cover < 14) {
      add('warning', `Stok produk terlaris menipis: ${t.name}`, `Terjual ${t.qty} unit pada ${text} (± ${dec(rate)} unit/hari). Stok ${prod.stock} unit diperkirakan cukup sekitar ${cover} hari.`, { label: 'Atur stok', page: 'produk', q: t.name })
    } else {
      add('success', `Produk terlaris: ${t.name}`, `Terjual ${t.qty} unit pada ${text}, menyumbang ${share}% dari nilai penjualan barang.${cover !== null ? ` Stok saat ini cukup sekitar ${cover} hari.` : ''}`, { label: 'Lihat analitik', page: 'analitik' })
    }
  }

  const ch = pctChange(cur.revenue, prev.revenue)
  if (cur.count >= 3 && ch !== null) {
    if (ch <= -10) add('warning', 'Pendapatan turun dibanding periode sebelumnya', `Pendapatan ${text} sebesar ${rupiah(cur.revenue)}, turun ${dec(Math.abs(ch))}% dari ${rupiah(prev.revenue)}. Tinjau produk terlaris dan pertimbangkan promo paket untuk produk bermargin baik.`, { label: 'Lihat analitik', page: 'analitik' })
    else if (ch >= 10) add('success', 'Pendapatan naik dibanding periode sebelumnya', `Pendapatan ${text} sebesar ${rupiah(cur.revenue)}, naik ${dec(ch)}% dari ${rupiah(prev.revenue)}. Pastikan stok produk laris tetap aman.`, { label: 'Lihat analitik', page: 'analitik' })
    else add('info', 'Pendapatan relatif stabil', `Pendapatan ${text} ${rupiah(cur.revenue)} (${ch >= 0 ? '+' : '-'}${dec(Math.abs(ch))}% dari periode sebelumnya).`, { label: 'Lihat analitik', page: 'analitik' })
  } else if (cur.count >= 3) {
    add('info', 'Belum ada pembanding periode', 'Periode sebelumnya belum memiliki transaksi selesai, sehingga perubahan tren belum bisa dihitung.')
  }

  const byCat = {}
  for (const e of expenses) if (inRange(e.date, r.start, r.end)) byCat[e.category] = (byCat[e.category] || 0) + e.amount
  const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1])
  if (entries.length) {
    const [cat, amt] = entries[0]
    const share = Math.round((amt / cur.expense) * 100)
    add(
      share >= 50 && cat !== PURCHASE_CATEGORY ? 'warning' : 'info',
      `Pengeluaran terbesar: ${cat}`,
      `${cat} mencapai ${rupiah(amt)} (${share}% dari total pengeluaran ${text}). ` +
        (cat === PURCHASE_CATEGORY
          ? 'Ini arus kas keluar untuk stok, bukan biaya operasional; biaya barang dihitung lewat HPP saat terjual.'
          : 'Periksa apakah ada komponen yang bisa dihemat.'),
      { label: 'Lihat pengeluaran', page: 'pengeluaran' }
    )
  }

  if (cur.revenue > 0 && cur.opex / cur.revenue > 0.4) {
    add('warning', 'Biaya operasional tinggi', `Biaya operasional ${rupiah(cur.opex)} setara ${Math.round((cur.opex / cur.revenue) * 100)}% dari pendapatan ${text}. Idealnya jauh di bawah laba kotor agar usaha tetap sehat.`, { label: 'Lihat pengeluaran', page: 'pengeluaran' })
  }

  if (cur.revenue > 0) {
    if (cur.net < 0) {
      add('danger', 'Estimasi laba bersih negatif', `Laba kotor ${rupiah(cur.gross)} belum menutup biaya operasional ${rupiah(cur.opex)} (selisih ${rupiah(cur.net)}). Tinjau harga jual produk dan pos biaya.`, { label: 'Lihat analitik', page: 'analitik' })
    } else if (cur.netMargin < 0.1) {
      add('warning', 'Margin laba bersih tipis', `Margin laba bersih ${dec(cur.netMargin * 100)}% (laba ${rupiah(cur.net)}). Pertimbangkan penyesuaian harga atau efisiensi biaya.`, { label: 'Lihat analitik', page: 'analitik' })
    } else if (cur.netMargin >= 0.2) {
      add('success', 'Margin laba bersih sehat', `Margin laba bersih ${dec(cur.netMargin * 100)}% dengan estimasi laba ${rupiah(cur.net)} pada ${text}.`, { label: 'Lihat analitik', page: 'analitik' })
    } else {
      add('info', 'Margin laba bersih cukup', `Margin laba bersih ${dec(cur.netMargin * 100)}% dengan estimasi laba ${rupiah(cur.net)} pada ${text}.`, { label: 'Lihat analitik', page: 'analitik' })
    }
  }

  const thin = products.filter((p) => p.price > 0 && (p.price - p.cost) / p.price < 0.15)
  if (thin.length) {
    add('warning', 'Produk dengan margin rendah', `${list(thin.map((p) => `${p.name} (${Math.round(((p.price - p.cost) / p.price) * 100)}%)`))} memiliki margin di bawah 15%. Pertimbangkan menaikkan harga atau mencari pemasok lain.`, { label: 'Edit produk', page: 'produk', q: thin[0].name })
  }

  if (cur.count >= 3) {
    const dead = products.filter((p) => p.stock > 0 && !soldMap.has(p.id) && p.stock * p.cost >= 100000).sort((a, b) => b.stock * b.cost - a.stock * a.cost)
    if (dead.length) {
      const capital = dead.reduce((s, p) => s + p.stock * p.cost, 0)
      add('info', 'Stok lambat bergerak', `${list(dead.map((p) => p.name))} belum terjual pada ${text}, dengan modal tertahan ${rupiah(capital)}. Pertimbangkan diskon atau paket bundling.`, { label: 'Lihat inventaris', page: 'produk' })
    }
  }

  const doneTx = transactions.filter((t) => t.status === 'Selesai' && inRange(t.date, r.start, r.end))
  if (doneTx.length >= 5) {
    const qr = doneTx.filter((t) => t.method.startsWith('QRIS'))
    const share = Math.round((qr.length / doneTx.length) * 100)
    add('info', 'Komposisi metode pembayaran', `${share}% transaksi (${qr.length} dari ${doneTx.length}) dicatat dengan QRIS (simulasi DEMO), senilai ${rupiah(qr.reduce((s, t) => s + t.total, 0))}. Angka ini hanya pencatatan demo, bukan pembayaran nyata.`, { label: 'Lihat transaksi', page: 'transaksi' })
  }

  if (doneTx.length >= 10) {
    const byDay = groupTotals(doneTx, (t) => DAY_NAMES[parseDate(t.date).getDay()], (t) => t.total)
    const best = byDay[0]
    add('info', `Hari terbaik: ${best.label}`, `${best.label} menghasilkan ${rupiah(best.value)} dari ${best.count} transaksi pada ${text}. Pertimbangkan promo di hari yang lebih sepi.`, { label: 'Lihat analitik', page: 'analitik' })
  }

  if (cur.pending > 0) {
    add('info', `${cur.pending} transaksi masih Pending`, 'Transaksi Pending belum dihitung sebagai pendapatan. Ubah statusnya menjadi Selesai setelah pembayaran dikonfirmasi.', { label: 'Lihat transaksi', page: 'transaksi', q: '' })
  }

  const order = { danger: 0, warning: 1, success: 2, info: 3 }
  out.sort((a, b) => order[a.level] - order[b.level])
  return { insights: out, cur, prev, limited: cur.count < 5 }
}

/* =====================================================================
   HOOK & KOMPONEN UMUM
   ===================================================================== */
function useClickOutside(ref, handler, active) {
  useEffect(() => {
    if (!active) return undefined
    const fn = (e) => {
      if (ref.current && !ref.current.contains(e.target)) handler()
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [ref, handler, active])
}

function useSeed(seed, page, apply) {
  useEffect(() => {
    if (seed && seed.page === page) apply(seed.q || '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed])
}

function Modal({ title, subtitle, onClose, children, footer, size = 'md' }) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') closeRef.current()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [])
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`modal modal-${size}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Tutup">
            <Icon name="close" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

function ConfirmDialog({ dialog, onCancel }) {
  if (!dialog) return null
  return (
    <Modal
      title={dialog.title}
      onClose={onCancel}
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>Batal</button>
          <button
            type="button"
            className={`btn ${dialog.danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => { dialog.onConfirm(); onCancel() }}
          >
            {dialog.confirmLabel || 'Ya, lanjutkan'}
          </button>
        </>
      }
    >
      <p className="confirm-text">{dialog.message}</p>
    </Modal>
  )
}

function Toasts({ toasts, dismiss }) {
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <Icon name={t.type === 'error' || t.type === 'warning' ? 'alert' : t.type === 'info' ? 'info' : 'check'} size={18} />
          <span>{t.message}</span>
          <button type="button" onClick={() => dismiss(t.id)} aria-label="Tutup notifikasi">
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}

function Field({ label, error, hint, className = '', children }) {
  return (
    <label className={`field ${error ? 'field-invalid' : ''} ${className}`}>
      <span>{label}</span>
      {children}
      {hint && !error && <small className="hint">{hint}</small>}
      {error && <small className="field-error">{error}</small>}
    </label>
  )
}

function EmptyState({ icon = 'box', title, text, action }) {
  return (
    <div className="empty">
      <span className="empty-icon"><Icon name={icon} size={26} /></span>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  )
}

function PeriodTabs({ value, onChange }) {
  return (
    <div className="seg" role="tablist" aria-label="Pilih periode">
      {PERIODS.map((p) => (
        <button key={p.id} type="button" role="tab" aria-selected={value === p.id} className={value === p.id ? 'active' : ''} onClick={() => onChange(p.id)}>
          {p.label}
        </button>
      ))}
    </div>
  )
}

function Delta({ cur, prev, invert }) {
  const ch = pctChange(cur, prev)
  if (ch === null) return <span className="delta delta-neutral">Belum ada pembanding</span>
  const up = ch >= 0
  const flat = Math.abs(ch) < 0.5
  const good = invert ? !up : up
  return (
    <span className={`delta ${flat ? 'delta-neutral' : good ? 'delta-good' : 'delta-bad'}`}>
      <Icon name={up ? 'trendUp' : 'trendDown'} size={14} />
      {up ? '+' : '-'}{dec(Math.abs(ch))}% vs periode lalu
    </span>
  )
}

function KpiCard({ label, value, icon, tone = 'default', delta, note }) {
  return (
    <article className={`kpi kpi-${tone}`}>
      <div className="kpi-top">
        <span className="kpi-label">{label}</span>
        <span className="kpi-icon"><Icon name={icon} size={18} /></span>
      </div>
      <strong className="kpi-value">{value}</strong>
      <div className="kpi-foot">
        {delta}
        {note && <span className="kpi-note">{note}</span>}
      </div>
    </article>
  )
}

function MethodBadge({ method }) {
  const demo = method.startsWith('QRIS')
  return (
    <span className={`method${demo ? ' method-qris' : ''}`}>
      {method}
      {demo && <b className="demo-tag">DEMO</b>}
    </span>
  )
}
function StatusBadge({ status }) {
  return <span className={`pill ${status === 'Selesai' ? 'pill-ok' : 'pill-warn'}`}>{status}</span>
}
function StockBadge({ product }) {
  const s = stockStatus(product)
  return <span className={`pill ${s === 'Aman' ? 'pill-ok' : s === 'Rendah' ? 'pill-warn' : 'pill-bad'}`}>{s}</span>
}

function Pager({ page, pageSize, total, onPage }) {
  if (!total) return null
  if (total <= pageSize) return <div className="pager"><span>{total} data</span></div>
  const pages = Math.ceil(total / pageSize)
  const from = (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  return (
    <div className="pager">
      <span>{from}–{to} dari {total} data</span>
      <div className="pager-btns">
        <button type="button" className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Sebelumnya</button>
        <span className="pager-page">{page} / {pages}</span>
        <button type="button" className="btn btn-ghost btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Berikutnya</button>
      </div>
    </div>
  )
}

function niceCeil(v) {
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  const f = v / p
  const n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10
  return n * p
}

function TrendChart({ data }) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.revenue, d.expense)))
  const top = niceCeil(max)
  const ticks = [1, 0.75, 0.5, 0.25, 0].map((f) => top * f)
  const step = Math.ceil(data.length / 8)
  const hasData = data.some((d) => d.revenue > 0 || d.expense > 0)
  return (
    <div className="chart">
      <div className="chart-legend">
        <span><i className="dot dot-rev" /> Pendapatan</span>
        <span><i className="dot dot-exp" /> Pengeluaran</span>
      </div>
      <div className="chart-body">
        <div className="chart-axis">
          {ticks.map((t, i) => <span key={i}>{compactRupiah(t)}</span>)}
        </div>
        <div className="chart-plot">
          <div className="chart-grid">{ticks.map((t, i) => <i key={i} />)}</div>
          <div className="chart-cols">
            {data.map((d, i) => (
              <div className="chart-col" key={d.date} tabIndex={0}>
                <div className="chart-bars">
                  <span className="bar bar-rev" style={{ height: `${(d.revenue / top) * 100}%` }} />
                  <span className="bar bar-exp" style={{ height: `${(d.expense / top) * 100}%` }} />
                </div>
                <div className={`chart-tip${i > data.length * 0.6 ? ' tip-left' : ''}`}>
                  <strong>{formatDate(d.date)}</strong>
                  <span>Pendapatan: {rupiah(d.revenue)}</span>
                  <span>Pengeluaran: {rupiah(d.expense)}</span>
                </div>
                <em className="chart-x">{i % step === 0 ? shortDate(d.date) : ''}</em>
              </div>
            ))}
          </div>
          {!hasData && <div className="chart-empty">Belum ada data pada periode ini</div>}
        </div>
      </div>
    </div>
  )
}

function HBarList({ items, format = rupiah, empty = 'Belum ada data pada periode ini.' }) {
  if (!items.length) return <p className="muted small">{empty}</p>
  const max = Math.max(1, ...items.map((i) => i.value))
  return (
    <ul className="hbars">
      {items.map((i) => (
        <li key={i.label}>
          <div className="hbar-top"><span>{i.label}</span><strong>{format(i.value)}</strong></div>
          <div className="hbar-track"><span style={{ width: `${(i.value / max) * 100}%` }} /></div>
          {i.sub && <small>{i.sub}</small>}
        </li>
      ))}
    </ul>
  )
}

function ProfitBreakdown({ s }) {
  const rows = [
    ['Pendapatan penjualan', s.revenue, ''],
    ['Harga pokok penjualan (HPP)', -s.cogs, 'minus'],
    ['Laba kotor', s.gross, 'sum'],
    ['Biaya operasional', -s.opex, 'minus'],
    ['Estimasi laba bersih', s.net, 'total'],
  ]
  return (
    <div className="breakdown">
      <table>
        <tbody>
          {rows.map(([l, v, k]) => (
            <tr key={l} className={k}>
              <td>{l}</td>
              <td>{rupiah(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="breakdown-cash">
        <div><span>Pembelian barang (arus kas keluar)</span><strong>{rupiah(s.purchases)}</strong></div>
        <div><span>Arus kas bersih (masuk - seluruh pengeluaran)</span><strong className={s.cashflow < 0 ? 'neg' : ''}>{rupiah(s.cashflow)}</strong></div>
      </div>
      <p className="muted small">Pembelian barang tidak dikurangkan dua kali: biaya barang masuk laba lewat HPP saat terjual, sedangkan pembelian stok hanya memengaruhi arus kas.</p>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="page skeleton" aria-busy="true" aria-label="Memuat data">
      <div className="sk sk-title" />
      <div className="sk-row">
        {[0, 1, 2, 3].map((i) => <div key={i} className="sk sk-card" />)}
      </div>
      <div className="sk sk-big" />
    </div>
  )
}

/* =====================================================================
   MODAL AUTENTIKASI (SIMULASI FRONTEND)
   ===================================================================== */
function AuthModal({ mode, setMode, demo, onClose, onSubmit }) {
  const [form, setForm] = useState({
    name: '', business: '',
    email: demo ? DEMO_USER.email : '',
    password: demo ? DEMO_USER.password : '',
    confirm: '',
  })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [show, setShow] = useState(false)
  const isLogin = mode === 'login'
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const switchMode = (m) => { setMode(m); setErrors({}); setFormError('') }

  const submit = (e) => {
    e.preventDefault()
    const er = {}
    if (!isLogin) {
      if (form.name.trim().length < 3) er.name = 'Nama minimal 3 karakter.'
      if (!form.business.trim()) er.business = 'Nama usaha wajib diisi.'
    }
    if (!EMAIL_RE.test(form.email.trim())) er.email = 'Format email tidak valid.'
    if (form.password.length < 6) er.password = 'Kata sandi minimal 6 karakter.'
    if (!isLogin && form.confirm !== form.password) er.confirm = 'Konfirmasi kata sandi tidak sama.'
    setErrors(er)
    if (Object.keys(er).length) return
    const msg = onSubmit(mode, form)
    if (msg) setFormError(msg)
  }

  return (
    <Modal
      title={isLogin ? 'Masuk ke UMKM Solution' : 'Buat akun UMKM Solution'}
      subtitle={isLogin ? 'Lanjutkan mengelola bisnis Anda.' : 'Daftar untuk mencoba semua fitur versi demo.'}
      onClose={onClose}
      size="sm"
    >
      <form className="form" onSubmit={submit} noValidate>
        <div className="notice notice-info">
          <Icon name="info" size={18} />
          <p>
            <strong>Autentikasi simulasi.</strong> Akun disimpan di localStorage browser ini dan kata sandi tidak dienkripsi. Jangan gunakan kata sandi asli Anda.
          </p>
        </div>
        {formError && <div className="notice notice-error" role="alert"><Icon name="alert" size={18} /><p>{formError}</p></div>}
        {!isLogin && (
          <>
            <Field label="Nama lengkap" error={errors.name}>
              <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Contoh: Siti Aminah" autoComplete="name" />
            </Field>
            <Field label="Nama usaha" error={errors.business}>
              <input value={form.business} onChange={(e) => set('business', e.target.value)} placeholder="Contoh: Toko Elektronik Sinar" />
            </Field>
          </>
        )}
        <Field label="Email" error={errors.email}>
          <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="nama@email.com" autoComplete="email" />
        </Field>
        <Field label="Kata sandi" error={errors.password}>
          <div className="input-group">
            <input type={show ? 'text' : 'password'} value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="Minimal 6 karakter" autoComplete={isLogin ? 'current-password' : 'new-password'} />
            <button type="button" className="icon-btn" onClick={() => setShow((s) => !s)} aria-label={show ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}>
              <Icon name={show ? 'eyeOff' : 'eye'} size={18} />
            </button>
          </div>
        </Field>
        {!isLogin && (
          <Field label="Konfirmasi kata sandi" error={errors.confirm}>
            <input type={show ? 'text' : 'password'} value={form.confirm} onChange={(e) => set('confirm', e.target.value)} autoComplete="new-password" />
          </Field>
        )}
        <button type="submit" className="btn btn-primary btn-block">{isLogin ? 'Masuk' : 'Daftar & mulai demo'}</button>
        {isLogin && (
          <button type="button" className="btn btn-ghost btn-block" onClick={() => { setForm((f) => ({ ...f, email: DEMO_USER.email, password: DEMO_USER.password })); setErrors({}); setFormError('') }}>
            Isi akun demo
          </button>
        )}
        <p className="auth-switch">
          {isLogin ? 'Belum punya akun?' : 'Sudah punya akun?'}{' '}
          <button type="button" className="link" onClick={() => switchMode(isLogin ? 'register' : 'login')}>
            {isLogin ? 'Daftar sekarang' : 'Masuk'}
          </button>
        </p>
      </form>
    </Modal>
  )
}

/* =====================================================================
   LANDING PAGE
   ===================================================================== */
const FEATURES = [
  { icon: 'dashboard', title: 'Dashboard keuangan', text: 'Pendapatan, pengeluaran, estimasi laba bersih, dan jumlah transaksi dihitung langsung dari catatan toko Anda.' },
  { icon: 'receipt', title: 'Pencatatan transaksi cepat', text: 'Catat penjualan multi-produk lengkap dengan diskon dan metode pembayaran. Stok otomatis menyesuaikan.' },
  { icon: 'box', title: 'peringatan stok', text: 'Pantau harga modal, harga jual, nilai persediaan, dan dapatkan penanda saat stok mendekati batas minimum.' },
  { icon: 'chart', title: 'Analitik penjualan', text: 'Grafik harian, ringkasan mingguan, produk terlaris, dan perbandingan dengan periode sebelumnya.' },
  { icon: 'spark', title: 'Business Advisor berbasis aturan pengguna', text: 'Saran bisnis kontekstual dari data Anda: restock, tren penjualan, margin, dan pos biaya terbesar.' },
  { icon: 'qr', title: 'Simulasi QRIS (DEMO)', text: 'Pilih QRIS saat mencatat transaksi untuk mencoba alur pembayaran digital tanpa menyentuh dana sungguhan.' },
]
const PAINS = [
  'Pencatatan manual di buku membuat laba bersih sulit diketahui cepat.',
  'Data penjualan, stok, dan pengeluaran tersebar di banyak tempat.',
  'Tren penjualan sulit dibaca sehingga keputusan sering berdasarkan perkiraan.',
]
const STEPS = [
  { n: '01', title: 'Siapkan toko', text: 'Masukkan produk, harga modal, harga jual, dan stok awal.' },
  { n: '02', title: 'Catat harian', text: 'Input transaksi dan pengeluaran. Metrik langsung diperbarui.' },
  { n: '03', title: 'Baca & putuskan', text: 'Gunakan analitik dan Business Advisor untuk menentukan langkah berikutnya.' },
]
const BENEFITS = [
  ['Laba lebih jelas', 'Pemisahan pendapatan, HPP, biaya operasional, dan arus kas agar tidak menyesatkan.'],
  ['Stok terkendali', 'Stok berkurang otomatis saat transaksi dan memberi peringatan sebelum habis.'],
  ['Satu sumber data', 'Dashboard, grafik, dan saran bisnis membaca data yang sama.'],
  ['Siap dikembangkan', 'Struktur data dan perhitungan dipisah sehingga mudah disambungkan ke backend dan gateway QRIS nanti.'],
]

function Landing({ user, products, transactions, expenses, onAuth, onOpenApp }) {
  const [menu, setMenu] = useState(false)
  const r = useMemo(() => getRanges('30d'), [])
  const stats = useMemo(() => computeStats(transactions, expenses, r.start, r.end), [transactions, expenses, r])
  const series = useMemo(() => buildSeries(transactions, expenses, r.start, r.end).slice(-14), [transactions, expenses, r])
  const recent = useMemo(() => [...transactions].sort(sortTxDesc).slice(0, 4), [transactions])
  const maxRev = Math.max(1, ...series.map((s) => s.revenue))
  const closeMenu = () => setMenu(false)

  return (
    <div className="landing">
      <div className="ribbon">Prototipe GTNIC 2026 · Autentikasi dan QRIS berupa simulasi (DEMO), belum terhubung ke bank atau penyedia pembayaran</div>
      <header className="l-header">
        <div className="l-header-inner">
          <a href="#top" className="l-brand" onClick={closeMenu}><Logo /></a>
          <nav className={`l-nav${menu ? ' open' : ''}`}>
            <a href="#fitur" onClick={closeMenu}>Fitur</a>
            <a href="#alur" onClick={closeMenu}>Cara kerja</a>
            <a href="#qris" onClick={closeMenu}>QRIS</a>
            <a href="#manfaat" onClick={closeMenu}>Manfaat</a>
            <div className="l-nav-cta">
              {user ? (
                <button type="button" className="btn btn-primary" onClick={onOpenApp}>Buka Dashboard</button>
              ) : (
                <>
                  <button type="button" className="btn btn-ghost" onClick={() => { closeMenu(); onAuth('login') }}>Masuk</button>
                  <button type="button" className="btn btn-primary" onClick={() => { closeMenu(); onAuth('register') }}>Daftar</button>
                </>
              )}
            </div>
          </nav>
          <button type="button" className="icon-btn l-burger" onClick={() => setMenu((m) => !m)} aria-label="Buka menu">
            <Icon name={menu ? 'close' : 'menu'} />
          </button>
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">{APP_TAGLINE}</span>
            <h1>Kelola usahamu dengan lebih terarah</h1>
            <p className="hero-lead">
              {APP_NAME} UMKM Solution membantu Anda mengelola usaha dengan lebih praktis. Mulai dari pencatatan transaksi, pengelolaan stok, hingga laporan keuangan, semuanya dapat dilakukan dalam satu website.
            </p>
            <div className="hero-actions">
              {user ? (
                <button type="button" className="btn btn-primary btn-lg" onClick={onOpenApp}>Buka Dashboard <Icon name="arrow" size={18} /></button>
              ) : (
                <>
                  <button type="button" className="btn btn-primary btn-lg" onClick={() => onAuth('login', true)}>Coba demo sekarang <Icon name="arrow" size={18} /></button>
                  <button type="button" className="btn btn-outline btn-lg" onClick={() => onAuth('register')}>Buat akun</button>
                </>
              )}
            </div>
            <ul className="hero-points">
              <li><Icon name="check" size={16} /> Data tersimpan di browser (localStorage)</li>
              <li><Icon name="check" size={16} /> Tanpa instalasi backend</li>
              <li><Icon name="check" size={16} /> Bahasa Indonesia penuh</li>
            </ul>
          </div>

          <div className="preview" role="img" aria-label="Pratinjau dashboard UMKM Solution dari data demo">
            <div className="preview-bar">
              <span /><span /><span />
              <em>umkmsolution / dashboard</em>
              <b className="demo-tag">DEMO</b>
            </div>
            <div className="preview-body">
              <div className="preview-kpis">
                <div><small>Pendapatan 30 hari</small><strong>{rupiah(stats.revenue)}</strong></div>
                <div><small>Estimasi laba bersih</small><strong>{rupiah(stats.net)}</strong></div>
                <div><small>Transaksi</small><strong>{stats.count}</strong></div>
              </div>
              <div className="preview-chart">
                {series.map((s) => <span key={s.date} style={{ height: `${Math.max(4, (s.revenue / maxRev) * 100)}%` }} />)}
              </div>
              <ul className="preview-list">
                {recent.map((t) => (
                  <li key={t.id}>
                    <div><strong>{t.customer}</strong><small>{t.id} · {formatDate(t.date)}</small></div>
                    <span>{rupiah(t.total)}</span>
                  </li>
                ))}
                {!recent.length && <li><small>Belum ada transaksi</small></li>}
              </ul>
            </div>
          </div>
        </section>

        <section className="l-section l-problem">
          <div className="l-wrap">
            <h2>Masalah yang sering dialami pemilik toko</h2>
            <div className="pain-grid">
              {PAINS.map((p, i) => (
                <div className="pain" key={i}><span>{String(i + 1).padStart(2, '0')}</span><p>{p}</p></div>
              ))}
            </div>
          </div>
        </section>

        <section className="l-section" id="fitur">
          <div className="l-wrap">
            <div className="l-heading">
              <span className="eyebrow">Fitur unggulan</span>
              <h2>Semua urusan tokomu, lebih mudah dan cepat dalam satu tempat.</h2>
            </div>
            <div className="feature-grid">
              {FEATURES.map((f) => (
                <article className="feature" key={f.title}>
                  <span className="feature-icon"><Icon name={f.icon} size={22} /></span>
                  <h3>{f.title}</h3>
                  <p>{f.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="l-section l-dark" id="alur">
          <div className="l-wrap">
            <div className="l-heading">
              <span className="eyebrow">Cara kerja</span>
              <h2>Tiga langkah mengelola data toko.</h2>
            </div>
            <div className="steps">
              {STEPS.map((s) => (
                <div className="step" key={s.n}><b>{s.n}</b><h3>{s.title}</h3><p>{s.text}</p></div>
              ))}
            </div>
          </div>
        </section>

        <section className="l-section" id="qris">
          <div className="l-wrap qris-box">
            <div>
              <span className="eyebrow">Pembayaran digital</span>
              <h2>Simulasi QRIS untuk demonstrasi alur kasir.</h2>
              <p>
                Saat mencatat transaksi, pilih metode <strong>QRIS (simulasi)</strong> untuk melihat bagaimana pembayaran digital tercatat di laporan. Mode ini berlabel DEMO: tidak ada QR yang dapat dipindai, tidak ada dana yang berpindah, dan belum ada koneksi ke bank atau penyedia pembayaran.
              </p>
              <p className="muted">Arsitektur disiapkan agar adaptor pembayaran sungguhan dapat dipasang pada tahap pengembangan berikutnya.</p>
            </div>
            <div className="qris-card">
              <div className="qris-card-top"><Icon name="qr" size={20} /> QRIS (simulasi) <b className="demo-tag">DEMO</b></div>
              <div className="qris-placeholder">Area pembayaran simulasi<br /><small>Bukan kode QR yang dapat dipindai</small></div>
              <div className="qris-row"><span>Status</span><strong>Pending → Selesai (simulasi)</strong></div>
              <div className="qris-row"><span>Dana bergerak</span><strong>Tidak ada</strong></div>
            </div>
          </div>
        </section>

        <section className="l-section l-soft" id="manfaat">
          <div className="l-wrap">
            <div className="l-heading">
              <span className="eyebrow">Manfaat untuk UMKM</span>
              <h2>Keputusan bisnis berbasis data toko.</h2>
            </div>
            <div className="benefit-grid">
              {BENEFITS.map(([t, d]) => (
                <div className="benefit" key={t}><Icon name="shield" size={20} /><div><h3>{t}</h3><p>{d}</p></div></div>
              ))}
            </div>
          </div>
        </section>

        <section className="l-cta">
          <div className="l-wrap">
            <h2>Siap melihat bisnis Anda lebih jelas?</h2>
            <p>Masuk menggunakan akun demo dan coba langsung fitur kasir, inventaris, transaksi, serta laporan keuangan.</p>
            {user ? (
              <button type="button" className="btn btn-light btn-lg" onClick={onOpenApp}>Buka Dashboard</button>
            ) : (
              <button type="button" className="btn btn-light btn-lg" onClick={() => onAuth('login', true)}>Coba demo sekarang</button>
            )}
          </div>
        </section>
      </main>

      <footer className="l-footer">
        <div className="l-wrap l-footer-inner">
          <div><Logo inverse /><p>{APP_TAGLINE}</p></div>
          <div className="l-footer-links">
            <a href="#fitur">Fitur</a><a href="#alur">Cara kerja</a><a href="#qris">QRIS</a><a href="#manfaat">Manfaat</a>
          </div>
          <p className="l-footer-note">© {new Date().getFullYear()} {APP_NAME} · Prototipe untuk GTNIC 2026. Autentikasi, QRIS, dan Business Advisor pada versi ini berupa simulasi frontend.</p>
        </div>
      </footer>
    </div>
  )
}

/* =====================================================================
   SIDEBAR & HEADER APLIKASI
   ===================================================================== */
function Sidebar({ page, go, open, onClose, user, lowCount, onHome, onLogout }) {
  return (
    <aside className={`sidebar${open ? ' open' : ''}`}>
      <div className="sidebar-top">
        <Logo inverse />
        <button type="button" className="icon-btn sidebar-close" onClick={onClose} aria-label="Tutup menu"><Icon name="close" /></button>
      </div>
      <div className="sidebar-biz">
        <Icon name="store" size={18} />
        <div><strong>{user.business}</strong><small>Mode demo</small><DbBadge /></div>
      </div>
      <nav className="sidebar-nav" aria-label="Navigasi utama">
        {NAV.map((n) => (
          <button key={n.id} type="button" className={`nav-item${page === n.id ? ' active' : ''}`} onClick={() => go(n.id)}>
            <Icon name={n.icon} size={19} />
            <span>{n.label}</span>
            {n.id === 'produk' && lowCount > 0 && <b className="nav-badge">{lowCount}</b>}
          </button>
        ))}
      </nav>
      <div className="sidebar-foot">
        <button type="button" className="nav-item" onClick={onHome}><Icon name="home" size={19} /><span>Halaman utama</span></button>
        <button type="button" className="nav-item" onClick={onLogout}><Icon name="logout" size={19} /><span>Keluar</span></button>
      </div>
    </aside>
  )
}

function Header({ title, user, products, transactions, expenses, alerts, activity, go, onMenu, onHome, onLogout }) {
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [bellOpen, setBellOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const searchRef = useRef(null)
  const bellRef = useRef(null)
  const profileRef = useRef(null)
  useClickOutside(searchRef, () => setSearchOpen(false), searchOpen)
  useClickOutside(bellRef, () => setBellOpen(false), bellOpen)
  useClickOutside(profileRef, () => setProfileOpen(false), profileOpen)

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    const out = []
    transactions
      .filter((t) => `${t.id} ${t.customer} ${t.items.map((i) => i.name).join(' ')}`.toLowerCase().includes(q))
      .slice(0, 4)
      .forEach((t) => out.push({ key: t.id, icon: 'receipt', label: `${t.id} · ${t.customer}`, sub: `Transaksi · ${rupiah(t.total)}`, page: 'transaksi', q: t.id }))
    products
      .filter((p) => `${p.name} ${p.sku}`.toLowerCase().includes(q))
      .slice(0, 4)
      .forEach((p) => out.push({ key: p.id, icon: 'box', label: p.name, sub: `Produk · ${p.sku} · stok ${p.stock}`, page: 'produk', q: p.name }))
    expenses
      .filter((e) => e.name.toLowerCase().includes(q))
      .slice(0, 3)
      .forEach((e) => out.push({ key: e.id, icon: 'wallet', label: e.name, sub: `Pengeluaran · ${rupiah(e.amount)}`, page: 'pengeluaran', q: e.name }))
    return out
  }, [query, transactions, products, expenses])

  const pick = (item) => {
    go(item.page, item.q)
    setQuery('')
    setSearchOpen(false)
  }

  return (
    <header className="topbar">
      <button type="button" className="icon-btn menu-btn" onClick={onMenu} aria-label="Buka menu"><Icon name="menu" /></button>
      <h1 className="topbar-title">{title}</h1>
      <div className="topbar-search" ref={searchRef}>
        <Icon name="search" size={18} />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSearchOpen(true) }}
          onFocus={() => setSearchOpen(true)}
          placeholder="Cari transaksi, produk, pengeluaran…"
          aria-label="Pencarian global"
        />
        {searchOpen && query.trim().length >= 2 && (
          <div className="dropdown search-results">
            {results.length === 0 && <p className="dropdown-empty">Tidak ada hasil untuk “{query}”.</p>}
            {results.map((r) => (
              <button key={r.key} type="button" className="result" onClick={() => pick(r)}>
                <Icon name={r.icon} size={18} />
                <span><strong>{r.label}</strong><small>{r.sub}</small></span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="topbar-actions">
        <div className="pop" ref={bellRef}>
          <button type="button" className="icon-btn bell" onClick={() => { setBellOpen((o) => !o); setProfileOpen(false) }} aria-label={`Notifikasi (${alerts.length})`}>
            <Icon name="bell" />
            {alerts.length > 0 && <b className="bell-count">{alerts.length > 9 ? '9+' : alerts.length}</b>}
          </button>
          {bellOpen && (
            <div className="dropdown notif">
              <div className="dropdown-head">Notifikasi</div>
              {alerts.length === 0 && <p className="dropdown-empty">Tidak ada peringatan. Semua aman.</p>}
              {alerts.slice(0, 6).map((a) => (
                <button key={a.id} type="button" className={`notif-item notif-${a.type}`} onClick={() => { go(a.page, a.q); setBellOpen(false) }}>
                  <Icon name={a.type === 'info' ? 'clock' : 'alert'} size={18} />
                  <span><strong>{a.title}</strong><small>{a.text}</small></span>
                </button>
              ))}
              {alerts.length > 6 && <p className="dropdown-empty">+{alerts.length - 6} peringatan lainnya</p>}
              <div className="dropdown-head">Aktivitas terbaru</div>
              {activity.length === 0 && <p className="dropdown-empty">Belum ada aktivitas.</p>}
              {activity.slice(0, 4).map((a) => (
                <div key={a.id} className="activity"><span>{a.text}</span><small>{formatStamp(a.at)}</small></div>
              ))}
            </div>
          )}
        </div>
        <div className="pop" ref={profileRef}>
          <button type="button" className="profile-btn" onClick={() => { setProfileOpen((o) => !o); setBellOpen(false) }} aria-label="Menu profil">
            <span className="avatar">{firstName(user.name).charAt(0).toUpperCase()}</span>
            <span className="profile-name">{firstName(user.name)}</span>
          </button>
          {profileOpen && (
            <div className="dropdown profile-menu">
              <div className="profile-info"><strong>{user.name}</strong><small>{user.email}</small></div>
              <button type="button" onClick={() => { go('pengaturan'); setProfileOpen(false) }}><Icon name="settings" size={17} /> Pengaturan</button>
              <button type="button" onClick={() => { setProfileOpen(false); onHome() }}><Icon name="home" size={17} /> Halaman utama</button>
              <button type="button" onClick={() => { setProfileOpen(false); onLogout() }}><Icon name="logout" size={17} /> Keluar</button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

/* =====================================================================
   HALAMAN: DASHBOARD
   ===================================================================== */
function Dashboard({ user, products, transactions, expenses, openModal, go }) {
  const [period, setPeriod] = useState('30d')
  const r = useMemo(() => getRanges(period), [period])
  const cur = useMemo(() => computeStats(transactions, expenses, r.start, r.end), [transactions, expenses, r])
  const prev = useMemo(() => computeStats(transactions, expenses, r.prevStart, r.prevEnd), [transactions, expenses, r])
  const series = useMemo(() => buildSeries(transactions, expenses, r.start, r.end), [transactions, expenses, r])
  const top = useMemo(() => aggregateItems(transactions, r.start, r.end).slice(0, 5), [transactions, r])
  const recent = useMemo(() => [...transactions].sort(sortTxDesc).slice(0, 6), [transactions])
  const stock = useMemo(() => {
    const low = products.filter((p) => p.stock > 0 && p.stock <= p.min)
    const out = products.filter((p) => p.stock <= 0)
    return {
      total: products.length,
      safe: products.length - low.length - out.length,
      low, out,
      cost: products.reduce((s, p) => s + p.stock * p.cost, 0),
      retail: products.reduce((s, p) => s + p.stock * p.price, 0),
    }
  }, [products])

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2 className="page-title">Halo, {firstName(user.name)}</h2>
          <p className="page-sub">{user.business} · {formatDate(r.start)} – {formatDate(r.end)}</p>
        </div>
        <PeriodTabs value={period} onChange={setPeriod} />
      </div>

      <div className="quick-actions">
        <button type="button" className="btn btn-primary" onClick={() => openModal('tx')}><Icon name="plus" size={18} /> Tambah transaksi</button>
        <button type="button" className="btn btn-outline" onClick={() => openModal('product')}><Icon name="plus" size={18} /> Tambah produk</button>
        <button type="button" className="btn btn-outline" onClick={() => openModal('expense')}><Icon name="plus" size={18} /> Tambah pengeluaran</button>
      </div>

      {transactions.length === 0 && (
        <div className="card">
          <EmptyState
            icon="receipt"
            title="Belum ada transaksi"
            text="Catat transaksi pertama Anda agar dashboard, grafik, dan Business Advisor mulai terisi."
            action={<button type="button" className="btn btn-primary" onClick={() => openModal('tx')}>Tambah transaksi pertama</button>}
          />
        </div>
      )}

      <div className="kpi-grid">
        <KpiCard label="Total pendapatan" value={rupiah(cur.revenue)} icon="trendUp" tone="accent" delta={<Delta cur={cur.revenue} prev={prev.revenue} />} />
        <KpiCard label="Total pengeluaran" value={rupiah(cur.expense)} icon="wallet" tone="warn" delta={<Delta cur={cur.expense} prev={prev.expense} invert />} note="Termasuk pembelian barang" />
        <KpiCard label="Estimasi laba bersih" value={rupiah(cur.net)} icon="chart" tone={cur.net < 0 ? 'bad' : 'good'} delta={<Delta cur={cur.net} prev={prev.net} />} note={cur.revenue > 0 ? `Margin ${dec(cur.netMargin * 100)}%` : 'Belum ada penjualan'} />
        <KpiCard label="Jumlah transaksi" value={nf.format(cur.count)} icon="receipt" delta={<Delta cur={cur.count} prev={prev.count} />} note={cur.pending ? `${cur.pending} Pending` : `${nf.format(cur.units)} unit terjual`} />
      </div>

      <div className="grid-2-1">
        <section className="card">
          <div className="card-head"><h3>Tren pendapatan & pengeluaran</h3><span className="muted small">Per hari</span></div>
          <TrendChart data={series} />
        </section>
        <section className="card">
          <div className="card-head"><h3>Ringkasan stok</h3><button type="button" className="link" onClick={() => go('produk')}>Kelola</button></div>
          <div className="stock-sum">
            <div><strong>{stock.total}</strong><span>Produk</span></div>
            <div className="ok"><strong>{stock.safe}</strong><span>Aman</span></div>
            <div className="warn"><strong>{stock.low.length}</strong><span>Rendah</span></div>
            <div className="bad"><strong>{stock.out.length}</strong><span>Habis</span></div>
          </div>
          <dl className="kv">
            <div><dt>Nilai persediaan (modal)</dt><dd>{rupiah(stock.cost)}</dd></div>
            <div><dt>Potensi nilai jual</dt><dd>{rupiah(stock.retail)}</dd></div>
          </dl>
          {stock.low.length + stock.out.length > 0 ? (
            <ul className="mini-list">
              {[...stock.out, ...stock.low].slice(0, 4).map((p) => (
                <li key={p.id}><span>{p.name}</span><StockBadge product={p} /></li>
              ))}
            </ul>
          ) : (
            <p className="muted small">Semua produk berada di atas batas minimum.</p>
          )}
        </section>
      </div>

      <div className="grid-3">
        <section className="card">
          <div className="card-head"><h3>Produk terlaris</h3><span className="muted small">Berdasarkan unit</span></div>
          <HBarList items={top.map((t) => ({ label: t.name, value: t.qty, sub: `${rupiah(t.revenue)} penjualan`, }))} format={(n) => `${n} unit`} />
        </section>
        <section className="card">
          <div className="card-head"><h3>Rincian laba</h3></div>
          <ProfitBreakdown s={cur} />
        </section>
        <section className="card">
          <div className="card-head"><h3>Transaksi terbaru</h3><button type="button" className="link" onClick={() => go('transaksi')}>Lihat semua</button></div>
          {recent.length === 0 ? (
            <p className="muted small">Belum ada transaksi.</p>
          ) : (
            <ul className="tx-list">
              {recent.map((t) => (
                <li key={t.id}>
                  <div><strong>{t.customer}</strong><small>{t.id} · {formatDate(t.date)} · {t.method}</small></div>
                  <div className="tx-right"><strong>{rupiah(t.total)}</strong><StatusBadge status={t.status} /></div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

/* =====================================================================
   HALAMAN: TRANSAKSI
   ===================================================================== */
function TransactionsPage({ transactions, products, openModal, onDelete, seed }) {
  const [query, setQuery] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [category, setCategory] = useState('')
  const [method, setMethod] = useState('')
  const [status, setStatus] = useState('')
  const [sort, setSort] = useState('newest')
  const [pageNo, setPageNo] = useState(1)
  const PAGE_SIZE = 8
  useSeed(seed, 'transaksi', (q) => setQuery(q))
  useEffect(() => { setPageNo(1) }, [query, from, to, category, method, status, sort])

  const categories = useMemo(() => [...new Set([...transactions.map((t) => t.category), ...products.map((p) => p.category)])].sort(), [transactions, products])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = transactions.filter((t) => {
      if (q && !`${t.id} ${t.customer} ${t.category} ${t.method} ${t.items.map((i) => i.name).join(' ')}`.toLowerCase().includes(q)) return false
      if (from && t.date < from) return false
      if (to && t.date > to) return false
      if (category && t.category !== category) return false
      if (method && t.method !== method) return false
      if (status && t.status !== status) return false
      return true
    })
    const sorters = {
      newest: sortTxDesc,
      oldest: (a, b) => sortTxDesc(b, a),
      high: (a, b) => b.total - a.total,
      low: (a, b) => a.total - b.total,
    }
    return list.sort(sorters[sort])
  }, [transactions, query, from, to, category, method, status, sort])

  const done = filtered.filter((t) => t.status === 'Selesai')
  const sum = done.reduce((s, t) => s + t.total, 0)
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current = Math.min(pageNo, pages)
  const rows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
  const hasFilter = query || from || to || category || method || status
  const reset = () => { setQuery(''); setFrom(''); setTo(''); setCategory(''); setMethod(''); setStatus('') }

  return (
    <div className="page">
      <div className="page-head">
        <div><h2 className="page-title">Transaksi</h2><p className="page-sub">Catat penjualan, pantau status, dan kelola riwayat transaksi.</p></div>
        <button type="button" className="btn btn-primary" onClick={() => openModal('tx')}><Icon name="plus" size={18} /> Tambah transaksi</button>
      </div>

      <div className="summary-chips">
        <div><span>Transaksi ditampilkan</span><strong>{filtered.length}</strong></div>
        <div><span>Total selesai</span><strong>{rupiah(sum)}</strong></div>
        <div><span>Rata-rata per transaksi</span><strong>{rupiah(done.length ? sum / done.length : 0)}</strong></div>
        <div><span>Pending</span><strong>{filtered.length - done.length}</strong></div>
      </div>

      <section className="card">
        <div className="toolbar">
          <div className="search-box"><Icon name="search" size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari ID, pelanggan, item…" aria-label="Cari transaksi" /></div>
          <label className="mini-field"><span>Dari</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="mini-field"><span>Sampai</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter kategori">
            <option value="">Semua kategori</option>
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Filter metode pembayaran">
            <option value="">Semua metode</option>
            {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter status">
            <option value="">Semua status</option>
            {TX_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Urutkan">
            <option value="newest">Terbaru</option>
            <option value="oldest">Terlama</option>
            <option value="high">Nominal tertinggi</option>
            <option value="low">Nominal terendah</option>
          </select>
          {hasFilter && <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>Reset filter</button>}
        </div>

        {transactions.length === 0 ? (
          <EmptyState icon="receipt" title="Belum ada transaksi" text="Mulai catat penjualan pertama Anda." action={<button type="button" className="btn btn-primary" onClick={() => openModal('tx')}>Tambah transaksi</button>} />
        ) : filtered.length === 0 ? (
          <EmptyState icon="search" title="Tidak ada transaksi yang cocok" text="Ubah kata kunci atau filter Anda." action={<button type="button" className="btn btn-outline" onClick={reset}>Reset filter</button>} />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>ID</th><th>Tanggal</th><th>Pelanggan</th><th>Item</th><th>Kategori</th><th>Metode</th><th className="num">Total</th><th>Status</th><th className="actions-col">Aksi</th></tr>
                </thead>
                <tbody>
                  {rows.map((t) => (
                    <tr key={t.id}>
                      <td className="mono">{t.id}</td>
                      <td><div className="cell-stack"><span>{formatDate(t.date)}</span><small>{t.time}</small></div></td>
                      <td>{t.customer}</td>
                      <td className="cell-clip">{txSummary(t)}</td>
                      <td>{t.category}</td>
                      <td><MethodBadge method={t.method} /></td>
                      <td className="num strong">{rupiah(t.total)}</td>
                      <td><StatusBadge status={t.status} /></td>
                      <td className="actions-col">
                        <div className="row-actions">
                          <button type="button" className="icon-btn" onClick={() => openModal('txDetail', t)} aria-label={`Detail ${t.id}`}><Icon name="eye" size={17} /></button>
                          <button type="button" className="icon-btn" onClick={() => openModal('tx', t)} aria-label={`Edit ${t.id}`}><Icon name="edit" size={17} /></button>
                          <button type="button" className="icon-btn danger" onClick={() => onDelete(t)} aria-label={`Hapus ${t.id}`}><Icon name="trash" size={17} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={current} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPageNo} />
          </>
        )}
      </section>
      <p className="muted small">Transaksi berstatus Pending belum dihitung sebagai pendapatan. Metode QRIS pada versi ini hanyalah simulasi (DEMO).</p>
    </div>
  )
}

function TransactionDetail({ tx, onEdit, onDelete, onClose }) {
  return (
    <Modal
      title={`Detail ${tx.id}`}
      subtitle={`${formatDate(tx.date)} · ${tx.time}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-danger-ghost" onClick={() => onDelete(tx)}>Hapus</button>
          <button type="button" className="btn btn-outline" onClick={() => onEdit(tx)}>Edit</button>
          <button type="button" className="btn btn-primary" onClick={onClose}>Tutup</button>
        </>
      }
    >
      <dl className="kv kv-grid">
        <div><dt>Pelanggan</dt><dd>{tx.customer}</dd></div>
        <div><dt>Kategori</dt><dd>{tx.category}</dd></div>
        <div><dt>Metode</dt><dd><MethodBadge method={tx.method} /></dd></div>
        <div><dt>Status</dt><dd><StatusBadge status={tx.status} /></dd></div>
      </dl>
      <div className="table-wrap">
        <table className="table table-compact">
          <thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Harga</th><th className="num">Subtotal</th></tr></thead>
          <tbody>
            {tx.items.map((i, idx) => (
              <tr key={idx}><td>{i.name}</td><td className="num">{i.qty}</td><td className="num">{rupiah(i.price)}</td><td className="num">{rupiah(i.qty * i.price)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="kv totals">
        <div><dt>Subtotal</dt><dd>{rupiah(tx.subtotal)}</dd></div>
        <div><dt>Diskon</dt><dd>-{rupiah(tx.discount)}</dd></div>
        <div className="grand"><dt>Total</dt><dd>{rupiah(tx.total)}</dd></div>
        <div><dt>HPP</dt><dd>{rupiah(tx.cogs)}</dd></div>
        <div><dt>Laba kotor</dt><dd>{rupiah(tx.total - tx.cogs)}</dd></div>
      </dl>
      {tx.note && <p className="note-box"><strong>Catatan:</strong> {tx.note}</p>}
      {tx.method.startsWith('QRIS') && <p className="notice notice-demo"><b className="demo-tag">DEMO</b> Pembayaran QRIS pada transaksi ini adalah simulasi, tidak ada dana yang diproses.</p>}
    </Modal>
  )
}

function TransactionForm({ editing, products, onSave, onClose, notify }) {
  const newLine = () => ({ key: uid('l'), productId: '', manual: false, name: '', qty: '1', price: '', cost: '0', category: '' })
  const [form, setForm] = useState(() =>
    editing
      ? {
          customer: editing.customer === 'Pelanggan Umum' ? '' : editing.customer,
          date: editing.date,
          time: editing.time,
          discount: String(editing.discount || 0),
          method: editing.method,
          status: editing.status,
          category: '',
          note: editing.note || '',
        }
      : { customer: '', date: todayStr(), time: nowTime(), discount: '0', method: 'Tunai', status: 'Selesai', category: '', note: '' }
  )
  const [lines, setLines] = useState(() =>
    editing
      ? editing.items.map((i) => {
          const exists = i.productId && products.some((p) => p.id === i.productId)
          return { key: uid('l'), productId: exists ? i.productId : '', manual: !exists, name: i.name, qty: String(i.qty), price: String(i.price), cost: String(i.cost), category: i.category || 'Lainnya' }
        })
      : [newLine()]
  )
  const [errors, setErrors] = useState({ lines: {} })
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const updateLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  const removeLine = (key) => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls))

  const selectProduct = (key, val) => {
    if (val === '__manual') updateLine(key, { manual: true, productId: '', name: '', price: '', cost: '0', category: 'Lainnya' })
    else if (!val) updateLine(key, { manual: false, productId: '', name: '', price: '', cost: '0', category: '' })
    else {
      const p = products.find((x) => x.id === val)
      updateLine(key, { manual: false, productId: p.id, name: p.name, price: String(p.price), cost: String(p.cost), category: p.category })
    }
  }

  const oldQty = (pid) => (editing ? editing.items.filter((i) => i.productId === pid).reduce((s, i) => s + i.qty, 0) : 0)
  const available = (pid) => {
    const p = products.find((x) => x.id === pid)
    return p ? p.stock + oldQty(pid) : 0
  }

  const parsed = lines.map((l) => ({ ...l, q: toNum(l.qty), pr: toNum(l.price), c: Number(l.cost) || 0 }))
  const qtyByProduct = {}
  parsed.forEach((l) => {
    if (!l.manual && l.productId) qtyByProduct[l.productId] = (qtyByProduct[l.productId] || 0) + (Number.isFinite(l.q) ? l.q : 0)
  })
  const subtotal = parsed.reduce((s, l) => s + (Number.isFinite(l.q) && Number.isFinite(l.pr) && l.q > 0 && l.pr >= 0 ? l.q * l.pr : 0), 0)
  const discount = form.discount === '' ? 0 : Number(form.discount)
  const total = Math.max(0, subtotal - (Number.isFinite(discount) ? discount : 0))
  const categoryOptions = [...new Set([...products.map((p) => p.category), 'Lainnya'])]
  const isQris = form.method.startsWith('QRIS')

  const changeMethod = (m) => {
    setForm((f) => {
      const next = { ...f, method: m }
      if (!editing) next.status = m.startsWith('QRIS') ? 'Pending' : 'Selesai'
      return next
    })
  }

  const validate = () => {
    const er = { lines: {} }
    let count = 0
    const bad = (obj, k, msg) => { obj[k] = msg; count++ }
    if (!form.date) bad(er, 'date', 'Tanggal wajib diisi.')
    else if (form.date > todayStr()) bad(er, 'date', 'Tanggal tidak boleh di masa depan.')
    parsed.forEach((l) => {
      if (!l.manual && !l.productId) bad(er.lines, l.key, 'Pilih produk atau gunakan item manual.')
      else if (l.manual && !l.name.trim()) bad(er.lines, l.key, 'Nama item wajib diisi.')
      else if (!Number.isInteger(l.q) || l.q < 1) bad(er.lines, l.key, 'Qty harus bilangan bulat minimal 1.')
      else if (l.manual && (!Number.isFinite(l.pr) || l.pr <= 0)) bad(er.lines, l.key, 'Harga harus lebih dari 0.')
      else if (l.manual && (!Number.isFinite(Number(l.cost || 0)) || Number(l.cost || 0) < 0)) bad(er.lines, l.key, 'Modal tidak boleh negatif.')
      else if (!l.manual && qtyByProduct[l.productId] > available(l.productId)) bad(er.lines, l.key, `Stok tidak cukup. Tersedia ${available(l.productId)}, diminta ${qtyByProduct[l.productId]}.`)
    })
    if (!Number.isFinite(discount) || discount < 0) bad(er, 'discount', 'Diskon tidak boleh negatif.')
    else if (discount > subtotal) bad(er, 'discount', 'Diskon melebihi subtotal.')
    er.count = count
    return er
  }

  const submit = (e) => {
    e.preventDefault()
    const er = validate()
    setErrors(er)
    if (er.count) {
      notify('Periksa kembali isian formulir transaksi.', 'error')
      return
    }
    const items = parsed.map((l) => ({
      productId: l.manual ? '' : l.productId,
      name: l.name.trim(),
      category: l.category || 'Lainnya',
      qty: l.q,
      price: l.pr,
      cost: l.manual ? Number(l.cost) || 0 : l.c,
    }))
    onSave({
      id: editing ? editing.id : undefined,
      date: form.date,
      time: form.time || nowTime(),
      customer: form.customer.trim() || 'Pelanggan Umum',
      items,
      subtotal,
      discount,
      total,
      cogs: items.reduce((s, i) => s + i.qty * i.cost, 0),
      category: form.category || items[0].category,
      method: form.method,
      status: form.status,
      note: form.note.trim(),
    })
  }

  return (
    <Modal
      title={editing ? `Edit ${editing.id}` : 'Tambah transaksi'}
      subtitle="Stok produk diperbarui otomatis saat transaksi disimpan."
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Batal</button>
          <button type="submit" form="tx-form" className="btn btn-primary">{editing ? 'Simpan perubahan' : 'Simpan transaksi'}</button>
        </>
      }
    >
      <form id="tx-form" className="form" onSubmit={submit} noValidate>
        <div className="form-grid">
          <Field label="Nama pelanggan / transaksi" hint="Kosongkan untuk “Pelanggan Umum”">
            <input value={form.customer} onChange={(e) => set('customer', e.target.value)} placeholder="Contoh: Budi Santoso" />
          </Field>
          <Field label="Tanggal" error={errors.date}>
            <input type="date" max={todayStr()} value={form.date} onChange={(e) => set('date', e.target.value)} />
          </Field>
          <Field label="Jam">
            <input type="time" value={form.time} onChange={(e) => set('time', e.target.value)} />
          </Field>
        </div>

        <div className="lines">
          <div className="lines-head"><h4>Item transaksi</h4></div>
          {lines.map((l) => {
            const err = errors.lines && errors.lines[l.key]
            const p = !l.manual && l.productId ? products.find((x) => x.id === l.productId) : null
            const sub = Number.isFinite(toNum(l.qty)) && Number.isFinite(toNum(l.price)) ? toNum(l.qty) * toNum(l.price) : 0
            return (
              <div className={`line${err ? ' line-invalid' : ''}`} key={l.key}>
                <div className="line-grid">
                  <label className="field line-product">
                    <span>Produk</span>
                    <select value={l.manual ? '__manual' : l.productId} onChange={(e) => selectProduct(l.key, e.target.value)}>
                      <option value="">Pilih produk…</option>
                      {products.map((pr) => (
                        <option key={pr.id} value={pr.id} disabled={available(pr.id) <= 0 && l.productId !== pr.id}>
                          {pr.name} — {rupiah(pr.price)} (stok {available(pr.id)})
                        </option>
                      ))}
                      <option value="__manual">Item manual (di luar inventaris)</option>
                    </select>
                  </label>
                  <label className="field line-qty">
                    <span>Qty</span>
                    <input type="number" min="1" step="1" value={l.qty} onChange={(e) => updateLine(l.key, { qty: e.target.value })} />
                  </label>
                  <label className="field line-price">
                    <span>Harga satuan</span>
                    <input type="number" min="0" step="1" value={l.price} readOnly={!l.manual} onChange={(e) => updateLine(l.key, { price: e.target.value })} />
                  </label>
                  <div className="line-sub"><span>Subtotal</span><strong>{rupiah(sub)}</strong></div>
                  <button type="button" className="icon-btn danger" onClick={() => removeLine(l.key)} disabled={lines.length === 1} aria-label="Hapus item"><Icon name="trash" size={17} /></button>
                </div>
                {l.manual && (
                  <div className="line-extra">
                    <Field label="Nama item">
                      <input value={l.name} onChange={(e) => updateLine(l.key, { name: e.target.value })} placeholder="Contoh: Jasa servis ringan" />
                    </Field>
                    <Field label="Modal per unit (opsional)" hint="Untuk menghitung laba kotor">
                      <input type="number" min="0" step="1" value={l.cost} onChange={(e) => updateLine(l.key, { cost: e.target.value })} />
                    </Field>
                  </div>
                )}
                {p && <small className="hint">Stok tersedia: {available(p.id)} unit · Modal {rupiah(l.cost)}</small>}
                {err && <small className="field-error">{err}</small>}
              </div>
            )
          })}
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setLines((ls) => [...ls, newLine()])}><Icon name="plus" size={16} /> Tambah item</button>
        </div>

        <div className="form-grid">
          <Field label="Diskon (Rp)" error={errors.discount}>
            <input type="number" min="0" step="1" value={form.discount} onChange={(e) => set('discount', e.target.value)} />
          </Field>
          <Field label="Kategori transaksi">
            <select value={form.category} onChange={(e) => set('category', e.target.value)}>
              <option value="">Otomatis (dari item pertama)</option>
              {categoryOptions.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Metode pembayaran">
            <select value={form.method} onChange={(e) => changeMethod(e.target.value)}>
              {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select value={form.status} onChange={(e) => set('status', e.target.value)}>
              {TX_STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
        </div>

        {isQris && (
          <div className="qris-demo">
            <div className="qris-demo-head"><Icon name="qr" size={18} /><strong>QRIS (simulasi)</strong><b className="demo-tag">DEMO</b></div>
            <p>Ini hanya simulasi untuk demonstrasi. Tidak ada QR yang dapat dipindai, tidak ada pembayaran nyata, dan belum ada koneksi ke bank atau penyedia pembayaran.</p>
            <button type="button" className="btn btn-outline btn-sm" disabled={form.status === 'Selesai'} onClick={() => { set('status', 'Selesai'); notify('Simulasi: pembayaran QRIS ditandai selesai (DEMO).', 'info') }}>
              {form.status === 'Selesai' ? 'Simulasi sudah ditandai selesai' : 'Tandai simulasi pembayaran selesai'}
            </button>
          </div>
        )}

        <Field label="Catatan (opsional)">
          <textarea rows="2" value={form.note} onChange={(e) => set('note', e.target.value)} placeholder="Catatan tambahan untuk transaksi ini" />
        </Field>

        <div className="totals-bar">
          <div><span>Subtotal</span><strong>{rupiah(subtotal)}</strong></div>
          <div><span>Diskon</span><strong>-{rupiah(Number.isFinite(discount) ? discount : 0)}</strong></div>
          <div className="grand"><span>Total</span><strong>{rupiah(total)}</strong></div>
        </div>
      </form>
    </Modal>
  )
}

/* =====================================================================
   HALAMAN: PRODUK & INVENTARIS
   ===================================================================== */
function ProductsPage({ products, openModal, onDelete, seed }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState('')
  const [pageNo, setPageNo] = useState(1)
  const PAGE_SIZE = 10
  useSeed(seed, 'produk', (q) => setQuery(q))
  useEffect(() => { setPageNo(1) }, [query, category, status])

  const categories = useMemo(() => [...new Set(products.map((p) => p.category))].sort(), [products])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return products.filter((p) => {
      if (q && !`${p.name} ${p.sku} ${p.category}`.toLowerCase().includes(q)) return false
      if (category && p.category !== category) return false
      if (status && stockStatus(p) !== status) return false
      return true
    })
  }, [products, query, category, status])

  const costValue = products.reduce((s, p) => s + p.stock * p.cost, 0)
  const retailValue = products.reduce((s, p) => s + p.stock * p.price, 0)
  const lowCount = products.filter((p) => p.stock > 0 && p.stock <= p.min).length
  const outCount = products.filter((p) => p.stock <= 0).length
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current = Math.min(pageNo, pages)
  const rows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
  const hasFilter = query || category || status
  const reset = () => { setQuery(''); setCategory(''); setStatus('') }

  return (
    <div className="page">
      <div className="page-head">
        <div><h2 className="page-title">Produk & Inventaris</h2><p className="page-sub">Kelola harga, stok, dan batas minimum persediaan.</p></div>
        <button type="button" className="btn btn-primary" onClick={() => openModal('product')}><Icon name="plus" size={18} /> Tambah produk</button>
      </div>

      <div className="summary-chips">
        <div><span>Jumlah produk</span><strong>{products.length}</strong></div>
        <div><span>Nilai inventaris (modal)</span><strong>{rupiah(costValue)}</strong></div>
        <div><span>Potensi nilai jual</span><strong>{rupiah(retailValue)}</strong></div>
        <div className={lowCount + outCount ? 'chip-warn' : ''}><span>Stok rendah / habis</span><strong>{lowCount} / {outCount}</strong></div>
      </div>

      <section className="card">
        <div className="toolbar">
          <div className="search-box"><Icon name="search" size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari nama atau SKU…" aria-label="Cari produk" /></div>
          <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter kategori">
            <option value="">Semua kategori</option>
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter status stok">
            <option value="">Semua status stok</option>
            <option>Aman</option><option>Rendah</option><option>Habis</option>
          </select>
          {hasFilter && <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>Reset filter</button>}
        </div>

        {products.length === 0 ? (
          <EmptyState icon="box" title="Belum ada produk" text="Tambahkan produk agar stok dapat dilacak dan dipakai saat mencatat transaksi." action={<button type="button" className="btn btn-primary" onClick={() => openModal('product')}>Tambah produk</button>} />
        ) : filtered.length === 0 ? (
          <EmptyState icon="search" title="Produk tidak ditemukan" text="Ubah kata kunci atau filter Anda." action={<button type="button" className="btn btn-outline" onClick={reset}>Reset filter</button>} />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Produk</th><th>Kategori</th><th className="num">Harga modal</th><th className="num">Harga jual</th><th className="num">Margin</th><th className="num">Stok</th><th>Status</th><th className="num">Nilai stok</th><th className="actions-col">Aksi</th></tr>
                </thead>
                <tbody>
                  {rows.map((p) => {
                    const margin = p.price > 0 ? ((p.price - p.cost) / p.price) * 100 : 0
                    return (
                      <tr key={p.id} className={p.stock <= p.min ? 'row-alert' : ''}>
                        <td><div className="cell-stack"><span className="strong">{p.name}</span><small className="mono">{p.sku}</small></div></td>
                        <td>{p.category}</td>
                        <td className="num">{rupiah(p.cost)}</td>
                        <td className="num">{rupiah(p.price)}</td>
                        <td className={`num ${margin < 15 ? 'neg' : ''}`}>{dec(margin)}%</td>
                        <td className="num"><div className="cell-stack right"><span className="strong">{p.stock}</span><small>min {p.min}</small></div></td>
                        <td><StockBadge product={p} /></td>
                        <td className="num">{rupiah(p.stock * p.cost)}</td>
                        <td className="actions-col">
                          <div className="row-actions">
                            <button type="button" className="icon-btn" onClick={() => openModal('product', p)} aria-label={`Edit ${p.name}`}><Icon name="edit" size={17} /></button>
                            <button type="button" className="icon-btn danger" onClick={() => onDelete(p)} aria-label={`Hapus ${p.name}`}><Icon name="trash" size={17} /></button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Pager page={current} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPageNo} />
          </>
        )}
      </section>
    </div>
  )
}

function ProductForm({ editing, products, onSave, onClose, notify }) {
  const suggestSku = () => {
    let n = products.length + 1
    const used = new Set(products.map((p) => p.sku.toLowerCase()))
    while (used.has(`ums-${String(n).padStart(3, '0')}`)) n++
    return `UMS-${String(n).padStart(3, '0')}`
  }
  const [form, setForm] = useState(() =>
    editing
      ? { name: editing.name, sku: editing.sku, category: editing.category, cost: String(editing.cost), price: String(editing.price), stock: String(editing.stock), min: String(editing.min) }
      : { name: '', sku: suggestSku(), category: DEFAULT_PRODUCT_CATEGORIES[0], cost: '', price: '', stock: '0', min: '5' }
  )
  const [errors, setErrors] = useState({})
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const cats = [...new Set([...DEFAULT_PRODUCT_CATEGORIES, ...products.map((p) => p.category)])]
  const cost = toNum(form.cost)
  const price = toNum(form.price)
  const thin = Number.isFinite(cost) && Number.isFinite(price) && price > 0 && price < cost

  const submit = (e) => {
    e.preventDefault()
    const er = {}
    if (form.name.trim().length < 2) er.name = 'Nama produk wajib diisi.'
    if (!form.sku.trim()) er.sku = 'SKU wajib diisi.'
    else if (products.some((p) => p.sku.toLowerCase() === form.sku.trim().toLowerCase() && (!editing || p.id !== editing.id))) er.sku = 'SKU sudah dipakai produk lain.'
    if (!form.category.trim()) er.category = 'Kategori wajib diisi.'
    if (!Number.isInteger(cost) || cost < 0) er.cost = 'Harga modal harus bilangan bulat, tidak negatif.'
    if (!Number.isInteger(price) || price <= 0) er.price = 'Harga jual harus bilangan bulat lebih dari 0.'
    const stock = toNum(form.stock)
    const min = toNum(form.min)
    if (!Number.isInteger(stock) || stock < 0) er.stock = 'Stok harus bilangan bulat, tidak negatif.'
    if (!Number.isInteger(min) || min < 0) er.min = 'Batas minimum harus bilangan bulat, tidak negatif.'
    setErrors(er)
    if (Object.keys(er).length) {
      notify('Periksa kembali isian formulir produk.', 'error')
      return
    }
    onSave({ id: editing ? editing.id : undefined, name: form.name.trim(), sku: form.sku.trim().toUpperCase(), category: form.category.trim(), cost, price, stock, min })
  }

  return (
    <Modal
      title={editing ? 'Edit produk' : 'Tambah produk'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Batal</button>
          <button type="submit" form="product-form" className="btn btn-primary">{editing ? 'Simpan perubahan' : 'Simpan produk'}</button>
        </>
      }
    >
      <form id="product-form" className="form" onSubmit={submit} noValidate>
        <div className="form-grid">
          <Field label="Nama produk" error={errors.name} className="span-2">
            <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Contoh: Kabel HDMI 2m" />
          </Field>
          <Field label="SKU / kode produk" error={errors.sku}>
            <input value={form.sku} onChange={(e) => set('sku', e.target.value)} />
          </Field>
          <Field label="Kategori" error={errors.category}>
            <input list="product-cats" value={form.category} onChange={(e) => set('category', e.target.value)} />
            <datalist id="product-cats">{cats.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
          <Field label="Harga modal (Rp)" error={errors.cost}>
            <input type="number" min="0" step="1" value={form.cost} onChange={(e) => set('cost', e.target.value)} />
          </Field>
          <Field label="Harga jual (Rp)" error={errors.price}>
            <input type="number" min="0" step="1" value={form.price} onChange={(e) => set('price', e.target.value)} />
          </Field>
          <Field label="Stok saat ini" error={errors.stock}>
            <input type="number" min="0" step="1" value={form.stock} onChange={(e) => set('stock', e.target.value)} />
          </Field>
          <Field label="Batas minimum stok" error={errors.min} hint="Peringatan muncul saat stok ≤ batas ini">
            <input type="number" min="0" step="1" value={form.min} onChange={(e) => set('min', e.target.value)} />
          </Field>
        </div>
        {thin && <div className="notice notice-warn"><Icon name="alert" size={18} /><p>Harga jual lebih rendah dari harga modal. Produk ini akan menghasilkan rugi per unit.</p></div>}
        {Number.isFinite(cost) && Number.isFinite(price) && price > 0 && !thin && (
          <p className="muted small">Margin per unit: {rupiah(price - cost)} ({dec(((price - cost) / price) * 100)}%)</p>
        )}
      </form>
    </Modal>
  )
}

/* =====================================================================
   HALAMAN: PENGELUARAN
   ===================================================================== */
function ExpensesPage({ expenses, openModal, onDelete, seed }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [pageNo, setPageNo] = useState(1)
  const PAGE_SIZE = 8
  useSeed(seed, 'pengeluaran', (q) => setQuery(q))
  useEffect(() => { setPageNo(1) }, [query, category, from, to])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return expenses
      .filter((e) => {
        if (q && !`${e.name} ${e.category} ${e.note || ''}`.toLowerCase().includes(q)) return false
        if (category && e.category !== category) return false
        if (from && e.date < from) return false
        if (to && e.date > to) return false
        return true
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
  }, [expenses, query, category, from, to])

  const total = filtered.reduce((s, e) => s + e.amount, 0)
  const purchases = filtered.filter((e) => e.category === PURCHASE_CATEGORY).reduce((s, e) => s + e.amount, 0)
  const byCat = groupTotals(filtered, (e) => e.category, (e) => e.amount)
  const periodTotals = PERIODS.map((p) => {
    const r = getRanges(p.id)
    return { ...p, value: expenses.filter((e) => inRange(e.date, r.start, r.end)).reduce((s, e) => s + e.amount, 0) }
  })
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current = Math.min(pageNo, pages)
  const rows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
  const hasFilter = query || category || from || to
  const reset = () => { setQuery(''); setCategory(''); setFrom(''); setTo('') }

  return (
    <div className="page">
      <div className="page-head">
        <div><h2 className="page-title">Pengeluaran</h2><p className="page-sub">Catat biaya operasional dan pembelian barang.</p></div>
        <button type="button" className="btn btn-primary" onClick={() => openModal('expense')}><Icon name="plus" size={18} /> Tambah pengeluaran</button>
      </div>

      <div className="summary-chips">
        {periodTotals.map((p) => <div key={p.id}><span>Total {p.label.toLowerCase()}</span><strong>{rupiah(p.value)}</strong></div>)}
        <div><span>Total sesuai filter</span><strong>{rupiah(total)}</strong></div>
      </div>

      <div className="grid-2-1">
        <section className="card">
          <div className="toolbar">
            <div className="search-box"><Icon name="search" size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari pengeluaran…" aria-label="Cari pengeluaran" /></div>
            <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter kategori">
              <option value="">Semua kategori</option>
              {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <label className="mini-field"><span>Dari</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="mini-field"><span>Sampai</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
            {hasFilter && <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>Reset filter</button>}
          </div>
          {expenses.length === 0 ? (
            <EmptyState icon="wallet" title="Belum ada pengeluaran" text="Catat biaya agar estimasi laba bersih lebih akurat." action={<button type="button" className="btn btn-primary" onClick={() => openModal('expense')}>Tambah pengeluaran</button>} />
          ) : filtered.length === 0 ? (
            <EmptyState icon="search" title="Tidak ada pengeluaran yang cocok" text="Ubah kata kunci atau filter Anda." action={<button type="button" className="btn btn-outline" onClick={reset}>Reset filter</button>} />
          ) : (
            <>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Tanggal</th><th>Deskripsi</th><th>Kategori</th><th className="num">Nominal</th><th className="actions-col">Aksi</th></tr></thead>
                  <tbody>
                    {rows.map((e) => (
                      <tr key={e.id}>
                        <td>{formatDate(e.date)}</td>
                        <td><div className="cell-stack"><span className="strong">{e.name}</span>{e.note && <small>{e.note}</small>}</div></td>
                        <td><span className={`tag${e.category === PURCHASE_CATEGORY ? ' tag-purchase' : ''}`}>{e.category}</span></td>
                        <td className="num strong">{rupiah(e.amount)}</td>
                        <td className="actions-col">
                          <div className="row-actions">
                            <button type="button" className="icon-btn" onClick={() => openModal('expense', e)} aria-label={`Edit ${e.name}`}><Icon name="edit" size={17} /></button>
                            <button type="button" className="icon-btn danger" onClick={() => onDelete(e)} aria-label={`Hapus ${e.name}`}><Icon name="trash" size={17} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager page={current} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPageNo} />
            </>
          )}
        </section>
        <section className="card">
          <div className="card-head"><h3>Per kategori</h3><span className="muted small">Sesuai filter</span></div>
          <HBarList items={byCat.map((c) => ({ label: c.label, value: c.value, sub: `${c.count} catatan` }))} empty="Belum ada data." />
          <div className="notice notice-info">
            <Icon name="info" size={18} />
            <p>Pembelian barang ({rupiah(purchases)}) dicatat sebagai arus kas keluar, tetapi <strong>tidak</strong> dikurangkan lagi dari laba karena biaya barang sudah dihitung lewat HPP saat terjual.</p>
          </div>
        </section>
      </div>
    </div>
  )
}

function ExpenseForm({ editing, onSave, onClose, notify }) {
  const [form, setForm] = useState(() =>
    editing
      ? { name: editing.name, category: editing.category, amount: String(editing.amount), date: editing.date, note: editing.note || '' }
      : { name: '', category: EXPENSE_CATEGORIES[0], amount: '', date: todayStr(), note: '' }
  )
  const [errors, setErrors] = useState({})
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const submit = (e) => {
    e.preventDefault()
    const er = {}
    const amount = toNum(form.amount)
    if (form.name.trim().length < 2) er.name = 'Deskripsi wajib diisi.'
    if (!Number.isInteger(amount) || amount <= 0) er.amount = 'Nominal harus bilangan bulat lebih dari 0.'
    if (!form.date) er.date = 'Tanggal wajib diisi.'
    else if (form.date > todayStr()) er.date = 'Tanggal tidak boleh di masa depan.'
    setErrors(er)
    if (Object.keys(er).length) {
      notify('Periksa kembali isian formulir pengeluaran.', 'error')
      return
    }
    onSave({ id: editing ? editing.id : undefined, name: form.name.trim(), category: form.category, amount, date: form.date, note: form.note.trim() })
  }

  return (
    <Modal
      title={editing ? 'Edit pengeluaran' : 'Tambah pengeluaran'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Batal</button>
          <button type="submit" form="expense-form" className="btn btn-primary">{editing ? 'Simpan perubahan' : 'Simpan pengeluaran'}</button>
        </>
      }
    >
      <form id="expense-form" className="form" onSubmit={submit} noValidate>
        <Field label="Nama / deskripsi" error={errors.name}>
          <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Contoh: Tagihan listrik bulan ini" />
        </Field>
        <div className="form-grid">
          <Field label="Kategori">
            <select value={form.category} onChange={(e) => set('category', e.target.value)}>
              {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Nominal (Rp)" error={errors.amount}>
            <input type="number" min="0" step="1" value={form.amount} onChange={(e) => set('amount', e.target.value)} />
          </Field>
          <Field label="Tanggal" error={errors.date}>
            <input type="date" max={todayStr()} value={form.date} onChange={(e) => set('date', e.target.value)} />
          </Field>
        </div>
        {form.category === PURCHASE_CATEGORY && (
          <div className="notice notice-info"><Icon name="info" size={18} /><p>Pembelian barang dihitung sebagai arus kas keluar. Biaya barang masuk ke laba lewat HPP saat produk terjual, sehingga tidak dihitung dua kali.</p></div>
        )}
        <Field label="Catatan (opsional)">
          <textarea rows="2" value={form.note} onChange={(e) => set('note', e.target.value)} />
        </Field>
      </form>
    </Modal>
  )
}

/* =====================================================================
   HALAMAN: ANALITIK
   ===================================================================== */
function AnalyticsPage({ products, transactions, expenses, go }) {
  const [period, setPeriod] = useState('30d')
  const r = useMemo(() => getRanges(period), [period])
  const cur = useMemo(() => computeStats(transactions, expenses, r.start, r.end), [transactions, expenses, r])
  const prev = useMemo(() => computeStats(transactions, expenses, r.prevStart, r.prevEnd), [transactions, expenses, r])
  const series = useMemo(() => buildSeries(transactions, expenses, r.start, r.end), [transactions, expenses, r])
  const weeks = useMemo(() => weeklyBuckets(series), [series])
  const items = useMemo(() => aggregateItems(transactions, r.start, r.end), [transactions, r])
  const cats = useMemo(() => groupTotals(items, (i) => i.category, (i) => i.qty), [items])
  const methods = useMemo(
    () => groupTotals(transactions.filter((t) => t.status === 'Selesai' && inRange(t.date, r.start, r.end)), (t) => t.method, (t) => t.total),
    [transactions, r]
  )
  const { insights, limited } = useMemo(() => buildInsights({ products, transactions, expenses, period }), [products, transactions, expenses, period])

  const compareRows = [
    ['Pendapatan', cur.revenue, prev.revenue, false],
    ['HPP', cur.cogs, prev.cogs, true],
    ['Laba kotor', cur.gross, prev.gross, false],
    ['Biaya operasional', cur.opex, prev.opex, true],
    ['Estimasi laba bersih', cur.net, prev.net, false],
    ['Total pengeluaran', cur.expense, prev.expense, true],
    ['Arus kas bersih', cur.cashflow, prev.cashflow, false],
  ]

  return (
    <div className="page">
      <div className="page-head">
        <div><h2 className="page-title">Analitik</h2><p className="page-sub">{formatDate(r.start)} – {formatDate(r.end)} · dibandingkan {formatDate(r.prevStart)} – {formatDate(r.prevEnd)}</p></div>
        <PeriodTabs value={period} onChange={setPeriod} />
      </div>

      <div className="kpi-grid">
        <KpiCard label="Pendapatan" value={rupiah(cur.revenue)} icon="trendUp" tone="accent" delta={<Delta cur={cur.revenue} prev={prev.revenue} />} />
        <KpiCard label="Pengeluaran" value={rupiah(cur.expense)} icon="wallet" tone="warn" delta={<Delta cur={cur.expense} prev={prev.expense} invert />} />
        <KpiCard label="Estimasi laba bersih" value={rupiah(cur.net)} icon="chart" tone={cur.net < 0 ? 'bad' : 'good'} delta={<Delta cur={cur.net} prev={prev.net} />} note={cur.revenue > 0 ? `Margin ${dec(cur.netMargin * 100)}%` : ''} />
        <KpiCard label="Laba kotor" value={rupiah(cur.gross)} icon="receipt" delta={<Delta cur={cur.gross} prev={prev.gross} />} note={cur.revenue > 0 ? `Margin ${dec(cur.grossMargin * 100)}%` : ''} />
      </div>

      <section className="card">
        <div className="card-head"><h3>Penjualan harian</h3><span className="muted small">Arahkan kursor pada batang untuk detail</span></div>
        <TrendChart data={series} />
      </section>

      <div className="grid-2">
        <section className="card">
          <div className="card-head"><h3>Perbandingan periode</h3></div>
          <div className="table-wrap">
            <table className="table table-compact">
              <thead><tr><th>Metrik</th><th className="num">Periode ini</th><th className="num">Sebelumnya</th><th className="num">Perubahan</th></tr></thead>
              <tbody>
                {compareRows.map(([label, c, p, invert]) => {
                  const ch = pctChange(c, p)
                  const good = ch === null ? null : invert ? ch <= 0 : ch >= 0
                  return (
                    <tr key={label}>
                      <td>{label}</td>
                      <td className="num strong">{rupiah(c)}</td>
                      <td className="num">{rupiah(p)}</td>
                      <td className={`num ${ch === null || Math.abs(ch) < 0.5 ? '' : good ? 'pos' : 'neg'}`}>{ch === null ? '—' : `${ch >= 0 ? '+' : '-'}${dec(Math.abs(ch))}%`}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
        <section className="card">
          <div className="card-head"><h3>Ringkasan mingguan</h3><span className="muted small">Minggu mulai Senin</span></div>
          <div className="table-wrap">
            <table className="table table-compact">
              <thead><tr><th>Minggu</th><th className="num">Pendapatan</th><th className="num">Pengeluaran</th><th className="num">Laba kotor</th></tr></thead>
              <tbody>
                {weeks.map((w) => (
                  <tr key={w.start}>
                    <td>{shortDate(w.start)} – {shortDate(w.end)}</td>
                    <td className="num">{rupiah(w.revenue)}</td>
                    <td className="num">{rupiah(w.expense)}</td>
                    <td className="num strong">{rupiah(w.revenue - w.cogs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="grid-3">
        <section className="card">
          <div className="card-head"><h3>Produk terlaris</h3></div>
          <HBarList items={items.slice(0, 6).map((i) => ({ label: i.name, value: i.qty, sub: `${rupiah(i.profit)} laba kotor` }))} format={(n) => `${n} unit`} />
        </section>
        <section className="card">
          <div className="card-head"><h3>Kategori paling banyak terjual</h3></div>
          <HBarList items={cats.map((c) => ({ label: c.label, value: c.value }))} format={(n) => `${n} unit`} />
        </section>
        <section className="card">
          <div className="card-head"><h3>Metode pembayaran</h3></div>
          <HBarList items={methods.map((m) => ({ label: m.label.startsWith('QRIS') ? `${m.label} · DEMO` : m.label, value: m.value, sub: `${m.count} transaksi` }))} />
        </section>
      </div>

      <section className="card">
        <div className="card-head"><h3>Insight dari data</h3><button type="button" className="link" onClick={() => go('advisor')}>Buka Business Advisor</button></div>
        {limited && <div className="notice notice-info"><Icon name="info" size={18} /><p>Data masih terbatas (kurang dari 5 transaksi selesai pada periode ini), jadi kesimpulan di bawah bersifat awal.</p></div>}
        {insights.length === 0 ? (
          <p className="muted small">Belum ada insight. Tambahkan transaksi untuk memulai.</p>
        ) : (
          <ul className="insight-mini">
            {insights.slice(0, 3).map((i) => (
              <li key={i.id} className={`lvl-${i.level}`}><strong>{i.title}</strong><span>{i.text}</span></li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

/* =====================================================================
   HALAMAN: BUSINESS ADVISOR (BERBASIS ATURAN)
   ===================================================================== */
function AdvisorPage({ products, transactions, expenses, openModal, go }) {
  const [period, setPeriod] = useState('30d')
  const { insights, cur, limited } = useMemo(() => buildInsights({ products, transactions, expenses, period }), [products, transactions, expenses, period])
  const counts = { danger: 0, warning: 0, success: 0, info: 0 }
  insights.forEach((i) => { counts[i.level]++ })
  const act = (a) => (a.modal ? openModal(a.modal) : go(a.page, a.q || ''))
  const iconFor = (l) => (l === 'danger' || l === 'warning' ? 'alert' : l === 'success' ? 'trendUp' : 'info')

  return (
    <div className="page">
      <div className="page-head">
        <div><h2 className="page-title">Business Advisor</h2><p className="page-sub">Rekomendasi dari data transaksi, stok, dan pengeluaran Anda.</p></div>
        <PeriodTabs value={period} onChange={setPeriod} />
      </div>

      <div className="notice notice-info">
        <Icon name="spark" size={18} />
        <p><strong>Analisis berbasis aturan.</strong> Pada versi demo, rekomendasi dihasilkan oleh aturan dan perhitungan JavaScript lokal yang transparan. Fitur ini tidak memakai model AI eksternal maupun machine learning.</p>
      </div>

      <div className="summary-chips">
        <div className="chip-bad"><span>Kritis</span><strong>{counts.danger}</strong></div>
        <div className="chip-warn"><span>Perlu perhatian</span><strong>{counts.warning}</strong></div>
        <div className="chip-good"><span>Kabar baik</span><strong>{counts.success}</strong></div>
        <div><span>Informasi</span><strong>{counts.info}</strong></div>
      </div>

      {limited && cur.count === 0 && transactions.length === 0 ? (
        <section className="card">
          <EmptyState icon="spark" title="Belum ada data untuk dianalisis" text="Tambahkan produk dan transaksi agar Business Advisor dapat memberi saran yang relevan." action={<button type="button" className="btn btn-primary" onClick={() => openModal('tx')}>Tambah transaksi</button>} />
        </section>
      ) : (
        <div className="insights">
          {insights.map((i) => (
            <article key={i.id} className={`insight insight-${i.level}`}>
              <span className="insight-icon"><Icon name={iconFor(i.level)} size={20} /></span>
              <div className="insight-body">
                <h3>{i.title}</h3>
                <p>{i.text}</p>
                {i.action && <button type="button" className="btn btn-outline btn-sm" onClick={() => act(i.action)}>{i.action.label} <Icon name="arrow" size={15} /></button>}
              </div>
            </article>
          ))}
        </div>
      )}

      <section className="card">
        <div className="card-head"><h3>Dasar perhitungan</h3></div>
        <ul className="rules">
          <li>Stok habis = 0. Stok rendah: stok ≤ batas minimum; saran restock ≈ 2 × minimum − stok.</li>
          <li>Produk terlaris: unit terjual terbanyak pada periode; perkiraan hari stok = stok ÷ (unit terjual ÷ jumlah hari).</li>
          <li>Tren pendapatan: perubahan dibanding periode sebelumnya dengan panjang hari sama; ambang ±10%.</li>
          <li>Margin laba bersih: (pendapatan − HPP − biaya operasional) ÷ pendapatan; pembelian barang tidak dikurangkan dua kali.</li>
          <li>Margin produk terlalu rendah: (harga jual − modal) ÷ harga jual di bawah 15%.</li>
          <li>Stok terlambat bergerak: ada stok, tidak terjual pada periode, nilai modal ≥ Rp100.000.</li>
        </ul>
      </section>
    </div>
  )
}

/* =====================================================================
   HALAMAN: PENGATURAN
   ===================================================================== */
function SettingsPage({ user, products, transactions, expenses, onResetDemo, onClearAll }) {
  const dbStatus = useDbStatus()
  const status = [
    ['Autentikasi', 'Simulasi frontend (localStorage)'],
    ['Pembayaran QRIS', 'Simulasi DEMO, tidak terhubung ke bank/gateway'],
    ['Business Advisor', 'Berbasis aturan lokal, bukan AI eksternal'],
    ['Penyimpanan data', describeStorage(dbStatus, cloudDb.configured)],
  ]
  return (
    <div className="page">
      <div className="page-head">
        <div><h2 className="page-title">Pengaturan</h2><p className="page-sub">Akun demo, status fitur, dan pengelolaan data.</p></div>
      </div>
      <div className="grid-2">
        <section className="card">
          <div className="card-head"><h3>Akun</h3></div>
          <dl className="kv">
            <div><dt>Nama</dt><dd>{user.name}</dd></div>
            <div><dt>Usaha</dt><dd>{user.business}</dd></div>
            <div><dt>Email</dt><dd>{user.email}</dd></div>
          </dl>
          <dl className="kv">
            <div><dt>Produk</dt><dd>{products.length}</dd></div>
            <div><dt>Transaksi</dt><dd>{transactions.length}</dd></div>
            <div><dt>Pengeluaran</dt><dd>{expenses.length}</dd></div>
          </dl>
        </section>
        <section className="card">
          <div className="card-head"><h3>Status fitur versi demo</h3></div>
          <dl className="kv">
            {status.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
        </section>
      </div>
      <section className="card">
        <div className="card-head"><h3>Kelola data</h3></div>
        <p className="muted">Data tersimpan hanya di browser ini. Anda dapat memuat ulang data contoh toko anda atau mengosongkan semua data untuk mulai dari awal.</p>
        <div className="settings-actions">
          <button type="button" className="btn btn-outline" onClick={onResetDemo}><Icon name="reset" size={18} /> Reset ke data demo</button>
          <button type="button" className="btn btn-danger-ghost" onClick={onClearAll}><Icon name="trash" size={18} /> Kosongkan semua data</button>
        </div>
      </section>
    </div>
  )
}

/* =====================================================================
   APLIKASI UTAMA
   ===================================================================== */
export default function App() {
  const [users, setUsers] = usePersistentState(KEYS.users, () => [{ ...DEMO_USER }], validUsers)
  const [session, setSession] = usePersistentState(KEYS.session, () => null, validSession)
  const [products, setProducts] = usePersistentState(KEYS.products, createSeedProducts, validProducts)
  const [transactions, setTransactions] = usePersistentState(KEYS.transactions, () => createSeedTransactions(createSeedProducts()), validTransactions)
  const [expenses, setExpenses] = usePersistentState(KEYS.expenses, createSeedExpenses, validExpenses)
  const [activity, setActivity] = usePersistentState(KEYS.activity, () => [], validActivity)

  const [screen, setScreen] = useState(() => (session && users.some((u) => u.id === session.userId) ? 'app' : 'landing'))
  const [authMode, setAuthMode] = useState(null)
  const [authDemo, setAuthDemo] = useState(false)
  const [page, setPage] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [modal, setModal] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [toasts, setToasts] = useState([])
  const [seed, setSeed] = useState(null)
  const [loading, setLoading] = useState(true)

  const currentUser = session ? users.find((u) => u.id === session.userId) || null : null
  const view = screen === 'app' && currentUser ? 'app' : 'landing'
  const workspace = useMemo(
    () => (currentUser ? workspaceIdFor({ email: currentUser.email, isDemo: currentUser.email === DEMO_USER.email, browserId: getBrowserId() }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentUser && currentUser.email]
  )
  useRemoteSync({ collection: 'products', value: products, setValue: setProducts, workspace, validate: validProducts })
  useRemoteSync({ collection: 'transactions', value: transactions, setValue: setTransactions, workspace, validate: validTransactions })
  useRemoteSync({ collection: 'expenses', value: expenses, setValue: setExpenses, workspace, validate: validExpenses })

  /* ---------- utilitas ---------- */
  const toast = useCallback((message, type = 'success') => {
    const id = uid('t')
    setToasts((t) => [...t.slice(-3), { id, message, type }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200)
  }, [])
  const dismissToast = (id) => setToasts((t) => t.filter((x) => x.id !== id))
  const log = useCallback((text) => setActivity((a) => [{ id: uid('a'), text, at: Date.now() }, ...a].slice(0, 15)), [setActivity])

  useEffect(() => {
    issueListener = (m) => toast(m, 'error')
    pendingIssues.splice(0).forEach((m) => toast(m, 'error'))
    return () => { issueListener = null }
  }, [toast])

  useEffect(() => {
    document.title = `${APP_NAME} — ${APP_TAGLINE}`
    let meta = document.querySelector('meta[name="description"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.setAttribute('name', 'description')
      document.head.appendChild(meta)
    }
    meta.setAttribute('content', APP_DESC)
  }, [])

  useEffect(() => {
    if (!users.some((u) => u.email === DEMO_USER.email)) setUsers((list) => [...list, { ...DEMO_USER }])
  }, [users, setUsers])

  useEffect(() => {
    if (view !== 'app') return undefined
    setLoading(true)
    const t = setTimeout(() => setLoading(false), 450)
    return () => clearTimeout(t)
  }, [view])

  const openModal = (type, data = null) => { setModal({ type, data }); setSidebarOpen(false) }
  const closeModal = () => setModal(null)
  const askConfirm = (cfg) => setConfirm(cfg)
  const go = (p, q) => {
    setPage(p)
    setSeed({ page: p, q: q || '', n: Date.now() })
    setSidebarOpen(false)
    window.scrollTo({ top: 0 })
  }

  /* ---------- autentikasi (simulasi) ---------- */
  const openAuth = (mode, demo = false) => { setAuthDemo(demo); setAuthMode(mode) }
  const handleAuth = (mode, form) => {
    const email = form.email.trim().toLowerCase()
    if (mode === 'login') {
      const u = users.find((x) => x.email === email && x.password === form.password)
      if (!u) return 'Email atau kata sandi tidak cocok.'
      setSession({ userId: u.id })
      setAuthMode(null)
      setScreen('app')
      setPage('dashboard')
      toast(`Selamat datang, ${firstName(u.name)}.`)
      return null
    }
    if (users.some((x) => x.email === email)) return 'Email sudah terdaftar. Silakan masuk.'
    const u = { id: uid('usr-'), name: form.name.trim(), business: form.business.trim(), email, password: form.password }
    setUsers((list) => [...list, u])
    setSession({ userId: u.id })
    setAuthMode(null)
    setScreen('app')
    setPage('dashboard')
    toast('Akun dibuat. Data contoh dimuat; kosongkan lewat menu Pengaturan jika ingin mulai dari awal.', 'info')
    return null
  }
  const logout = () => {
    setSession(null)
    setScreen('landing')
    setModal(null)
    setSidebarOpen(false)
    toast('Anda telah keluar.', 'info')
  }

  /* ---------- transaksi ---------- */
  const adjustStock = (list, items, sign) => {
    const delta = {}
    items.forEach((i) => { if (i.productId) delta[i.productId] = (delta[i.productId] || 0) + i.qty })
    return list.map((p) => (delta[p.id] ? { ...p, stock: p.stock + sign * delta[p.id] } : p))
  }

  const saveTransaction = (tx) => {
    const editing = tx.id ? transactions.find((t) => t.id === tx.id) : null
    let next = products
    if (editing) next = adjustStock(next, editing.items, +1)
    next = adjustStock(next, tx.items, -1)
    if (next.some((p) => p.stock < 0)) {
      toast('Stok tidak mencukupi untuk transaksi ini.', 'error')
      return
    }
    const warn = []
    tx.items.forEach((i) => {
      if (!i.productId || warn.some((w) => w.id === i.productId)) return
      const before = products.find((p) => p.id === i.productId)
      const after = next.find((p) => p.id === i.productId)
      if (before && after && after.stock <= after.min && after.stock < before.stock) warn.push(after)
    })
    if (editing) {
      setTransactions((list) => list.map((t) => (t.id === tx.id ? { ...t, ...tx } : t)))
      log(`Mengubah transaksi ${tx.id}`)
      toast(`Transaksi ${tx.id} berhasil diperbarui.`)
    } else {
      const id = nextSeq(transactions, 'TRX-', 4)
      setTransactions((list) => [{ ...tx, id }, ...list])
      log(`Menambah transaksi ${id} (${rupiah(tx.total)})`)
      toast(`Transaksi ${id} berhasil disimpan.`)
    }
    setProducts(next)
    warn.forEach((p) => toast(`Stok ${p.name} ${p.stock <= 0 ? 'habis' : 'rendah'} (sisa ${p.stock}).`, 'warning'))
    closeModal()
  }

  const requestDeleteTransaction = (tx) => {
    askConfirm({
      title: `Hapus ${tx.id}?`,
      message: `Transaksi ${tx.customer} senilai ${rupiah(tx.total)} akan dihapus dan stok produk terkait dikembalikan. Tindakan ini tidak dapat dibatalkan.`,
      confirmLabel: 'Hapus transaksi',
      danger: true,
      onConfirm: () => {
        setProducts((list) => adjustStock(list, tx.items, +1))
        setTransactions((list) => list.filter((t) => t.id !== tx.id))
        log(`Menghapus transaksi ${tx.id}`)
        toast(`Transaksi ${tx.id} dihapus dan stok dikembalikan.`, 'info')
        setModal((m) => (m && m.type === 'txDetail' ? null : m))
      },
    })
  }

  /* ---------- produk ---------- */
  const saveProduct = (p) => {
    if (p.id) {
      setProducts((list) => list.map((x) => (x.id === p.id ? { ...x, ...p } : x)))
      log(`Mengubah produk ${p.name}`)
      toast(`Produk ${p.name} berhasil diperbarui.`)
    } else {
      setProducts((list) => [{ ...p, id: uid('prd-') }, ...list])
      log(`Menambah produk ${p.name}`)
      toast(`Produk ${p.name} berhasil ditambahkan.`)
    }
    if (p.stock <= p.min) toast(`Stok ${p.name} ${p.stock <= 0 ? 'habis' : 'rendah'} (sisa ${p.stock}, minimum ${p.min}).`, 'warning')
    closeModal()
  }
  const requestDeleteProduct = (p) => {
    askConfirm({
      title: `Hapus produk “${p.name}”?`,
      message: 'Produk akan dihapus dari inventaris. Riwayat transaksi lama tetap tersimpan dengan nama dan harga saat itu.',
      confirmLabel: 'Hapus produk',
      danger: true,
      onConfirm: () => {
        setProducts((list) => list.filter((x) => x.id !== p.id))
        log(`Menghapus produk ${p.name}`)
        toast(`Produk ${p.name} dihapus.`, 'info')
      },
    })
  }

  /* ---------- pengeluaran ---------- */
  const saveExpense = (e) => {
    if (e.id) {
      setExpenses((list) => list.map((x) => (x.id === e.id ? { ...x, ...e } : x)))
      log(`Mengubah pengeluaran ${e.name}`)
      toast('Pengeluaran berhasil diperbarui.')
    } else {
      const id = nextSeq(expenses, 'EXP-', 4)
      setExpenses((list) => [{ ...e, id }, ...list])
      log(`Menambah pengeluaran ${e.name} (${rupiah(e.amount)})`)
      toast('Pengeluaran berhasil disimpan.')
    }
    closeModal()
  }
  const requestDeleteExpense = (e) => {
    askConfirm({
      title: 'Hapus pengeluaran?',
      message: `“${e.name}” senilai ${rupiah(e.amount)} akan dihapus dari catatan.`,
      confirmLabel: 'Hapus pengeluaran',
      danger: true,
      onConfirm: () => {
        setExpenses((list) => list.filter((x) => x.id !== e.id))
        log(`Menghapus pengeluaran ${e.name}`)
        toast('Pengeluaran dihapus.', 'info')
      },
    })
  }

  /* ---------- reset data ---------- */
  const requestResetDemo = () => {
    askConfirm({
      title: 'Reset ke data demo?',
      message: 'Seluruh produk, transaksi, dan pengeluaran Anda saat ini akan diganti dengan data contoh toko elektronik.',
      confirmLabel: 'Reset data demo',
      danger: true,
      onConfirm: () => {
        const prods = createSeedProducts()
        setProducts(prods)
        setTransactions(createSeedTransactions(createSeedProducts()))
        setExpenses(createSeedExpenses())
        setActivity([])
        toast('Data demo berhasil dimuat ulang.', 'info')
      },
    })
  }
  const requestClearAll = () => {
    askConfirm({
      title: 'Kosongkan semua data?',
      message: 'Seluruh produk, transaksi, dan pengeluaran akan dihapus dari browser ini. Akun demo tidak ikut dihapus.',
      confirmLabel: 'Kosongkan data',
      danger: true,
      onConfirm: () => {
        setProducts([])
        setTransactions([])
        setExpenses([])
        setActivity([])
        toast('Semua data dikosongkan.', 'info')
      },
    })
  }

  /* ---------- notifikasi turunan ---------- */
  const alerts = useMemo(() => {
    const a = []
    products
      .filter((p) => p.stock <= p.min)
      .sort((x, y) => x.stock - y.stock)
      .forEach((p) =>
        a.push({ id: `s-${p.id}`, type: p.stock <= 0 ? 'bad' : 'warn', title: p.stock <= 0 ? `${p.name} habis` : `Stok ${p.name} rendah`, text: `Sisa ${p.stock} unit, minimum ${p.min}.`, page: 'produk', q: p.name })
      )
    const pend = transactions.filter((t) => t.status === 'Pending')
    if (pend.length) a.push({ id: 'pending', type: 'info', title: `${pend.length} transaksi Pending`, text: 'Belum dihitung sebagai pendapatan hingga berstatus Selesai.', page: 'transaksi', q: '' })
    return a
  }, [products, transactions])

  const lowCount = products.filter((p) => p.stock <= p.min).length

  /* ---------- render ---------- */
  if (view === 'landing') {
    return (
      <>
        <Landing
          user={currentUser}
          products={products}
          transactions={transactions}
          expenses={expenses}
          onAuth={openAuth}
          onOpenApp={() => { setScreen('app'); setPage('dashboard') }}
        />
        {authMode && <AuthModal mode={authMode} setMode={setAuthMode} demo={authDemo} onClose={() => setAuthMode(null)} onSubmit={handleAuth} />}
        <Toasts toasts={toasts} dismiss={dismissToast} />
      </>
    )
  }

  const renderPage = () => {
    switch (page) {
      case 'transaksi':
        return <TransactionsPage transactions={transactions} products={products} openModal={openModal} onDelete={requestDeleteTransaction} seed={seed} />
      case 'produk':
        return <ProductsPage products={products} openModal={openModal} onDelete={requestDeleteProduct} seed={seed} />
      case 'pengeluaran':
        return <ExpensesPage expenses={expenses} openModal={openModal} onDelete={requestDeleteExpense} seed={seed} />
      case 'analitik':
        return <AnalyticsPage products={products} transactions={transactions} expenses={expenses} go={go} />
      case 'advisor':
        return <AdvisorPage products={products} transactions={transactions} expenses={expenses} openModal={openModal} go={go} />
      case 'pengaturan':
        return <SettingsPage user={currentUser} products={products} transactions={transactions} expenses={expenses} onResetDemo={requestResetDemo} onClearAll={requestClearAll} />
      default:
        return <Dashboard user={currentUser} products={products} transactions={transactions} expenses={expenses} openModal={openModal} go={go} />
    }
  }

  return (
    <div className="app-shell">
      <Sidebar
        page={page}
        go={go}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        user={currentUser}
        lowCount={lowCount}
        onHome={() => { setScreen('landing'); setSidebarOpen(false) }}
        onLogout={logout}
      />
      {sidebarOpen && <div className="sidebar-scrim" onClick={() => setSidebarOpen(false)} />}
      <div className="app-main">
        <Header
          title={PAGE_TITLES[page]}
          user={currentUser}
          products={products}
          transactions={transactions}
          expenses={expenses}
          alerts={alerts}
          activity={activity}
          go={go}
          onMenu={() => setSidebarOpen(true)}
          onHome={() => setScreen('landing')}
          onLogout={logout}
        />
        <main className="app-content" key={page}>
          {loading ? <Skeleton /> : renderPage()}
        </main>
      </div>

      {modal && modal.type === 'tx' && <TransactionForm editing={modal.data} products={products} onSave={saveTransaction} onClose={closeModal} notify={toast} />}
      {modal && modal.type === 'txDetail' && (
        <TransactionDetail tx={modal.data} onClose={closeModal} onEdit={(t) => openModal('tx', t)} onDelete={requestDeleteTransaction} />
      )}
      {modal && modal.type === 'product' && <ProductForm editing={modal.data} products={products} onSave={saveProduct} onClose={closeModal} notify={toast} />}
      {modal && modal.type === 'expense' && <ExpenseForm editing={modal.data} onSave={saveExpense} onClose={closeModal} notify={toast} />}

      <ConfirmDialog dialog={confirm} onCancel={() => setConfirm(null)} />
      <Toasts toasts={toasts} dismiss={dismissToast} />
    </div>
  )
}
