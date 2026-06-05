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
// 🤖 SETUP BOT TELEGRAM
// ==========================================
const BOT_TOKEN = '8425326650:AAFu9jFivIDN38tDiiyrBZzfZYX3A6cDAO4';
const API_KEY = '6a2dba6c32c3d78b86a7366f4d592abe8fd287e7f14c5274dca01c2d6311d7ef';
const ADMIN_CHAT_ID = 8505107135; 

const bot = new Telegraf(BOT_TOKEN);

// 🔥 Waktu pertama kali script dijalankan (UNTUK FITUR /time)
const startTime = Date.now();

// 🔥 Database sementara untuk nyimpen data pantauan resi VIP
const activeTrackings = new Map();

// 🔥 [BARU] Database sementara untuk nyimpen limit user biasa
const userLimits = new Map();
const DAILY_LIMIT = 5;
const LIMIT_DURATION = 24 * 60 * 60 * 1000; // 24 Jam dalam milidetik

// ==========================================
// 🛡️ SISTEM AKSES PRIVATE (HANYA OWNER & YANG DI-ADD)
// ==========================================
const allowedUsers = ['brownmatcha', 'padilstore']; 
const admins = ['brownmatcha', 'padilstore']; // Daftar admin yang bisa pakai command penuh

bot.use(async (ctx, next) => {
  const username = ctx.from?.username;
  const text = ctx.message?.text || '';
  
  // 1. IZINKAN SEMUA ORANG AKSES /START (Biar disapa dulu sama botnya)
  if (text.startsWith('/start')) {
    return next();
  }

  // 2. FILTER AKSES: Kalau bukan user yang di-add, tolak total
  if (!allowedUsers.includes(username)) {
    if (ctx.message) {
      return ctx.reply('🛑 *Eits, Akses Ditolak!*\n\nMaaf nih kak, kamu siapa ya mau cek resi? Kok tiba-tiba main pakai aja wkwk 🤭\nIni bot *Private*. Kalau mau ikutan pakai, wajib minta izin dulu ke owner: @padilstore', { parse_mode: 'Markdown' });
    } else if (ctx.callbackQuery) {
      return ctx.answerCbQuery('⛔ Eits, belum dapet izin ya? wkwk Hubungi owner dulu! 😜', { show_alert: true });
    }
    return;
  }

  // 3. FILTER COMMAND: Pastikan user VIP biasa GAK BISA pakai command apa-apa selain cek resi
  if (text.startsWith('/') && text !== '/start') {
    if (!admins.includes(username)) {
      return ctx.reply('🛑 *Akses Ditolak!*\n\nMaaf kak, kamu cuma dikasih izin buat *Cek Resi* aja ya. Command ini khusus buat Admin! 📦', { parse_mode: 'Markdown' });
    }
  }

  // 4. FITUR KHUSUS ADMIN (Nambah & Hapus User)
  if (text.startsWith('/add ') && admins.includes(username)) {
    const newUser = text.split(' ')[1].replace('@', '');
    if (!allowedUsers.includes(newUser)) {
      allowedUsers.push(newUser);
      return ctx.reply(`✅ Asik! @${newUser} udah dikasih jalur khusus buat ngecek resi di bot ini. 🎉`);
    } else {
      return ctx.reply(`⚠️ Santai min, @${newUser} udah ada di dalam daftar kok. Aman!`);
    }
  }

  if (text.startsWith('/del ') && admins.includes(username)) {
    const targetUser = text.split(' ')[1].replace('@', '');
    
    if (admins.includes(targetUser)) {
       return ctx.reply(`⚠️ Buset min, masa mau ngehapus admin sendiri? Ditolak! 🛑`);
    }

    const index = allowedUsers.indexOf(targetUser);
    if (index > -1) {
      allowedUsers.splice(index, 1); 
      return ctx.reply(`🗑️ Beres! @${targetUser} udah ditendang dari daftar akses VIP. Bye-bye! 👋`);
    } else {
      return ctx.reply(`🤔 Lho, @${targetUser} emang nggak ada di dalam daftar, min.`);
    }
  }

  // Lolos pengecekan, lanjut
  return next(); 
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

bot.command('cmd', (ctx) => {
  let msg = `📜 *DAFTAR PERINTAH (KHUSUS ADMIN)*\n\n`;
  
  msg += `🛠️ *FITUR SISTEM:*\n`;
  msg += `• /time - Cek durasi bot menyala\n`;
  msg += `• /listvip - Lihat resi Auto-Update aktif\n`;
  msg += `• /stopvip \`<resi>\` - Batalin pantauan\n`;
  msg += `• /cmd - Lihat daftar perintah ini\n\n`;
  
  msg += `👑 *MANAJEMEN USER:*\n`;
  msg += `• /add \`<username>\` - Kasih izin ke user lain\n`;
  msg += `• /del \`<username>\` - Hapus izin user\n\n`;

  msg += `📦 *INFO USER BIASA:*\n`;
  msg += `User yang di-add cuma bisa ngetik resi untuk di-track, nggak bisa pakai command pakai garis miring (/). Limit cek harian: 5 kali.`;
  
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
    // 🔥 [BARU] Cek apakah user admin/owner. Kalau bukan, tolak!
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

  // 🔥 [BARU] SISTEM LIMIT HARIAN KHUSUS USER BIASA (Admin Bebas)
  if (!admins.includes(username)) {
    const now = Date.now();
    let limitData = userLimits.get(username);

    if (limitData) {
      const timePassed = now - limitData.firstUsedAt;
      
      if (timePassed >= LIMIT_DURATION) {
        // Udah lewat 24 jam dari pemakaian pertama, reset kuota jadi 1 lagi!
        limitData = { count: 1, firstUsedAt: now };
        userLimits.set(username, limitData);
      } else {
        // Masih dalam hitungan 24 jam
        if (limitData.count >= DAILY_LIMIT) {
          const resetTime = limitData.firstUsedAt + LIMIT_DURATION;
          const resetDate = new Date(resetTime);
          const timeStr = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }).format(resetDate).replace(':', '.');
          
          return ctx.reply(`🛑 *Waduh Limit Habis Kak!*\n\nKamu udah ngecek resi 5 kali hari ini. Limit kamu bakal balik lagi jam *${timeStr} WIB* besok ya. Sabar abangkuh! 🔥`, { parse_mode: 'Markdown' });
        }
        // Belum limit, tambah count
        limitData.count += 1;
        userLimits.set(username, limitData);
      }
    } else {
      // User baru pertama kali pakai hari ini
      userLimits.set(username, { count: 1, firstUsedAt: now });
    }
  }

  const parts = textMsg.split(/\s+/);
  if (parts.length < 2) {
    return ctx.reply('❗ *Ups, format ketikannya kurang pas kak.*\n\nContoh yang bener gini ya:\n`spx SPX123456789` atau `jnt JP123456789`', { parse_mode: 'Markdown' });
  }

  const courier = parts[0].toLowerCase();
  const waybill = parts[1];
  const number = parts[2];

  let loadingMsg;

  try {
    loadingMsg = await ctx.reply('⏳ _Bentar ya kak, bot lagi lari ngecek resinya nih... 🏃💨_', { parse_mode: 'Markdown' });

    const params = { api_key: API_KEY, courier, awb: waybill };
    if (number) params.number = number;

    const res = await axios.get('https://api.binderbyte.com/v1/track', { params });

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
    
    // Sisa kuota limit untuk user biasa ditambahkan di bawah
    if (!admins.includes(username)) {
      const currentCount = userLimits.get(username).count;
      msg += `\n🎯 *Sisa Kuota Cek Harian:* ${DAILY_LIMIT - currentCount} kali lagi.`;
    }

    ctx.reply(msg, { 
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔔 Aktifkan Auto-Update VIP', `vip_${courier}_${awbClean}`)],
        [Markup.button.callback('🗑️ Hapus Pesan Ini', 'btn_delete_msg')]
      ])
    });

  } catch (err) {
    console.error('Error tracking:', err.response?.data || err.message);
    
    if (loadingMsg) {
      await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id).catch(() => {});
    }
    
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
      const params = { api_key: API_KEY, courier: data.courier, awb: awb };
      const res = await axios.get('https://api.binderbyte.com/v1/track', { params });
      
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
      console.log(`⚠️ Gagal ngecek otomatis resi ${awb}:`, err.message);
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