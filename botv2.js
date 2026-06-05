const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const express = require('express');

// ==========================================
// 🌐 SETUP WEB SERVER (BIAR NYALA 24/7 DI CLOUD RENDER)
// ==========================================
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('✅ Bot Lacak Resi (Edisi Gabut) Sedang Berjalan 24/7! 🚀');
});

app.listen(port, '0.0.0.0', () => {
  console.log(`🌐 Web server aktif di port ${port}`);
});

// ==========================================
// 🤖 SETUP BOT TELEGRAM & MULTI API KEY
// ==========================================
const BOT_TOKEN = '8425326650:AAFu9jFivIDN38tDiiyrBZzfZYX3A6cDAO4';
const ADMIN_CHAT_ID = 8505107135; 

const bot = new Telegraf(BOT_TOKEN);

// 🔥 SISTEM MULTI API KEY (AUTO FALLBACK)
const API_KEYS = [
  '6a2dba6c32c3d78b86a7366f4d592abe8fd287e7f14c5274dca01c2d6311d7ef', // API Key 1 (Yang lagi dipakai)
  '98c470e253df048535e42833659e0a785e8f5dfc95acc34271dd39cd2bfedf4a' // 👈 TARUH API KEY AKUN KEDUA KAMU DI SINI
];
let currentApiIndex = 0; // Mulai dari index 0 (API Key 1)

// 🔥 Waktu pertama kali script dijalankan (UNTUK FITUR /time)
const startTime = Date.now();

// 🔥 Database sementara untuk nyimpen data pantauan resi VIP
const activeTrackings = new Map();

// ==========================================
// 🛡️ SISTEM AKSES PRIVATE, PREMIUM 24 JAM & LIMIT HARIAN
// ==========================================
const admins = ['brownmatcha', 'padilstore']; // Daftar admin (Akses Bebas Selamanya)

// 🔥 Database sementara untuk nyimpen user premium (Waktu Expired, Sisa Limit, Status Notif)
const premiumUsers = new Map();
const PREMIUM_DURATION = 24 * 60 * 60 * 1000; // 24 Jam dalam milidetik
const DAILY_LIMIT = 5; // Kuota limit untuk user

