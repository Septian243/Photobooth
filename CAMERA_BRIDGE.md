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
lalu menghapus `sourceName` dari `PHOTO_DIR` setelah upload berhasil. Jika
Google Drive tidak dikonfigurasi, pesan ini diabaikan dan tidak ada file yang
dihapus. Untuk foto dari Upload foto uji, `sourceName` dikosongkan sehingga
tidak ada file kamera yang dihapus.

Status yang dipakai:

- `connected`: DSLR siap dan foto dari tombol kamera akan diterima.
- `waiting`: connector aktif, tetapi belum ada DSLR yang terhubung.
- `unavailable`: connector belum berjalan; Upload foto uji tetap tersedia.

Photobooth hanya menerima satu foto untuk setiap frame yang dipilih. Setelah
foto diterima, aplikasi otomatis berpindah ke mode dekorasi.

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
