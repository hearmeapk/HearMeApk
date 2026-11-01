// ================= KONFIGURASI API =================
// Tempel URL Web App Apps Script (yang berakhiran /exec)
const API_URL = 'https://script.google.com/macros/s/AKfycbwUpaOcPrWKHQFJtd_-ANtY05WqKdgkM3akBjxNnlVLfdoYSiE6JQOcwmjWkRJmSmYh/exec';

const ADMIN_TOKEN_KEY = 'hearme_admin_token';

// ================= HELPER API =================
async function api(action, params = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      // text/plain menghindari preflight CORS yang tidak didukung Apps Script
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...params }),
      signal: ctrl.signal
    });
    if (!res.ok) throw new Error('Server merespons ' + res.status);
    return await res.json();
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Waktu tunggu habis, coba lagi.');
    throw new Error('Gagal terhubung ke server. Periksa koneksi internet Anda.');
  } finally {
    clearTimeout(timer);
  }
}

function getAdminToken() {
  try { return sessionStorage.getItem(ADMIN_TOKEN_KEY) || ''; } catch (e) { return ''; }
}
function setAdminToken(t) {
  try { sessionStorage.setItem(ADMIN_TOKEN_KEY, t); } catch (e) {}
}
function clearAdminToken() {
  try { sessionStorage.removeItem(ADMIN_TOKEN_KEY); } catch (e) {}
}

// Kompres foto di browser (maks 1280px, JPEG) lalu ubah ke base64
function kompresFoto(file, maxSize = 1280, kualitas = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file foto.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('File bukan gambar yang valid.'));
      img.onload = () => {
        let w = img.width, h = img.height;
        if (Math.max(w, h) > maxSize) {
          const rasio = maxSize / Math.max(w, h);
          w = Math.round(w * rasio);
          h = Math.round(h * rasio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', kualitas));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// ================= STATE =================
let currentTrackedReport = null;
let masterAdminList = [];

// Logika Rahasia 5 Kali Ketuk
let tapCount = 0;
let tapTimer = null;

function handleSecretTap() {
  tapCount++;
  clearTimeout(tapTimer);
  if (tapCount >= 5) {
    tapCount = 0;
    bukaModalLoginAdmin();
  } else {
    tapTimer = setTimeout(() => { tapCount = 0; }, 2500);
  }
}

// ================= NAVIGASI =================
const SEMUA_HALAMAN = ['tab-beranda', 'tab-lapor', 'tab-cek', 'tab-edukasi', 'page-cara-melapor', 'page-tentang-cara', 'page-kritik', 'page-admin'];

function switchTab(tabId) {
  tutupSideMenu();
  SEMUA_HALAMAN.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });

  const activeEl = document.getElementById('tab-' + tabId);
  if (activeEl) activeEl.classList.remove('hidden');

  document.querySelectorAll('.nav-item').forEach(item => {
    const target = item.getAttribute('data-target');
    const iconWrapper = item.querySelector('.nav-icon-wrapper');
    const label = item.querySelector('.nav-label');

    if (target === tabId) {
      iconWrapper.className = 'nav-icon-wrapper w-8 h-8 rounded-full bg-[#E5E9FF] text-hearme flex items-center justify-center transition';
      label.className = 'nav-label text-[9px] mt-0.5 font-bold text-hearme';
    } else {
      iconWrapper.className = 'nav-icon-wrapper w-8 h-8 rounded-full bg-transparent flex items-center justify-center transition text-slate-400';
      label.className = 'nav-label text-[9px] mt-0.5 font-semibold text-slate-400';
    }
  });

  document.getElementById('mainContainer').scrollTop = 0;
}

function toggleSideMenu() {
  const menu = document.getElementById('sideMenu');
  const backdrop = document.getElementById('menuBackdrop');
  if (menu.classList.contains('hidden')) {
    menu.classList.remove('hidden');
    backdrop.classList.remove('hidden');
  } else {
    tutupSideMenu();
  }
}

function tutupSideMenu() {
  document.getElementById('sideMenu').classList.add('hidden');
  document.getElementById('menuBackdrop').classList.add('hidden');
}

function sembunyikanSemuaHalaman() {
  SEMUA_HALAMAN.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
  document.querySelectorAll('.nav-item').forEach(item => {
    const iconWrapper = item.querySelector('.nav-icon-wrapper');
    const label = item.querySelector('.nav-label');
    iconWrapper.className = 'nav-icon-wrapper w-8 h-8 rounded-full bg-transparent flex items-center justify-center transition text-slate-400';
    label.className = 'nav-label text-[9px] mt-0.5 font-semibold text-slate-400';
  });
}

function bukaHalaman(id) {
  tutupSideMenu();
  sembunyikanSemuaHalaman();
  document.getElementById(id).classList.remove('hidden');
  document.getElementById('mainContainer').scrollTop = 0;
}

function bukaHalamanCara()   { bukaHalaman('page-cara-melapor'); }
function bukaTentangCara()   { bukaHalaman('page-tentang-cara'); }
function bukaKritikSaran()   { bukaHalaman('page-kritik'); }

// ================= KIRIM LAPORAN =================
async function submitLaporan(e) {
  e.preventDefault();
  const btn = document.getElementById('btnSubmitLapor');
  btn.disabled = true;
  btn.innerText = 'Mengirim ke Database...';

  const resetBtn = () => {
    btn.disabled = false;
    btn.innerText = 'Kirim Laporan';
  };

  try {
    const payload = {
      nama: document.getElementById('inpNama').value.trim(),
      email: document.getElementById('inpEmail').value.trim(),
      kategori: document.getElementById('inpKategori').value,
      tanggal: document.getElementById('inpTanggal').value,
      lokasi: document.getElementById('inpLokasi').value.trim(),
      judul: document.getElementById('inpJudul').value.trim(),
      kronologi: document.getElementById('inpKronologi').value.trim(),
      fotoBase64: null,
      fotoNama: null
    };

    const file = document.getElementById('inpFoto').files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('Ukuran foto terlalu besar! Maksimal 5MB.');
        resetBtn();
        return;
      }
      btn.innerText = 'Memproses foto...';
      payload.fotoBase64 = await kompresFoto(file);
      payload.fotoNama = file.name.replace(/\.[^.]+$/, '') + '.jpg';
      btn.innerText = 'Mengirim ke Database...';
    }

    const res = await api('kirimLaporan', { data: payload });
    resetBtn();
    if (res.success) {
      document.getElementById('laporForm').reset();
      document.getElementById('createdCode').innerText = res.kode;
      document.getElementById('modalFeedback').classList.remove('hidden');
    } else {
      alert('Gagal mengirim: ' + (res.error || res.message || 'Terjadi kesalahan'));
    }
  } catch (err) {
    resetBtn();
    alert(err.message);
  }
}

