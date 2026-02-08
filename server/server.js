import 'dotenv/config.js';
import express, { json } from 'express';
import { hash as _hash, compare } from 'bcrypt';
import jwtPkg from 'jsonwebtoken';
const { sign } = jwtPkg;
import cors from 'cors';
import init, { createUser, getUserByUsername, getConversationsByUserId, createConversation, getMessagesByConversationId, getMessageCountByConversationId } from './db.js';
import { connectRedis, initConversation as redisInitConversation } from './redis.js';

console.log("[SERVER] Starting server initialization...");

const app = express();
app.use(json());
app.use(cors());

// Redis helpers are in ./redis.js

const JWT_SECRET = "dev_secret";

/* SIGNUP */
app.post('/signup', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: "Missing credentials" });
  
  console.log(`[SERVER] POST /signup - Username: ${username}`);
  
  try {
    const hash = await _hash(password, 10);
    console.log(`[SERVER] Password hashed for user: ${username}`);

    await createUser(username, hash);
    
    const result = await getUserByUsername(username);
    const userId = result.id;
    console.log(`[SERVER] User created successfully - ID: ${userId}, Username: ${username}`);
    res.json({ userId });
  } catch (err) {
    console.error(`[SERVER] Signup error for ${username}:`, err.message);
    res.status(400).json({ error: err.message });
  }
});

/* LOGIN */
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  console.log(`[SERVER] POST /login - Username: ${username}`);
  
  try {
    const user = await getUserByUsername(username);

    if (!user) {
      console.log(`[SERVER] Login failed - User not found: ${username}`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await compare(password, user.password_hash);
    if (!valid) {
      console.log(`[SERVER] Login failed - Invalid password for user: ${username}`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const userId = user.id;
    console.log(`[SERVER] Password verified for user: ${username} (ID: ${userId})`);

    const convos = await getConversationsByUserId(userId);
    
    const token = sign({ userId }, JWT_SECRET);
    console.log(`[SERVER] Login successful - User: ${username} (ID: ${userId}), Conversations: ${convos.length}`);

    res.json({
      token,
      userId,
      conversations: convos
    });
  } catch (err) {
    console.error(`[SERVER] Login error for ${username}:`, err.message);
    res.status(400).json({ error: err.message });
  }
});

/* CREATE NEW CONVO */
app.post('/conversations', async (req, res) => {
  const { userId, title } = req.body;
  console.log(`[SERVER] POST /conversations - User: ${userId}, Title: ${title || 'New Chat'}`);
  
  try {
    const conversationTitle = title || 'New Chat';
    const result = await createConversation(userId, conversationTitle);
    
    console.log(`[SERVER] Conversation created - ID: ${result.id}, User: ${userId}`);
    res.json({ conversationId: result.id });
  } catch (err) {
    console.error(`[SERVER] Create conversation error for user ${userId}:`, err.message);
    res.status(400).json({ error: err.message });
  }
});

/* INIT CONVERSATION IN REDIS */
app.post('/conversations/init', async (req, res) => {
  const { conversationId } = req.body;
  if (!conversationId) return res.status(400).json({ error: 'Missing conversationId' });
  try {
    const result = await redisInitConversation(conversationId);
    if (result.already) {
      console.log(`[SERVER] Redis key already exists for conversation:${conversationId}`);
      return res.json({ ok: true, message: 'Already initialized' });
    }
    console.log(`[SERVER] Initialized redis list for conversation ${conversationId}`);
  
    return res.json({ ok: true });
  } catch (err) {
    console.error('[SERVER] Error initializing conversation in Redis:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

app.get('/conversations/:id/messages', async (req, res) => {
  const conversationId = req.params.id;
  // Pagination: offset = how many messages to skip from the end, limit = batch size
  // Default: fetch last 10 messages (offset=0, limit=10)
  const limit = req.query.limit !== undefined ? Math.max(1, parseInt(req.query.limit, 10)) : 10;
  const offset = req.query.offset !== undefined ? Math.max(0, parseInt(req.query.offset, 10)) : 0;

  try {
    const messages = await getMessagesByConversationId(conversationId, limit, offset);
    const total = await getMessageCountByConversationId(conversationId);
    return res.json({ ok: true, messages, total, limit, offset });
  } catch (err) {
    console.error('[SERVER] Error fetching messages from database:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    console.log("[SERVER] Initializing database...");
    await init();
    await connectRedis();
    
    app.listen(PORT, () => {
      console.log(`[SERVER] ========== Server Ready ==========`);
      console.log(`[SERVER] Node auth MS running on port ${PORT}`);
      console.log(`[SERVER] Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`[SERVER] Ready to accept connections`);
    });
  } catch (err) {
    console.error('[SERVER] ========== Server Startup Failed ==========');
    console.error('[SERVER] Error:', err.message);
    process.exit(1);
  }
}

start();
