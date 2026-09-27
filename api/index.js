// /api/telegram-webhook.js (Vercel Serverless Function)
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { message } = req.body;
    if (!message || !message.text) return res.status(200).send('OK');

    const chatId = message.chat.id;
    const text = message.text;

    // 1. Parsing Regex Sederhana (Nominal & Kategori)
    const match = text.match(/^(.*?)\s*(\d+[\d\.\,]*)\s*(k|rb|jt|juta)?$/i);
    
    let replyText = "";
    if (match) {
        let desc = match[1];
        let amountNum = parseFloat(match[2]);
        let multiplier = match[3] ? match[3].toLowerCase() : '';

        if (multiplier === 'k' || multiplier === 'rb') amountNum *= 1000;
        if (multiplier === 'jt' || multiplier === 'juta') amountNum *= 1000000;

        // 2. Simpan ke Database (Misal: Supabase / Firebase / PlanetScale)
        // await saveToDatabase({ desc, amount: amountNum, chatId });

        replyText = `✅ *Tercatat!* \n📝 Deskripsi: ${desc}\n💰 Jumlah: Rp ${amountNum.toLocaleString('id-ID')}`;
    } else {
        replyText = "⚠️ Format salah. Contoh format: *makan siang 25k* atau *gaji 5jt*";
    }

   // 3. Kirim Balasan via Telegram API
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: replyText, parse_mode: 'Markdown' })
});

return res.status(200).json({ status: 'success' });
}