function tutupModalFeedback(directToTrack) {
  const code = document.getElementById('createdCode').innerText;
  document.getElementById('modalFeedback').classList.add('hidden');
  if (directToTrack) {
    switchTab('cek');
    document.getElementById('trackInput').value = code;
    cariLaporan();
  } else {
    switchTab('beranda');
  }
}

// ================= CEK LAPORAN =================
async function cariLaporan() {
  const query = document.getElementById('trackInput').value.trim();
  if (!query) return showToast('Masukkan kode laporan terlebih dahulu!');

  const btn = document.getElementById('btnTrack');
  btn.disabled = true;
  btn.innerText = 'Mencari...';

  try {
    const res = await api('cekLaporan', { kode: query });
    if (res.success) {
      tampilkanHasilTracking(res.data);
    } else {
      showToast(res.message || 'Laporan tidak ditemukan');
      document.getElementById('hasilTrackingCard').classList.add('hidden');
    }
  } catch (err) {
    showToast(err.message);
  } finally {
    btn.disabled = false;
    btn.innerText = 'Cek Laporan';
  }
}

function tampilkanHasilTracking(data) {
  currentTrackedReport = data;
  document.getElementById('trackKode').innerText = data.kode;
  document.getElementById('trackStatusBadge').innerText = data.status;
  document.getElementById('trackWaktuMasuk').innerText = data.waktuMasuk;
  document.getElementById('timelineStatusTxt').innerText = data.status;
  document.getElementById('hasilTrackingCard').classList.remove('hidden');
}

