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
        console.error('TELEGRAM_BOT_TOKEN tidak ditemukan!');
        return res.status(200).json({ status: 'error', message: 'Missing bot token' });
    }

    let replyText = '';
    const cleanText = text.toLowerCase();

    // 1. FITUR HAPUS TRANSAKSI VIA TELEGRAM (Contoh: hapus 5)
    if (cleanText.startsWith('hapus')) {
        const targetId = cleanText.split(' ')[1];
        if (!targetId || isNaN(targetId)) {
            replyText = '❓ Sertakan ID transaksi yang ingin dihapus.\nContoh: `hapus 5`';
        } else {
            if (!process.env.DATABASE_URL) {
                replyText = '❌ DATABASE_URL tidak ditemukan!';
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
                        replyText = `🗑️ *Transaksi dengan ID ${targetId} berhasil dihapus!*`;
                    } else {
                        replyText = `⚠️ Transaksi dengan ID ${targetId} tidak ditemukan.`;
                    }
                } catch (err) {
                    replyText = `❌ Gagal menghapus: \`${err.message}\``;
                }
            }
        }
    } 
    // 2. PARSER PEMASUKAN / PENGELUARAN & KATEGORI
    else {
        // Mendukung format: "makan siang 25k", "makan siang 25k : Kuliner", atau "gaji 5jt : Kantor"
        const match = cleanText.match(/^(.+?)\s+(\d+(?:[.,]\d+)?)\s*(k|rb|ribu|jt|juta)?(?:\s*:\s*(.+))?$/i);

        if (match) {
            let title = match[1].trim();
            let num = parseFloat(match[2].replace(',', '.'));
            let unit = (match[3] || '').toLowerCase();
            let customCategory = match[4] ? match[4].trim() : null;

            // Kalkulasi Jumlah
            let amount = num;
            if (['k', 'rb', 'ribu'].includes(unit)) amount = num * 1000;
            if (['jt', 'juta'].includes(unit)) amount = num * 1000000;

            let type = 'expense';
            let category = 'Lainnya';

            // Deteksi Tipe (Pemasukan vs Pengeluaran)
            const incomeKeywords = ['gaji', 'bonus', 'dapat', 'pemasukan', 'transfer', 'freelance', 'cuan', 'hasil', 'saham', 'dividen'];
            const isIncome = incomeKeywords.some(keyword => title.includes(keyword));

            if (isIncome) {
                type = 'income';
                category = 'Pemasukan';
            } else {
                // Katagorisasi Otomatis untuk Pengeluaran
                if (title.includes('makan') || title.includes('minum') || title.includes('kopi') || title.includes('bakso') || title.includes('nasi')) {
                    category = 'Makanan & Minuman';
                } else if (title.includes('bensin') || title.includes('gojek') || title.includes('grab') || title.includes('parkir') || title.includes('tol')) {
                    category = 'Transportasi';
                } else if (title.includes('pulsa') || title.includes('kuota') || title.includes('wifi') || title.includes('listrik') || title.includes('air') || title.includes('token')) {
                    category = 'Tagihan & Tagihan';
                } else if (title.includes('belanja') || title.includes('baju') || title.includes('sepatu') || title.includes('tokped') || title.includes('shopee')) {
                    category = 'Belanja';
                } else if (title.includes('nonton') || title.includes('game') || title.includes('topup') || title.includes('bioskop')) {
                    category = 'Hiburan';
                }
            }

            // Jika user menuliskan kategori manual (menggunakan titik dua :), pakai kategori user
            if (customCategory) {
                category = customCategory.charAt(0).toUpperCase() + customCategory.slice(1);
            }

            title = title.charAt(0).toUpperCase() + title.slice(1);

            // Simpan Ke Neon DB
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

                    replyText = `✅ *Berhasil Dicatat!*\n\n📌 *Deskripsi*: ${title}\n💰 *Jumlah*: Rp ${amount.toLocaleString('id-ID')}\n🏷️ *Kategori*: ${category}\n📂 *Tipe*: ${type === 'income' ? '🟢 Pemasukan' : '🔴 Pengeluaran'}`;
                } catch (err) {
                    console.error('Database Error:', err);
                    replyText = `❌ *Gagal Simpan DB*:\n\`${err.message}\``;
                }
            }
        } else {
            replyText = '❓ *Format tidak dikenali.*\n\n*Contoh Penggunaan:*\n• `makan siang 25k`\n• `gaji 5jt : Kantor`\n• `beli sepatu 200k : Lifestyle`\n• `hapus 12` *(Menghapus ID 12)*';
        }
    }

    // Kirim Balasan Ke Telegram
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
