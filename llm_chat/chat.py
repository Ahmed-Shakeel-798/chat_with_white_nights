import logging
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import time
import json

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='[LLM_CHAT] %(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI()

# Enable CORS for client communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/message")
def send_message(conversation_id: str, user_id: str, message: str):
    """Receive a message and stream a response"""
    logger.info(f"[MESSAGE] User {user_id} in conversation {conversation_id}: {message}")
    
    def message_stream():
        try:
            # Simulate LLM response (echo for now)
            response = f"Echo: {message}"
            logger.info(f"[RESPONSE] Sending response to conversation {conversation_id}")
            
            yield f"data: {json.dumps({'type': 'message', 'role': 'assistant', 'content': response})}\n\n"
        except Exception as e:
            logger.error(f"[MESSAGE] Error processing message: {e}")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
    
    return StreamingResponse(message_stream(), media_type="text/event-stream")

@app.get("/health")
def health_check():
    """Health check endpoint"""
    logger.info("[HEALTH] Health check requested")
    return {"status": "healthy"}
