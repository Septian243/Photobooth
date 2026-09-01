# Photobooth

Aplikasi photobooth berbasis React. Foto dari kamera Sony yang kompatibel dapat
diterima melalui Sony Imaging Edge Desktop, lalu otomatis ditempatkan ke frame.

## Fitur

- Satu frame untuk satu foto.
- Upload foto untuk uji coba.
- Foto otomatis disesuaikan dengan area frame tanpa gepeng.
- Tombol ambil ulang jika foto tidak sesuai.
- Status connector kamera ditampilkan di frontend.
- Jika Google Drive diaktifkan, foto sumber kamera dihapus setelah upload berhasil.

## Struktur project

```text
Photobooth/
├── frontend/       # Aplikasi React dan tampilan frame
├── backend/        # Connector folder foto ke WebSocket
└── CAMERA_BRIDGE.md
```

## Kebutuhan

- Windows
- Node.js dan npm
- Kamera Sony yang kompatibel dengan Imaging Edge Desktop
- Sony Imaging Edge Desktop
- Kabel micro-USB

## Instalasi

Install dependency frontend:

```text
cd frontend
npm install
```

Install dependency backend:

```text
cd backend
npm install
```

## Konfigurasi folder foto

File `backend/.env` bersifat opsional. Jika file tersebut belum dibuat,
connector otomatis memakai dan membuat folder bawaan:

```text
backend/inbox
```

Atur Imaging Edge Desktop satu kali agar menyimpan foto ke folder tersebut.
Jika ingin memakai folder lain, buat file `backend/.env` berdasarkan
`backend/.env.example`, lalu isi lokasinya. Contoh memakai drive D:

```env
PHOTO_DIR=D:\Photobooth\inbox
PORT=8765
POLL_INTERVAL_MS=500
GOOGLE_DRIVE_FOLDER_ID=
GOOGLE_CREDENTIALS_PATH=./credentials.json
GOOGLE_TOKEN_PATH=./token.json
```

`PHOTO_DIR` adalah folder sementara tempat Imaging Edge menyimpan foto asli.
Upload Google Drive bersifat opsional. Jika `GOOGLE_DRIVE_FOLDER_ID` kosong,
foto tidak di-upload otomatis dan tidak dihapus; tombol **Download** tetap
menjadi cara penyimpanan manual.

Untuk mengaktifkan upload, simpan OAuth client file Google sebagai
`backend/credentials.json` dan isi ID folder Google Drive. Login Google akan
diminta pertama kali saat connector melakukan upload; tokennya disimpan sebagai
`backend/token.json`. Kedua file tersebut tidak boleh dibagikan atau di-commit.

## Menjalankan aplikasi

Jalankan backend dan frontend di dua terminal terpisah.

Terminal backend:

```text
cd backend
npm run dev
```

Terminal frontend:

```text
cd frontend
npm run dev
```

Buka `http://localhost:3000` di browser. Connector menggunakan WebSocket:

```text
ws://127.0.0.1:8765
```

## Pengaturan kamera Sony

1. Hubungkan kamera ke laptop melalui USB.
2. Pada kamera pilih `USB Connection → PC Remote`.
3. Buka Sony Imaging Edge Desktop.
4. Atur penyimpanan foto ke folder yang tertulis di `PHOTO_DIR`.
5. Tekan shutter dari kamera.

Connector akan mendeteksi foto baru dan mengirimkannya ke frontend. Foto
kemudian masuk ke frame secara otomatis. Jika upload Google Drive diaktifkan,
hasil frame di-upload terlebih dahulu, lalu foto asli di `PHOTO_DIR` dihapus
setelah upload berhasil.

## Uji coba tanpa kamera

Gunakan tombol **Upload foto uji** di frontend. Tombol ini hanya untuk pengujian.
Jika upload Google Drive diaktifkan, hasil uji juga di-upload, tetapi tidak
menghapus file kamera.

Tombol **Download** tetap tersedia untuk mengunduh hasil frame melalui browser.

## Build frontend

```text
cd frontend
npm run build
```

Detail format pesan WebSocket tersedia di [CAMERA_BRIDGE.md](CAMERA_BRIDGE.md).
