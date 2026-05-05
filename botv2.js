const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const express = require('express');
const cron = require('node-cron'); // Modul baru untuk Auto-Update

// ==========================================
// 🌐 SETUP WEB SERVER (BIAR NYALA 24/7 DI CLOUD RENDER)
// ==========================================
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('BOT READY DI GUNAKAN KAKKK');
});

app.listen(port, '0.0.0.0', () => {
  console.log(`bot siap di gunakan kakkk ${port}`);
});

// ==========================================
// 🤖 SETUP BOT TELEGRAM
// ==========================================
const BOT_TOKEN = '8425326650:AAFu9jFivIDN38tDiiyrBZzfZYX3A6cDAO4';
const API_KEY = '6a2dba6c32c3d78b86a7366f4d592abe8fd287e7f14c5274dca01c2d6311d7ef';

const bot = new Telegraf(BOT_TOKEN);

// ==========================================
// 👑 SISTEM KEAMANAN, KASTA USER, & DATABASES (MEMORY)
// ==========================================
const ADMIN_USERNAMES = ['padilstore', 'brownmatcha']; 
const ADMIN_CHAT_ID = '8505107135';   // ISI DENGAN CHAT ID KAMU (ANGKA) AGAR BOT BISA NGASIH NOTIF SAAT DEPLOY

const START_TIME = Date.now(); // Perekam waktu bot pertama kali nyala (Untuk fitur /time)

const freeUsers = new Set(); // Kasta 1: Free
const vipUsers = {};         // Kasta 2: VIP 1 (Objek untuk simpan limit & expired)
const usageHistory = {};     // Riwayat waktu pakai limit Free (24 Jam)
const extraLimits = {};      // Limit tambahan manual
const MAX_LIMIT = 2;         // Batas Free per 24 jam

const userChatIds = {};      // Nyimpan Chat ID untuk Broadcast & Notif
const savedResi = {};        // Database History Resi per User
const autoTrackList = [];    // Database Resi yang masuk Auto-Track

// Satpam Pengecek Akses & Pencatat Chat ID
bot.use(async (ctx, next) => {
  const username = ctx.from?.username;

  if (username) {
    userChatIds[username.toLowerCase()] = ctx.from.id;
  }

  if (!username) {
    if (ctx.callbackQuery) {
      return ctx.answerCbQuery('⚠️ Atur Username Telegram dulu!', { show_alert: true });
    }
    return ctx.reply('⚠️ *PERHATIAN*\n\nKamu belum mengatur *Username Telegram*.\nSilakan masuk ke Pengaturan (Settings) profil Telegram kamu dan buat Username terlebih dahulu agar bisa menggunakan layanan sistem ini.', { parse_mode: 'Markdown' });
  }

  const usernameLower = username.toLowerCase();
  const isAdmin = ADMIN_USERNAMES.includes(usernameLower);

  // Cek jika user adalah VIP, apakah masa aktifnya sudah habis?
  if (vipUsers[usernameLower]) {
    if (Date.now() > vipUsers[usernameLower].expiry) {
      delete vipUsers[usernameLower];
      freeUsers.add(usernameLower);
      // Notif otomatis saat expired
      bot.telegram.sendMessage(ctx.from.id, `⚠️ *INFO VIP*\n\nMasa aktif paket VIP kamu telah habis. Statusmu otomatis kembali menjadi *Free*. Ketik /premium untuk info perpanjangan.`, { parse_mode: 'Markdown' }).catch(() => {});
    }
  }

  // Jika bukan admin dan bukan VIP, otomatis masuk daftar Free
  if (!isAdmin && !vipUsers[usernameLower]) {
    freeUsers.add(usernameLower);
  }

  return next();
});

function checkDailyLimit(username) {
  const now = Date.now();
  const ONE_DAY = 24 * 60 * 60 * 1000;

  if (!usageHistory[username]) usageHistory[username] = [];
  usageHistory[username] = usageHistory[username].filter(time => (now - time) < ONE_DAY);

  if (usageHistory[username].length < MAX_LIMIT) {
    usageHistory[username].push(now);
    return true; 
  } else {
    if (extraLimits[username] && extraLimits[username] > 0) {
      extraLimits[username] -= 1; 
      return true; 
    }
    return false; 
  }
}

// ------------------------------------------
// FITUR ADMIN: COMMAND, TIME, BROADCAST, DLL
// ------------------------------------------

