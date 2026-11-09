/**
 * db.js — klien database untuk UMKM Solution (PostgreSQL via Supabase REST/PostgREST).
 *
 * - Tanpa dependensi tambahan: hanya fetch().
 * - Satu tabel `records` (workspace_id, collection, id, data jsonb). Setiap produk,
 *   transaksi, dan pengeluaran menjadi satu baris. Skema ada di database/schema.sql.
 * - localStorage tetap dipakai sebagai cache/cadangan. Database adalah sumber data
 *   bersama: saat aplikasi dibuka, data dibaca dari database; setiap perubahan disimpan ke sana.
 * - Kunci yang dipakai di browser adalah kunci publik (anon/publishable). Keamanan
 *   sesungguhnya ditentukan oleh kebijakan RLS di database (lihat catatan di README).
 * - Semua kegagalan jaringan/database ditangkap dan dilaporkan lewat status; aplikasi
 *   tidak pernah crash dan data tetap aman di browser.
 */

const TABLE = 'records'
const CHUNK = 200
const DELETE_CHUNK = 100

/** Hash non-kriptografis (cyrb53) untuk membuat ID workspace dari email. BUKAN keamanan. */
export function hashId(text) {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16)
}

/**
 * ID workspace data. Akun demo dipakai bersama banyak orang, jadi tiap browser mendapat
 * workspace demo sendiri agar data satu pengunjung tidak tertimpa pengunjung lain.
 * Akun yang didaftarkan sendiri memakai hash email sehingga data bisa dimuat di perangkat lain.
 */
export function workspaceIdFor({ email, isDemo, browserId }) {
  if (isDemo) return `demo-${browserId || 'anon'}`
  return `u-${hashId(String(email || '').trim().toLowerCase())}`
}

export function explainError(code) {
  switch (code) {
    case 'not_configured':
      return 'Database belum dikonfigurasi (URL/kunci belum diisi).'
    case 'timeout':
      return 'Database tidak merespons (timeout).'
    case 'network':
      return 'Tidak bisa terhubung ke database (periksa koneksi internet).'
    case 'auth':
      return 'Database menolak akses (kunci salah atau kebijakan RLS belum dibuat).'
    case 'table_missing':
      return 'Tabel "records" belum ada. Jalankan database/schema.sql di Supabase.'
    case 'bad_response':
      return 'Respons database tidak dikenali.'
    case 'invalid':
      return 'Data tidak valid untuk disimpan.'
    default:
      return `Database membalas error (${code}).`
  }
}

function codeForStatus(status) {
  if (status === 401 || status === 403) return 'auth'
  if (status === 404) return 'table_missing'
  return `http_${status}`
}

const quote = (id) => `"${String(id).replace(/["\\]/g, '')}"`
const byPos = (a, b) => ((a.data && a.data._pos) || 0) - ((b.data && b.data._pos) || 0)

