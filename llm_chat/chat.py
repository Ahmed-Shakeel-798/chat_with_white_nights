import logging
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import json

from redis_client import init_redis, push_message

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
def send_message(conversation_id: str, user_id: str, message: str):
    logger.info(f"[MESSAGE] User {user_id} in conversation {conversation_id}: {message}")

    def message_stream():
        try:
            # Store user message
            push_message(conversation_id, "user", message)

            # Simulate LLM response
            response = f"Echo: {message}"
            logger.info(f"[RESPONSE] Sending response to conversation {conversation_id}")

            # Store assistant/system message
            push_message(conversation_id, "system", response)

            # Stream to frontend
            yield f"data: {json.dumps({'type': 'message', 'role': 'assistant', 'content': response})}\n\n"

        except Exception as e:
            logger.error(f"[MESSAGE] Error: {e}")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(message_stream(), media_type="text/event-stream")

@app.get("/health")
def health_check():
    logger.info("[HEALTH] Health check requested")
    return {"status": "healthy"}
