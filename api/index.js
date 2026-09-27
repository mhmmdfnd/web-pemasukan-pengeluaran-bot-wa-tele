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

  const databaseUrl = process.env.DATABASE_URL;
  const sql = databaseUrl ? neon(databaseUrl) : null;

  if (req.method === 'POST') {
    try {
      const update = req.body;
      const text = update && update.message && update.message.text ? update.message.text.trim() : (update && update.text ? update.text.trim() : '');
      const chatId = update && update.message && update.message.chat ? update.message.chat.id : 0;
      const botToken = process.env.TELEGRAM_BOT_TOKEN;

      const replyTelegram = async (msg) => {
        if (!botToken || !chatId) return;
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: msg })
        });
      };

      if (!text) {
        return res.status(200).json({ status: 'No text' });
      }

      // 1. CEK PERINTAH HAPUS (Contoh: "hapus 49")
      if (text.toLowerCase().startsWith('hapus')) {
        const idTarget = text.replace(/hapus/i, '').trim();
        if (idTarget && sql) {
          await sql`DELETE FROM transactions WHERE id = ${idTarget}`;
        }
        if (chatId) await replyTelegram(`🗑️ Transaksi #${idTarget} berhasil dihapus.`);
        return res.status(200).json({ success: true, deleted: idTarget });
      }

      if (text.toLowerCase() === '/start') {
        await replyTelegram("Halo! Bot keuangan aktif. Contoh format:\n• pengeluaran makan 10k\n• pemasukan gaji 5jt");
        return res.status(200).json({ success: true });
      }

      let type = 'expense';
      let category = 'Pengeluaran';
      let cleanText = text;

      if (text.toLowerCase().startsWith('pemasukan')) {
        type = 'income';
        category = 'Pemasukan';
        cleanText = text.replace(/^pemasukan\s*/i, '').trim();
      } else if (text.toLowerCase().startsWith('pengeluaran')) {
        type = 'expense';
        category = 'Pengeluaran';
        cleanText = text.replace(/^pengeluaran\s*/i, '').trim();
      }

      const words = cleanText.split(/\s+/);
      const rawAmountStr = words.pop();
      let title = words.join(' ');

      if (!title) {
        title = cleanText;
      }

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

        let cleanNum = lower.replace(/\./g, '').replace(',', '.').replace(/[^0-9.]/g, '');
        let num = parseFloat(cleanNum);
        return isNaN(num) ? 0 : Math.round(num * multiplier);
      };

      let amount = parseAmount(rawAmountStr);

      if (!title || amount <= 0) {
        await replyTelegram("Format tidak valid! Contoh: pengeluaran makan 10k atau pemasukan gaji 5jt");
        return res.status(200).json({ success: true });
      }

      if (sql) {
        await sql`
          INSERT INTO transactions (title, amount, type, category, username)
          VALUES (${title}, ${amount}, ${type}, ${category}, 'admin')
        `;
      }

      const formatRp = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount);
      await replyTelegram(`✅ Berhasil dicatat!\n• Deskripsi: ${title}\n• Jumlah: ${formatRp}\n• Kategori: ${category}`);

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Server Error:', error);
      return res.status(200).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
