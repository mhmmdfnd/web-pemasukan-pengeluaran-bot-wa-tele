// api/auth.js
import { pgTable, text, varchar, timestamp, serial } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { eq } from 'drizzle-orm';

// Definisi Skema Tabel Users
const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: varchar('username', { length: 100 }).notNull().unique(),
  password: varchar('password', { length: 255 }).notNull(),
  botToken: text('bot_token'),
  chatId: varchar('chat_id', { length: 100 }),
  role: varchar('role', { length: 20 }).default('user'),
  createdAt: timestamp('created_at').defaultNow(),
});

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const sql = neon(process.env.DATABASE_URL);
  const db = drizzle(sql);

  try {
    // 1. HANDLER LOGIN
    if (req.method === 'POST' && req.body.action === 'login') {
      const { username, password } = req.body;
      const result = await db.select().from(users).where(eq(users.username, username));

      if (result.length === 0 || result[0].password !== password) {
        return res.status(401).json({ success: false, message: 'Username atau password salah!' });
      }

      const user = result[0];
      return res.status(200).json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          botToken: user.botToken || '',
          chatId: user.chatId || '',
          role: user.role
        }
      });
    }

    // 2. HANDLER LIST ALL USERS (KHUSUS ADMIN)
    if (req.method === 'GET') {
      const allUsers = await db.select({
        id: users.id,
        username: users.username,
        botToken: users.botToken,
        chatId: users.chatId,
        role: users.role
      }).from(users);

      return res.status(200).json({ success: true, users: allUsers });
    }

    // 3. HANDLER TAMBAH USER BARU (TAMBAH DENGAN BOT TOKEN)
    if (req.method === 'POST' && req.body.action === 'register') {
      const { username, password, botToken, chatId, role } = req.body;

      if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username dan password wajib diisi!' });
      }

      const newUser = await db.insert(users).values({
        username,
        password,
        botToken: botToken || '',
        chatId: chatId || '',
        role: role || 'user'
      }).returning();

      return res.status(200).json({ success: true, user: newUser[0] });
    }

    // 4. HANDLER HAPUS USER
    if (req.method === 'DELETE') {
      const { id } = req.body;
      await db.delete(users).where(eq(users.id, id));
      return res.status(200).json({ success: true, message: 'User berhasil dihapus' });
    }

    return res.status(405).json({ message: 'Method not allowed' });
  } catch (error) {
    console.error('Database error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}