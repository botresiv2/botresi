const { Telegraf } = require('telegraf');
const axios = require('axios');

// 🔒 TOKEN DAN API KEY (TIDAK DIUBAH SAMA SEKALI)
const BOT_TOKEN = '8547583137:AAGosr3A9CQ_OOF_69KyWEH9tPvlM9k1UYk';
const API_KEY = '6a2dba6c32c3d78b86a7366f4d592abe8fd287e7f14c5274dca01c2d6311d7ef';

const bot = new Telegraf(BOT_TOKEN);

// helper: membersihkan karakter khusus dari API agar tidak bikin Telegram error (crash parse entities)
function cleanData(text) {
  if (!text) return '';
  return String(text).replace(/[_*`\[\]]/g, ' ').trim();
}

// helper: format tanggal persis seperti gambar (DD-MM-YYYY HH:mm)
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

// helper: pemetaan kode kurir ke nama lengkap ekspedisi
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

bot.start((ctx) => {
  ctx.reply(
`👋 Halo! Selamat datang di Bot Lacak Resi Premium.

Kirim resi dengan format:
📌 *kode_kurir nomor_resi*

Contoh:
\`spx SPX123456789\`
\`jnt JP123456789\`

📌 Khusus JNE (jika riwayat tidak lengkap, tambah 5 digit nomor HP penerima):
\`jne 123456789 12345\`

Ketik /help untuk melihat daftar kode ekspedisi yang didukung.`,
    { parse_mode: 'Markdown' }
  );
});

bot.help((ctx) => {
  ctx.reply(
`📖 *Panduan Penggunaan:*

Ketik kode ekspedisi diikuti dengan nomor resi.
Contoh: \`spx SPX1234567890\`

🚚 *Daftar Kode Ekspedisi Populer:*
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

*Catatan JNE:* Jika data kurang lengkap, tambahkan 5 digit terakhir nomor HP penerima di akhir. 
Contoh: \`jne 123456789 12345\``,
    { parse_mode: 'Markdown' }
  );
});

bot.on('text', async (ctx) => {
  const textMsg = ctx.message.text.trim();
  
  // Abaikan jika command
  if (textMsg.startsWith('/')) return;

  const parts = textMsg.split(/\s+/);

  if (parts.length < 2) {
    return ctx.reply('❗ *Format salah*\n\nContoh yang benar: \`spx SPX123456789\` atau \`jnt JP123456789\`', { parse_mode: 'Markdown' });
  }

  const courier = parts[0].toLowerCase();
  const waybill = parts[1];
  const number = parts[2]; // opsional untuk JNE

  try {
    // Tampilkan pesan loading agar interaktif
    const loadingMsg = await ctx.reply('⏳ _Mengambil data detail dari server, mohon tunggu..._', { parse_mode: 'Markdown' });

    const params = {
      api_key: API_KEY,
      courier,
      awb: waybill
    };

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
    
    // --- PENARIKAN & PEMBERSIHAN DATA EKSTRA DETAIL ---
    const courierName = cleanData(getCourierName(summary.courier || courier));
    const awbClean = cleanData(summary.awb);
    
    // SMART FILTER: Cek apakah data kosong karena disensor oleh Marketplace
    const isMarketplace = (courier === 'spx' || courier === 'lex');
    const hiddenText = isMarketplace ? 'Privasi Sistem (Disensor Pusat)' : 'Tidak tercatat di sistem';
    
    const receiver = cleanData(detail.receiver || summary.receiver) || hiddenText;
    const destination = cleanData(detail.destination || summary.destination) || hiddenText;
    
    const shipper = cleanData(detail.shipper) || hiddenText;
    const origin = cleanData(detail.origin) || hiddenText;
    
    const service = cleanData(summary.service || 'Standar');
    const weight = cleanData(summary.weight ? `${summary.weight}` : '-');
    const statusText = cleanData(summary.status || 'Data sedang diproses');
    const amount = summary.amount || '';

    // Logika penentuan COD / Non-COD yang lebih cerdas
    let paymentStatus = 'NON-COD / Lunas';
    
    if (amount && amount !== '0' && amount.toLowerCase() !== 'false') {
      const formattedCod = Number(amount).toLocaleString('id-ID');
      paymentStatus = `COD Rp. ${formattedCod},-`;
    } else if (isMarketplace) {
      // Jika resi marketplace dan harganya 0, berikan info yang lebih masuk akal
      paymentStatus = `Sistem Aplikasi (Bisa COD / Lunas)`;
    }

    // Ambil tanggal update terakhir dari history
    const lastDate = history.length > 0 ? formatDate(history[0].date) : '-';

    // ===== MEMBANGUN PESAN PREMIUM (TREE LAYOUT) =====
    
    // 1. EKSPEDISI
    let msg = `📦 *EKSPEDISI ${courier.toUpperCase()}*\n`;
    msg += `└ ${courierName}\n\n`;

    // 2. INFORMASI RESI & PAKET
    msg += `📩 *Informasi Resi*\n`;
    msg += `├ No Resi : ${awbClean}\n`;
    msg += `├ Layanan : ${service} (Berat: ${weight})\n`;
    msg += `└ Tipe    : ${paymentStatus}\n\n`;

    // 3. STATUS TERKINI
    msg += `📮 *Status Pengiriman*\n`;
    msg += `├ ${statusText}\n`;
    msg += `└ ${lastDate}\n\n`;

    // 4. PENGIRIM
    msg += `📤 *Pengirim*\n`;
    msg += `├ Nama : ${shipper}\n`;
    msg += `└ Asal : ${origin}\n\n`;

    // 5. PENERIMA
    msg += `🚩 *Penerima*\n`;
    msg += `├ Nama   : ${receiver}\n`;
    msg += `└ Tujuan : ${destination}\n\n`;

    // 6. HISTORY (POD DETAIL)
    msg += `⏩ *POD Detail*\n`;

    if (history.length === 0) {
      msg += '└ 📭 Belum ada riwayat pengiriman.\n';
      if (courier === 'jne') {
        msg += '\n💡 *Tips JNE:* Tambahkan 5 digit terakhir no HP:\n';
        msg += '`jne RESI 12345`';
      }
    } else {
      // Menampilkan SELURUH history dari yang paling tua ke terbaru
      const fullHistory = [...history].reverse();

      fullHistory.forEach((h) => {
        const descClean = cleanData(h.desc);
        msg += `✅ ${descClean}\n`;
        msg += `└ ${formatDate(h.date)}\n`;
      });
    }

    // Hapus pesan loading dan kirim hasil akhir
    await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id).catch(() => {});
    ctx.reply(msg, { parse_mode: 'Markdown' });

  } catch (err) {
    console.error('Error tracking:', err.response?.data || err.message);

    let errorDetails = '';
    if (err.response && err.response.data && err.response.data.message) {
      errorDetails = `\n💬 *Pesan Sistem:* _${cleanData(err.response.data.message)}_`;
    }

    ctx.reply(
`❌ *Gagal melacak resi*

Kemungkinan penyebab:
- Nomor resi salah / belum terdaftar di sistem
- Kode kurir salah ketik (Ketik /help untuk daftar kurir)
- Server ekspedisi sedang gangguan
- Limit API telah habis${errorDetails}

Silakan periksa kembali resinya dan coba lagi nanti 🙏`,
      { parse_mode: 'Markdown' }
    );
  }
});

console.log('Menyiapkan bot...');
bot.launch().then(() => {
  console.log('bot ready di gunakan kakak');
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));