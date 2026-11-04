import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createPayment, simulateProviderEvent, applyProviderEvent, tickPayment, cancelPayment,
  describePayment, getProvider, PaymentError, PAYMENT_STATUS,
} from '../src/lib/payments.js'
import { checkout, settlePaymentResult, validateSale, itemsToRestoreOnDelete, TX_STATUS } from '../src/lib/pos.js'

const T0 = 1_700_000_000_000
const mkPayment = (over = {}) => createPayment({ checkoutId: 'chk-1', txId: 'TRX-0001', amount: 100000, now: T0, ...over })

/* ---------------- payments ---------------- */
test('createPayment: pending, nominal & kedaluwarsa benar, mode demo', () => {
  const p = mkPayment()
  assert.equal(p.status, 'pending')
  assert.equal(p.mode, 'demo')
  assert.equal(p.expiresAt - p.createdAt, 5 * 60 * 1000)
  assert.match(p.id, /^PAY-/)
})

test('createPayment: menolak nominal tidak valid', () => {
  for (const amount of [0, -5, 10.5, NaN, '100']) {
    assert.throws(() => mkPayment({ amount }), (e) => e instanceof PaymentError && e.code === 'invalid_amount')
  }
})

test('menampilkan QR / membuat tagihan TIDAK mengubah status menjadi paid', () => {
  const p = mkPayment()
  assert.equal(tickPayment(p, T0 + 1000).status, 'pending')
  assert.equal(describePayment(p).label, 'Menunggu pembayaran')
})

test('event paid yang valid -> status paid', () => {
  const p = mkPayment()
  const r = applyProviderEvent(p, simulateProviderEvent(p, 'payment.paid', { now: T0 + 1000 }), T0 + 2000)
  assert.equal(r.result, 'applied')
  assert.equal(r.payment.status, 'paid')
  assert.equal(r.payment.paidAt, T0 + 2000)
  assert.equal(describePayment(r.payment).label, 'Dibayar (simulasi)')
})

test('event dengan tanda tangan salah ditolak', () => {
  const p = mkPayment()
  const ev = { ...simulateProviderEvent(p), signature: 'palsu' }
  const r = applyProviderEvent(p, ev, T0 + 1000)
  assert.equal(r.result, 'rejected')
  assert.equal(r.reason, 'bad_signature')
  assert.equal(r.payment.status, 'pending')
})

test('event yang nominalnya diubah (tanda tangan tidak cocok) ditolak', () => {
  const p = mkPayment()
  const ev = simulateProviderEvent(p)
  const r = applyProviderEvent(p, { ...ev, amount: 1 }, T0 + 1000)
  assert.equal(r.reason, 'bad_signature')
})

test('event bertanda tangan benar tetapi nominal tidak sama dengan tagihan ditolak', () => {
  const p = mkPayment()
  const ev = simulateProviderEvent(p, 'payment.paid', { amount: 5000 })
  const r = applyProviderEvent(p, ev, T0 + 1000)
  assert.equal(r.result, 'rejected')
  assert.equal(r.reason, 'amount_mismatch')
  assert.equal(r.payment.status, 'pending')
})

test('event untuk pembayaran lain ditolak', () => {
  const p = mkPayment()
  const other = mkPayment({ checkoutId: 'chk-2', txId: 'TRX-0002' })
  const r = applyProviderEvent(p, simulateProviderEvent(other), T0 + 1000)
  assert.equal(r.reason, 'payment_mismatch')
})

test('event yang sama diputar ulang -> duplicate, tidak diproses dua kali', () => {
  const p = mkPayment()
  const ev = simulateProviderEvent(p)
  const first = applyProviderEvent(p, ev, T0 + 1000)
  const again = applyProviderEvent(first.payment, ev, T0 + 2000)
  assert.equal(again.result, 'duplicate')
  assert.equal(again.payment.paidAt, T0 + 1000)
})

test('pembayaran kedaluwarsa tidak bisa menjadi paid', () => {
  const p = mkPayment()
  const late = T0 + 6 * 60 * 1000
  const r = applyProviderEvent(p, simulateProviderEvent(p), late)
  assert.equal(r.result, 'rejected')
  assert.equal(r.reason, 'payment_expired')
  assert.equal(r.payment.status, 'expired')
})

