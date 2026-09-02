# Photobooth

Aplikasi photobooth berbasis React. Foto dari kamera Sony dikirim oleh Sony
Imaging Edge Desktop ke sebuah folder di laptop. Backend connector memantau
folder tersebut dan mengirim foto baru secara real-time ke frontend melalui
WebSocket. Frontend kemudian menempatkan foto ke frame dan menyediakan tombol
ambil ulang, download, serta upload ke Google Drive secara opsional.

## Cara kerja

```text
Kamera Sony --USB--> Imaging Edge Desktop
                         |
                         v
                 Folder PHOTO_DIR
                         |
                         v
              Backend connector (WebSocket)
                         |
                         v
                 Frontend Photobooth
                         |
          +--------------+--------------+
          |                             |
       Download                   Google Drive (opsional)
```

Ada dua aplikasi yang perlu dijalankan di laptop:

1. **Sony Imaging Edge Desktop** menerima foto dari kamera dan menyimpannya
   ke folder yang dipantau.
2. **Backend connector** memantau folder tersebut dan meneruskan foto ke web.

## Fitur

- Satu frame berisi satu foto.
- Foto dari kamera diterima otomatis melalui WebSocket.
- Foto kamera terbaru otomatis menggantikan foto yang sedang tampil, tanpa perlu
  klik **Ambil ulang** terlebih dahulu.
- Upload foto manual untuk uji coba tanpa kamera.
- Foto disesuaikan ke area frame dengan rasio tetap sehingga tidak gepeng.
- Tombol **Ambil ulang** menghapus foto pada tampilan dan meminta connector
  menghapus file sumber kamera dari folder pantauan.
- Tombol **Download** mengunduh hasil frame melalui browser, lalu meminta
  connector menghapus file sumber kamera dan mereset frame.
- Tombol **Simpan ke Google Drive** bersifat opsional.
- Setelah **Download** atau **Simpan ke Google Drive** berhasil, tampilan frame
  kembali kosong dan siap menerima foto berikutnya.
- Saat foto kamera baru menggantikan foto lama, file sumber foto lama tetap
  disimpan. File sumber kamera dihapus saat **Ambil ulang** atau **Download**.
  Untuk **Simpan ke Google Drive**, file baru dihapus setelah upload berhasil.
- Frame aktif saat ini adalah `frontend/public/assets/frames/Contoh2.png`.

## Struktur project

```text
Photobooth/
├── frontend/
│   ├── public/assets/frames/Contoh2.png  # frame aktif
│   └── src/components/Photobooth.js      # UI, canvas, WebSocket browser
├── backend/
│   ├── src/server.js                      # connector folder -> WebSocket
│   ├── .env.example                       # contoh konfigurasi
│   └── inbox/                             # folder bawaan, dibuat otomatis
├── CAMERA_BRIDGE.md                       # format pesan WebSocket
└── README.md
```

## Persyaratan

- Windows (contoh perintah di bawah menggunakan PowerShell).
- Node.js versi LTS dan npm.
- Kamera Sony yang dapat digunakan bersama Imaging Edge Desktop.
- Sony Imaging Edge Desktop.
- Kabel USB data yang sesuai dengan kamera.
- Akun Google hanya diperlukan jika fitur Google Drive digunakan.

Periksa Node.js dan npm:

```powershell
node --version
npm --version
```

## Instalasi project

Clone project, kemudian install dependency frontend dan backend satu kali:

```powershell
git clone https://github.com/Septian243/Photobooth.git
cd Photobooth

cd frontend
npm install

cd ..\backend
npm install

cd ..
```

Jangan menjalankan `npm install` dari root karena dependency frontend dan
backend memang dipisah.

## Konfigurasi backend dan folder foto

Backend membaca file `backend/.env` secara otomatis. File ini tidak wajib.
Jika belum ada, backend menggunakan folder bawaan berikut dan membuatnya saat
server dijalankan:

```text
backend/inbox
```

### Menggunakan folder bawaan

Tidak perlu membuat `.env`. Jalankan backend dengan `npm run dev`; folder
`backend/inbox` akan dibuat otomatis.

### Menggunakan folder lain, misalnya drive D:

Salin `backend/.env.example` menjadi `backend/.env`, lalu isi:

