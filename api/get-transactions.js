// api/get-transactions.js
import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return res.status(500).json({ error: 'DATABASE_URL belum dikonfigurasi' });
  }

  try {
    const sql = neon(databaseUrl);
    
    // Mengambil transaksi dari tabel (urutkan dari yang terbaru)
    const transactions = await sql`
      SELECT id, title, amount, type, category, created_at 
      FROM transactions 
      ORDER BY id DESC
    `;

    return res.status(200).json(transactions);
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return res.status(500).json({ error: 'Gagal mengambil data transaksi', details: error.message });
  }
}