bot.use(async (ctx, next) => {
  const username = ctx.from?.username;
  const text = ctx.message?.text || '';
  
  // 1. IZINKAN SEMUA ORANG AKSES /START DAN /READY (Biar disapa dulu sama botnya)
  if (text.startsWith('/start') || text.startsWith('/ready')) {
    // 🔥 [BARU] Trik Surprise Notif buat user yang baru di-add pas dia ngetik start/ready
    if (premiumUsers.has(username)) {
      const userData = premiumUsers.get(username);
      if (Date.now() < userData.expireTime && !userData.notified) {
        userData.notified = true; // Tandain kalau udah dikasih tau
        premiumUsers.set(username, userData);
        await ctx.reply('🎉 *YEYYY ASIIIIKK!* 🎉\n\nKamu baru aja dapet izin khusus nih dari Owner buat pakai bot ini! Menyala abangkuhhh 🔥\n\nSekarang tinggal ketik aja resinya, nggak usah sungkan-sungkan. Let\'s gooo! 🚀📦', { parse_mode: 'Markdown' });
      }
    }
    return next();
  }

  // 2. CEK AKSES ADMIN: Kalau admin, langsung lolos!
  if (admins.includes(username)) {
    // FITUR KHUSUS ADMIN (Nambah & Hapus User)
    if (text.startsWith('/add ')) {
      const newUser = text.split(' ')[1].replace('@', '');
      
      if (admins.includes(newUser)) {
         return ctx.reply(`⚠️ Santai min, @${newUser} itu sesama admin. Udah kebal!`);
      }

      // 🔥 [BARU] Set notified jadi false, biar nanti pas dia chat bot, keluar pop-up surprise
      const expireTime = Date.now() + PREMIUM_DURATION;
      premiumUsers.set(newUser, { expireTime: expireTime, count: DAILY_LIMIT, notified: false });

      const expDate = new Date(expireTime);
      const opt = { timeZone: 'Asia/Jakarta', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' };
      const expStr = new Intl.DateTimeFormat('id-ID', opt).format(expDate).replace(',', ' Jam').replace(':', '.');

      return ctx.reply(`✅ *Asik!* @${newUser} udah dikasih akses *Premium 24 Jam* dengan limit *${DAILY_LIMIT} kali cek resi*.\n\n⏳ *Akses Otomatis Hangus Pada:*\n📆 ${expStr} WIB`, { parse_mode: 'Markdown' });
    }

    if (text.startsWith('/del ')) {
      const targetUser = text.split(' ')[1].replace('@', '');
      
      if (admins.includes(targetUser)) {
         return ctx.reply(`⚠️ Buset min, masa mau ngehapus admin sendiri? Ditolak! 🛑`);
      }

      if (premiumUsers.has(targetUser)) {
        premiumUsers.delete(targetUser); 
        return ctx.reply(`🗑️ Beres! Akses premium @${targetUser} udah dicabut duluan sebelum 24 jam. Bye-bye! 👋`);
      } else {
        return ctx.reply(`🤔 Lho, @${targetUser} emang nggak ada di dalam daftar premium, min.`);
      }
    }

    return next(); // Kalau admin, lanjut ke command yang diketik
  }

  // 3. CEK AKSES USER PREMIUM
  if (premiumUsers.has(username)) {
    const userData = premiumUsers.get(username);
    
    // Apakah udah lewat 24 Jam?
    if (Date.now() > userData.expireTime) {
      // Waktu habis, hapus dari database premium
      premiumUsers.delete(username);
      
      if (ctx.message) {
        return ctx.reply('🛑 *Waktu Premium Kamu Udah Habis!*\n\nMaaf kak, akses 24 jam kamu udah selesai nih. Kalau mau pakai bot lagi, wajib minta izin atau berlangganan lagi ke owner ya: @padilstore ⏳', { parse_mode: 'Markdown' });
      } else if (ctx.callbackQuery) {
        return ctx.answerCbQuery('⛔ Waktu premium kamu udah habis!', { show_alert: true });
      }
      return;
    }

    // Kalau waktu masih ada, pastikan user biasa gak bisa pakai /cmd, /time, dll
    if (text.startsWith('/') && text !== '/start' && text !== '/ready') {
      return ctx.reply('🛑 *Akses Ditolak!*\n\nMaaf kak, walau kamu premium, kamu cuma dikasih izin buat *Cek Resi* aja ya. Command garis miring (/) ini khusus Admin! 📦', { parse_mode: 'Markdown' });
    }

    // 🔥 [BARU] Trik Surprise Notif kalau dia tiba-tiba langsung ngetik resi tanpa /start
    if (!userData.notified) {
      userData.notified = true; // Tandain kalau udah dikasih tau
      premiumUsers.set(username, userData);
      await ctx.reply('🎉 *YEYYY ASIIIIKK!* 🎉\n\nKamu baru aja dapet izin khusus nih dari Owner buat pakai bot ini! Menyala abangkuhhh 🔥\n\nSekarang tinggal ketik aja resinya, nggak usah sungkan-sungkan. Let\'s gooo! 🚀📦', { parse_mode: 'Markdown' });
    }

    // Masih aktif, lanjut ke pengecekan (limit dipotong nanti pas ngecek resi)
    return next();
  }

  // 4. BUKAN ADMIN & BUKAN PREMIUM = TOLAK MENTAH-MENTAH
  if (ctx.message) {
    return ctx.reply('🛑 *Eits, Akses Ditolak!*\n\nMaaf nih kak, kamu siapa ya mau cek resi? Kok tiba-tiba main pakai aja wkwk 🤭\nIni bot *Private*. Kalau mau ikutan pakai, wajib minta izin dulu ke owner: @padilstore', { parse_mode: 'Markdown' });
  } else if (ctx.callbackQuery) {
    return ctx.answerCbQuery('⛔ Eits, belum dapet izin ya? wkwk Hubungi owner dulu! 😜', { show_alert: true });
  }
  
});

// ==========================================
// 🛠️ FUNGSI-FUNGSI PENDUKUNG
// ==========================================
function getGreeting(name = '') {
  const options = { timeZone: 'Asia/Jakarta', hour: 'numeric', hour12: false };
  const hour = parseInt(new Intl.DateTimeFormat('id-ID', options).format(new Date()));

  if (hour >= 4 && hour < 11) {
    return `Selamat Pagi kak *${name}* 🌅\nJangan lupa sarapan dan ngopi dulu ya biar fokus! ☕`;
  }
  if (hour >= 11 && hour < 15) {
    return `Selamat Siang kak *${name}* ☀️\nJangan telat makan siang ya, semangat terus! 🍛`;
  }
  if (hour >= 15 && hour < 18) {
    return `Selamat Sore kak *${name}* 🌇\nWaktunya santai sejenak sambil ngeteh atau ngopi sore nih! 🍵`;
  }
  return `Selamat Malam kak *${name}* 🌙\nJangan lupa istirahat yang cukup ya, selamat rebahan! 🛌`;
}

function getProgressBar(status = '') {
  const s = status.toLowerCase();
  if (s.includes('delivered') || s.includes('sukses') || s.includes('berhasil')) return '▓▓▓▓▓▓▓▓▓▓ 100% (Selesai)';
  if (s.includes('courier') || s.includes('kurir') || s.includes('delivery')) return '▓▓▓▓▓▓▓▓░░ 85% (Otw Alamat)';
  if (s.includes('transit') || s.includes('hub') || s.includes('gateway')) return '▓▓▓▓▓▓░░░░ 60% (Transit)';
  if (s.includes('process') || s.includes('sorting')) return '▓▓▓▓░░░░░░ 75% (Diproses)';
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
    'jne': 'JNE Express',
    'jnt': 'J&T Express',
    'jntcargo': 'J&T Cargo',
    'sicepat': 'SiCepat Ekspres',
    'spx': 'Shopee Express (SPX)',
    'lex': 'Lazada eLogistics (LEX)',
    'idx': 'ID Express',
    'anteraja': 'AnterAja',
    'ninja': 'Ninja Xpress',
    'lion': 'Lion Parcel',
    'pos': 'POS Indonesia',
    'tiki': 'TIKI',
    'wahana': 'Wahana Prestasi Logistik',
    'sap': 'SAP Express',
    'jet': 'JET Express'
  };
  return couriers[code.toLowerCase()] || code.toUpperCase();
}

