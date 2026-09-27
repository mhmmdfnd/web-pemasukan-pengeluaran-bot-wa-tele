const { Client } = require('pg');

module.exports = async (req, res) => {
    // Tangani jika diakses via browser
    if (req.method !== 'POST') {
        return res.status(200).send('Webhook Telegram Aktif!');
    }

    const body = req.body || {};
    const message = body.message;

    if (!message || !message.text) {
        return res.status(200).json({ status: 'no message text' });
    }

    const chatId = message.chat.id;
    const text = message.text;
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

    if (!BOT_TOKEN) {
        console.error('TELEGRAM_BOT_TOKEN tidak ditemukan di Environment Variables!');
        return res.status(200).json({ status: 'error', message: 'Missing bot token' });
    }

    let replyText = '';

    // Logika Parser
    const cleanText = text.toLowerCase().trim();
    const match = cleanText.match(/^(.+?)\s+(\d+(?:[.,]\d+)?)\s*(k|rb|ribu|jt|juta)?$/i);

    if (match) {
        let title = match[1].trim();
        let num = parseFloat(match[2].replace(',', '.'));
        let unit = (match[3] || '').toLowerCase();

        let amount = num;
        if (['k', 'rb', 'ribu'].includes(unit)) amount = num * 1000;
        if (['jt', 'juta'].includes(unit)) amount = num * 1000000;

        let type = 'expense';
        let category = 'Lainnya';

        if (title.includes('gaji') || title.includes('bonus') || title.includes('dapat') || title.includes('pemasukan')) {
            type = 'income';
            category = 'Gaji/Bonus';
        } else if (title.includes('makan') || title.includes('minum') || title.includes('kopi')) {
            category = 'Makanan';
        } else if (title.includes('bensin') || title.includes('gojek') || title.includes('grab')) {
            category = 'Transport';
        }

        title = title.charAt(0).toUpperCase() + title.slice(1);

        // KONEKSI DATABASE NEON DB
        if (!process.env.DATABASE_URL) {
            replyText = '❌ *Error*: `DATABASE_URL` belum diset di Environment Variables Vercel!';
        } else {
            const client = new Client({
                connectionString: process.env.DATABASE_URL,
                ssl: { rejectUnauthorized: false }
            });

            try {
                await client.connect();
                await client.query(
                    `INSERT INTO transactions (title, amount, type, category, created_at) VALUES ($1, $2, $3, $4, NOW())`,
                    [title, amount, type, category]
                );
                await client.end();

                replyText = `✅ *Berhasil Dicatat ke Neon DB!*\n\n📌 *Deskripsi*: ${title}\n💰 *Jumlah*: Rp ${amount.toLocaleString('id-ID')}\n🏷️ *Kategori*: ${category}\n📂 *Tipe*: ${type === 'income' ? 'Pemasukan' : 'Pengeluaran'}`;
            } catch (err) {
                console.error('Database Error:', err);
                replyText = `❌ *Gagal Simpan DB*:\n\`${err.message}\``;
            }
        }
    } else {
        replyText = '❓ *Format tidak dikenali.*\nContoh: `makan siang 25k` atau `gaji 5jt`';
    }

    // KIRIM BALASAN KE TELEGRAM
    try {
        const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: replyText, parse_mode: 'Markdown' })
        });
        
        const tgData = await tgRes.json();
        console.log('Telegram API Response:', tgData);
    } catch (err) {
        console.error('Fetch Telegram Error:', err);
    }

    return res.status(200).json({ status: 'success' });
};
