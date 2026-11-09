# UMKM Solution

**QRIS-Integrated Business & Financial Analytics**: aplikasi web untuk membantu pelaku UMKM (fokus toko retail/elektronik) mencatat penjualan, stok, dan pengeluaran, lalu melihat analitik keuangan dalam satu dashboard.

Dibuat untuk **GTNIC 2026, Web Development**. Tema: *Accelerating Digital Transformation for Business and SMEs*.

- **Website (live):** https://umkm-solution-opal.vercel.app
- **Repository:** https://github.com/andika804/umkm-solution
- **Tim:** [QUBIX MANSACIL]

---

## Masalah yang diselesaikan

Banyak UMKM masih mencatat penjualan dan stok di buku atau di kepala. Akibatnya:

- untung rugi yang sebenarnya tidak diketahui,
- stok habis atau menumpuk tanpa disadari,
- pembayaran digital (QRIS) tidak terhubung dengan pencatatan keuangan,
- pemilik usaha mengambil keputusan berdasarkan perkiraan, bukan data.

UMKM Solution menyatukan pencatatan, stok, pengeluaran, dan analitik di satu tempat yang bisa dibuka dari HP maupun laptop.

## Fitur

| Fitur | Keterangan |
|---|---|
| Dashboard | Ringkasan pendapatan, pengeluaran, dan tren dalam satu layar |
| Transaksi | Mencatat penjualan, dengan pencarian dan filter (tanggal, kategori, metode bayar, status) |
| Produk & Stok | Daftar produk, jumlah stok, dan penanda stok menipis |
| Pengeluaran | Mencatat biaya operasional (termasuk pembelian barang) |
| Analitik | Grafik dan laporan keuangan dihitung otomatis dari data |
| Business Advisor | Saran bisnis berbasis aturan (rule-based) dari data penjualan dan stok |
| Pembayaran QRIS (**DEMO**) | Simulasi pembayaran QRIS berlabel DEMO |
| Database | Data tersimpan di PostgreSQL (Supabase) dan dimuat ulang saat aplikasi dibuka |
| Akun | Daftar dan masuk; satu akun demo tersedia |

### Batasan yang perlu diketahui (kami tulis apa adanya)

- **QRIS adalah simulasi.** Tidak ada merchant ID dan tidak ada uang yang bergerak. Semua tampilannya diberi label **DEMO**. Struktur kodenya disiapkan agar bisa disambungkan ke payment gateway sungguhan.
- **Business Advisor memakai aturan, bukan AI.** Tidak ada API key AI di aplikasi ini. Jika `ANTHROPIC_API_KEY` tidak diatur, sistem memakai analisis berbasis aturan dan menyatakannya dengan jelas.
- **Login masih simulasi** (disimpan di browser, tanpa server autentikasi). Untuk produksi diperlukan Supabase Auth.
- **Kebijakan akses database masih tingkat demo** (Row Level Security dengan policy terbuka untuk kunci anon). Jangan menyimpan data sensitif sungguhan di versi ini.
- Penyimpanan data memakai strategi *last-write-wins*.

## Akun demo

```
Email    : demo@umkmsolution.id
Password : demo1234
```

Data contoh dimuat otomatis agar dashboard tidak kosong. Setiap browser mendapat ruang data demo sendiri.

## Teknologi

- **Bahasa:** JavaScript (ES2022), HTML, CSS
- **Library:** React
- **Build tool:** Vite
- **Database:** PostgreSQL (Supabase), diakses lewat REST API (PostgREST) memakai `fetch`, tanpa library tambahan
- **Cadangan lokal:** `localStorage`
- **Hosting:** Vercel (frontend) dan Supabase (database)
- **Version control:** Git dan GitHub
- **Lisensi pihak ketiga:** React dan Vite berlisensi MIT; PostgreSQL berlisensi PostgreSQL License

## Arsitektur

```
Browser (HP/laptop)
   │ HTTPS
Vercel: React + Vite (single-page application)
   │
Aplikasi di browser
   ├─ UI: Dashboard, Transaksi, Stok, Pengeluaran, Analitik, Advisor, Pengaturan
   ├─ Logika: simulasi QRIS (DEMO), Business Advisor, perhitungan laporan
   └─ Lapisan data (src/lib/db.js)
        ├─ localStorage  → cache dan cadangan saat offline
        └─ REST (fetch)  → Supabase PostgreSQL (tabel records + RLS)
```

Lapisan data membaca dari database saat aplikasi dibuka, menyimpan perubahan dengan jeda 0,7 detik, memakai antrean per koleksi agar tidak saling menimpa, melewati penyimpanan jika data tidak berubah, dan mencoba lagi otomatis bila database tidak terjangkau. Status koneksi tampil di sidebar ("Database: tersinkron").

## Skema database

Satu tabel `records`; setiap produk, transaksi, dan pengeluaran menjadi satu baris. Atribut disimpan di kolom JSONB `data`.

| Kolom | Tipe | Keterangan |
|---|---|---|
| `workspace_id` | text | memisahkan data tiap usaha/pengguna |
| `collection` | text | `products`, `transactions`, atau `expenses` |
| `id` | text | ID item |
| `data` | jsonb | isi item |
| `updated_at` | timestamptz | waktu terakhir diubah |

Primary key: `(workspace_id, collection, id)`. SQL lengkap ada di [`database/schema.sql`](database/schema.sql).

## Menjalankan secara lokal

Prasyarat: Node.js 20 atau lebih baru.

```bash
git clone https://github.com/andika804/umkm-solution.git
cd umkm-solution
npm install
```

1. Buat project di [Supabase](https://supabase.com).
2. Di **SQL Editor**, jalankan isi `database/schema.sql`.
3. Salin `.env.example` menjadi `.env`, lalu isi:

```
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=kunci_anon_atau_publishable
```

4. Jalankan:

```bash
npm run dev
```

Buka http://localhost:5173. Tanpa `.env`, aplikasi tetap berjalan memakai `localStorage` saja (lencana "Lokal saja").

**Keamanan:** hanya kunci **anon/publishable** yang dipakai di frontend. Jangan pernah memakai atau meng-commit kunci `service_role`. File `.env` sudah masuk `.gitignore`.

## Pengujian

```bash
node --test "test/*.test.js"
```

Pengujian mencakup lapisan database (dengan emulator PostgREST), pembayaran, kasir/stok, dan asisten.

## Deploy

Repository terhubung ke Vercel; setiap push ke `main` dideploy otomatis. Tambahkan `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` di **Settings → Environment Variables** Vercel, lalu redeploy.

## Struktur proyek

```
├── database/schema.sql      Skema tabel dan policy RLS
├── src/
│   ├── App.jsx              Antarmuka dan logika aplikasi
│   ├── App.css, index.css   Gaya
│   ├── main.jsx             Titik masuk
│   └── lib/                 db.js (klien database), cloud.jsx (sinkronisasi), dan modul pendukung
├── test/                    Pengujian
├── .env.example             Contoh variabel lingkungan
└── README.md
```

## Rencana pengembangan

- Supabase Auth dengan RLS per pengguna
- Integrasi payment gateway QRIS sungguhan melalui backend/serverless function
- Asisten AI melalui endpoint server (API key tidak pernah di frontend)
- Pemisahan data menjadi tabel relasional
- Fitur target penjualan

## Tampilan

> Tambahkan tangkapan layar di folder `docs/` lalu tautkan di sini.

## Lisensi

Karya ini dibuat untuk kompetisi GTNIC 2026. Hak cipta pada tim penyusun.
