import logging
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import json
from redis_client import init_redis, push_message, get_messages
from llm_client import stream_from_ollama, build_messages

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='[LLM_CHAT] %(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Redis once at startup
init_redis()

@app.post("/message")
async def send_message(conversation_id: str, user_id: str, message: str):
    try:

        conversation_history = get_messages(conversation_id, limit=10)

        logger.info(f"[MESSAGE] User {user_id} in conversation {conversation_id}: {message}")
        push_message(conversation_id, "user", message, user_id=user_id)

        messages_for_llm = build_messages(query = message, conversation_history = conversation_history)

        def sse_wrapper():
            full_response = ""

            for delta in stream_from_ollama(messages_for_llm):
                full_response += delta
                yield f"data: {json.dumps({'type': 'message', 'content': delta})}\n\n"

            # push assistant message AFTER stream completes
            try:
                push_message(conversation_id, "assistant", full_response, user_id=user_id)
            except Exception as e:
                logger.error(f"[REDIS] Failed to push assistant message: {e}")

        return StreamingResponse(sse_wrapper(), media_type="text/event-stream")

    except Exception as e:
        logger.error(f"[ERROR] Failed to process message: {e}")
        return {"error": str(e)}


@app.get("/health")
def health_check():
    logger.info("[HEALTH] Health check requested")
    return {"status": "healthy"}