function bukaModalDetail() {
  if (!currentTrackedReport) return;
  const r = currentTrackedReport;

  let fotoHtml = '<div class="text-[10px] text-slate-400 italic">Tidak ada foto bukti dilampirkan</div>';
  if (isUrlAman(r.buktiFoto)) {
    fotoHtml = `
      <a href="${escapeHtml(r.buktiFoto)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center space-x-1.5 text-hearme font-semibold text-[11px] underline">
        <i class="fa-solid fa-arrow-up-right-from-square"></i>
        <span>Lihat Foto Bukti Asli</span>
      </a>`;
  }

  document.getElementById('detailContent').innerHTML = `
    <div class="bg-slate-50 p-2.5 rounded-xl border space-y-1.5">
      <div><strong class="text-slate-500 text-[10px]">Judul:</strong> <div class="font-bold text-slate-800">${escapeHtml(r.judul)}</div></div>
      <div><strong class="text-slate-500 text-[10px]">Kategori:</strong> <div>${escapeHtml(r.kategori)}</div></div>
      <div><strong class="text-slate-500 text-[10px]">Tanggal Kejadian:</strong> <div>${escapeHtml(r.tanggal)}</div></div>
      <div><strong class="text-slate-500 text-[10px]">Lokasi:</strong> <div>${escapeHtml(r.lokasi)}</div></div>
      <div><strong class="text-slate-500 text-[10px]">Pelapor:</strong> <div>${escapeHtml(r.nama)}</div></div>
    </div>
    <div class="bg-slate-50 p-2.5 rounded-xl border space-y-1">
      <strong class="text-slate-500 text-[10px] block">Bukti Foto:</strong>
      ${fotoHtml}
    </div>
    <div class="bg-slate-50 p-2.5 rounded-xl border">
      <strong class="text-slate-500 text-[10px] block mb-1">Kronologi Kejadian:</strong>
      <p class="leading-relaxed whitespace-pre-line text-slate-700">${escapeHtml(r.kronologi)}</p>
    </div>`;
  document.getElementById('modalDetail').classList.remove('hidden');
}

function tutupModalDetail() {
  document.getElementById('modalDetail').classList.add('hidden');
}

function bukaPesanAdmin() {
  if (!currentTrackedReport) return;
  document.getElementById('pesanAdminTxt').innerText = currentTrackedReport.catatanAdmin || 'Belum ada catatan khusus dari Satgas.';
  document.getElementById('modalPesanAdmin').classList.remove('hidden');
}

function tutupPesanAdmin() {
  document.getElementById('modalPesanAdmin').classList.add('hidden');
}

// ================= KRITIK & SARAN =================
async function submitKritik(e) {
  e.preventDefault();
  const btn = document.getElementById('btnKritik');
  btn.innerText = 'Mengirim...';
  btn.disabled = true;

  try {
    const res = await api('kirimKritik', {
      data: {
        email: document.getElementById('kritikEmail').value.trim(),
        pesan: document.getElementById('kritikPesan').value.trim()
      }
    });
    if (res.success) {
      showToast('Kritik & saran terkirim. Terima kasih!');
      document.getElementById('kritikEmail').value = '';
      document.getElementById('kritikPesan').value = '';
      setTimeout(() => switchTab('beranda'), 1000);
    } else {
      alert('Gagal: ' + (res.message || 'Terjadi kesalahan'));
    }
  } catch (err) {
    alert(err.message);
  } finally {
    btn.innerText = 'Kirim Masukan';
    btn.disabled = false;
  }
}

// ================= ADMIN =================
function bukaModalLoginAdmin() {
  tutupSideMenu();
  // Jika sesi masih ada, langsung masuk panel
  if (getAdminToken()) {
    bukaPanelAdmin();
    return;
  }
  document.getElementById('modalLoginAdmin').classList.remove('hidden');
}

function tutupLoginAdmin() {
  document.getElementById('modalLoginAdmin').classList.add('hidden');
}

async function prosesLoginAdmin(e) {
  e.preventDefault();
  const email = document.getElementById('adminEmailInp').value.trim();
  const pass = document.getElementById('adminPassInp').value;
  const btn = document.getElementById('btnLoginAdmin');

  btn.disabled = true;
  btn.innerText = 'Memeriksa...';

  try {
    const res = await api('loginAdmin', { email, password: pass });
    if (res.success && res.token) {
      setAdminToken(res.token);
      document.getElementById('adminPassInp').value = '';
      tutupLoginAdmin();
      bukaPanelAdmin();
    } else {
      alert(res.message || 'Login gagal');
    }
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
    btn.innerText = 'Masuk';
  }
}

function sesiAdminHabis() {
  clearAdminToken();
  masterAdminList = [];
  switchTab('beranda');
  showToast('Sesi admin berakhir. Silakan login ulang.');
  document.getElementById('modalLoginAdmin').classList.remove('hidden');
}

function adalahErrorSesi(res) {
  return res && res.success === false && /sesi admin/i.test(res.message || '');
}

