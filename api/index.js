// api/index.js
import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const databaseUrl = process.env.DATABASE_URL;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (req.method === 'GET') {
    return res.status(200).json({ status: 'API is running' });
  }

  if (req.method === 'POST') {
    try {
      const update = req.body;
      if (!update || !update.message || !update.message.text) {
        return res.status(200).json({ status: 'No message text' });
      }

      const chatId = update.message.chat.id;
      const text = update.message.text.trim();
      const usernameFromReq = req.body.username || 'admin';

      // Fungsi pembantu untuk mengirim pesan balasan ke Telegram
      const sendTelegramMessage = async (msg) => {
        if (!botToken) return;
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: msg })
        });
      };

      if (text.toLowerCase() === '/start') {
        await sendTelegramMessage("Halo! Bot pencatat keuangan aktif. Kirim format:\nmakan siang 25000\natau\npemasukan gaji 5000000 : Gaji");
        return res.status(200).json({ status: 'Started' });
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

      let title = cleanText;
      let amount = 0;

      if (cleanText.includes(':')) {
        const parts = cleanText.split(':');
        category = parts[1].trim();
        cleanText = parts[0].trim();
      }

      const words = cleanText.split(' ');
      const lastWord = words[words.length - 1].replace(/\D/g, '');
      
      if (lastWord) {
        amount = Number(lastWord);
        words.pop();
        title = words.join(' ');
      }

      if (!title || amount <= 0) {
        await sendTelegramMessage("Format tidak valid! Contoh: makan 15000 atau pemasukan gaji 2000000 : Gaji");
        return res.status(200).json({ status: 'Format tidak valid' });
      }

      // Simpan ke database Neon DB
      if (databaseUrl) {
        const sql = neon(databaseUrl);
        await sql`
          INSERT INTO transactions (title, amount, type, category, username)
          VALUES (${title}, ${amount}, ${type}, ${category}, ${usernameFromReq})
        `;
      }

      // Kirim konfirmasi berhasil ke Telegram
      const formatRupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount);
      await sendTelegramMessage(`✅ Berhasil dicatat!\n• ${title}\n• ${type === 'income' ? 'Pemasukan' : 'Pengeluaran'}: ${formatRupiah}\n• Kategori: ${category}`);

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Webhook Error:', error);
      return res.status(200).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
