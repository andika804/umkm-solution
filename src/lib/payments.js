/**
 * payments.js — alur pembayaran QR untuk checkout UMKM Solution.
 *
 * MODE DEMO: tidak ada uang yang bergerak dan tidak ada koneksi ke bank/penyedia
 * pembayaran. Status "dibayar" HANYA bisa berubah lewat applyProviderEvent(),
 * yaitu jalur yang sama persis dengan webhook payment gateway sungguhan:
 *   - tanda tangan event diperiksa,
 *   - id pembayaran harus cocok,
 *   - nominal harus sama dengan tagihan,
 *   - pembayaran belum kedaluwarsa dan masih pending,
 *   - event yang sama tidak diproses dua kali (idempoten).
 * Menampilkan QR atau menekan tombol di UI TIDAK mengubah status menjadi dibayar.
 *
 * Catatan keamanan: checksum di bawah hanya penanda untuk demo dan BUKAN
 * keamanan. Pada gateway sungguhan, verifikasi HMAC wajib dilakukan di server.
 */

export const PAYMENT_STATUS = Object.freeze({
  PENDING: 'pending',
  PAID: 'paid',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
  FAILED: 'failed',
})

export const FINAL_STATUSES = Object.freeze([
  PAYMENT_STATUS.PAID,
  PAYMENT_STATUS.EXPIRED,
  PAYMENT_STATUS.CANCELLED,
  PAYMENT_STATUS.FAILED,
])

export const DEFAULT_TTL_MS = 5 * 60 * 1000
const DEMO_SECRET = 'umkm-solution-demo-checksum'

export class PaymentError extends Error {
  constructor(code, message) {
    super(message || code)
    this.name = 'PaymentError'
    this.code = code
  }
}

/** Checksum non-kriptografis (cyrb53) untuk simulasi event provider. */
function checksum(str) {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0')
}

function signEvent(e) {
  return checksum([DEMO_SECRET, e.id, e.paymentId, e.type, e.amount, e.createdAt].join('|'))
}

function randomId(prefix, rng = Math.random, len = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < len; i++) out += chars[Math.floor(rng() * chars.length)]
  return `${prefix}${out}`
}

/** Membuat tagihan pembayaran baru berstatus pending. */
export function createPayment({ checkoutId, txId, amount, now = Date.now(), ttlMs = DEFAULT_TTL_MS, rng = Math.random } = {}) {
  if (!checkoutId || typeof checkoutId !== 'string') throw new PaymentError('invalid_checkout', 'checkoutId wajib diisi.')
  if (!txId || typeof txId !== 'string') throw new PaymentError('invalid_transaction', 'txId wajib diisi.')
  if (!Number.isInteger(amount) || amount <= 0) throw new PaymentError('invalid_amount', 'Nominal harus bilangan bulat lebih dari 0.')
  return {
    id: randomId('PAY-', rng),
    checkoutId,
    txId,
    amount,
    currency: 'IDR',
    method: 'QRIS_DEMO',
    mode: 'demo',
    reference: randomId('DEMO-', rng),
    status: PAYMENT_STATUS.PENDING,
    createdAt: now,
    expiresAt: now + ttlMs,
    paidAt: null,
    events: [],
  }
}

/** Menandai pembayaran kedaluwarsa jika waktunya sudah lewat. Murni (tidak mengubah input). */
export function tickPayment(payment, now = Date.now()) {
  if (payment.status === PAYMENT_STATUS.PENDING && now >= payment.expiresAt) {
    return { ...payment, status: PAYMENT_STATUS.EXPIRED }
  }
  return payment
}

/** Pembatalan manual oleh kasir. Hanya berlaku untuk pembayaran pending. */
export function cancelPayment(payment, now = Date.now()) {
  const current = tickPayment(payment, now)
  if (current.status !== PAYMENT_STATUS.PENDING) {
    return { payment: current, result: 'rejected', reason: `payment_${current.status}` }
  }
  return { payment: { ...current, status: PAYMENT_STATUS.CANCELLED }, result: 'applied' }
}

/**
 * HANYA UNTUK MODE DEMO: membuat event provider simulasi.
 * Pada gateway sungguhan event datang dari server penyedia (webhook), bukan dari UI.
 */