// Fitur Cheat Sheet Command Admin
bot.command('command', (ctx) => {
  const username = ctx.from?.username?.toLowerCase() || '';
  if (!ADMIN_USERNAMES.includes(username)) return;

  const msg = `🛠️ *DAFTAR PERINTAH ADMIN* 🛠️
_Simpan pesan ini agar tidak lupa!_

1️⃣ */addvip <username> <hari> <limit>*
👉 Tambah VIP dinamis.
Contoh: \`/addvip dika 30 100\`

2️⃣ */tambahlimit <jumlah> <username>*
👉 Tambah limit untuk member Free.
Contoh: \`/tambahlimit 10 budi\`

3️⃣ */delvip <username>* atau */del <username>*
👉 Hapus akses VIP/Limit ekstra dari user secara paksa (Kembali jadi Free).
Contoh: \`/delvip joko\`

4️⃣ */list*
👉 Lihat daftar semua user (VIP & Free) beserta sisa limit & expired-nya.

5️⃣ */lihatresi <username>*
👉 Intip daftar resi yang disimpan user.
Contoh: \`/lihatresi andi\`

6️⃣ */bc <pesan>*
👉 Kirim pesan broadcast ke semua user bot.
Contoh: \`/bc Bot sedang maintenance jam 12 malam\`

7️⃣ */time*
👉 Cek statistik durasi bot menyala (Uptime server).`;

  ctx.reply(msg, { parse_mode: 'Markdown' });
});

// Fitur Cek Uptime Bot (WIB)
bot.command('time', (ctx) => {
  const username = ctx.from?.username?.toLowerCase() || '';
  if (!ADMIN_USERNAMES.includes(username)) return;

  const now = Date.now();
  const diff = now - START_TIME;

  const seconds = Math.floor((diff / 1000) % 60);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  // Format Tanggal Mulai dipaksa ke WIB (Asia/Jakarta)
  const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' };
  const startDateStr = new Date(START_TIME).toLocaleString('id-ID', options).replace(/\./g, ':');

  const msg = `⏱️ *INFO WAKTU AKTIF BOT (UPTIME)*
━━━━━━━━━━━━━━━━━━━━━━

🚀 *Mulai Beroperasi Sejak:*
✅ Aktif sejak ${startDateStr} WIB

⏳ *Durasi Menyala Non-Stop:*
👉 ${days} Hari, ${hours} Jam, ${minutes} Menit, ${seconds} Detik

_Catatan: Waktu ini akan keriset dari 0 lagi setiap kali bot di-restart atau di-deploy ulang di server._`;

  ctx.reply(msg, { parse_mode: 'Markdown' });
});

// Broadcast Pesan Massal (Hanya Admin)
bot.command('bc', async (ctx) => {
  const username = ctx.from?.username?.toLowerCase() || '';
  if (!ADMIN_USERNAMES.includes(username)) return;

  const pesan = ctx.message.text.split(' ').slice(1).join(' ');
  if (!pesan) return ctx.reply('❗ Format salah!\n\nKetik: `/bc <pesan pengumuman>`', { parse_mode: 'Markdown' });

  let successCount = 0;
  for (const user in userChatIds) {
    try {
      await bot.telegram.sendMessage(userChatIds[user], `📢 *BROADCAST PENGUMUMAN*\n\n${pesan}`, { parse_mode: 'Markdown' });
      successCount++;
    } catch (e) { /* Abaikan jika user blokir bot */ }
  }
  ctx.reply(`✅ Broadcast berhasil dikirim ke *${successCount}* pengguna aktif.`, { parse_mode: 'Markdown' });
});

// Admin Lihat Resi User
bot.command('lihatresi', (ctx) => {
  const username = ctx.from?.username?.toLowerCase() || '';
  if (!ADMIN_USERNAMES.includes(username)) return;

  const parts = ctx.message.text.split(' ');
  if (parts.length < 2) return ctx.reply('❗ Format salah!\n\nKetik: `/lihatresi username`\nContoh: `/lihatresi budi`', { parse_mode: 'Markdown' });

  const targetUser = parts[1].replace('@', '').toLowerCase();
  const history = savedResi[targetUser];

  if (!history || history.length === 0) {
    return ctx.reply(`📂 Pengguna @${targetUser} belum menyimpan resi apapun.`);
  }

  let msg = `📂 *Daftar Resi Milik @${targetUser}*\n\n`;
  history.forEach((r, i) => {
    msg += `${i + 1}. *${r.courier.toUpperCase()}* - \`${r.awb}\`\n`;
  });

  ctx.reply(msg, { parse_mode: 'Markdown' });
});