```env
PHOTO_DIR=D:\Photobooth\inbox
PORT=8765
POLL_INTERVAL_MS=500

# Kosongkan jika Google Drive tidak digunakan
GOOGLE_DRIVE_FOLDER_ID=
GOOGLE_CREDENTIALS_PATH=./credentials.json
GOOGLE_TOKEN_PATH=./token.json
```

Keterangan:

- `PHOTO_DIR`: folder tempat Imaging Edge menyimpan foto.
- `PORT`: port WebSocket connector. Default `8765`.
- `POLL_INTERVAL_MS`: interval pemeriksaan folder dalam milidetik. Default
  `500`.
- `GOOGLE_DRIVE_FOLDER_ID`: ID folder Google Drive. Jika kosong, fitur Google
  Drive dianggap tidak aktif.
- `GOOGLE_CREDENTIALS_PATH`: lokasi file OAuth Google.
- `GOOGLE_TOKEN_PATH`: lokasi token login yang dibuat otomatis.

Foto yang sudah ada sebelum backend dijalankan akan ditandai sebagai file
 lama dan tidak langsung dikirim. Ambil foto baru setelah connector aktif. Jika
 beberapa foto baru masuk bersamaan, connector mengurutkannya berdasarkan waktu
 modifikasi terbaru dan hanya mengirim foto terbaru dari rangkaian tersebut.
Backend hanya memantau file `.jpg`, `.jpeg`, dan `.png`.
Jika file baru menggantikan file lama dengan nama yang sama, connector tetap
mendeteksinya berdasarkan perubahan ukuran atau waktu modifikasi file.

## Setup kamera Sony melalui USB

Bagian ini harus diselesaikan sebelum menguji frontend. Connector project ini
tidak berbicara langsung dengan kamera; ia membaca file foto yang sudah selesai
disimpan oleh Imaging Edge Desktop.

### A. Siapkan folder pantauan

Pilih satu folder absolut dan gunakan folder yang sama di backend serta Imaging
Edge Desktop. Contoh yang direkomendasikan:

```text
C:\Photobooth\inbox
```

Buat `backend/.env`:

```env
PHOTO_DIR=C:\Photobooth\inbox
PORT=8765
POLL_INTERVAL_MS=500
```

Jalankan backend satu kali agar folder dibuat otomatis:

```powershell
cd backend
npm run dev
```

Pastikan folder `C:\Photobooth\inbox` sudah muncul, lalu biarkan backend tetap
berjalan. Jika memakai drive D:, gunakan misalnya `D:\Photobooth\inbox` di
`backend/.env` dan ulangi langkah ini.

### B. Hubungkan kamera

1. Nyalakan kamera dan pastikan baterai cukup atau gunakan adaptor daya.
2. Gunakan kabel USB yang mendukung **data**, bukan kabel charge-only.
3. Hubungkan kamera langsung ke laptop, bukan melalui hub USB jika memungkinkan.
4. Pada kamera buka menu pengaturan USB.
5. Pilih **USB Connection -> PC Remote**. Pada kamera yang lebih baru, nama
   menunya dapat berupa **PC Remote Function -> PC Remote** dan metode koneksi
   **USB**.
6. Matikan sementara koneksi smartphone/Wi-Fi kamera jika kamera menolak
   koneksi PC.

Untuk Sony A6000 (ILCE-6000), jalurnya adalah:

```text
MENU -> Setup -> USB Connection -> PC Remote
```

