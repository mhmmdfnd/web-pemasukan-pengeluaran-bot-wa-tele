const { Client } = require('pg');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(200).send('Webhook Telegram Aktif!');
    }

    const body = req.body || {};
    const message = body.message;

    if (!message || !message.text) {
        return res.status(200).json({ status: 'no message text' });
    }

    const chatId = message.chat.id;
    const text = message.text.trim();
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

    if (!BOT_TOKEN) {
        return res.status(200).json({ status: 'error', message: 'Missing bot token' });
    }

    let replyText = '';
    const cleanText = text.toLowerCase();

    // 1. FITUR HAPUS TRANSAKSI VIA TELEGRAM (Contoh: hapus 5)
    if (cleanText.startsWith('hapus')) {
        const targetId = cleanText.split(' ')[1];
        if (!targetId || isNaN(targetId)) {
            replyText = '❓ *Format Hapus Salah*\nGunakan: `hapus [ID]`\nContoh: `hapus 5`';
        } else {
            if (!process.env.DATABASE_URL) {
                replyText = '❌ `DATABASE_URL` belum diset di Vercel!';
            } else {
                const client = new Client({
                    connectionString: process.env.DATABASE_URL,
                    ssl: { rejectUnauthorized: false }
                });
                try {
                    await client.connect();
                    const resDb = await client.query('DELETE FROM transactions WHERE id = $1', [targetId]);
                    await client.end();

                    if (resDb.rowCount > 0) {
                        replyText = `🗑️ *Transaksi ID ${targetId} Berhasil Dihapus!*`;
                    } else {
                        replyText = `⚠️ Transaksi dengan ID ${targetId} tidak ditemukan.`;
                    }
                } catch (err) {
                    replyText = `❌ Gagal menghapus: \`${err.message}\``;
                }
            }
        }
    } 
    // 2. PARSER PEMASUKAN & PENGELUARAN MENGGUNAKAN KATA AWALAN
    else {
        let type = 'expense'; // Default pengeluaran
        let rawInput = text;

        // Cek jika diawali kata "pemasukan"
        if (cleanText.startsWith('pemasukan ')) {
            type = 'income';
            rawInput = text.substring(10).trim();
        } 
        // Cek jika diawali kata "pengeluaran"
        else if (cleanText.startsWith('pengeluaran ')) {
            type = 'expense';
            rawInput = text.substring(12).trim();
        }

        // Match Regex: [Deskripsi] [Jumlah] : [Kategori Optional]
        const match = rawInput.match(/^(.+?)\s+(\d+(?:[.,]\d+)?)\s*(k|rb|ribu|jt|juta)?(?:\s*:\s*(.+))?$/i);

        if (match) {
            let title = match[1].trim();
            let num = parseFloat(match[2].replace(',', '.'));
            let unit = (match[3] || '').toLowerCase();
            let customCategory = match[4] ? match[4].trim() : null;

            // Hitung Nominal Angka
            let amount = num;
            if (['k', 'rb', 'ribu'].includes(unit)) amount = num * 1000;
            if (['jt', 'juta'].includes(unit)) amount = num * 1000000;

            // Tentukan Kategori Default
            let category = type === 'income' ? 'Pemasukan' : 'Pengeluaran';

            // Kategori Manual dari User (jika menggunakan tanda :)
            if (customCategory) {
                category = customCategory.charAt(0).toUpperCase() + customCategory.slice(1);
            }

            title = title.charAt(0).toUpperCase() + title.slice(1);

            // Simpan ke Neon DB
            if (!process.env.DATABASE_URL) {
                replyText = '❌ *Error*: `DATABASE_URL` belum diset di Vercel!';
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

                    const icon = type === 'income' ? '🟢' : '🔴';
                    const typeLabel = type === 'income' ? 'Pemasukan' : 'Pengeluaran';

                    replyText = `✅ *Berhasil Dicatat!*\n\n📌 *Deskripsi*: ${title}\n💰 *Jumlah*: Rp ${amount.toLocaleString('id-ID')}\n📂 *Tipe*: ${icon} ${typeLabel}\n🏷️ *Kategori*: ${category}`;
                } catch (err) {
                    console.error('Database Error:', err);
                    replyText = `❌ *Gagal Simpan DB*:\n\`${err.message}\``;
                }
            }
        } else {
            replyText = `❓ *Format Tidak Dikenali*\n\n*Pemasukan:*\n• \`pemasukan Jual motor 13jt\`\n• \`pemasukan Gaji kantor 5jt : Pekerjaan\`\n\n*Pengeluaran:*\n• \`pengeluaran Beli motor 10jt\`\n• \`pengeluaran Beli bensin 50k : Transport\`\n\n*Hapus Data:*\n• \`hapus 12\``;
        }
    }

    // Balas ke Telegram
    try {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: replyText, parse_mode: 'Markdown' })
        });
    } catch (err) {
        console.error('Fetch Telegram Error:', err);
    }

    return res.status(200).json({ status: 'success' });
};
