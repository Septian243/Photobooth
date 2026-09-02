# Protokol connector kamera

Photobooth web menerima foto dari connector lokal melalui WebSocket:

`ws://127.0.0.1:8765`

Saat koneksi dibuka, web mengirim:

```json
{"type":"subscribe","events":["camera","photo"]}
```

Connector dapat mengirim status koneksi:

```json
{"type":"camera","status":"connected","name":"Sony Camera - Imaging Edge"}
```

Setelah tombol shutter fisik ditekan, connector dapat mengirim foto sebagai
data URL atau base64 JPEG:

```json
{"type":"photo","mimeType":"image/jpeg","data":"data:image/jpeg;base64,..."}
```

Web juga menerima pesan WebSocket biner berupa JPEG/PNG. Foto yang diterima
langsung diproses ke slot frame berikutnya; tidak ada keharusan menyimpan foto
di folder permanen.

Setelah frame selesai dirender, frontend mengirim hasil frame ke connector:

```json
{"type":"photo:save","sourceName":"DSC0001.JPG","mimeType":"image/png","data":"data:image/png;base64,..."}
```

Jika Google Drive dikonfigurasi, connector meng-upload hasil ke folder Drive,
lalu menghapus `sourceName` dari `PHOTO_DIR` setelah upload berhasil. Frontend
juga dapat mengirim pesan berikut saat pengguna mengunduh hasil atau memilih
ambil ulang:

```json
{"type":"photo:discard","sourceName":"DSC0001.JPG"}
```

Connector kemudian menghapus `sourceName` dari `PHOTO_DIR`. Jika Google Drive
tidak dikonfigurasi, pesan `photo:save` tidak menghapus file. Untuk foto dari
Upload foto uji, `sourceName` dikosongkan sehingga tidak ada file kamera yang
dihapus.

Status yang dipakai:

- `connected`: DSLR siap dan foto dari tombol kamera akan diterima.
- `waiting`: connector aktif, tetapi belum ada DSLR yang terhubung.
- `unavailable`: connector belum berjalan; Upload foto uji tetap tersedia.

Photobooth hanya menampilkan satu foto untuk setiap frame. Jika foto kamera
baru masuk saat frame sudah berisi foto, foto terbaru menggantikan foto lama
secara otomatis. Backend memprioritaskan file terbaru agar file lama tidak
menimpa foto tersebut kembali.

## Connector Imaging Edge

Backend memantau folder penyimpanan foto yang dipilih di Sony Imaging Edge
Desktop. Jalankan dari terminal terpisah:

```text
cd backend
npm install
npm run dev
```

Secara default connector memantau folder `backend/inbox`, yang dibuat otomatis
saat server dijalankan. Atur Imaging Edge Desktop agar menyimpan foto ke folder
tersebut. Jika ingin memakai lokasi lain, buat `backend/.env` dari
`.env.example` dan isi `PHOTO_DIR`. Foto JPEG/PNG yang benar-benar
selesai ditulis akan dikirim satu kali melalui WebSocket, sehingga tombol
shutter tetap bisa ditekan dari kamera. Penghapusan sumber hanya dilakukan
setelah upload Google Drive berhasil dan opsi Google Drive diaktifkan.
