import test from 'node:test'
import assert from 'node:assert/strict'
import { createDb, hydrate, workspaceIdFor, hashId, describeStorage, explainError } from '../src/lib/db.js'

/** Emulator kecil PostgREST untuk tabel records: GET (filter eq), POST upsert, DELETE (id in). */
function fakeSupabase({ failWith = null, table = new Map() } = {}) {
  const calls = []
  const keyOf = (r) => `${r.workspace_id}|${r.collection}|${r.id}`
  const parse = (u) => {
    const url = new URL(u)
    const q = {}
    for (const [k, v] of url.searchParams) q[k] = v
    return { url, q }
  }
  const eq = (v) => (v || '').replace(/^eq\./, '')
  const fetchImpl = async (u, opts = {}) => {
    const { url, q } = parse(u)
    const method = opts.method || 'GET'
    calls.push({ method, path: url.pathname, query: url.search, headers: opts.headers, body: opts.body ? JSON.parse(opts.body) : undefined })
    if (failWith === 'throw') throw Object.assign(new Error('x'), { name: 'TypeError' })
    if (typeof failWith === 'number') return { ok: false, status: failWith, json: async () => ({}) }
    if (method === 'GET') {
      // database sungguhan tidak menjamin urutan: balik urutannya agar tes urutan bermakna
      const rows = [...table.values()].filter((r) => r.workspace_id === eq(q.workspace_id) && r.collection === eq(q.collection)).reverse()
      const sel = (q.select || '').split(',')
      return { ok: true, status: 200, json: async () => rows.map((r) => Object.fromEntries(sel.map((c) => [c, r[c]]))) }
    }
    if (method === 'POST') {
      for (const r of JSON.parse(opts.body)) table.set(keyOf(r), r)
      return { ok: true, status: 201, json: async () => ({}) }
    }
    if (method === 'DELETE') {
      const inList = q.id.replace(/^in\.\(/, '').replace(/\)$/, '').split(',').map((s) => s.replace(/^"|"$/g, ''))
      for (const [k, r] of [...table]) {
        if (r.workspace_id === eq(q.workspace_id) && r.collection === eq(q.collection) && inList.includes(r.id)) table.delete(k)
      }
      return { ok: true, status: 204, json: async () => ({}) }
    }
    return { ok: false, status: 405, json: async () => ({}) }
  }
  return { fetchImpl, calls, table }
}

const mk = (opts, dbOpts = {}) => {
  const f = fakeSupabase(opts)
  const db = createDb({ url: 'https://abc.supabase.co/', key: 'sb_publishable_test', fetchImpl: f.fetchImpl, ...dbOpts })
  return { ...f, db }
}
const products = [
  { id: 'p1', name: 'Kabel', price: 10000, cost: 6000, stock: 5, min: 2 },
  { id: 'p2', name: 'Charger', price: 50000, cost: 30000, stock: 9, min: 3 },
  { id: 'p3', name: 'Mouse', price: 90000, cost: 60000, stock: 1, min: 2 },
]

test('tanpa URL/kunci: tidak terkonfigurasi, tidak memanggil jaringan, status off', async () => {
  let called = 0
  const db = createDb({ url: '', key: '', fetchImpl: async () => { called++ } })
  assert.equal(db.configured, false)
  assert.equal(db.getStatus().state, 'off')
  assert.deepEqual(await db.pull('w', 'products'), { ok: false, error: 'not_configured' })
  assert.deepEqual(await db.sync('w', 'products', products), { ok: false, error: 'not_configured' })
  assert.equal(called, 0)
  assert.match(describeStorage(db.getStatus(), db.configured), /localStorage/)
})

test('URL tidak valid dianggap belum dikonfigurasi', () => {
  assert.equal(createDb({ url: 'bukan-url', key: 'k', fetchImpl: async () => {} }).configured, false)
})

