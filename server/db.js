import pkg from "pg";
const { Client, Pool } = pkg;

const DB_NAME = process.env.DB_NAME || "chatdb";
const DB_USER = process.env.POSTGRES_USER || "user";
const DB_PASSWORD = process.env.POSTGRES_PASSWORD || "pass";
const DB_HOST = process.env.DB_HOST || "localhost";
const DB_PORT = parseInt(process.env.DB_PORT || "5432", 10);

console.log("[DB] Configuration loaded:", { DB_HOST, DB_PORT, DB_NAME, DB_USER });

const adminConfig = {
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: "postgres", // connect to default db first
};

/**
 * Setting up a connection pool for the application database.
 * The pool will be initialized on first use to ensure the database is ready.
 */
const appConfig = {
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
};

let pool = null;

function getPool() {
  if (!pool) {
    console.log("[DB] Creating connection pool...");
    pool = new Pool(appConfig);
    pool.on('error', (err) => {
      console.error('[DB] Unexpected error on idle client', err);
    });
  }
  return pool;
}

/**
 * Database initialization steps:
 * 1. Wait for database to be ready
 * 2. Create database if it doesn't exist
 * 3. Create necessary tables if they don't exist
 */

async function waitForDatabase(config, maxRetries = 30, delay = 1000) {
  console.log(`[DB] Waiting for database at ${config.host}:${config.port}...`);
  for (let i = 0; i < maxRetries; i++) {
    try {
      const client = new Client(config);
      await client.connect();
      await client.end();
      console.log("[DB] Database connection successful");
      return true;
    } catch (err) {
      if (i === maxRetries - 1) {
        console.error(`[DB] Connection failed after ${maxRetries} attempts`);
        throw new Error(`Database not ready after ${maxRetries} retries: ${err.message}`);
      }
      console.log(`[DB] Connection attempt ${i + 1}/${maxRetries} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

async function createDatabaseIfNotExists() {
  console.log("[DB] Checking if database exists...");
  const client = new Client(adminConfig);
  await client.connect();
  console.log("[DB] Connected to postgres admin database");

  const res = await client.query(
    "SELECT 1 FROM pg_database WHERE datname = $1",
    [DB_NAME]
  );

  if (res.rowCount === 0) {
    console.log(`[DB] Creating database: ${DB_NAME}`);
    await client.query(`CREATE DATABASE ${DB_NAME}`);
    console.log(`[DB] Database '${DB_NAME}' created successfully`);
  } else {
    console.log(`[DB] Database '${DB_NAME}' already exists`);
  }

  await client.end();
  console.log("[DB] Closed admin connection");
}

async function createTables() {
  console.log("[DB] Creating tables...");
  const client = new Client(appConfig);
  await client.connect();
  console.log(`[DB] Connected to application database '${DB_NAME}'`);

  console.log("[DB] Creating 'users' table...");
  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL
    );
  `);
  console.log("[DB] 'users' table ready");

  console.log("[DB] Creating 'conversations' table...");
  await client.query(`
    CREATE TABLE IF NOT EXISTS conversations (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id),
      title TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log("[DB] 'conversations' table ready");

  console.log("[DB] Creating 'messages' table...");
  await client.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id UUID PRIMARY KEY,
      conversation_id INT REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
      type TEXT NOT NULL CHECK (type IN ('text','image','command')),
      content TEXT NOT NULL,
      ts BIGINT NOT NULL
    );
  `);
  console.log("[DB] 'messages' table ready");

  await client.end();
  console.log("[DB] Closed application database connection");
}

async function init() {
  console.log("[DB] ========== Database Initialization Started ==========");
  try {
    await waitForDatabase(adminConfig);
    await createDatabaseIfNotExists();
    await createTables();
    console.log("[DB] ========== Database Ready ==========");
    return true;
  } catch (err) {
    console.error("[DB] ========== Database Initialization Failed ==========");
    console.error("[DB] Error:", err.message);
    process.exit(1);
  }
}

/**
 * Database access functions for users, conversations, and messages.
 * Each function includes logging for debugging and error handling.
 */

async function createUser(username, passwordHash) {
  console.log("[DB] Creating user:", username);
  try {
    const result = await getPool().query(
      'INSERT INTO users(username, password_hash) VALUES($1,$2) RETURNING id',
      [username, passwordHash]
    );
    const userId = result.rows[0].id;
    console.log(`[DB] User created - ID: ${userId}, Username: ${username}`);
    return { id: userId, username };
  } catch (err) {
    console.error(`[DB] Error creating user ${username}:`, err.message);
    throw err;
  }
}

async function getUserByUsername(username) {
  console.log("[DB] Fetching user:", username);
  try {
    const result = await getPool().query(
      'SELECT * FROM users WHERE username=$1',
      [username]
    );
    if (result.rows.length > 0) {
      console.log(`[DB] User found: ${username} (ID: ${result.rows[0].id})`);
    } else {
      console.log(`[DB] User not found: ${username}`);
    }
    return result.rows[0] || null;
  } catch (err) {
    console.error(`[DB] Error fetching user ${username}:`, err.message);
    throw err;
  }
}

async function getConversationsByUserId(userId) {
  console.log("[DB] Fetching conversations for user:", userId);
  try {
    const result = await getPool().query(
      'SELECT id, title FROM conversations WHERE user_id=$1',
      [userId]
    );
    console.log(`[DB] Found ${result.rows.length} conversations for user ${userId}`);
    return result.rows;
  } catch (err) {
    console.error(`[DB] Error fetching conversations for user ${userId}:`, err.message);
    throw err;
  }
}

async function createConversation(userId, title) {
  console.log(`[DB] Creating conversation for user ${userId}:`, title);
  try {
    const result = await getPool().query(
      'INSERT INTO conversations(user_id, title) VALUES($1,$2) RETURNING id',
      [userId, title]
    );
    const conversationId = result.rows[0].id;
    console.log(`[DB] Conversation created - ID: ${conversationId}, User: ${userId}`);
    return { id: conversationId, userId, title };
  } catch (err) {
    console.error(`[DB] Error creating conversation for user ${userId}:`, err.message);
    throw err;
  }
}

async function createMessage({id, conversationId, role, type = "text", content, ts = Date.now()}) {
  console.log(`[DB] Storing message ${id} in conversation ${conversationId}`);

  try {
    await getPool().query(
      `
      INSERT INTO messages(id, conversation_id, role, type, content, ts)
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [id, conversationId, role, type, content, ts]
    );

    console.log(`[DB] Message stored - ID: ${id}, Conversation: ${conversationId}, Role: ${role}`);
    return { id, conversationId, role, type, content, ts };
  } catch (err) {
    console.error("[DB] Error storing message:", err.message);
    throw err;
  }
}

async function getMessagesByConversationId(conversationId, limit = null) {
  console.log("[DB] Fetching messages for conversation:", conversationId, "limit:", limit);

  try {
    let query;
    let params;

    if (limit && Number.isInteger(limit)) {
      // Get latest N messages, then reorder ascending for display
      query = `
        SELECT id, role, type, content, ts
        FROM (
          SELECT id, role, type, content, ts
          FROM messages
          WHERE conversation_id = $1
          ORDER BY ts DESC
          LIMIT $2
        ) sub
        ORDER BY ts ASC
      `;
      params = [conversationId, limit];
    } else {
      // Get all messages in ascending order
      query = `
        SELECT id, role, type, content, ts
        FROM messages
        WHERE conversation_id = $1
        ORDER BY ts ASC
      `;
      params = [conversationId];
    }

    const result = await getPool().query(query, params);

    console.log(
      `[DB] Found ${result.rows.length} messages for conversation ${conversationId}`
    );

    return result.rows;
  } catch (err) {
    console.error("[DB] Error fetching messages:", err.message);
    throw err;
  }
}

export default init;
export { createUser, getUserByUsername, getConversationsByUserId, createConversation, createMessage, getMessagesByConversationId, getPool };