function bukaPanelAdmin() {
  sembunyikanSemuaHalaman();
  document.getElementById('page-admin').classList.remove('hidden');
  document.getElementById('mainContainer').scrollTop = 0;
  muatDataAdmin();
}

async function muatDataAdmin() {
  const container = document.getElementById('adminListContainer');
  const icon = document.getElementById('refreshIcon');
  if (icon) icon.classList.add('fa-spin');

  container.innerHTML = '<div class="text-center py-6 text-xs text-slate-400"><i class="fa-solid fa-spinner fa-spin mr-1"></i> Memuat data laporan dari Google Sheets...</div>';

  try {
    const res = await api('ambilAdmin', { token: getAdminToken() });
    if (adalahErrorSesi(res)) return sesiAdminHabis();
    if (res.success) {
      masterAdminList = res.list || [];
      filterLaporanAdmin();
      showToast('Data laporan diperbarui!');
    } else {
      container.innerHTML = '<div class="text-center py-8 text-xs text-rose-500">' + escapeHtml(res.message) + '</div>';
    }
  } catch (err) {
    container.innerHTML = '<div class="text-center py-6 text-xs text-rose-500">' + escapeHtml(err.message) + '</div>';
  } finally {
    if (icon) icon.classList.remove('fa-spin');
  }
}

function renderDaftarLaporanAdmin(list) {
  const container = document.getElementById('adminListContainer');
  if (!list || list.length === 0) {
    container.innerHTML = '<div class="text-center py-8 text-xs text-slate-400">Tidak ada laporan yang cocok/ditemukan.</div>';
    return;
  }

  container.innerHTML = list.map(r => {
    const fotoBtn = isUrlAman(r.buktiFoto)
      ? `<a href="${escapeHtml(r.buktiFoto)}" target="_blank" rel="noopener noreferrer" class="text-indigo-600 hover:underline font-semibold text-[10px] inline-flex items-center">
           <i class="fa-solid fa-image mr-1"></i>Lihat Foto Bukti
         </a>`
      : '';

    return `
      <div class="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-sm space-y-2 text-xs">
        <div class="flex justify-between items-start">
          <div>
            <span class="font-mono font-bold text-hearme text-xs">${escapeHtml(r.kode)}</span>
            <div class="font-bold text-slate-800 text-xs mt-0.5">${escapeHtml(r.judul)}</div>
          </div>
          <span class="text-[10px] font-bold px-2 py-0.5 rounded-full border ${kelasWarnaStatus(r.status)}">
            ${escapeHtml(r.status)}
          </span>
        </div>
        <div class="text-[10px] text-slate-400 space-y-0.5">
          <div><i class="fa-regular fa-user mr-1"></i> ${escapeHtml(r.nama)} (${escapeHtml(r.email)})</div>
          <div><i class="fa-regular fa-calendar mr-1"></i> ${escapeHtml(r.waktuMasuk)} | Kategori: ${escapeHtml(r.kategori)}</div>
        </div>
        <div class="bg-slate-50 p-2 rounded-xl border text-[11px] text-slate-600 line-clamp-3">
          ${escapeHtml(r.kronologi)}
        </div>
        <div class="pt-1 flex justify-between items-center">
          <div>${fotoBtn}</div>
          <button data-kode="${escapeHtml(r.kode)}" onclick="bukaModalAdminEditByKode(this.dataset.kode)" class="bg-hearme hover:bg-hearme-dark text-white font-semibold px-3 py-1.5 rounded-lg text-[11px] active:scale-95 transition">
            <i class="fa-solid fa-pen-to-square mr-1"></i> Tindak Lanjut
          </button>
        </div>
      </div>`;
  }).join('');
}

function filterLaporanAdmin() {
  const q = document.getElementById('adminSearchInp').value.trim().toLowerCase();
  if (!q) {
    renderDaftarLaporanAdmin(masterAdminList);
    return;
  }
  const has = v => String(v || '').toLowerCase().includes(q);
  renderDaftarLaporanAdmin(masterAdminList.filter(item =>
    has(item.kode) || has(item.judul) || has(item.nama) || has(item.kategori)
  ));
}

function bukaModalAdminEditByKode(kode) {
  const r = masterAdminList.find(x => x.kode === kode);
  if (!r) return;
  document.getElementById('editKodeLaporan').innerText = r.kode;
  document.getElementById('editStatusInp').value = r.status;
  document.getElementById('editCatatanInp').value = r.catatanAdmin || '';
  document.getElementById('modalAdminEdit').classList.remove('hidden');
}

