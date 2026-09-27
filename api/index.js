// api/index.js
import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({ status: 'Bot API is online' });
  }

  if (req.method === 'POST') {
    try {
      const update = req.body;
      if (!update || !update.message || !update.message.text) {
        return res.status(200).json({ status: 'No message text' });
      }

      const chatId = update.message.chat.id;
      const text = update.message.text.trim();
      const botToken = process.env.TELEGRAM_BOT_TOKEN;

      const replyTelegram = async (msg) => {
        if (!botToken) return;
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: msg })
        });
      };

      if (text.toLowerCase() === '/start') {
        await replyTelegram("Halo! Bot keuangan aktif. Silakan ketik transaksi Anda.\nContoh: makan 400k\nAtau: pemasukan gaji 5jt : Gaji");
        return res.status(200).json({ success: true });
      }

      let type = 'expense';
      let category = 'Umum';
      let cleanText = text;

      if (text.toLowerCase().startsWith('pemasukan')) {
        type = 'income';
        cleanText = text.replace(/^pemasukan\s*/i, '');
      } else if (text.toLowerCase().startsWith('pengeluaran')) {
        type = 'expense';
        cleanText = text.replace(/^pengeluaran\s*/i, '');
      }

      if (cleanText.includes(':')) {
        const parts = cleanText.split(':');
        category = parts[1].trim();
        cleanText = parts[0].trim();
      }

      const words = cleanText.trim().split(/\s+/);
      const rawAmountStr = words.pop(); // Ambil kata terakhir sebagai nominal
      let title = words.join(' ');

      // Fungsi konverter angka (mendukung k, rb, jt, dan titik/koma)
      const parseAmount = (str) => {
        if (!str) return 0;
        let lower = str.toLowerCase().replace(/rp/g, '').trim();
        let multiplier = 1;

        if (lower.endsWith('jt')) {
          multiplier = 1000000;
          lower = lower.replace('jt', '');
        } else if (lower.endsWith('k') || lower.endsWith('rb')) {
          multiplier = 1000;
          lower = lower.replace('k', '').replace('rb', '');
        }

        // Bersihkan karakter non-angka kecuali titik/koma
        let cleanNum = lower.replace(/\./g, '').replace(',', '.').replace(/[^0-9.]/g, '');
        let num = parseFloat(cleanNum);
        return isNaN(num) ? 0 : Math.round(num * multiplier);
      };

      let amount = parseAmount(rawAmountStr);

      if (!title || amount <= 0) {
        await replyTelegram("Format tidak valid! Contoh: makan 400k atau pemasukan gaji 5jt");
        return res.status(200).json({ success: true });
      }

      // Simpan ke database Neon DB
      const databaseUrl = process.env.DATABASE_URL;
      if (databaseUrl) {
        try {
          const sql = neon(databaseUrl);
          await sql`
            INSERT INTO transactions (title, amount, type, category, username)
            VALUES (${title}, ${amount}, ${type}, ${category}, 'admin')
          `;
        } catch (dbErr) {
          console.error("Database insert error:", dbErr);
        }
      }

      const formatRp = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount);
      await replyTelegram(`✅ Berhasil dicatat!\n• ${title}\n• ${type === 'income' ? 'Pemasukan' : 'Pengeluaran'}: ${formatRp}\n• Kategori: ${category}`);

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Server Error:', error);
      return res.status(200).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
