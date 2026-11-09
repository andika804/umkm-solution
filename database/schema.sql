-- UMKM Solution — skema database (PostgreSQL / Supabase)
-- Jalankan di Supabase: SQL Editor -> New query -> tempel -> Run.
--
-- Satu tabel `records` menyimpan produk, transaksi, dan pengeluaran:
--   workspace_id : ruang data satu pengguna/toko
--   collection   : 'products' | 'transactions' | 'expenses'
--   id           : ID dokumen (mis. TRX-0001)
--   data         : isi dokumen dalam JSONB
create table if not exists public.records (
  workspace_id text not null,
  collection   text not null,
  id           text not null,
  data         jsonb not null,
  updated_at   timestamptz not null default now(),
  primary key (workspace_id, collection, id)
);

alter table public.records enable row level security;

-- CATATAN KEAMANAN: kebijakan di bawah membuka akses penuh untuk kunci publik (anon)
-- agar prototipe lomba ini bisa dicoba tanpa login server. Ini cukup untuk demo, tetapi
-- BUKAN untuk produksi. Versi produksi harus memakai Supabase Auth dan kebijakan RLS
-- per pengguna (mis. using (workspace_id = auth.uid()::text)).
drop policy if exists "demo anon read" on public.records;
drop policy if exists "demo anon insert" on public.records;
drop policy if exists "demo anon update" on public.records;
drop policy if exists "demo anon delete" on public.records;
create policy "demo anon read"   on public.records for select to anon using (true);
create policy "demo anon insert" on public.records for insert to anon with check (true);
create policy "demo anon update" on public.records for update to anon using (true) with check (true);
create policy "demo anon delete" on public.records for delete to anon using (true);