// Tambah Limit Manual ke User Free
bot.command('tambahlimit', (ctx) => {
  const username = ctx.from?.username?.toLowerCase() || '';
  if (!ADMIN_USERNAMES.includes(username)) return; 

  const parts = ctx.message.text.split(' ');
  if (parts.length < 3) return ctx.reply('❗ Format salah!\n\nKetik: `/tambahlimit <jumlah> <username>`\nContoh: `/tambahlimit 2 budi`', { parse_mode: 'Markdown' });

  const amount = parseInt(parts[1]);
  const targetUser = parts[2].replace('@', '').toLowerCase();

  if (isNaN(amount) || amount <= 0) return ctx.reply('❗ Jumlah limit harus berupa angka > 0.');

  if (!extraLimits[targetUser]) extraLimits[targetUser] = 0;
  extraLimits[targetUser] += amount;
  freeUsers.add(targetUser);

  ctx.reply(`✅ *BERHASIL!*\nLimit ekstra *${amount}x* diberikan ke @${targetUser}.`, { parse_mode: 'Markdown' });

  if (userChatIds[targetUser]) {
    bot.telegram.sendMessage(userChatIds[targetUser], `🎉 *SELAMAT!*\n\nAdmin memberikan saldo *${amount}x limit tambahan* ke akunmu!`, { parse_mode: 'Markdown' }).catch(() => {});
  }
});

// Tambah User VIP (Dinamis: Limit & Hari)
bot.command('addvip', (ctx) => {
  const username = ctx.from?.username?.toLowerCase() || '';
  if (!ADMIN_USERNAMES.includes(username)) return; 

  const parts = ctx.message.text.split(' ');
  if (parts.length < 4) {
    return ctx.reply('❗ Format salah!\n\nKetik: `/addvip <username> <berapa_hari> <jumlah_limit>`\nContoh: `/addvip budi 1 50`', { parse_mode: 'Markdown' });
  }

  const newUser = parts[1].replace('@', '').toLowerCase();
  const hari = parseInt(parts[2]);
  const limit = parseInt(parts[3]);

  if (isNaN(hari) || hari <= 0) return ctx.reply('❗ Jumlah hari harus berupa angka > 0.');
  if (isNaN(limit) || limit <= 0) return ctx.reply('❗ Jumlah limit harus berupa angka > 0.');

  const expiryDate = Date.now() + (hari * 24 * 60 * 60 * 1000); 
  
  vipUsers[newUser] = { limit: limit, expiry: expiryDate };
  freeUsers.delete(newUser); 
  
  ctx.reply(`💎 *BERHASIL!*\n@${newUser} resmi *VIP* (Limit ${limit}x, Aktif ${hari} Hari).`, { parse_mode: 'Markdown' });

  if (userChatIds[newUser]) {
    bot.telegram.sendMessage(userChatIds[newUser], `💎 *AKSES VIP DIBERIKAN!* 💎\n\nSelamat! Akun kamu (@${newUser}) telah di-Upgrade ke *VIP*.\n\n📦 *Benefit:*\n- Limit Cek: ${limit}x\n- Masa Aktif: ${hari} Hari\n- Bebas Limit Harian\n- Akses Fitur Auto-Track\n\nMenyala abangkuh! 🔥🚀`, { parse_mode: 'Markdown' }).catch(() => {});
  }
});

// Hapus/Cabut Akses VIP secara Paksa (Tiba-tiba)
bot.command(['del', 'delvip'], (ctx) => {
  const username = ctx.from?.username?.toLowerCase() || '';
  if (!ADMIN_USERNAMES.includes(username)) return;

  const parts = ctx.message.text.split(' ');
  if (parts.length < 2) return ctx.reply('❗ Format salah!\n\nKetik: `/delvip username`', { parse_mode: 'Markdown' });

  const targetUser = parts[1].replace('@', '').toLowerCase();
  
  delete vipUsers[targetUser];
  freeUsers.delete(targetUser);
  delete usageHistory[targetUser];
  delete extraLimits[targetUser];

  ctx.reply(`🗑️ *BERHASIL CABUT VIP*\nAkses VIP untuk @${targetUser} telah dihapus. Statusnya kembali ke standar (Free).`, { parse_mode: 'Markdown' });

  // Notif ke User kalau VIP nya dicabut
  if (userChatIds[targetUser]) {
    bot.telegram.sendMessage(userChatIds[targetUser], `⚠️ *PEMBERITAHUAN*\n\nMohon maaf, akses *VIP* kamu telah dinonaktifkan oleh Admin. Status akunmu saat ini kembali menjadi member *Free*.`, { parse_mode: 'Markdown' }).catch(() => {});
  }
});

