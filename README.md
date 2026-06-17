# Oppaya Gudang — Cara Deploy ke Vercel

Project ini sudah siap deploy. Tidak perlu install apa pun di laptop.

---

## LANGKAH 0 — Isi kredensial Supabase (PENTING, lakukan dulu)
Buka file `src/App.jsx`, cari 2 baris di bagian paling atas, ganti dengan punyamu:

```js
const SUPABASE_URL = "https://abcdxyz.supabase.co";   // Project URL dari Supabase
const SUPABASE_ANON_KEY = "eyJhbGciOi...";            // anon public key dari Supabase
```

(Ambil keduanya di Supabase → Project Settings → API. anon key aman ditaruh di sini.)
Kalau dibiarkan, aplikasi tetap jalan tapi minta paste manual tiap dibuka — kurang praktis untuk dipakai harian.

---

## LANGKAH 1 — Upload ke GitHub (lewat browser, tanpa install)
1. Buka **github.com** → login/daftar gratis.
2. Klik **+** (kanan atas) → **New repository** → kasih nama `oppaya-gudang` → **Create repository**.
3. Di halaman repo kosong, klik **uploading an existing file**.
4. Seret SEMUA isi folder ini (package.json, vite.config.js, index.html, folder src, dll) ke kotak upload.
5. Klik **Commit changes**.

---

## LANGKAH 2 — Deploy ke Vercel
1. Buka **vercel.com** → **Sign up** pakai akun GitHub (gratis).
2. Klik **Add New… → Project**.
3. Pilih repo `oppaya-gudang` → **Import**.
4. Vercel otomatis mendeteksi Vite. Biarkan semua setelan default → klik **Deploy**.
5. Tunggu ±1 menit. Selesai — kamu dapat link seperti `https://oppaya-gudang.vercel.app`.

---

## LANGKAH 3 — Bagikan & pakai
- Kirim link Vercel itu ke staff cabang dan admin gudang. Bisa dibuka di HP, tablet, atau laptop.
- Bisa dijadikan ikon di home screen HP (Share → Add to Home Screen) biar seperti aplikasi.

---

## Update di kemudian hari
Mau ubah daftar produk, tambah cabang, dll? Edit `src/App.jsx` langsung di GitHub (klik file → ikon pensil → edit → Commit). Vercel otomatis deploy ulang dalam 1 menit. Tidak perlu apa-apa lagi.

---

## Tes dulu di laptop (opsional)
Kalau punya Node.js, di dalam folder ini jalankan:
```
npm install
npm run dev
```
Buka alamat yang muncul (mis. http://localhost:5173).