export function createDb({ url, key, fetchImpl = globalThis.fetch, timeoutMs = 12000 } = {}) {
  const configured = Boolean(url && key && /^https?:\/\/\S+$/.test(url) && typeof fetchImpl === 'function')
  const base = configured ? url.replace(/\/+$/, '') : ''
  const known = new Map() // `${ws}|${col}` -> Set id yang diketahui ada di database
  const last = new Map() // `${ws}|${col}` -> JSON terakhir yang sudah tersinkron
  const chains = new Map() // antrean per koleksi agar penyimpanan tidak saling tumpang tindih
  const listeners = new Set()
  let inflight = 0
  let status = { state: configured ? 'idle' : 'off', lastSyncAt: null, error: null }

  const setStatus = (patch) => {
    status = { ...status, ...patch }
    listeners.forEach((fn) => {
      try {
        fn()
      } catch {
        /* pendengar tidak boleh menjatuhkan sinkronisasi */
      }
    })
  }

  async function request(path, { method = 'GET', body, prefer } = {}) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const headers = { apikey: key, 'content-type': 'application/json' }
      if (key.startsWith('eyJ')) headers.authorization = `Bearer ${key}`
      if (prefer) headers.prefer = prefer
      const res = await fetchImpl(`${base}/rest/v1/${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      })
      if (!res.ok) return { ok: false, error: codeForStatus(res.status) }
      if (method !== 'GET') return { ok: true }
      const json = await res.json()
      return { ok: true, json }
    } catch (e) {
      return { ok: false, error: e && e.name === 'AbortError' ? 'timeout' : 'network' }
    } finally {
      clearTimeout(timer)
    }
  }

  async function track(fn) {
    inflight++
    setStatus({ state: 'syncing' })
    let result
    try {
      result = await fn()
    } catch {
      result = { ok: false, error: 'network' }
    }
    inflight--
    if (result.ok) {
      if (inflight === 0) setStatus({ state: 'synced', lastSyncAt: Date.now(), error: null })
    } else {
      setStatus({ state: inflight === 0 ? 'error' : 'syncing', error: result.error })
    }
    return result
  }

  const filter = (ws, col) => `workspace_id=eq.${encodeURIComponent(ws)}&collection=eq.${encodeURIComponent(col)}`

  /** Membaca seluruh isi satu koleksi dari database (urutan asli dipertahankan). */
  function pull(workspace, collection) {
    if (!configured) return Promise.resolve({ ok: false, error: 'not_configured' })
    return track(async () => {
      const r = await request(`${TABLE}?select=id,data&${filter(workspace, collection)}&limit=10000`)
      if (!r.ok) return r
      if (!Array.isArray(r.json)) return { ok: false, error: 'bad_response' }
      const valid = r.json.filter((x) => x && x.data && typeof x.data === 'object' && !Array.isArray(x.data))
      const rows = valid.sort(byPos).map((x) => {
        const { _pos, ...rest } = x.data
        return rest
      })
      const k = `${workspace}|${collection}`
      known.set(k, new Set(valid.map((x) => String(x.id))))
      last.set(k, JSON.stringify(rows))
      return { ok: true, rows }
    })
  }

  /** Menyamakan database dengan `list` (tambah/ubah lewat upsert, hapus yang sudah tidak ada). */
  function sync(workspace, collection, list) {
    if (!configured) return Promise.resolve({ ok: false, error: 'not_configured' })
    if (!Array.isArray(list) || list.some((i) => !i || i.id === undefined || i.id === null)) {
      return Promise.resolve({ ok: false, error: 'invalid' })
    }
    const k = `${workspace}|${collection}`
    const run = async () => {
      const json = JSON.stringify(list)
      if (last.get(k) === json) return { ok: true, skipped: true }
      return track(async () => {
        const stamp = new Date().toISOString()
        const rows = list.map((item, i) => ({
          workspace_id: workspace,
          collection,
          id: String(item.id),
          data: { ...item, _pos: i },
          updated_at: stamp,
        }))
        for (let i = 0; i < rows.length; i += CHUNK) {
          const r = await request(`${TABLE}?on_conflict=workspace_id,collection,id`, {
            method: 'POST',
            body: rows.slice(i, i + CHUNK),
            prefer: 'resolution=merge-duplicates,return=minimal',
          })
          if (!r.ok) return r
        }
        let ids = known.get(k)
        if (!ids) {
          const r = await request(`${TABLE}?select=id&${filter(workspace, collection)}&limit=10000`)
          if (!r.ok) return r
          if (!Array.isArray(r.json)) return { ok: false, error: 'bad_response' }
          ids = new Set(r.json.map((x) => String(x.id)))
        }
        const current = new Set(rows.map((r) => r.id))
        const removed = [...ids].filter((id) => !current.has(id))
        for (let i = 0; i < removed.length; i += DELETE_CHUNK) {
          const part = removed.slice(i, i + DELETE_CHUNK).map(quote).join(',')
          const r = await request(`${TABLE}?${filter(workspace, collection)}&id=in.(${encodeURIComponent(part)})`, { method: 'DELETE' })
          if (!r.ok) return r
        }
        known.set(k, current)
        last.set(k, json)
        return { ok: true, saved: rows.length, removed: removed.length }
      })
    }
    const prev = chains.get(k) || Promise.resolve()
    const next = prev.then(run, run)
    chains.set(k, next.catch(() => {}))
    return next
  }

  return {
    configured,
    pull,
    sync,
    getStatus: () => status,
    subscribe: (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
  }
}

/**
 * Keputusan saat aplikasi dibuka: pakai data dari database, isi database dengan data lokal
 * (pertama kali), atau tetap memakai data lokal bila database bermasalah.
 */
export async function hydrate({ db, workspace, collection, local, validate }) {
  const r = await db.pull(workspace, collection)
  if (!r.ok) return { action: 'error', error: r.error }
  if (r.rows.length > 0) {
    if (validate && !validate(r.rows)) return { action: 'invalid_remote' }
    return { action: 'use_remote', rows: r.rows }
  }
  if (Array.isArray(local) && local.length > 0) {
    const s = await db.sync(workspace, collection, local)
    return s.ok ? { action: 'seeded' } : { action: 'error', error: s.error }
  }
  return { action: 'empty' }
}

/** Teks status penyimpanan untuk antarmuka. */
export function describeStorage(status, configured) {
  if (!configured || status.state === 'off') return 'localStorage browser ini (database belum dikonfigurasi)'
  if (status.state === 'error') return `Database tidak terjangkau: ${explainError(status.error)} Data tetap tersimpan di browser ini.`
  if (status.state === 'syncing') return 'PostgreSQL (Supabase): sedang menyinkronkan…'
  if (status.state === 'synced') return 'PostgreSQL (Supabase): tersinkron, dengan cadangan localStorage'
  return 'PostgreSQL (Supabase): menghubungkan…'
}
