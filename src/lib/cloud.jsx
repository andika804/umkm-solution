import { useEffect, useRef, useSyncExternalStore } from 'react'
import './cloud.css'
import { createDb, hydrate, describeStorage, explainError } from './db.js'
import { DB_URL, DB_KEY } from './dbConfig.js'

export const db = createDb({ url: DB_URL, key: DB_KEY })

const BROWSER_KEY = 'umkmsolution.browser.v1'

export function getBrowserId() {
  try {
    let id = window.localStorage.getItem(BROWSER_KEY)
    if (!id) {
      id = `b${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
      window.localStorage.setItem(BROWSER_KEY, id)
    }
    return id
  } catch {
    return 'b-anon'
  }
}

export function useDbStatus() {
  return useSyncExternalStore(db.subscribe, db.getStatus, db.getStatus)
}

export { describeStorage }

/** Lencana status database kecil untuk sidebar. */
export function DbBadge() {
  const s = useDbStatus()
  const labels = {
    off: 'Lokal saja',
    idle: 'Database: menghubungkan',
    syncing: 'Database: menyinkronkan',
    synced: 'Database: tersinkron',
    error: 'Database: terputus',
  }
  const title = describeStorage(s, db.configured) + (s.error ? ` (${explainError(s.error)})` : '')
  return (
    <span className={`db-badge db-${s.state}`} title={title}>
      <i aria-hidden="true" /> {labels[s.state] || labels.off}
    </span>
  )
}

/**
 * Menyinkronkan satu koleksi (produk/transaksi/pengeluaran) dengan database.
 * - Saat workspace tersedia: baca dari database (atau isi database dengan data lokal).
 * - Setelah itu setiap perubahan disimpan ke database (ditunda 0,7 detik).
 * - Jika database tidak terjangkau, data lokal tetap dipakai dan dicoba lagi berkala.
 */
export function useRemoteSync({ collection, value, setValue, workspace, validate }) {
  const ready = useRef(null)
  const latest = useRef(value)
  latest.current = value

  useEffect(() => {
    ready.current = null
    if (!workspace || !db.configured) return undefined
    let cancelled = false
    let timer = null
    let attempts = 0
    const run = async () => {
      const r = await hydrate({ db, workspace, collection, local: latest.current, validate })
      if (cancelled) return
      if (r.action === 'error') {
        attempts += 1
        if (attempts <= 5) timer = setTimeout(run, 15000)
        return
      }
      if (r.action === 'use_remote') setValue(r.rows)
      ready.current = workspace
    }
    run()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace, collection])

  useEffect(() => {
    if (!workspace || ready.current !== workspace || !db.configured) return undefined
    const t = setTimeout(() => {
      db.sync(workspace, collection, value)
    }, 700)
    return () => clearTimeout(t)
  }, [value, workspace, collection])
}
