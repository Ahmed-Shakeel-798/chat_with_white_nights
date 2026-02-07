import os
import json
import time
import uuid
import logging
import redis

logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379")

redis_client = None

def init_redis():
    global redis_client
    try:
        redis_client = redis.from_url(REDIS_URL, decode_responses=True)
        redis_client.ping()
        logger.info("[REDIS] Connected to Redis")
    except Exception as e:
        logger.error(f"[REDIS] Failed to connect: {e}")
        redis_client = None


def get_client():
    return redis_client


def get_conversation_key(conversation_id: str) -> str:
    return f"conversation:{conversation_id}"


def push_message(conversation_id: str, role: str, content: str, msg_type: str = "text", user_id: str | None = None):
    """
    Store a message in Redis list and append an event to a Redis stream (fire-and-forget).
    Returns the stored message object.
    """
    if not redis_client:
        return None

    msg = {
        "id": uuid.uuid4().hex,
        "role": role,
        "type": msg_type,
        "content": content,
        "ts": int(time.time() * 1000)
    }

    key = get_conversation_key(conversation_id)

    try:
        redis_client.rpush(key, json.dumps(msg))
        logger.info(f"[REDIS] Pushed {role} message {msg['id']} to {key}")

        # Fire-and-forget: append an event to the messages_stream for downstream workers
        try:
            stream_mapping = {
                "conversation_id": conversation_id,
                "user_id": user_id or "",
                "message_id": msg["id"],
                "role": role,
                "type": msg_type,
                "content": content,
                "ts": str(msg["ts"]) 
            }
            # XADD -- use '*' id to let Redis assign one
            redis_client.xadd("messages_stream", stream_mapping)
            logger.info(f"[REDIS] XADD messages_stream {msg['id']}")
        except Exception as se:
            logger.error(f"[REDIS] Failed to XADD to stream: {se}")

        return msg
    except Exception as e:
        logger.error(f"[REDIS] Failed to push message: {e}")
        return None


def get_messages(conversation_id: str, limit: int | None = None):
    """
    Fetch messages from Redis.
    Returns list of parsed message dicts.
    """
    if not redis_client:
        return []

    key = get_conversation_key(conversation_id)

    try:
        if limit:
            raw = redis_client.lrange(key, -limit, -1)
        else:
            raw = redis_client.lrange(key, 0, -1)

        return [json.loads(x) for x in raw]
    except Exception as e:
        logger.error(f"[REDIS] Failed to fetch messages: {e}")
        return []
