const { Client } = require('pg');

module.exports = async (req, res) => {
    // Pengaturan Header CORS agar frontend bisa membaca API ini
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        // Mengambil semua data transaksi dari Neon DB, diurutkan dari yang terbaru
        const result = await client.query('SELECT * FROM transactions ORDER BY created_at DESC');
        await client.end();
        
        return res.status(200).json(result.rows);
    } catch (err) {
        console.error('Database fetch error:', err);
        return res.status(500).json({ error: 'Gagal mengambil data dari database' });
    }
};