bot.command('list', (ctx) => {
  const username = ctx.from?.username?.toLowerCase() || '';
  if (!ADMIN_USERNAMES.includes(username)) return;

  let msg = '🌟 *DAFTAR PENGGUNA BOT:*\n\n';

  msg += `💎 *VIP (Limit & Expired):*\n`;
  const vipKeys = Object.keys(vipUsers);
  if (vipKeys.length === 0) {
    msg += `_Belum ada member VIP_\n`;
  } else {
    let v = 1;
    vipKeys.forEach(user => { 
      // Mengubah jam expired ke WIB
      const expDate = new Date(vipUsers[user].expiry).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }).replace(/\./g, ':');
      msg += `${v}. @${user} (Sisa: ${vipUsers[user].limit}x | Exp: ${expDate} WIB)\n`; 
      v++; 
    });
  }
  msg += `\n`;

  msg += `👤 *FREE MEMBERS:*\n`;
  if (freeUsers.size === 0) {
    msg += `_Belum ada member Free_\n`;
  } else {
    let f = 1;
    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;
    
    freeUsers.forEach(user => {
      let historyCount = 0;
      if (usageHistory[user]) historyCount = usageHistory[user].filter(time => (now - time) < ONE_DAY).length;
      
      const sisaHarian = (MAX_LIMIT - historyCount > 0) ? (MAX_LIMIT - historyCount) : 0;
      const sisaEkstra = extraLimits[user] || 0;
      msg += `${f}. @${user} (Harian: ${sisaHarian}x | Ekstra: ${sisaEkstra}x)\n`;
      f++;
    });
  }
  
  ctx.reply(msg, { parse_mode: 'Markdown' });
});

// ------------------------------------------
// FITUR MENU USER: PREMIUM & HISTORY
// ------------------------------------------

bot.command(['premium', 'upgrade'], (ctx) => {
  ctx.reply(
`👑 *INFORMASI UPGRADE PREMIUM* 👑

*Paket VIP:*
• Limit Cek Resi (Bisa Request)
• Masa Aktif (Bisa Request)
• Akses Fitur *Auto-Track* (Notif otomatis jika paket bergerak)
• Bebas limit tunggu 24 jam

💳 Pembayaran via:
- Dana / Gopay / Qris (Tanya Admin)

Berminat? Langsung chat/kirim bukti transfer ke Admin @padilstore untuk aktivasi! 🔥`, 
    { parse_mode: 'Markdown' }
  );
});

bot.command(['riwayat', 'history'], (ctx) => {
  const username = ctx.from?.username?.toLowerCase();
  const resis = savedResi[username] || [];

  if (resis.length === 0) {
    return ctx.reply('📂 Kamu belum pernah menyimpan resi. Gunakan tombol "💾 Simpan Resi" saat melacak paket.');
  }

  let msg = '📂 *Resi Tersimpan Kamu:*\n_Klik pada resi untuk menyalin dan mengecek ulang_\n\n';
  resis.forEach((r) => {
    msg += `📦 ${r.courier.toUpperCase()}\n\`${r.courier} ${r.awb}\`\n\n`;
  });
  
  ctx.reply(msg, { parse_mode: 'Markdown' });
});


// ==========================================
// FUNGSI UTAMA TRACKING (TIDAK ADA YANG DIHAPUS)
// ==========================================

// FITUR SAPAAN BERDASARKAN WIB BUKAN UTC SERVER
function getGreeting() {
  const d = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', hour: 'numeric', hour12: false });
  const hour = parseInt(formatter.format(d));
  
  if (hour < 11) return 'Selamat Pagi 🌅';
  if (hour < 15) return 'Selamat Siang ☀️';
  if (hour < 18) return 'Selamat Sore 🌇';
  return 'Selamat Malam 🌙';
}