test('sync lalu pull: data tersimpan di database dan kembali dengan urutan yang sama', async () => {
  const { db, table } = mk()
  const r = await db.sync('ws1', 'products', products)
  assert.equal(r.ok, true)
  assert.equal(table.size, 3)
  const db2 = createDb({ url: 'https://abc.supabase.co', key: 'k', fetchImpl: mk({ table }).fetchImpl }) // klien baru = perangkat lain
  const pulled = await db2.pull('ws1', 'products')
  assert.deepEqual(pulled.rows, products) // _pos dibuang, urutan sama
})

test('workspace saling terpisah', async () => {
  const { db, table } = mk()
  await db.sync('wsA', 'products', products)
  await db.sync('wsB', 'products', [products[0]])
  assert.equal((await db.pull('wsA', 'products')).rows.length, 3)
  assert.equal((await db.pull('wsB', 'products')).rows.length, 1)
  assert.equal(table.size, 4)
})

test('perubahan: ubah, tambah, dan hapus tercermin di database', async () => {
  const { db, table } = mk()
  await db.sync('w', 'products', products)
  const next = [{ ...products[0], stock: 4 }, products[2], { id: 'p9', name: 'Baru', price: 1, cost: 1, stock: 1, min: 1 }]
  const r = await db.sync('w', 'products', next)
  assert.equal(r.removed, 1)
  const rows = (await db.pull('w', 'products')).rows
  assert.deepEqual(rows.map((x) => x.id), ['p1', 'p3', 'p9'])
  assert.equal(rows[0].stock, 4)
  assert.equal([...table.values()].filter((x) => x.id === 'p2').length, 0)
})

test('mengosongkan daftar menghapus semua baris koleksi itu saja', async () => {
  const { db, table } = mk()
  await db.sync('w', 'products', products)
  await db.sync('w', 'expenses', [{ id: 'EXP-1', amount: 5 }])
  await db.sync('w', 'products', [])
  assert.equal(table.size, 1)
  assert.equal([...table.values()][0].collection, 'expenses')
})

test('sync data yang sama tidak mengirim ulang (hemat permintaan)', async () => {
  const { db, calls } = mk()
  await db.sync('w', 'products', products)
  const n = calls.length
  const r = await db.sync('w', 'products', products)
  assert.equal(r.skipped, true)
  assert.equal(calls.length, n)
})

test('pull lalu sync data hasil pull tidak memicu tulis ulang', async () => {
  const { db, calls, table } = mk()
  await db.sync('w', 'products', products)
  const { rows } = await db.pull('w', 'products')
  const n = calls.length
  assert.equal((await db.sync('w', 'products', rows)).skipped, true)
  assert.equal(calls.length, n)
  assert.equal(table.size, 3)
})

test('header: apikey ada; kunci JWT (eyJ...) juga dikirim sebagai Bearer; kunci baru tidak', async () => {
  const a = mk()
  await a.db.sync('w', 'products', [products[0]])
  assert.equal(a.calls[0].headers.apikey, 'sb_publishable_test')
  assert.equal(a.calls[0].headers.authorization, undefined)
  const f = fakeSupabase()
  const db = createDb({ url: 'https://x.supabase.co', key: 'eyJhbGciOi.test.sig', fetchImpl: f.fetchImpl })
  await db.sync('w', 'products', [products[0]])
  assert.equal(f.calls[0].headers.authorization, 'Bearer eyJhbGciOi.test.sig')
})

test('permintaan upsert memakai on_conflict dan merge-duplicates', async () => {
  const { db, calls } = mk()
  await db.sync('w', 'products', products)
  const post = calls.find((c) => c.method === 'POST')
  assert.match(post.query, /on_conflict=workspace_id,collection,id/)
  assert.match(post.headers.prefer, /merge-duplicates/)
  assert.ok(post.path.endsWith('/rest/v1/records'))
})