Sony mencantumkan ILCE-6000 sebagai perangkat yang mendukung Remote Shooting.
Menu dapat berbeda sedikit menurut bahasa dan versi firmware. Lihat [Sony
Supported Devices](https://support.d-imaging.sony.co.jp/app/imagingedge/en/devices/)
dan [panduan USB ILCE-6000](https://helpguide.sony.net/mig/Z001924611/EN/contents/TP0000226675.html)
jika nama menu di kamera berbeda.

## Setup Sony Imaging Edge Desktop

Imaging Edge Desktop memiliki beberapa modul. Untuk project ini gunakan modul
**Remote**, bukan Viewer atau Edit.

### A. Install dan deteksi kamera

1. Install versi terbaru Imaging Edge Desktop dari situs resmi Sony.
2. Buka Imaging Edge Desktop.
3. Buka **Remote**.
4. Tunggu sampai kamera muncul di daftar perangkat.
5. Jika kamera tidak muncul, tutup aplikasi kamera lain, cabut-pasang kabel,
   lalu pastikan kamera berada pada mode **PC Remote**.

### B. Atur lokasi dan format file

1. Di jendela **Remote**, buka panel pengaturan penyimpanan gambar. Pada
   beberapa versi panel ini bernama **Image Save Settings** atau **Save in**.
2. Pada **Save in**, klik **Browse** dan pilih folder absolut yang sama persis
   dengan `PHOTO_DIR`, misalnya:

   ```text
   C:\Photobooth\inbox
   ```

3. Pastikan hasil pemotretan disimpan ke komputer. Jika kamera/versi Imaging
   Edge menyediakan pilihan tujuan, gunakan **PC Only** atau **PC + Camera**.
   Jika pilihan tersebut tidak ada, cukup pastikan lokasi **Save in** sudah
   benar.
4. Atur kamera untuk menyimpan **JPEG saja** dengan pengaturan berikut:

   ```text
   File Format: JPEG
   JPEG Quality: Extra Fine
   Image Size: Large
   PC Save Image Size: Original
   ```

   Nama menu dapat sedikit berbeda menurut model atau bahasa kamera. Yang
   penting adalah formatnya JPEG, kualitas Extra Fine, ukuran Large, dan ukuran
   file PC Original.
5. Jangan memilih RAW atau RAW + JPEG untuk alur Photobooth ini. Connector hanya
   memproses `.jpg`, `.jpeg`, dan `.png`; RAW seperti `.ARW` memang tidak dipakai.
6. Simpan pengaturan dan jangan mengganti folder setelah pengujian dimulai.

Sony menjelaskan bahwa foto hasil Remote otomatis disimpan ke folder pada panel
**Save in**. Detail panel dapat dilihat di [Remote Shooting Sony](https://support.d-imaging.sony.co.jp/app/imagingedge/en/instruction/4_5_remote.php)
dan [Image Save Settings](https://support.d-imaging.sony.co.jp/app/imagingedge/en/instruction/4_3_panels.php).

### C. Tes Imaging Edge sebelum tes Photobooth

1. Dengan kamera masih terhubung, lakukan satu foto uji dari tombol
   **Image/Photo** di Remote. Setelah itu, uji juga shutter fisik kamera jika
   alur pemotretan memang ingin dipicu dari kamera.
2. Buka `PHOTO_DIR` di File Explorer.
3. Pastikan satu file `.jpg` atau `.jpeg` baru muncul dan ukurannya tidak lagi
   berubah.
4. Jika file tidak muncul, jangan lanjut ke frontend. Perbaiki dulu mode USB,
   koneksi kamera, atau pengaturan **Save in**.

Setelah tes ini berhasil, biarkan Imaging Edge dan backend tetap terbuka, lalu
jalankan frontend. Alur lengkapnya:

```text
Shutter kamera ditekan
-> Imaging Edge menyelesaikan file JPEG
-> file masuk ke PHOTO_DIR
-> connector menunggu ukuran file stabil
-> connector mengirim foto melalui WebSocket
-> foto masuk ke frame secara otomatis
```

Connector tidak menghapus foto saat baru diterima. Jika foto kamera baru
menggantikan foto lama, file sumber foto lama tetap berada di `PHOTO_DIR`. Foto
yang sedang tampil tetap memiliki file sumber sampai pengguna menekan **Ambil
ulang**, **Download**, atau upload hasil frame ke Google Drive berhasil.

## Menjalankan aplikasi penghubung

Backend connector adalah aplikasi Node.js kecil yang berjalan di laptop, bukan
backend online. Jalankan di terminal terpisah:

```powershell
cd backend
npm run dev
```

Jika berhasil, terminal menampilkan alamat seperti:

```text
Connector berjalan di ws://127.0.0.1:8765
Memantau folder Imaging Edge: ...
```

Biarkan terminal ini tetap terbuka selama sesi photobooth. Connector akan
mencoba membaca ulang folder secara berkala.

## Menjalankan frontend

Buka terminal kedua:

```powershell
cd frontend
npm run dev
```

Buka alamat berikut di browser:

```text
http://localhost:3000
```

Frontend secara default terhubung ke:

```text
ws://127.0.0.1:8765
```

Jika port connector diubah, buat `frontend/.env.local` dan isi alamat WebSocket
yang sesuai:

```env
REACT_APP_CAMERA_BRIDGE_URL=ws://127.0.0.1:8765
```

Setelah mengubah file environment frontend, restart `npm run dev`.

## Urutan menjalankan semua aplikasi setiap sesi

Gunakan urutan ini agar tidak bingung:

1. Hubungkan dan nyalakan kamera Sony.
2. Pastikan kamera berada pada mode **PC Remote**.
3. Buka **Imaging Edge Desktop -> Remote** dan pastikan kamera terdeteksi.
4. Buka terminal pertama, lalu jalankan backend:

   ```powershell
   cd backend
   npm run dev
   ```

5. Pastikan terminal menampilkan folder yang dipantau dan folder tersebut sama
   dengan **Save in** di Imaging Edge.
6. Buka terminal kedua, lalu jalankan frontend:

   ```powershell
   cd frontend
   npm run dev
   ```

7. Buka `http://localhost:3000`.
8. Ambil foto baru dari kamera. Jangan memakai file lama yang sudah ada di
   folder sebelum backend dimulai.

Jika status web **Connector kamera belum aktif**, backend belum terhubung.
Jika status web **Connector aktif — menunggu kamera**, backend sudah terhubung
tetapi belum mendeteksi folder/kamera menghasilkan foto baru.

## Setup Google Drive (opsional)

Fitur ini benar-benar opsional dan tidak berjalan otomatis saat foto masuk ke
frame. Upload hanya terjadi setelah pengguna menekan tombol **Simpan ke Google
Drive**. Tanpa `GOOGLE_DRIVE_FOLDER_ID`, frontend tetap dapat dipakai untuk
download lokal.

Panduan resmi Google yang menjadi acuan: [Drive API Node.js
quickstart](https://developers.google.com/workspace/drive/api/quickstart/nodejs).

### A. Buat project dan aktifkan Drive API

1. Buka [Google Cloud Console](https://console.cloud.google.com/).
2. Di bagian pemilih project, klik **New Project**.
3. Isi nama project, misalnya `Photobooth`, lalu klik **Create**.
4. Pastikan project `Photobooth` sedang dipilih.
5. Buka **APIs & Services -> Library**.
6. Cari **Google Drive API**.
7. Buka hasil **Google Drive API**, lalu klik **Enable**.

Jangan membuat API key. Project ini memakai OAuth 2.0 karena connector perlu
mengunggah file ke Drive milik akun yang login.

### B. Konfigurasikan Google Auth Platform/OAuth consent

Google Cloud dapat menampilkan menu baru bernama **Google Auth Platform** atau
menu lama bernama **OAuth consent screen**. Keduanya merujuk ke pengaturan OAuth
yang sama.

1. Buka **Google Auth Platform -> Branding**. Jika diminta, klik **Get
   Started**.
2. Isi **App name**, **User support email**, dan **Developer contact
   information**.
3. Buka **Audience**.
   - Pilih **External** jika menggunakan akun Gmail pribadi.
   - Pilih **Internal** hanya jika akun berada dalam Google Workspace yang sama
     dan kebijakan organisasi mengizinkannya.
4. Jika memilih **External** dan aplikasi masih berstatus testing, klik **Add
   users** lalu masukkan alamat Gmail yang akan dipakai untuk login.
5. Simpan perubahan.

Jangan melewati langkah **Test users** untuk akun Gmail pribadi. Tanpa akun
tersebut, login dapat ditolak dengan pesan bahwa aplikasi belum diverifikasi.

### C. Buat OAuth Client ID untuk Desktop

1. Buka **Google Auth Platform -> Clients**. Pada tampilan lama, buka **APIs &
   Services -> Credentials**.
2. Klik **Create Client** atau **Create credentials -> OAuth client ID**.
3. Pada **Application type**, pilih **Desktop app**.
4. Beri nama, misalnya `Photobooth Connector`, lalu klik **Create**.
5. Klik tombol download pada client yang baru dibuat.
6. Ganti nama file hasil download menjadi tepat:

```text
credentials.json
```

7. Pindahkan file tersebut ke:

```text
Photobooth/backend/credentials.json
```

Struktur akhirnya harus seperti ini:

```text
Photobooth/
└── backend/
    ├── credentials.json  <- file dari Google Cloud
    └── src/server.js
```

Jangan membuka atau mengubah isi JSON dan jangan mengunggahnya ke GitHub. File
ini sudah diabaikan oleh `.gitignore`.

### D. Buat folder tujuan dan ambil Folder ID

1. Buka [Google Drive](https://drive.google.com/).
2. Buat folder baru, misalnya `Photobooth Photos`.
3. Buka folder tersebut.
4. Lihat URL browser. Bentuknya:

   ```text
   https://drive.google.com/drive/folders/1AbCdefGHIjKlmnOP
   ```

5. Salin hanya bagian setelah `/folders/`, yaitu:

   ```text
   1AbCdefGHIjKlmnOP
   ```

6. Pastikan akun yang akan login mempunyai izin **Editor** pada folder itu.

### E. Isi backend/.env

Buat atau edit `backend/.env`:

```env
PHOTO_DIR=C:\Photobooth\inbox
PORT=8765
POLL_INTERVAL_MS=500
GOOGLE_DRIVE_FOLDER_ID=1AbCdefGHIjKlmnOP
GOOGLE_CREDENTIALS_PATH=./credentials.json
GOOGLE_TOKEN_PATH=./token.json
```

Ganti `1AbCdefGHIjKlmnOP` dengan Folder ID sebenarnya. Jangan menambahkan
`https://drive.google.com/...` ke nilai `GOOGLE_DRIVE_FOLDER_ID`; yang diterima
backend hanya ID-nya.

### F. Login OAuth pertama kali dan uji upload

1. Pastikan `backend/credentials.json` ada.
2. Pastikan `GOOGLE_DRIVE_FOLDER_ID` benar dan tidak kosong.
3. Tutup backend lama jika sedang berjalan, lalu mulai ulang:

   ```powershell
   cd backend
   npm run dev
   ```

4. Jalankan frontend di terminal lain:

   ```powershell
   cd frontend
   npm run dev
   ```

5. Di browser, klik **Upload foto uji** dan pilih satu foto.
6. Setelah foto muncul di frame, klik **Simpan ke Google Drive**.
7. Jendela browser OAuth akan terbuka. Pilih akun yang tadi ditambahkan sebagai
   **Test user**.
8. Tinjau izin dan klik **Allow/Continue**.
9. Kembali ke aplikasi. Jika berhasil, status berubah menjadi **Berhasil
   disimpan ke Google Drive**.
10. Periksa folder `Photobooth Photos` di Drive.

Backend menyimpan token login di:

```text
backend/token.json
```

Token dipakai ulang pada upload berikutnya sehingga login biasanya hanya perlu
dilakukan sekali. Jika ingin login dengan akun berbeda, hentikan backend, hapus
`backend/token.json`, lalu jalankan dan lakukan upload lagi.

Jika muncul halaman peringatan aplikasi belum diverifikasi, lanjutkan hanya
untuk project milik sendiri dan akun yang sudah didaftarkan sebagai **Test
user**. Jangan melewati peringatan untuk aplikasi atau credentials yang tidak
Anda kenal.

### G. Batas izin dan perilaku penghapusan

Connector meminta scope `drive.file`, sehingga upload dilakukan oleh aplikasi
ke folder yang ditentukan; connector tidak menyediakan fitur untuk membaca
atau mengelola seluruh isi Drive.

- Yang di-upload adalah hasil akhir frame dalam format PNG.
- Upload hanya dimulai ketika tombol **Simpan ke Google Drive** diklik.
- Jika upload berhasil, file sumber kamera di `PHOTO_DIR` dihapus.
- Jika upload berhasil, tampilan frame juga direset agar siap untuk foto baru.
- Jika upload gagal, file sumber kamera tidak dihapus.
- Jika pengguna menekan **Download**, hasil frame diunduh lalu file sumber
  kamera diminta untuk dihapus dan tampilan frame direset.
- Jika Google Drive belum dikonfigurasi, tidak ada upload dan tidak ada file
  yang dihapus.
- Foto dari **Upload foto uji** tidak memiliki file sumber kamera, sehingga
  tidak menghapus file kamera.

## Alur penggunaan

### Dengan kamera

1. Jalankan backend.
2. Jalankan frontend.
3. Pastikan status berubah menjadi **Connector aktif — menunggu kamera** atau
   **Kamera terhubung**.
4. Tekan shutter pada kamera.
5. Tunggu foto masuk ke frame.
6. Jika mengambil foto lagi, foto kamera terbaru otomatis menggantikan foto
   sebelumnya.
7. Jika sudah sesuai, klik **Download** atau **Simpan ke Google Drive**.
8. Tombol **Ambil ulang** tetap tersedia jika ingin mengosongkan frame sebelum
   mengambil foto berikutnya.

### Tanpa kamera

1. Jalankan frontend; backend tidak wajib untuk upload manual.
2. Klik **Upload foto uji**.
3. Pilih file foto.
4. Foto akan disesuaikan otomatis ke frame.
5. Gunakan **Ambil ulang** untuk mengganti foto, atau gunakan **Download**.

## Frame dan penyesuaian foto

Frame aktif ditentukan di:

```text
frontend/src/components/Photobooth.js
```

Saat ini:

```js
const FRAME_SRC = "/assets/frames/Contoh2.png";
```

Area foto ditentukan oleh `PHOTO_AREA`. Foto kamera tidak dipaksa mengikuti
rasio kamera; foto dipertahankan rasionya, diperbesar agar memenuhi area frame,
lalu bagian tepi yang berlebih dipotong secara proporsional. Karena itu foto
tidak gepeng. Jika mengganti frame dengan ukuran atau posisi lubang foto yang
berbeda, ubah `FRAME_SRC` dan koordinat `PHOTO_AREA` sesuai frame baru.

## Troubleshooting

### Status “Connector kamera belum aktif”

- Pastikan terminal backend sedang menjalankan `npm run dev`.
- Pastikan frontend memakai port WebSocket yang sama.
- Pastikan tidak ada aplikasi lain yang memakai port `8765`.

### Status “Connector aktif — menunggu kamera”

- Backend sudah berjalan, tetapi folder `PHOTO_DIR` belum tersedia atau belum
  berisi hasil baru.
- Periksa ejaan dan lokasi `PHOTO_DIR` di `backend/.env`.
- Pastikan Imaging Edge menyimpan foto ke folder yang sama.

### Foto tidak muncul

- Ambil foto baru setelah backend berjalan.
- Pastikan ekstensi file `.jpg`, `.jpeg`, atau `.png`.
- Jika memakai nama file yang sama untuk pengujian berulang, pastikan file
  benar-benar tertimpa/terganti; connector membandingkan ukuran dan waktu
  modifikasinya.
- Tunggu sampai Imaging Edge selesai menulis file.
- Jika frame sudah berisi foto, foto kamera terbaru akan menggantikannya secara
  otomatis.
- Periksa pesan error di terminal backend dan Console browser.

### Google Drive tidak bisa digunakan

- Pastikan `GOOGLE_DRIVE_FOLDER_ID` tidak kosong.
- Pastikan `backend/credentials.json` ada dan berasal dari OAuth Desktop app.
- Hapus `backend/token.json` hanya jika ingin login ulang, kemudian coba lagi.
- Pastikan Google Drive API sudah diaktifkan dan akun sudah ditambahkan sebagai
  test user jika diperlukan.

### Kamera tidak terdeteksi oleh Imaging Edge

- Pastikan kabel USB mendukung transfer data.
- Pastikan mode USB kamera adalah **PC Remote**.
- Pastikan kamera kompatibel dengan Imaging Edge Desktop.
- Coba port USB atau kabel lain.
- Masalah koneksi kamera harus diselesaikan di Imaging Edge; connector ini
  hanya membaca folder hasil foto.

## Build frontend untuk deployment

Untuk membuat build produksi:

```powershell
cd frontend
npm run build
```

Hasilnya berada di `frontend/build/`. Folder `build` tidak perlu di-commit
karena sudah diabaikan oleh `.gitignore`.

## Keamanan dan file lokal

Jangan commit file berikut:

```text
backend/.env
backend/credentials.json
backend/token.json
```

File-file tersebut sudah masuk `.gitignore`. `credentials.json` dan `token.json`
memberikan akses ke akun Google, jadi simpan hanya di laptop yang menjalankan
connector.

Format pesan WebSocket yang digunakan frontend dan connector dijelaskan di
[`CAMERA_BRIDGE.md`](CAMERA_BRIDGE.md).