// 🔥 FUNGSI REQUEST API PINTAR (AUTO GANTI KEY KALAU LIMIT)
async function fetchTrackingData(courier, awb, number = null) {
  let attempts = 0;
  
  while (attempts < API_KEYS.length) {
    try {
      const params = { api_key: API_KEYS[currentApiIndex], courier, awb };
      if (number) params.number = number;
      
      const res = await axios.get('https://api.binderbyte.com/v1/track', { params });
      return res; // Kalau sukses, langsung balikin datanya
    } catch (error) {
      const errMessage = error.response?.data?.message?.toLowerCase() || '';
      const status = error.response?.status;
      
      // Deteksi kalau limit habis atau API key error
      if (status === 403 || status === 429 || errMessage.includes('limit') || errMessage.includes('exceeded') || errMessage.includes('invalid')) {
        console.log(`⚠️ API Key ke-${currentApiIndex + 1} Limit/Bermasalah! Auto pindah ke API Key berikutnya...`);
        // Ganti ke index berikutnya (kalau udah mentok, balik ke index 0)
        currentApiIndex = (currentApiIndex + 1) % API_KEYS.length;
        attempts++;
      } else {
        // Kalau error karena resi salah atau web error, langsung lempar aja (gak usah ganti API)
        throw error;
      }
    }
  }
  
  // Kalau semua API Key di dalam list udah dicoba tapi limit semua:
  throw new Error("ALL_KEYS_LIMIT");
}

