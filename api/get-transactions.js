const { Client } = require('pg');

module.exports = async (req, res) => {
    // Header CORS agar website bisa mengambil data tanpa terhalang browser
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Content-Type', 'application/json');

    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        const result = await client.query('SELECT * FROM transactions ORDER BY id DESC');
        await client.end();

        return res.status(200).json(result.rows);
    } catch (err) {
        console.error('Fetch Error:', err);
        return res.status(500).json({ error: err.message });
    }
};
