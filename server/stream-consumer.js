import 'dotenv/config.js';
import pLimit from 'p-limit';
import { createClient } from 'redis';
import init, { createMessage } from './db.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const WORKER_ID = `worker-${process.pid}`; // unique name per process. Important for consumer groups.
const CONSUMER_GROUP = 'pg-writers'; // logical group Redis uses to distribute work.
const STREAM_KEY = 'messages_stream'; // stream name.
const BATCH_SIZE = 100; // max messages per read.
const BLOCK_MS = 5000; // long-poll timeout.

const PARALLEL_LIMIT = pLimit(5); // max 5 concurrent DB inserts

let redisClient = null;

/**
 * Initialize Redis client
 */
async function initRedis() {
  if (redisClient) return redisClient;
  redisClient = createClient({ url: REDIS_URL });
  redisClient.on('error', (err) => console.error('[WORKER/REDIS] Error:', err));
  
  try {
    await redisClient.connect();
    console.log('[WORKER/REDIS] Connected to Redis');
    return redisClient;
  } catch (err) {
    console.error('[WORKER/REDIS] Connection failed:', err.message);
    throw err;
  }
}

/**
 * Initialize database
 */
async function initDb() {
  await init();
}

/**
 * Ensure consumer group exists. Create if not, ignore if already exists.
 */
async function ensureConsumerGroup() {
  try {
    // Try to create the group. If it already exists, Redis returns an error which we catch.
    await redisClient.xGroupCreate(STREAM_KEY, CONSUMER_GROUP, '$', {
      MKSTREAM: true,
    });
    console.log(`[WORKER] Consumer group '${CONSUMER_GROUP}' created (or already exists)`);
  } catch (err) {
    if (err.message && err.message.includes('BUSYGROUP')) {
      console.log(`[WORKER] Consumer group '${CONSUMER_GROUP}' already exists`);
    } else {
      console.error(`[WORKER] Error ensuring consumer group:`, err.message);
      throw err;
    }
  }
}

/**
 * Process a single stream entry: convert fields and insert into DB
 */
async function insertMessage(msg) {
  try {
    await createMessage({
      id: msg.message_id,
      conversationId: parseInt(msg.conversation_id, 10),
      role: msg.role,
      type: msg.type,
      content: msg.content,
      ts: parseInt(msg.ts, 10),
    });
    
    console.log(`[WORKER/DB] Inserted message ${msg.message_id} for conversation ${msg.conversation_id}`);
    return true;
  } catch (err) {
    console.error(`[WORKER/DB] Failed to insert message ${msg.message_id}:`, err.message);
    throw err;
  }
}

/**
 * Process a single stream entry
 */
async function processEntry(id, msg) {
  try {
    console.log(`[WORKER] Processing message ${id} for conversation ${msg.conversation_id}`);

    // Insert into Postgres using shared DB function
    await insertMessage(msg);
    
    // On success, acknowledge the message
    await redisClient.xAck(STREAM_KEY, CONSUMER_GROUP, id);
    console.log(`[WORKER] ACKed message ${id}`);

    // delete the message from stream after ACK
    await redisClient.xDel(STREAM_KEY, id);
    console.log(`[WORKER] Deleted message ${id} from stream`);
    
    return true;
  } catch (err) {
    console.error(`[WORKER] Error processing entry ${id}:`, err.message);
    // Do NOT ACK; leave message pending for retry
    return false;
  }
}

/**
 * Main consumer loop
 * Long-polls Redis
 * Reads up to 100 messages
 * Waits 5 seconds if none arrive
 * Processes entries sequentially
 */
async function consumerLoop() {
  console.log(`[WORKER] Starting consumer loop (worker: ${WORKER_ID}, group: ${CONSUMER_GROUP})`);
  
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 10;
  
  while (true) {
    try {
      // Read from the stream
      const messages = await redisClient.xReadGroup(
        CONSUMER_GROUP,
        WORKER_ID,
        [{ key: STREAM_KEY, id: '>' }],
        {
            COUNT: BATCH_SIZE,
            BLOCK: BLOCK_MS,
        }
      );
      
      if (!messages || messages.length === 0) {
        consecutiveErrors = 0;
        continue;
      }
      
      // Process each entry
      for (const stream of messages) {
        for (const entry of stream.messages) {
          const { id, message } = entry;
          await processEntry(id, message);
        }
      }
      
      consecutiveErrors = 0;
    } catch (err) {
      consecutiveErrors++;
      console.error(`[WORKER] Consumer loop error (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`, err.message);
      
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.error(`[WORKER] Too many consecutive errors. Exiting.`);
        process.exit(1);
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

/**
 * Claim and process pending messages from other consumers
 * Ensures no unprocessed message is left behind
 */
async function claimAndProcessPendingMessages() {
  try {
    let startId = '-';
    const batchSize = 100;

    console.log('[WORKER] Checking for pending messages to claim...');

    while (true) {
        const pendingEntries = await redisClient.xPendingRange( STREAM_KEY, CONSUMER_GROUP, startId, '+', batchSize);

        if (!pendingEntries || pendingEntries.length === 0) break;

        const idsToClaim = pendingEntries.map(m => m.id);

        const claimedEntries = await redisClient.xClaim( STREAM_KEY, CONSUMER_GROUP, WORKER_ID, 0, idsToClaim );

        // Process claimed messages in parallel with a concurrency limit
        await Promise.all(claimedEntries.map(entry => PARALLEL_LIMIT(() => processEntry(entry.id, entry.message))));

        startId = pendingEntries[pendingEntries.length - 1].id; // process next batch
        if (pendingEntries.length < batchSize) break;
    }
    console.log('[WORKER] Pending messages processed.');
  } catch (error) {
    console.error('[WORKER] Error processing pending messages:', err.message);
  }
}


/**
 * Main entry point
 */
async function main() {
  console.log('[WORKER] ========== Stream Consumer Started ==========');
  
  try {
    // Initialize DB (creates tables if needed)
    await initDb();
    
    // Initialize Redis
    await initRedis();
    
    // Ensure consumer group exists
    await ensureConsumerGroup();

    // Process any pending messages from other consumers
    await claimAndProcessPendingMessages();
    
    // Start consumer loop
    await consumerLoop();
  } catch (err) {
    console.error('[WORKER] Fatal error:', err.message);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[WORKER] SIGTERM received, shutting down gracefully...');
  if (redisClient) await redisClient.quit();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[WORKER] SIGINT received, shutting down gracefully...');
  if (redisClient) await redisClient.quit();
  process.exit(0);
});

main().catch(err => {
  console.error('[WORKER] Startup error:', err);
  process.exit(1);
});
