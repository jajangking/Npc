# 🏰 Desa Hidup — Simulasi NPC Emergent

Simulasi dunia desa fantasi berisi NPC yang **belajar, beradaptasi, dan berevolusi secara organik** — tanpa satu pun perilaku yang di-script. Semua drama (cinta, paceklik, trauma, tradisi, dinasti keluarga) muncul sendiri dari interaksi sistem.

## Menjalankan

```bash
npm install
npm run dev
```

Buka `http://localhost:5173`.

## Cara kerja otaknya

### 🧠 Utility AI + Reinforcement Learning
Tiap tick, NPC menilai semua aksi yang mungkin (meramu, memancing, bertani, menebang, berdagang, bersosialisasi, menjelajah, merayu, dsb.) dengan skor:

```
skor = kebutuhan saat ini × sifat kepribadian × nilai-Q (pengalaman) × kondisi dunia
```

Nilai-Q diperbarui dari **hasil nyata** tiap aksi selesai (`q += 0.18 × (reward − q)`). NPC yang sering gagal memancing akan berhenti memancing; yang panennya melimpah makin rajin bertani → **profesi muncul sendiri**, bukan di-assign.

### 🗺️ Peta mental & memori
NPC hanya tahu sumber daya yang **pernah ia temukan sendiri** (lewat menjelajah) atau **dengar dari gosip**. Estimasi hasil tiap lokasi dikoreksi oleh pengalaman — semak yang habis dipetik perlahan "dilupakan", dan NPC mencari alternatif.

### 😱 Trauma lokasi
Diserang serigala meninggalkan memori ketakutan pada koordinat kejadian, yang memengaruhi semua keputusan rute & pemilihan lokasi kerja. Trauma meluruh seiring waktu dan **menular lewat cerita** — satu serangan bisa membuat seisi desa menghindari satu sisi hutan.

### 💬 Gosip = jaringan informasi
Tiap percakapan mempertukarkan: lokasi sumber daya, peringatan bahaya, opini tentang orang ketiga (reputasi menular), dan meme budaya.

### 🎭 Budaya
NPC kreatif sesekali *menciptakan* kebiasaan baru (Tarian Senja, Pai Beri, ...). Kebiasaan menyebar dari mulut ke mulut, diwariskan ke anak, bisa punah, bisa jadi identitas desa.

### 👶 Generasi & seleksi alam
Pasangan terbentuk dari affinity yang tumbuh lewat interaksi. Anak mewarisi sifat orang tua (rajin, supel, berani, penasaran) **plus mutasi acak** — paceklik dan serigala menyeleksi sifat mana yang bertahan lintas generasi.

### 💰 Ekonomi
Harga pasar murni dari supply/demand harian. Panen raya → harga anjlok; musim dingin → pangan meroket. NPC merespons harga (menimbun, beralih profesi, beli vs. cari sendiri).

### 🌍 Dunia dinamis
Siang-malam, 4 musim, sumber daya habis & tumbuh lagi (hutan bisa gundul permanen kalau dieksploitasi), serigala berburu di malam hari, dan gotong royong: teman dekat menolong yang kelaparan — relasi sosial adalah jaring pengaman.

## Struktur kode

| File | Isi |
|---|---|
| `src/npc.js` | Agen: kebutuhan, sifat, keahlian, memori, Q-learning, pathfinding |
| `src/actions.js` | Utility AI — semua aksi & fungsi skornya |
| `src/sim.js` | Orkestrator: siklus hidup, serigala, gotong royong, generasi |
| `src/world.js` | Dunia: terrain prosedural, musim, regrowth, A* |
| `src/social.js` | Gosip, relasi, meme budaya |
| `src/economy.js` | Pasar supply/demand |
| `src/render.js`, `src/ui.js`, `src/main.js` | Canvas, inspektor NPC, loop |

Setiap dunia memakai seed acak — tiap kali tombol **🌍 Dunia Baru** ditekan, sejarah yang sama sekali berbeda akan tertulis.