function getProgressBar(status = '') {
  const s = status.toLowerCase();
  if (s.includes('delivered') || s.includes('sukses') || s.includes('berhasil')) return '▓▓▓▓▓▓▓▓▓▓ 100% (Selesai)';
  if (s.includes('courier') || s.includes('kurir') || s.includes('delivery')) return '▓▓▓▓▓▓▓▓░░ 85% (Otw Alamat)';
  if (s.includes('transit') || s.includes('hub') || s.includes('gateway')) return '▓▓▓▓▓▓░░░░ 60% (Transit)';
  if (s.includes('process') || s.includes('sorting')) return '▓▓▓▓░░░░░░ 70% (Diproses)';
  if (s.includes('pickup') || s.includes('jemput') || s.includes('received')) return '▓▓░░░░░░░░ 20% (Dijemput)';
  if (s.includes('failed') || s.includes('gagal') || s.includes('return')) return '░░░░░░░░░░ 0% (Gagal/Retur)';
  return '▓▓▓░░░░░░░ 30% (Berjalan)';
}

function cleanData(text) {
  if (!text) return '';
  return String(text).replace(/[_*`\[\]]/g, ' ').trim();
}

function formatDate(str) {
  const d = new Date(str);
  if (isNaN(d)) return str;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}-${month}-${year} ${hours}:${minutes}`;
}

function getCourierName(code) {
  const couriers = {
    'jne': 'JNE Express', 'jnt': 'J&T Express', 'jntcargo': 'J&T Cargo',
    'sicepat': 'SiCepat Ekspres', 'spx': 'Shopee Express (SPX)',
    'lex': 'Lazada eLogistics (LEX)', 'idx': 'ID Express',
    'anteraja': 'AnterAja', 'ninja': 'Ninja Xpress', 'lion': 'Lion Parcel',
    'pos': 'POS Indonesia', 'tiki': 'TIKI', 'wahana': 'Wahana Logistik',
    'sap': 'SAP Express', 'jet': 'JET Express'
  };
  return couriers[code.toLowerCase()] || code.toUpperCase();
}

// === FUNGSI INTI TRACKING (Biar Rapi & Reusable) ===
async function processResiTracking(ctx, courier, waybill, number) {
  try {
    const loadingMsg = await ctx.reply('⏳ _Sistem sedang memproses data resi kamu..._', { parse_mode: 'Markdown' });

    const params = { api_key: API_KEY, courier, awb: waybill };
    if (number) params.number = number;

    const res = await axios.get('https://api.binderbyte.com/v1/track', { params });

    if (!res.data || !res.data.data) {
      await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id).catch(() => {});
      return ctx.reply('❌ Respon API tidak valid atau data tidak ditemukan.');
    }

    const data = res.data.data;
    const summary = data.summary || {};
    const detail = data.detail || {}; 
    const history = data.history || [];
    
    const courierName = cleanData(getCourierName(summary.courier || courier));
    const awbClean = cleanData(summary.awb);
    
    const isMarketplace = (courier === 'spx' || courier === 'lex');
    const hiddenText = isMarketplace ? 'Privasi Sistem (Disensor)' : 'Tidak tercatat di sistem';
    
    const receiver = cleanData(detail.receiver || summary.receiver) || hiddenText;
    const destination = cleanData(detail.destination || summary.destination) || hiddenText;
    const shipper = cleanData(detail.shipper) || hiddenText;
    const origin = cleanData(detail.origin) || hiddenText;
    
    const service = cleanData(summary.service || 'Standar');
    const weight = cleanData(summary.weight ? `${summary.weight}` : '-');
    const statusText = cleanData(summary.status || 'Data sedang diproses');
    
    const amountStr = String(summary.amount || '');

    let paymentStatus = 'NON-COD / Lunas';
    if (amountStr && amountStr !== '0' && amountStr.toLowerCase() !== 'false') {
      const formattedCod = Number(amountStr).toLocaleString('id-ID');
      paymentStatus = `COD Rp. ${formattedCod},-`;
    } else if (isMarketplace) {
      paymentStatus = `Sistem Aplikasi (Bisa COD/Lunas)`;
    }

    const lastDate = history.length > 0 ? formatDate(history[0].date) : '-';
    const progressBar = getProgressBar(summary.status);

    let msg = `📦 *EKSPEDISI ${courier.toUpperCase()}*\n`;
    msg += `└ ${courierName}\n\n`;

    msg += `📩 *Informasi Resi*\n`;
    msg += `├ No Resi : ${awbClean}\n`;
    msg += `├ Layanan : ${service} (Berat: ${weight})\n`;
    msg += `└ Tipe    : ${paymentStatus}\n\n`;

    msg += `📮 *Status Pengiriman*\n`;
    msg += `├ ${statusText}\n`;
    msg += `├ ${lastDate}\n`;
    msg += `└ Progress: \`${progressBar}\`\n\n`; 

    msg += `📤 *Pengirim*\n`;
    msg += `├ Nama : ${shipper}\n`;
    msg += `└ Asal : ${origin}\n\n`;

    msg += `🚩 *Penerima*\n`;
    msg += `├ Nama   : ${receiver}\n`;
    msg += `└ Tujuan : ${destination}\n\n`;

    msg += `⏩ *POD Detail*\n`;

    if (history.length === 0) {
      msg += '└ 📭 Belum ada riwayat pengiriman.\n';
    } else {
      const fullHistory = [...history].reverse();
      fullHistory.forEach((h) => {
        const descClean = cleanData(h.desc);
        msg += `✅ ${descClean}\n`;
        msg += `└ ${formatDate(h.date)}\n`;
      });
    }

    await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id).catch(() => {});
    
    // UI Button Terbaru (Simpan, Auto-Track, Hapus)
    ctx.reply(msg, { 
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('💾 Simpan Resi', `save_${courier}_${awbClean}`),
          Markup.button.callback('🔔 Auto-Track (VIP)', `auto_${courier}_${awbClean}`)
        ],
        [Markup.button.callback('🗑️ Hapus Resi Ini', 'btn_delete_msg')]
      ])
    });

  } catch (err) {
    console.error('Error tracking:', err.response?.data || err.message);
    let errorDetails = '';
    if (err.response && err.response.data && err.response.data.message) {
      errorDetails = `\n💬 *Pesan Sistem:* _${cleanData(err.response.data.message)}_`;
    }
    ctx.reply(`❌ *Gagal melacak resi*\n\nKemungkinan penyebab:\n- Nomor resi salah / belum terdaftar\n- Kode kurir salah ketik\n- Limit API habis${errorDetails}\n\nSilakan periksa kembali resinya 🙏`, { parse_mode: 'Markdown' });
  }
}