test('data besar dipecah per 200 baris', async () => {
  const { db, calls, table } = mk()
  const big = Array.from({ length: 450 }, (_, i) => ({ id: `T${i}`, total: i }))
  assert.equal((await db.sync('w', 'transactions', big)).ok, true)
  assert.equal(calls.filter((c) => c.method === 'POST').length, 3)
  assert.equal(table.size, 450)
  const rows = (await db.pull('w', 'transactions')).rows
  assert.equal(rows.length, 450)
  assert.equal(rows[449].id, 'T449')
})

test('kesalahan dilaporkan dengan kode yang jelas dan status error, tanpa melempar', async () => {
  for (const [fail, code] of [[401, 'auth'], [403, 'auth'], [404, 'table_missing'], [500, 'http_500'], ['throw', 'network']]) {
    const { db } = mk({ failWith: fail })
    const r = await db.pull('w', 'products')
    assert.equal(r.ok, false)
    assert.equal(r.error, code)
    assert.equal(db.getStatus().state, 'error')
    assert.equal(db.getStatus().error, code)
    assert.ok(explainError(code).length > 10)
  }
})

test('timeout dilaporkan sebagai timeout', async () => {
  const db = createDb({ url: 'https://a.supabase.co', key: 'k', timeoutMs: 20, fetchImpl: (u, o) => new Promise((_, rej) => o.signal.addEventListener('abort', () => rej(Object.assign(new Error('a'), { name: 'AbortError' })))) })
  assert.equal((await db.pull('w', 'products')).error, 'timeout')
})

test('status pulih menjadi synced setelah kegagalan lalu berhasil', async () => {
  const f = fakeSupabase({ failWith: 500 })
  const db = createDb({ url: 'https://a.supabase.co', key: 'k', fetchImpl: f.fetchImpl })
  await db.sync('w', 'products', products)
  assert.equal(db.getStatus().state, 'error')
  const ok = fakeSupabase({ table: f.table })
  const db2 = createDb({ url: 'https://a.supabase.co', key: 'k', fetchImpl: ok.fetchImpl })
  await db2.sync('w', 'products', products)
  assert.equal(db2.getStatus().state, 'synced')
  assert.ok(db2.getStatus().lastSyncAt)
  assert.equal(db2.getStatus().error, null)
})

test('pendengar status dipanggil dan bisa berhenti berlangganan', async () => {
  const { db } = mk()
  const seen = []
  const off = db.subscribe(() => seen.push(db.getStatus().state))
  await db.sync('w', 'products', products)
  assert.deepEqual(seen, ['syncing', 'synced'])
  off()
  await db.sync('w', 'products', [])
  assert.equal(seen.length, 2)
})

test('penyimpanan beruntun pada koleksi yang sama berjalan berurutan (data akhir = terakhir)', async () => {
  const { db, table } = mk()
  const a = db.sync('w', 'products', products)
  const b = db.sync('w', 'products', [products[0]])
  const c = db.sync('w', 'products', [products[1], products[2]])
  await Promise.all([a, b, c])
  assert.deepEqual([...table.values()].map((r) => r.id).sort(), ['p2', 'p3'])
})

test('data tidak valid ditolak sebelum menyentuh jaringan', async () => {
  const { db, calls } = mk()
  assert.equal((await db.sync('w', 'products', [{ name: 'tanpa id' }])).error, 'invalid')
  assert.equal((await db.sync('w', 'products', 'bukan array')).error, 'invalid')
  assert.equal(calls.length, 0)
})

test('hydrate: database kosong + data lokal -> mengisi database (seeded)', async () => {
  const { db, table } = mk()
  const r = await hydrate({ db, workspace: 'w', collection: 'products', local: products })
  assert.equal(r.action, 'seeded')
  assert.equal(table.size, 3)
})