// ==========================================
// 📋 COMMAND & HANDLING MENU
// ==========================================
bot.start((ctx) => {
  const userName = cleanData(ctx.from.first_name || 'Bosku');
  
  ctx.reply(
`${getGreeting(userName)} 👋

Selamat datang di *Bot Lacak Resi Ala Kadarnya* 📦✨

Kirim resi dengan format:
📌 *kode_kurir nomor_resi*

Contoh:
\`spx SPX123456789\`
\`jnt JP123456789\`

Silakan pilih menu di bawah ini jika butuh bantuan:`,
    { 
      parse_mode: 'Markdown',
      ...Markup.keyboard([
        ['🚚 Daftar Kurir', '📖 Cara Pakai'],
        ['👨‍💻 Tentang Bot']
      ]).resize() 
    }
  );
});

// 🔥 FITUR COMMAND /READY UNTUK SEMUA USER
bot.command('ready', (ctx) => {
  ctx.reply('Yooowww bot udah 100% *ready* nih kak! 🔥🚀\nAman jaya sentosa, no lelet no ribet. Langsung gas aja ketik resinya, menyala abangkuh! 💯✨', { parse_mode: 'Markdown' });
});

bot.command('cmd', (ctx) => {
  let msg = `📜 *DAFTAR PERINTAH (KHUSUS ADMIN)*\n\n`;
  
  msg += `🛠️ *FITUR SISTEM:*\n`;
  msg += `• /time - Cek durasi bot menyala\n`;
  msg += `• /listvip - Lihat resi Auto-Update aktif\n`;
  msg += `• /stopvip \`<resi>\` - Batalin pantauan\n`;
  msg += `• /cmd - Lihat daftar perintah ini\n\n`;
  
  msg += `👑 *MANAJEMEN USER PREMIUM 24 JAM:*\n`;
  msg += `• /add \`<username>\` - Kasih akses 24 jam ke user\n`;
  msg += `• /del \`<username>\` - Cabut akses user sebelum habis\n\n`;

  msg += `📦 *INFO PENGGUNA BOT:*\n`;
  msg += `User yang di-add bisa ngecek resi maksimal ${DAILY_LIMIT} kali selama masa tenggang 24 Jam belum lewat.`;
  
  ctx.reply(msg, { parse_mode: 'Markdown' });
});

bot.command('time', (ctx) => {
  const uptimeMs = Date.now() - startTime;
  
  let seconds = Math.floor((uptimeMs / 1000) % 60);
  let minutes = Math.floor((uptimeMs / (1000 * 60)) % 60);
  let hours = Math.floor((uptimeMs / (1000 * 60 * 60)) % 24);
  let days = Math.floor(uptimeMs / (1000 * 60 * 60 * 24));
  
  const startD = new Date(startTime);
  const optionsDate = { timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  const optionsTime = { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false };
  
  const dateStr = new Intl.DateTimeFormat('id-ID', optionsDate).format(startD);
  const timeStr = new Intl.DateTimeFormat('id-ID', optionsTime).format(startD).replace(':', '.');
  
  let msg = `⏱️ *INFO WAKTU AKTIF BOT (UPTIME)*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  msg += `🚀 *Mulai Beroperasi Sejak:*\n`;
  msg += `✅ Aktif sejak ${dateStr}, jam ${timeStr} WIB (Durasi nyala: ${days} Hari, ${hours} Jam, ${minutes} Menit, ${seconds} Detik)\n\n`;
  msg += `⏳ *Durasi Menyala Non-Stop:*\n`;
  msg += `👉 ${days} Hari, ${hours} Jam, ${minutes} Menit, ${seconds} Detik\n\n`;
  msg += `_Catatan: Waktu ini akan keriset dari 0 lagi setiap kali bot di-restart atau di-deploy ulang di server._`;
  
  ctx.reply(msg, { parse_mode: 'Markdown' });
});

// ==========================================
// 🛑 FITUR BERHENTI / CANCEL AUTO-UPDATE VIP
// ==========================================

bot.command('listvip', (ctx) => {
  const chatId = ctx.chat.id;
  let list = [];
  
  for (const [awb, data] of activeTrackings.entries()) {
    if (data.chatId === chatId) {
      list.push(`📦 \`${awb}\` (${data.courier.toUpperCase()})`);
    }
  }

  if (list.length === 0) {
    return ctx.reply('📭 Kamu belum mengaktifkan Auto-Update VIP untuk resi manapun.');
  }

  let msg = `📋 *Daftar Resi VIP Kamu Saat Ini:*\n\n${list.join('\n')}\n\n`;
  msg += `Ketik \`/stopvip nomor_resi\` untuk membatalkan pantauan.\n`;
  msg += `Contoh: \`/stopvip JP1234567890\``;
  
  ctx.reply(msg, { parse_mode: 'Markdown' });
});