bot.start((ctx) => {
  const userName = cleanData(ctx.from.first_name || 'Kak');
  const usernameLower = ctx.from?.username?.toLowerCase() || '';
  const isAdmin = ADMIN_USERNAMES.includes(usernameLower);

  let limitText = "";
  
  if (isAdmin) {
    limitText = `👑 Status: *ADMIN* (Unlimited)`;
  } else if (vipUsers[usernameLower]) {
    const sisa = vipUsers[usernameLower].limit;
    // Mengubah jam expired ke WIB untuk info User
    const exp = new Date(vipUsers[usernameLower].expiry).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }).replace(/\./g, ':');
    limitText = `💎 Status: *VIP*\n🔋 Sisa Limit: *${sisa}x*\n⏳ Kedaluwarsa: *${exp} WIB*`;
  } else {
    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;
    let historyCount = 0;
    if (usageHistory[usernameLower]) historyCount = usageHistory[usernameLower].filter(time => (now - time) < ONE_DAY).length;
    
    const sisaHarian = (MAX_LIMIT - historyCount > 0) ? (MAX_LIMIT - historyCount) : 0;
    const sisaEkstra = extraLimits[usernameLower] || 0;
    limitText = `👤 Status: *FREE*\n🔋 Limit Harian: *${sisaHarian}x*\n🎁 Limit Tambahan: *${sisaEkstra}x*\n\n_Mau limit banyak & Auto-Track? Ketik /premium_`;
  }

  ctx.reply(
`${getGreeting()} *${userName}*! 👋

Selamat datang di *Bot Lacak Resi Premium*.

${limitText}

Kirim resi dengan format:
📌 *kode_kurir nomor_resi*

Contoh:
\`spx SPX123456789\`
\`jnt JP123456789\`

Silakan pilih menu di bawah ini:`,
    { 
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🚚 Daftar Kurir', 'btn_kurir'), Markup.button.callback('📖 Cara Pakai', 'btn_help')],
        [Markup.button.callback('📂 Resi Tersimpan', 'btn_history'), Markup.button.callback('👨‍💻 Tentang Bot', 'btn_about')]
      ])
    }
  );
});