test('setelah dibatalkan, event paid ditolak', () => {
  const p = mkPayment()
  const c = cancelPayment(p, T0 + 1000)
  assert.equal(c.payment.status, 'cancelled')
  const r = applyProviderEvent(c.payment, simulateProviderEvent(p), T0 + 2000)
  assert.equal(r.reason, 'payment_cancelled')
})

test('event payment.failed -> failed; dan tidak bisa dibatalkan lagi', () => {
  const p = mkPayment()
  const r = applyProviderEvent(p, simulateProviderEvent(p, 'payment.failed'), T0 + 1000)
  assert.equal(r.payment.status, 'failed')
  assert.equal(cancelPayment(r.payment, T0 + 2000).result, 'rejected')
})

test('event tak dikenal & malformed ditolak', () => {
  const p = mkPayment()
  assert.equal(applyProviderEvent(p, null).reason, 'malformed_event')
  assert.equal(applyProviderEvent(p, simulateProviderEvent(p, 'payment.refund'), T0 + 1000).reason, 'unknown_event_type')
})

test('fungsi murni: payment asli tidak dimutasi', () => {
  const p = mkPayment()
  const snapshot = JSON.stringify(p)
  applyProviderEvent(p, simulateProviderEvent(p), T0 + 1000)
  assert.equal(JSON.stringify(p), snapshot)
})

test('provider gateway menolak bekerja sebelum dikonfigurasi', () => {
  assert.equal(getProvider('demo').live, false)
  assert.throws(() => getProvider('gateway').createCharge({}), (e) => e.code === 'gateway_not_configured')
  assert.throws(() => getProvider('xyz'), (e) => e.code === 'unknown_provider')
})

/* ---------------- pos ---------------- */
const products = () => [
  { id: 'p1', sku: 'A', name: 'Kabel', category: 'Kabel', cost: 10000, price: 25000, stock: 5, min: 2 },
  { id: 'p2', sku: 'B', name: 'Mouse', category: 'Periferal', cost: 50000, price: 90000, stock: 1, min: 1 },
]
const item = (productId, qty, price = 25000, cost = 10000) => ({ productId, name: productId, category: 'X', qty, price, cost })
const draft = (over = {}) => ({ checkoutId: 'chk-1', items: [item('p1', 2)], method: 'Tunai', discount: 0, ...over })

test('checkout tunai: transaksi Selesai, stok berkurang, total benar', () => {
  const r = checkout({ products: products(), transactions: [], draft: draft({ discount: 5000 }) })
  assert.equal(r.ok, true)
  assert.equal(r.transaction.status, 'Selesai')
  assert.equal(r.transaction.total, 45000)
  assert.equal(r.transaction.cogs, 20000)
  assert.equal(r.products.find((p) => p.id === 'p1').stock, 3)
  assert.equal(r.transaction.id, 'TRX-0001')
})

test('checkout QRIS: status Pending sampai pembayaran dikonfirmasi', () => {
  const r = checkout({ products: products(), transactions: [], draft: draft({ method: 'QRIS (simulasi)' }) })
  assert.equal(r.transaction.status, 'Pending')
  assert.equal(r.products.find((p) => p.id === 'p1').stock, 3)
})

test('stok tidak boleh negatif', () => {
  const r = checkout({ products: products(), transactions: [], draft: draft({ items: [item('p2', 2)] }) })
  assert.equal(r.ok, false)
  assert.match(r.error, /Stok Mouse tidak cukup/)
})

test('qty gabungan baris yang sama divalidasi bersama', () => {
  const errs = validateSale(products(), [item('p1', 3), item('p1', 3)])
  assert.equal(errs.length, 1)
  assert.match(errs[0], /tersedia 5, diminta 6/)
})

test('checkoutId yang sama tidak membuat transaksi ganda dan stok tidak berkurang dua kali', () => {
  const first = checkout({ products: products(), transactions: [], draft: draft() })
  const second = checkout({ products: first.products, transactions: [first.transaction], draft: draft() })
  assert.equal(second.ok, false)
  assert.equal(second.code, 'duplicate')
  assert.equal(second.transaction.id, 'TRX-0001')
})

