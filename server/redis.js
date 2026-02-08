import { createClient } from 'redis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

let client = null;

export async function connectRedis() {
	if (client) return client;
	client = createClient({ url: REDIS_URL });
	client.on('error', (err) => console.error('[REDIS] Client Error', err));

	try {
		await client.connect();
		console.log('[REDIS] Connected');
	} catch (err) {
		console.error('[REDIS] Connection failed:', err.message);
		throw err;
	}

	return client;
}

export async function exists(key) {
	if (!client) await connectRedis();
	return await client.exists(key);
}

export async function initConversation(conversationId) {
	if (!client) await connectRedis();
	const key = `conversation:${conversationId}`;
	const does = await client.exists(key);
	if (does) return { ok: true, already: true };

	const initMsg = JSON.stringify({
		id: `init-${Date.now()}`,
		role: 'system',
		type: 'text',
		content: 'conversation initialized',
		ts: Date.now()
	});

	await client.rPush(key, initMsg);
	return { ok: true, already: false };
}

export async function pushMessage(conversationId, messageObj) {
	if (!client) await connectRedis();
	const key = `conversation:${conversationId}`;
	return await client.rPush(key, JSON.stringify(messageObj));
}

export async function getMessages(conversationId, start = 0, end = -1) {
	if (!client) await connectRedis();
	const key = `conversation:${conversationId}`;
	return await client.lRange(key, start, end);
}

export async function getLength(conversationId) {
	if (!client) await connectRedis();
	const key = `conversation:${conversationId}`;
	return await client.lLen(key);
}

export async function deleteConversation(conversationId) {
	if (!client) await connectRedis();
	const key = `conversation:${conversationId}`;
	return await client.del(key);
}

export default {
	connectRedis,
	exists,
	initConversation,
	pushMessage,
	getMessages,
	getLength,
	deleteConversation,
};