bot.action('btn_kurir', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.reply(`🚚 *Daftar Kode Ekspedisi Populer:*\n• \`spx\` - Shopee Express\n• \`jnt\` - J&T Express\n• \`jne\` - JNE Express\n• \`sicepat\` - SiCepat Ekspres\n• \`idx\` - ID Express\n• \`anteraja\` - AnterAja\n• \`ninja\` - Ninja Xpress\n• \`pos\` - POS Indonesia\n• \`lex\` - Lazada Express\n• \`tiki\` - TIKI\n• \`lion\` - Lion Parcel\n• \`wahana\` - Wahana\n• \`jntcargo\` - J&T Cargo\n• \`sap\` - SAP Express`, { parse_mode: 'Markdown' });
});

bot.action('btn_help', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.reply(`📖 *Panduan Penggunaan:*\n\n1. Ketik kode ekspedisi lalu nomor resi.\nContoh: \`jnt JP1234567890\`\n\n2. *Catatan JNE:* Jika data kurang lengkap, tambahkan 5 digit terakhir nomor HP.\nContoh: \`jne 123456789 12345\``, { parse_mode: 'Markdown' });
});

bot.action('btn_history', async (ctx) => {
  await ctx.answerCbQuery();
  const username = ctx.from?.username?.toLowerCase();
  const resis = savedResi[username] || [];
  if (resis.length === 0) return ctx.reply('📂 Kamu belum pernah menyimpan resi.');
  
  let msg = '📂 *Resi Tersimpan Kamu:*\n_Klik pada resi untuk menyalin_\n\n';
  resis.forEach(r => { msg += `📦 ${r.courier.toUpperCase()}\n\`${r.courier} ${r.awb}\`\n\n`; });
  ctx.reply(msg, { parse_mode: 'Markdown' });
});

bot.action('btn_about', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.reply('👨‍💻 Bot Premium dengan UI interaktif, pendeteksi COD cerdas, dan fitur VIP Auto-Track resi.');
});

bot.action('btn_delete_msg', async (ctx) => {
  try {
    await ctx.deleteMessage();
    await ctx.answerCbQuery('Pesan resi dihapus 🗑️');
  } catch (error) {
    await ctx.answerCbQuery('Gagal menghapus pesan.');
  }
});

// Aksi Tombol Simpan Resi
bot.action(/^save_([^_]+)_(.+)$/, async (ctx) => {
  const courier = ctx.match[1];
  const awb = ctx.match[2];
  const username = ctx.from?.username?.toLowerCase();

  if (!savedResi[username]) savedResi[username] = [];
  const exists = savedResi[username].find(r => r.awb === awb);
  
  if (exists) return ctx.answerCbQuery('⚠️ Resi ini sudah tersimpan di riwayatmu!', { show_alert: true });

  savedResi[username].push({ courier, awb });
  await ctx.answerCbQuery('✅ Resi berhasil disimpan!', { show_alert: true }).catch(() => {});
});

// Aksi Tombol Auto-Track
bot.action(/^auto_([^_]+)_(.+)$/, async (ctx) => {
  const courier = ctx.match[1];
  const awb = ctx.match[2];
  const username = ctx.from?.username?.toLowerCase();
  const isAdmin = ADMIN_USERNAMES.includes(username);

  if (!vipUsers[username] && !isAdmin) {
    return ctx.answerCbQuery('⛔ Fitur Auto-Track eksklusif untuk member VIP! Ketik /premium', { show_alert: true });
  }

  const exists = autoTrackList.find(a => a.awb === awb);
  if (exists) return ctx.answerCbQuery('⚠️ Resi ini sudah masuk daftar Auto-Track!', { show_alert: true });

  autoTrackList.push({
    chatId: ctx.from.id,
    username,
    courier,
    awb,
    lastStatus: '' // Akan diisi saat cron berjalan pertama kali
  });

  ctx.answerCbQuery('🔔 Auto-Track AKTIF! Bot akan memantau dan mengirim notif jika paketmu bergerak.', { show_alert: true });
});