function tutupModalAdminEdit() {
  document.getElementById('modalAdminEdit').classList.add('hidden');
}

async function prosesUpdateLaporan(e) {
  e.preventDefault();
  const kode = document.getElementById('editKodeLaporan').innerText;
  const status = document.getElementById('editStatusInp').value;
  const catatan = document.getElementById('editCatatanInp').value.trim();
  const btn = document.getElementById('btnSimpanUpdate');

  btn.disabled = true;
  btn.innerText = 'Menyimpan...';

  try {
    const res = await api('updateAdmin', { token: getAdminToken(), kode, status, catatan });
    if (adalahErrorSesi(res)) {
      tutupModalAdminEdit();
      return sesiAdminHabis();
    }
    if (res.success) {
      tutupModalAdminEdit();
      showToast('Laporan berhasil diperbarui!');
      muatDataAdmin();
    } else {
      alert('Gagal: ' + (res.message || 'Terjadi kesalahan'));
    }
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
    btn.innerText = 'Simpan & Beritahu Pelapor';
  }
}

function logoutAdmin() {
  const token = getAdminToken();
  clearAdminToken();
  masterAdminList = [];
  if (token) api('logoutAdmin', { token }).catch(() => {});
  switchTab('beranda');
  showToast('Berhasil keluar dari mode admin');
}

// ================= HELPERS =================
function salinKode() {
  const code = document.getElementById('createdCode').innerText;
  if (!code) return;
  navigator.clipboard.writeText(code)
    .then(() => showToast('Kode berhasil disalin: ' + code))
    .catch(() => showToast('Gagal menyalin otomatis'));
}

let toastTimer = null;
function showToast(text) {
  const toast = document.getElementById('toastNotification');
  document.getElementById('toastMsg').innerText = text;
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 2500);
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function tampilkanHasilTracking(data) {
  currentTrackedReport = data;

  document.getElementById('trackKode').innerText = data.kode;
  document.getElementById('trackStatusBadge').innerText = data.status;

  // Panggil pengaturan warna status
  aturWarnaStatus(data.status);

  document.getElementById('trackWaktuMasuk').innerText = data.waktuMasuk;
  document.getElementById('timelineStatusTxt').innerText = data.status;
  document.getElementById('hasilTrackingCard').classList.remove('hidden');
}


// ================= WARNA STATUS =================
function aturWarnaStatus(status) {
  const badge = document.getElementById('trackStatusBadge');
  const dot = document.getElementById('timelineStatusDot');

  const warna = {
    'Menunggu Verifikasi': 'bg-amber-100 text-amber-700',
    'Sedang Diproses': 'bg-blue-100 text-blue-700',
    'Dalam Investigasi': 'bg-purple-100 text-purple-700',
    'Selesai Ditindaklanjuti': 'bg-emerald-100 text-emerald-700',
    'Ditolak / Tidak Valid': 'bg-red-100 text-red-700'
  };

  const titik = {
    'Menunggu Verifikasi': 'bg-amber-400',
    'Sedang Diproses': 'bg-blue-500',
    'Dalam Investigasi': 'bg-purple-500',
    'Selesai Ditindaklanjuti': 'bg-emerald-500',
    'Ditolak / Tidak Valid': 'bg-red-500'
  };

  badge.className = 'text-[10px] font-bold px-3 py-1 rounded-full ' +
    (warna[status] || 'bg-slate-100 text-slate-600');

  if (dot) {
    dot.className = 'w-2.5 h-2.5 rounded-full absolute -left-[21px] top-1 ' +
      (titik[status] || 'bg-slate-400');
  }
}

// ================= WARNA STATUS ADMIN =================
function kelasWarnaStatus(status) {
  const warna = {
    'Menunggu Verifikasi': 'bg-amber-50 text-amber-700 border-amber-200',
    'Sedang Diproses': 'bg-blue-50 text-blue-700 border-blue-200',
    'Dalam Investigasi': 'bg-purple-50 text-purple-700 border-purple-200',
    'Selesai Ditindaklanjuti': 'bg-emerald-50 text-emerald-700 border-emerald-200',
    'Ditolak / Tidak Valid': 'bg-red-50 text-red-700 border-red-200'
  };

  return warna[status] || 'bg-slate-50 text-slate-600 border-slate-200';
}


// Hanya izinkan link http(s) untuk foto bukti
function isUrlAman(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url);
}
