/**
 * pos.js — logika checkout POS dan stok yang murni (tanpa React/localStorage).
 *
 * Aturan:
 *  - Satu checkoutId hanya boleh menghasilkan satu transaksi (anti transaksi ganda).
 *  - Stok divalidasi lalu langsung dipesan (dikurangi) saat transaksi dibuat.
 *  - QRIS dibuat berstatus Pending sampai pembayaran terkonfirmasi lewat payments.js.
 *  - Pembayaran gagal/kedaluwarsa/dibatalkan -> transaksi Dibatalkan dan stok
 *    dikembalikan tepat satu kali.
 *  - Hanya transaksi berstatus Selesai yang dihitung sebagai pendapatan.
 */

export const TX_STATUS = Object.freeze({ DONE: 'Selesai', PENDING: 'Pending', CANCELLED: 'Dibatalkan' })
export const isQris = (method) => typeof method === 'string' && method.startsWith('QRIS')

function nextTxId(transactions) {
  let max = 0
  for (const t of transactions) {
    const m = /^TRX-(\d+)$/.exec(t.id || '')
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return `TRX-${String(max + 1).padStart(4, '0')}`
}

function qtyByProduct(items) {
  const map = {}
  for (const i of items) if (i.productId) map[i.productId] = (map[i.productId] || 0) + i.qty
  return map
}

/** Mengembalikan daftar pesan error (kosong = valid). `restore` = item lama yang stoknya dikembalikan (untuk edit). */
export function validateSale(products, items, restore = []) {
  const errors = []
  if (!Array.isArray(items) || items.length === 0) return ['Keranjang kosong.']
  const need = qtyByProduct(items)
  const back = qtyByProduct(restore)
  for (const i of items) {
    if (!Number.isInteger(i.qty) || i.qty < 1) errors.push(`Qty ${i.name || 'item'} harus bilangan bulat minimal 1.`)
    if (!Number.isFinite(i.price) || i.price < 0) errors.push(`Harga ${i.name || 'item'} tidak valid.`)
  }
  for (const pid of Object.keys(need)) {
    const p = products.find((x) => x.id === pid)
    if (!p) {
      errors.push('Ada produk yang sudah tidak ada di inventaris.')
      continue
    }
    const available = p.stock + (back[pid] || 0)
    if (need[pid] > available) errors.push(`Stok ${p.name} tidak cukup (tersedia ${available}, diminta ${need[pid]}).`)
  }
  return errors
}

export function adjustStock(products, items, sign) {
  const delta = qtyByProduct(items)
  return products.map((p) => (delta[p.id] ? { ...p, stock: p.stock + sign * delta[p.id] } : p))
}

/** Checkout murni: tidak mengubah argumen, mengembalikan state baru atau error. */
export function checkout({ products, transactions, draft, now = new Date() }) {
  if (!draft || !draft.checkoutId) return { ok: false, code: 'invalid', error: 'checkoutId wajib ada.' }
  const existing = transactions.find((t) => t.checkoutId === draft.checkoutId)
  if (existing) {
    return { ok: false, code: 'duplicate', error: `Transaksi ini sudah tersimpan sebagai ${existing.id}.`, transaction: existing }
  }
  const items = draft.items || []
  const errors = validateSale(products, items)
  if (errors.length) return { ok: false, code: 'invalid', error: errors[0], errors }

  const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0)
  const discount = Number(draft.discount) || 0
  if (!Number.isFinite(discount) || discount < 0) return { ok: false, code: 'invalid', error: 'Diskon tidak boleh negatif.' }
  if (discount > subtotal) return { ok: false, code: 'invalid', error: 'Diskon melebihi subtotal.' }

  const pad = (n) => String(n).padStart(2, '0')
  const transaction = {
    id: nextTxId(transactions),
    checkoutId: draft.checkoutId,
    date: draft.date || `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: draft.time || `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    customer: (draft.customer || '').trim() || 'Pelanggan Umum',
    items: items.map((i) => ({ ...i })),
    subtotal,
    discount,
    total: subtotal - discount,
    cogs: items.reduce((s, i) => s + i.qty * (i.cost || 0), 0),
    category: draft.category || items[0].category || 'Lainnya',
    method: draft.method,
    status: isQris(draft.method) ? TX_STATUS.PENDING : TX_STATUS.DONE,
    note: draft.note || '',
    paymentId: null,
    stockReleased: false,
  }
  return { ok: true, products: adjustStock(products, items, -1), transaction }
}

/** Menerapkan hasil pembayaran ke transaksi + stok. Idempoten: hanya transaksi Pending yang berubah. */
export function settlePaymentResult({ products, transactions, txId, paymentStatus, paymentId = null }) {
  const tx = transactions.find((t) => t.id === txId)
  if (!tx) return { ok: false, code: 'not_found', error: 'Transaksi tidak ditemukan.' }
  if (tx.status !== TX_STATUS.PENDING) return { ok: true, changed: false, products, transactions }

  let nextProducts = products
  let nextTx
  if (paymentStatus === 'paid') {
    nextTx = { ...tx, status: TX_STATUS.DONE, paymentId: paymentId || tx.paymentId }
  } else if (['expired', 'cancelled', 'failed'].includes(paymentStatus)) {
    if (!tx.stockReleased) nextProducts = adjustStock(products, tx.items, +1)
    nextTx = { ...tx, status: TX_STATUS.CANCELLED, stockReleased: true, paymentId: paymentId || tx.paymentId }
  } else {
    return { ok: false, code: 'invalid_status', error: `Status pembayaran tidak dikenal: ${paymentStatus}` }
  }
  return { ok: true, changed: true, products: nextProducts, transactions: transactions.map((t) => (t.id === txId ? nextTx : t)) }
}

/** Item yang stoknya harus dikembalikan ketika transaksi dihapus. Transaksi batal sudah dikembalikan stoknya. */
export function itemsToRestoreOnDelete(tx) {
  return tx.stockReleased || tx.status === TX_STATUS.CANCELLED ? [] : tx.items
}