bot.command('stopvip', (ctx) => {
  const textMsg = ctx.message.text.trim();
  const parts = textMsg.split(/\s+/);

  if (parts.length < 2) {
    return ctx.reply('❗ *Format salah kak.*\n\nContoh yang bener:\n`/stopvip JP1234567890`', { parse_mode: 'Markdown' });
  }

  const awb = parts[1];

  if (activeTrackings.has(awb)) {
    const data = activeTrackings.get(awb);
    
    if (data.chatId === ctx.chat.id) {
      activeTrackings.delete(awb); 
      return ctx.reply(`✅ *Beres!* Pemantauan otomatis untuk resi \`${awb}\` berhasil dihentikan. Bot nggak akan ngirim notif lagi buat resi ini. 🛑`, { parse_mode: 'Markdown' });
    } else {
      return ctx.reply(`⚠️ Eits, kamu nggak bisa hapus resi ini karena bukan kamu yang ngaktifin VIP-nya!`, { parse_mode: 'Markdown' });
    }
  } else {
    return ctx.reply(`🤔 Resi \`${awb}\` emang nggak ada di dalam daftar pantauan VIP kamu, kak. Coba cek lagi pakai /listvip`, { parse_mode: 'Markdown' });
  }
});

// ==========================================
// BALASAN REPLY KEYBOARD BISA DIAKSES SEMUA USER (YANG DI-ADD)
// ==========================================
bot.hears('🚚 Daftar Kurir', (ctx) => {
  ctx.reply(
`🚚 *Daftar Kode Ekspedisi Populer:*
• \`spx\` - Shopee Express
• \`jnt\` - J&T Express
• \`jne\` - JNE Express
• \`sicepat\` - SiCepat Ekspres
• \`idx\` - ID Express
• \`anteraja\` - AnterAja
• \`ninja\` - Ninja Xpress
• \`pos\` - POS Indonesia
• \`lex\` - Lazada Express
• \`tiki\` - TIKI
• \`lion\` - Lion Parcel
• \`wahana\` - Wahana
• \`jntcargo\` - J&T Cargo
• \`sap\` - SAP Express

💡 *Cara Cek Resinya:*
Ketik kode kurir diikuti spasi dan nomor resi kamu, lalu kirim ke sini.

*Contoh ketiknya gini:*
\`jnt JP1234567890\`
\`spx SPX0987654321\``, 
    { parse_mode: 'Markdown' }
  );
});

bot.hears('📖 Cara Pakai', (ctx) => {
  ctx.reply(
`📖 *Panduan Penggunaan:*

1. *Cek Resi:* Ketik kode ekspedisi diikuti spasi dan nomor resi.
Contoh: \`jnt JP1234567890\`
(Khusus JNE, tambah 5 digit nomor HP penerima di akhir jika data kurang lengkap. Contoh: \`jne 123456789 12345\`)

2. *Auto-Update VIP (Hanya Admin):* Bot akan ngabarin otomatis tiap 1 jam kalau ada pergerakan paket. Klik tombol di bawah pesan resi untuk mengaktifkan.`, 
    { parse_mode: 'Markdown' }
  );
});

