// Konfigurasi database dibaca dari environment Vite saat build.
// Nilai ini adalah kunci PUBLIK (anon/publishable) dan memang dirancang berada di frontend.
// Jangan pernah mengisi kunci rahasia (service_role) di sini.
export const DB_URL = (import.meta.env.VITE_SUPABASE_URL || '').trim()
export const DB_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()