export function simulateProviderEvent(payment, type = 'payment.paid', { now = Date.now(), amount, rng = Math.random } = {}) {
  const event = {
    id: randomId('EVT-', rng, 10),
    paymentId: payment.id,
    type,
    amount: amount === undefined ? payment.amount : amount,
    createdAt: now,
    simulated: true,
  }
  return { ...event, signature: signEvent(event) }
}

function rejectEvent(payment, reason) {
  return { payment, result: 'rejected', reason }
}

/** Satu-satunya jalur yang boleh mengubah pembayaran menjadi paid/failed. */
export function applyProviderEvent(payment, event, now = Date.now()) {
  if (!event || typeof event !== 'object') return rejectEvent(payment, 'malformed_event')
  if (typeof event.signature !== 'string' || event.signature !== signEvent(event)) return rejectEvent(payment, 'bad_signature')
  if (event.paymentId !== payment.id) return rejectEvent(payment, 'payment_mismatch')
  if (payment.events.includes(event.id)) return { payment, result: 'duplicate', reason: 'event_already_processed' }

  const current = tickPayment(payment, now)
  if (current.status !== PAYMENT_STATUS.PENDING) return rejectEvent(current, `payment_${current.status}`)

  if (event.type === 'payment.paid') {
    if (event.amount !== current.amount) return rejectEvent(current, 'amount_mismatch')
    return {
      payment: { ...current, status: PAYMENT_STATUS.PAID, paidAt: now, events: [...current.events, event.id] },
      result: 'applied',
    }
  }
  if (event.type === 'payment.failed') {
    return {
      payment: { ...current, status: PAYMENT_STATUS.FAILED, events: [...current.events, event.id] },
      result: 'applied',
    }
  }
  return rejectEvent(current, 'unknown_event_type')
}

const STATUS_VIEW = {
  [PAYMENT_STATUS.PENDING]: { label: 'Menunggu pembayaran', tone: 'warn' },
  [PAYMENT_STATUS.PAID]: { label: 'Dibayar', tone: 'ok' },
  [PAYMENT_STATUS.EXPIRED]: { label: 'Kedaluwarsa', tone: 'bad' },
  [PAYMENT_STATUS.CANCELLED]: { label: 'Dibatalkan', tone: 'bad' },
  [PAYMENT_STATUS.FAILED]: { label: 'Gagal', tone: 'bad' },
}

export function describePayment(payment) {
  const view = STATUS_VIEW[payment.status] || { label: payment.status, tone: 'warn' }
  const demo = payment.mode === 'demo'
  return { label: demo && payment.status === PAYMENT_STATUS.PAID ? 'Dibayar (simulasi)' : view.label, tone: view.tone, demo }
}

export function formatCountdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/* ---------------------------------------------------------------------
   Registry provider. Mode "demo" siap pakai. Mode "gateway" sengaja belum
   diimplementasikan: ia menolak bekerja sampai integrasi resmi dipasang.
   --------------------------------------------------------------------- */
export const GATEWAY_REQUIREMENTS = Object.freeze([
  'Akun merchant pada penyedia pembayaran resmi yang mendukung QRIS (mis. lewat payment gateway berlisensi).',
  'Server backend untuk membuat tagihan (charge) memakai server key; kunci tidak boleh ada di frontend.',
  'Endpoint webhook publik (HTTPS) untuk menerima notifikasi status pembayaran.',
  'Verifikasi tanda tangan webhook (HMAC) di server dan pencatatan idempoten per event.',
  'Penyimpanan transaksi dan pembayaran di database server (bukan localStorage).',
])

function notConfigured() {
  throw new PaymentError('gateway_not_configured', 'Payment gateway belum dikonfigurasi. Gunakan mode demo.')
}

export const providers = Object.freeze({
  demo: Object.freeze({
    id: 'demo',
    label: 'Simulasi (DEMO)',
    live: false,
    createCharge: createPayment,
    simulate: simulateProviderEvent,
    handleEvent: applyProviderEvent,
  }),
  gateway: Object.freeze({
    id: 'gateway',
    label: 'QRIS via payment gateway',
    live: true,
    createCharge: notConfigured,
    handleEvent: notConfigured,
  }),
})

export function getProvider(mode = 'demo') {
  const p = providers[mode]
  if (!p) throw new PaymentError('unknown_provider', `Provider tidak dikenal: ${mode}`)
  return p
}