bot.hears('👨‍💻 Tentang Bot', (ctx) => {
  ctx.reply('👨‍💻 Bot ini aslinya cuma dibikin karena lagi gabutan aja kak hehe ✌️');
});

// ==========================================
// 🔔 FITUR NOTIFIKASI AUTO-UPDATE VIP
// ==========================================
bot.action(/^vip_(.+)_(.+)$/, async (ctx) => {
  try {
    // 🔥 Cek apakah user admin/owner. Kalau bukan, tolak!
    const username = ctx.from?.username;
    if (!admins.includes(username)) {
      return ctx.answerCbQuery('🛑 Maaf, fitur Auto-Update VIP ini khusus Admin / Owner ya abangkuh!', { show_alert: true });
    }

    const courier = ctx.match[1];
    const awb = ctx.match[2];
    const chatId = ctx.chat.id;

    if (activeTrackings.has(awb)) {
      return ctx.answerCbQuery('⚠️ Fitur VIP sudah aktif untuk resi ini bang!', { show_alert: true });
    }

    // Simpan ke database sementara
    activeTrackings.set(awb, { 
      courier: courier, 
      chatId: chatId, 
      lastHistoryCount: 0,
      isDelivered: false
    });

    await ctx.answerCbQuery('Fitur Auto-Update VIP diaktifkan! 🔔');
    ctx.reply(
`🔔 *Status VIP Aktif Untuk Resi \`${awb}\`!*

Sistem sekarang memantau resi ini secara otomatis. Jika kurir mengupdate perjalanan, bot akan langsung memberi tahu kamu di sini.
_(Mengecek otomatis setiap 1 Jam, dan libur ngecek di jam 00:00 - 06:00)_`, 
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Error VIP Button:', error);
  }
});

// ==========================================
// 🔎 HANDLING PENCARIAN RESI & AUTO-ROASTING TYPO COMMAND
// ==========================================
bot.on('text', async (ctx) => {
  const textMsg = ctx.message.text.trim();
  const username = ctx.from?.username;
  
  // Kalau dia (Admin) ngetik garis miring tapi commandnya nggak ada di list atas (berarti typo/ngawur)
  if (textMsg.startsWith('/')) {
    return ctx.reply('kamu ketik apasi gajelas banget typo kali lu ya 😒');
  }

  const parts = textMsg.split(/\s+/);
  if (parts.length < 2) {
    return ctx.reply('❗ *Ups, format ketikannya kurang pas kak.*\n\nContoh yang bener gini ya:\n`spx SPX123456789` atau `jnt JP123456789`', { parse_mode: 'Markdown' });
  }

  // 🔥 CEK SISA LIMIT KHUSUS USER BIASA SEBELUM LANJUT PROSES RESI
  if (!admins.includes(username) && premiumUsers.has(username)) {
    const userData = premiumUsers.get(username);
    if (userData.count <= 0) {
      return ctx.reply('🛑 *Limit Habis!*\n\nKamu sudah menggunakan semua kuota 5 kali cek resi. Silakan hubungi owner untuk perpanjang atau minta nambah kuota ya! 🔥', { parse_mode: 'Markdown' });
    }
  }

  const courier = parts[0].toLowerCase();
  const waybill = parts[1];
  const number = parts[2];

  let loadingMsg;

  try {
    // Kurangi kuota jika bukan admin & proses valid
    if (!admins.includes(username) && premiumUsers.has(username)) {
      const userData = premiumUsers.get(username);
      userData.count -= 1;
      premiumUsers.set(username, userData);
    }

    loadingMsg = await ctx.reply('⏳ _Bentar ya kak, bot lagi lari ngecek resinya nih... 🏃💨_', { parse_mode: 'Markdown' });

    // 🔥 Panggil fungsi pintar Auto-Fallback API
    const res = await fetchTrackingData(courier, waybill, number);

    if (!res.data || !res.data.data) {
      if (loadingMsg) await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id).catch(() => {});
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

    let msg = `✨ *L A P O R A N  R E S I* ✨\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    msg += `🏢 *EKSPEDISI:* ${courierName} (${courier.toUpperCase()})\n`;
    msg += `🔖 *NO. RESI:* \`${awbClean}\`\n`;
    msg += `⚖️ *LAYANAN:* ${service} (Berat: ${weight})\n`;
    msg += `💳 *TIPE:* ${paymentStatus}\n\n`;

    msg += `📍 *STATUS SAAT INI*\n`;
    msg += `╰ 🚚 _${statusText}_\n`;
    msg += `╰ ⏱️ ${lastDate}\n`;
    msg += `📊 *Progress:* \`${progressBar}\`\n\n`;

    msg += `👥 *DETAIL PENGIRIMAN*\n`;
    msg += `╭ 📤 *PENGIRIM:* ${shipper} (${origin})\n`;
    msg += `╰ 📥 *PENERIMA:* ${receiver} (${destination})\n\n`;

    msg += `📜 *RIWAYAT PERJALANAN (POD)*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;

    if (history.length === 0) {
      msg += '📭 _Belum ada riwayat pengiriman._\n';
    } else {
      history.forEach((h, index) => {
        const descClean = cleanData(h.desc);
        if (index === 0) {
          msg += `✅ *${formatDate(h.date)} [POSISI SAAT INI]*\n`;
        } else {
          msg += `✅ *${formatDate(h.date)}*\n`;
        }
        msg += `   ╰ _${descClean}_\n`;
      });
    }

    if (loadingMsg) await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id).catch(() => {});

    // Beri info sisa limit buat user premium (Expired nggak usah diliatin di bawah resi lagi sesuai *request*)
    if (!admins.includes(username) && premiumUsers.has(username)) {
      const userData = premiumUsers.get(username);
      msg += `\n🎯 *Sisa Kuota Cek:* ${userData.count} kali lagi.`;
    }
    
    ctx.reply(msg, { 
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔔 Aktifkan Auto-Update VIP', `vip_${courier}_${awbClean}`)],
        [Markup.button.callback('🗑️ Hapus Pesan Ini', 'btn_delete_msg')]
      ])
    });

  } catch (err) {
    if (loadingMsg) {
      await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id).catch(() => {});
    }

    // 🔥 Kalau error karena semua API udah limit beneran
    if (err.message === "ALL_KEYS_LIMIT") {
      return ctx.reply('🛑 *Gawat Kak!*\n\nSemua API Key kita bulan ini udah mentok limitnya (500 resi/bulan). Mesti nunggu bulan depan atau Owner harus nambahin API Key baru nih 😭', { parse_mode: 'Markdown' });
    }
    
    console.error('Error tracking:', err.response?.data || err.message);
    
    ctx.reply(
`❌ *Ups, resi tidak ditemukan!*

Beberapa kemungkinan penyebabnya:
• Nomor resi salah ketik.
• Resi baru dibuat dan belum ter-update di sistem ekspedisi (tunggu beberapa jam).
• Kode kurir tidak sesuai.
• Sedang ada gangguan pada sistem pelacakan kami.

Yuk, pastikan lagi nomor resi dan kurirnya sudah benar, lalu coba beberapa saat lagi ya 🙏`,
      { parse_mode: 'Markdown' }
    );
  }
});

bot.action('btn_delete_msg', async (ctx) => {
  try {
    await ctx.deleteMessage();
    await ctx.answerCbQuery('Pesan dihapus 🗑️');
  } catch (error) {
    await ctx.answerCbQuery('Gagal menghapus pesan.');
  }
});

console.log('Menyiapkan bot dan web server...');

// ==========================================
// ⚙️ MESIN BACKGROUND: NGECEK RESI OTOMATIS (MODE IRIT & SMART)
// ==========================================
setInterval(async () => {
  if (activeTrackings.size === 0) return; 

  // 🕒 FITUR JAM MALAM: Bot istirahat dari jam 00:00 sampai 05:59 WIB
  const options = { timeZone: 'Asia/Jakarta', hour: 'numeric', hour12: false };
  const currentHour = parseInt(new Intl.DateTimeFormat('id-ID', options).format(new Date()));
  
  if (currentHour >= 0 && currentHour < 6) {
    console.log('😴 Jam malam (00:00 - 06:00), bot istirahat ngecek resi biar hemat API...');
    return; // Berhenti di sini, jangan lakukan request ke API
  }

  console.log(`🔄 Mesin VIP jalan: Mengecek ${activeTrackings.size} resi...`);

  for (const [awb, data] of activeTrackings.entries()) {
    try {
      // 🔥 Pakai fungsi pintar buat auto-fallback saat ngecek background
      const res = await fetchTrackingData(data.courier, awb);
      
      if (res.data && res.data.data) {
        const history = res.data.data.history || [];
        const summary = res.data.data.summary || {};
        const statusText = summary.status || '';

        // Kalau ada update riwayat perjalanan baru
        if (history.length > data.lastHistoryCount && data.lastHistoryCount !== 0) {
          const latestUpdate = history[0]; 
          
          let notifMsg = `🚨 *UPDATE RESI VIP!* 🚨\n`;
          notifMsg += `📦 *Resi:* \`${awb}\`\n\n`;
          notifMsg += `📍 *Status Baru:*\n`;
          notifMsg += `_${latestUpdate.desc}_\n`;
          notifMsg += `⏱️ ${formatDate(latestUpdate.date)}\n\n`;
          
          bot.telegram.sendMessage(data.chatId, notifMsg, { parse_mode: 'Markdown' })
            .catch(err => console.log('Gagal ngirim notif ke user:', err.message));
        }

        // Update jumlah riwayat terakhir di memori
        activeTrackings.set(awb, { ...data, lastHistoryCount: history.length });

        // Kalau paket udah nyampe, hapus dari pantauan 
        if (statusText.toLowerCase().includes('delivered') || statusText.toLowerCase().includes('sukses')) {
          bot.telegram.sendMessage(data.chatId, `✅ *Yeay! Paket dengan resi \`${awb}\` sudah terkirim (Delivered).* Pemantauan otomatis dihentikan ya.`, { parse_mode: 'Markdown' }).catch(()=>{});
          activeTrackings.delete(awb);
        }
      }
    } catch (err) {
      if (err.message === "ALL_KEYS_LIMIT") {
        console.log(`⚠️ Henti Pengecekan Auto: Semua API Limit Habis!`);
      } else {
        console.log(`⚠️ Gagal ngecek otomatis resi ${awb}:`, err.message);
      }
    }
  }
}, 60 * 60 * 1000); // 👈 Ini diset jadi 1 Jam (60 menit)


// ==========================================
// 🔥 START BOT
// ==========================================
const startBot = async () => {
  try {
    await bot.launch({ dropPendingUpdates: true });
    console.log('Bot ready di gunakan kakak, menyala abangkuh 🔥');
    
    bot.telegram.sendMessage(ADMIN_CHAT_ID, '✅ *Bot ready nih min siap digunakan hehe*', { parse_mode: 'Markdown' })
      .catch((err) => {
        console.log('⚠️ Gagal kirim notif ke admin. Pastikan ADMIN_CHAT_ID sudah benar.');
      });
  } catch (error) {
    console.error('⚠️ Error saat menyalakan bot:', error.message);
    
    if (error.response && error.response.error_code === 409) {
      console.log('🔄 Telegram masih nahan koneksi lama. Coba tabrak lagi dalam 5 detik...');
      setTimeout(startBot, 5000); 
    }
  }
};

startBot();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));