test('hydrate: database berisi -> memakai data database', async () => {
  const { db } = mk()
  await db.sync('w', 'products', products)
  const db2 = createDb({ url: 'https://a.supabase.co', key: 'k', fetchImpl: mk({ table: new Map() }).fetchImpl })
  void db2
  const r = await hydrate({ db, workspace: 'w', collection: 'products', local: [{ id: 'lama' }] })
  assert.equal(r.action, 'use_remote')
  assert.deepEqual(r.rows, products)
})

test('hydrate: data database rusak menurut validator -> tidak dipakai', async () => {
  const { db } = mk()
  await db.sync('w', 'products', products)
  const r = await hydrate({ db, workspace: 'w', collection: 'products', local: products, validate: () => false })
  assert.equal(r.action, 'invalid_remote')
})

test('hydrate: database error -> aksi error, data lokal tidak disentuh', async () => {
  const { db } = mk({ failWith: 'throw' })
  const r = await hydrate({ db, workspace: 'w', collection: 'products', local: products })
  assert.deepEqual(r, { action: 'error', error: 'network' })
})

test('hydrate: keduanya kosong -> empty, tanpa tulis', async () => {
  const { db, calls } = mk()
  const r = await hydrate({ db, workspace: 'w', collection: 'products', local: [] })
  assert.equal(r.action, 'empty')
  assert.equal(calls.filter((c) => c.method !== 'GET').length, 0)
})

test('skenario perangkat berbeda: perangkat B memuat data yang disimpan perangkat A', async () => {
  const table = new Map()
  const A = createDb({ url: 'https://a.supabase.co', key: 'k', fetchImpl: fakeSupabase({ table }).fetchImpl })
  const B = createDb({ url: 'https://a.supabase.co', key: 'k', fetchImpl: fakeSupabase({ table }).fetchImpl })
  const ws = workspaceIdFor({ email: 'Toko@Contoh.com ', isDemo: false })
  await A.sync(ws, 'transactions', [{ id: 'TRX-0002', total: 2 }, { id: 'TRX-0001', total: 1 }])
  const r = await hydrate({ db: B, workspace: ws, collection: 'transactions', local: [] })
  assert.equal(r.action, 'use_remote')
  assert.deepEqual(r.rows.map((x) => x.id), ['TRX-0002', 'TRX-0001'])
})

test('workspaceIdFor: akun demo per-browser; akun lain stabil dan tidak peka huruf besar/spasi', () => {
  assert.equal(workspaceIdFor({ email: 'demo@umkmsolution.id', isDemo: true, browserId: 'b1' }), 'demo-b1')
  assert.notEqual(workspaceIdFor({ email: 'x', isDemo: true, browserId: 'b1' }), workspaceIdFor({ email: 'x', isDemo: true, browserId: 'b2' }))
  const a = workspaceIdFor({ email: 'Andi@Mail.com', isDemo: false })
  assert.equal(a, workspaceIdFor({ email: ' andi@mail.com ', isDemo: false }))
  assert.notEqual(a, workspaceIdFor({ email: 'budi@mail.com', isDemo: false }))
  assert.match(a, /^u-[0-9a-f]+$/)
  assert.ok(!a.includes('andi'))
  assert.equal(hashId('x'), hashId('x'))
})

test('describeStorage: teks sesuai status', () => {
  assert.match(describeStorage({ state: 'synced' }, true), /tersinkron/)
  assert.match(describeStorage({ state: 'syncing' }, true), /menyinkronkan/)
  assert.match(describeStorage({ state: 'error', error: 'network' }, true), /tetap tersimpan di browser/)
  assert.match(describeStorage({ state: 'idle' }, true), /menghubungkan/)
  assert.match(describeStorage({ state: 'off' }, false), /belum dikonfigurasi/)
})

test('kunci tidak pernah muncul di URL permintaan', async () => {
  const { db, calls } = mk()
  await db.sync('w', 'products', products)
  await db.pull('w', 'products')
  assert.ok(calls.every((c) => !c.path.includes('sb_publishable_test') && !c.query.includes('sb_publishable_test')))
})