test('validasi: keranjang kosong, qty 0, qty desimal, diskon negatif, diskon > subtotal', () => {
  const run = (d) => checkout({ products: products(), transactions: [], draft: d })
  assert.equal(run(draft({ items: [] })).ok, false)
  assert.equal(run(draft({ items: [item('p1', 0)] })).ok, false)
  assert.equal(run(draft({ items: [item('p1', 1.5)] })).ok, false)
  assert.equal(run(draft({ discount: -1 })).ok, false)
  assert.equal(run(draft({ discount: 999999 })).ok, false)
})

test('checkout tidak memutasi stok asli', () => {
  const ps = products()
  checkout({ products: ps, transactions: [], draft: draft() })
  assert.equal(ps[0].stock, 5)
})

test('settle paid: Pending -> Selesai, stok tetap terpotong', () => {
  const ps = products()
  const c = checkout({ products: ps, transactions: [], draft: draft({ method: 'QRIS (simulasi)' }) })
  const s = settlePaymentResult({ products: c.products, transactions: [c.transaction], txId: 'TRX-0001', paymentStatus: 'paid', paymentId: 'PAY-X' })
  assert.equal(s.transactions[0].status, 'Selesai')
  assert.equal(s.products.find((p) => p.id === 'p1').stock, 3)
})

test('settle expired/cancelled/failed: Dibatalkan, stok kembali tepat sekali', () => {
  for (const status of ['expired', 'cancelled', 'failed']) {
    const c = checkout({ products: products(), transactions: [], draft: draft({ method: 'QRIS (simulasi)' }) })
    const s1 = settlePaymentResult({ products: c.products, transactions: [c.transaction], txId: 'TRX-0001', paymentStatus: status })
    assert.equal(s1.transactions[0].status, 'Dibatalkan')
    assert.equal(s1.products.find((p) => p.id === 'p1').stock, 5)
    const s2 = settlePaymentResult({ products: s1.products, transactions: s1.transactions, txId: 'TRX-0001', paymentStatus: status })
    assert.equal(s2.changed, false)
    assert.equal(s2.products.find((p) => p.id === 'p1').stock, 5)
  }
})

test('settle idempoten: transaksi Selesai tidak bisa dibatalkan lewat settle', () => {
  const c = checkout({ products: products(), transactions: [], draft: draft() })
  const s = settlePaymentResult({ products: c.products, transactions: [c.transaction], txId: 'TRX-0001', paymentStatus: 'expired' })
  assert.equal(s.changed, false)
  assert.equal(s.transactions[0].status, 'Selesai')
})

test('settle: transaksi tak ada & status tak dikenal', () => {
  assert.equal(settlePaymentResult({ products: [], transactions: [], txId: 'X', paymentStatus: 'paid' }).code, 'not_found')
  const c = checkout({ products: products(), transactions: [], draft: draft({ method: 'QRIS (simulasi)' }) })
  assert.equal(settlePaymentResult({ products: c.products, transactions: [c.transaction], txId: 'TRX-0001', paymentStatus: 'zzz' }).code, 'invalid_status')
})

test('hapus transaksi: stok dikembalikan kecuali transaksi sudah dibatalkan', () => {
  const c = checkout({ products: products(), transactions: [], draft: draft({ method: 'QRIS (simulasi)' }) })
  assert.equal(itemsToRestoreOnDelete(c.transaction).length, 1)
  const s = settlePaymentResult({ products: c.products, transactions: [c.transaction], txId: 'TRX-0001', paymentStatus: 'expired' })
  assert.equal(itemsToRestoreOnDelete(s.transactions[0]).length, 0)
})

test('alur lengkap QRIS: checkout -> pembayaran -> event paid -> Selesai', () => {
  const c = checkout({ products: products(), transactions: [], draft: draft({ method: 'QRIS (simulasi)' }), now: new Date(2026, 9, 18, 10, 5) })
  assert.equal(c.transaction.time, '10:05')
  const pay = createPayment({ checkoutId: c.transaction.checkoutId, txId: c.transaction.id, amount: c.transaction.total, now: T0 })
  assert.equal(pay.amount, 50000)
  const ev = applyProviderEvent(pay, simulateProviderEvent(pay, 'payment.paid', { now: T0 + 5000 }), T0 + 6000)
  assert.equal(ev.payment.status, PAYMENT_STATUS.PAID)
  const s = settlePaymentResult({ products: c.products, transactions: [c.transaction], txId: c.transaction.id, paymentStatus: ev.payment.status, paymentId: ev.payment.id })
  assert.equal(s.transactions[0].status, TX_STATUS.DONE)
})
