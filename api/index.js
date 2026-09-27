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

  if (req.method === 'GET') {
    return res.status(200).json({ status: 'API is running' });
  }

  if (req.method === 'POST') {
    try {
      const update = req.body;
      if (!update || !update.message || !update.message.text) {
        return res.status(200).json({ status: 'No message text' });
      }

      const text = update.message.text.trim();
      const usernameFromReq = req.body.username || 'admin';

      if (text.toLowerCase() === '/start') {
        return res.status(200).json({ status: 'Started command received' });
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
        return res.status(200).json({ status: 'Format tidak valid' });
      }

      if (databaseUrl) {
        const sql = neon(databaseUrl);
        await sql`
          INSERT INTO transactions (title, amount, type, category, username)
          VALUES (${title}, ${amount}, ${type}, ${category}, ${usernameFromReq})
        `;
      }

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Webhook Error:', error);
      // Tetap kembalikan 200 agar Telegram tidak melakukan retry terus-menerus
      return res.status(200).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