// Handler Pesan Teks (Lacak Resi)
bot.on('text', async (ctx) => {
  const textMsg = ctx.message.text.trim();
  if (textMsg.startsWith('/')) return;

  const parts = textMsg.split(/\s+/);
  if (parts.length < 2) {
    return ctx.reply('❗ *Format salah*\n\nContoh yang benar: \`spx SPX123456789\` atau \`jnt JP123456789\`', { parse_mode: 'Markdown' });
  }

  const usernameLower = ctx.from?.username?.toLowerCase() || '';
  const isAdmin = ADMIN_USERNAMES.includes(usernameLower);
  
  // PEMOTONG LIMIT (FREE VS VIP)
  if (!isAdmin) {
    if (vipUsers[usernameLower]) {
      // Logic VIP
      if (vipUsers[usernameLower].limit <= 0) {
        return ctx.reply(`⛔ *LIMIT VIP HABIS*\n\nLimit paket VIP kamu telah habis. Ketik /premium untuk perpanjang.`, { parse_mode: 'Markdown' });
      }
      vipUsers[usernameLower].limit -= 1; // Kurangi limit VIP
    } else {
      // Logic Free
      const isAllowed = checkDailyLimit(usernameLower);
      if (!isAllowed) {
        return ctx.reply(`⛔ *LIMIT HABIS*\n\nMaaf, kuota gratis harianmu (2x/24 jam) sudah habis. Tunggu besok atau ketik /premium untuk Upgrade VIP!`, { parse_mode: 'Markdown' });
      }
    }
  }

  const courier = parts[0].toLowerCase();
  const waybill = parts[1];
  const number = parts[2];

  // Panggil fungsi inti yang dipisah biar rapi
  await processResiTracking(ctx, courier, waybill, number);
});


// ==========================================
// ⏰ SISTEM CRON JOB (AUTO-TRACK RESI VIP)
// Berjalan setiap 3 Jam sekali
// ==========================================
cron.schedule('0 */3 * * *', async () => {
  console.log('Menjalankan Auto-Track Pengecekan Resi VIP...');
  
  // Loop menggunakan index agar gampang dihapus jika paket selesai
  for (let i = autoTrackList.length - 1; i >= 0; i--) {
    const item = autoTrackList[i];
    try {
      const params = { api_key: API_KEY, courier: item.courier, awb: item.awb };
      const res = await axios.get('https://api.binderbyte.com/v1/track', { params });
      
      if (res.data && res.data.data) {
        const currentStatus = res.data.data.summary.status;
        
        // Cek apakah status berubah dari pantauan sebelumnya
        if (item.lastStatus !== '' && currentStatus !== item.lastStatus) {
            
          const notifMsg = `🔔 *UPDATE OTOMATIS (AUTO-TRACK)*\n\n📦 *${item.courier.toUpperCase()}* - \`${item.awb}\`\n\n📮 *Status Baru:*\n_${currentStatus}_\n\nCek ulang secara manual jika diperlukan.`;
          
          bot.telegram.sendMessage(item.chatId, notifMsg, { parse_mode: 'Markdown' }).catch(() => {});
        }
        
        // Perbarui status terakhir
        autoTrackList[i].lastStatus = currentStatus;

        // Jika paket sudah sampai / gagal, hapus dari daftar pantauan agar server tidak berat
        const lowerStatus = currentStatus.toLowerCase();
        if (lowerStatus.includes('delivered') || lowerStatus.includes('sukses') || lowerStatus.includes('gagal') || lowerStatus.includes('return')) {
          autoTrackList.splice(i, 1);
          bot.telegram.sendMessage(item.chatId, `✅ Pemantauan Auto-Track untuk resi \`${item.awb}\` telah dihentikan karena paket berstatus Selesai/Gagal.`, { parse_mode: 'Markdown' }).catch(() => {});
        }
      }
    } catch (err) {
      // Abaikan jika error API saat background check
    }
  }
});

console.log('Menyiapkan bot dan web server...');

// INI BAGIAN YANG DITAMBAH { dropPendingUpdates: true } UNTUK ANTI-ERROR 409
bot.launch({ dropPendingUpdates: true }).then(() => {
  console.log('bot ready di gunakan kakak,gass teruss');
  
  // FITUR BARU: AUTO-NOTIF KE ADMIN SAAT SELESAI DEPLOY
  if (ADMIN_CHAT_ID && ADMIN_CHAT_ID !== '8505107135') {
    bot.telegram.sendMessage(ADMIN_CHAT_ID, '✅ *bott ready nih min siap di gunakan hehe*', { parse_mode: 'Markdown' }).catch(() => {
      console.log('Gagal kirim pesan ke Admin. Pastikan Chat ID benar dan Admin sudah nge-start bot.');
    });
  }
}).catch((err) => {
  console.error('Gagal menjalankan bot:', err);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));