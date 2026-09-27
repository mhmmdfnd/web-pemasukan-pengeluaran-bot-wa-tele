// api/auth.js
import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return res.status(500).json({ success: false, message: 'DATABASE_URL belum dipasang di Vercel' });
  }

  try {
    const sql = neon(databaseUrl);

    // 1. HANDLER LOGIN
    if (req.method === 'POST' && req.body.action === 'login') {
      const { username, password } = req.body;
      const rows = await sql`SELECT id, username, password, bot_token, chat_id, role FROM users WHERE username = ${username}`;

      if (rows.length === 0 || rows[0].password !== password) {
        return res.status(401).json({ success: false, message: 'Username atau password salah!' });
      }

      const user = rows[0];
      return res.status(200).json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          botToken: user.bot_token || '',
          chatId: user.chat_id || '',
          role: user.role
        }
      });
    }

    // 2. HANDLER LIST USER (ADMIN)
    if (req.method === 'GET') {
      const allUsers = await sql`SELECT id, username, bot_token AS "botToken", chat_id AS "chatId", role FROM users ORDER BY id ASC`;
      return res.status(200).json({ success: true, users: allUsers });
    }

    // 3. HANDLER REGISTER USER (ADMIN)
    if (req.method === 'POST' && req.body.action === 'register') {
      const { username, password, botToken, chatId, role } = req.body;

      if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username dan password wajib diisi!' });
      }

      const inserted = await sql`
        INSERT INTO users (username, password, bot_token, chat_id, role)
        VALUES (${username}, ${password}, ${botToken || ''}, ${chatId || ''}, ${role || 'user'})
        RETURNING id, username, role
      `;

      return res.status(200).json({ success: true, user: inserted[0] });
    }

    // 4. HANDLER HAPUS USER
    if (req.method === 'DELETE') {
      const { id } = req.body;
      await sql`DELETE FROM users WHERE id = ${id}`;
      return res.status(200).json({ success: true, message: 'User berhasil dihapus' });
    }

    return res.status(405).json({ message: 'Method not allowed' });
  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}
