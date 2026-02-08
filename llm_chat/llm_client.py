import logging
import json
import os
from openai import OpenAI

logger = logging.getLogger(__name__)

# Ollama/OpenAI client configuration
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "http://host.docker.internal:11434/v1")
LLM_API_KEY = os.getenv("LLM_API_KEY", "ollama")

SYSTEM_PROMPT = os.getenv("SYSTEM_PROMPT", "You are a helpful assistant that responds conversationally to user messages.")

def _get_client():
    return OpenAI(base_url=LLM_BASE_URL, api_key=LLM_API_KEY)


def stream_from_ollama(messages: list):
    """Stream deltas from the LLM and yield SSE-formatted strings.

    This function is synchronous because it iterates the blocking stream
    provided by the Ollama client. It will also persist the full assistant
    response into Redis using `push_message`.

    """
    client = _get_client()

    stream = client.chat.completions.create(
        model="llama3.2",
        messages=messages,
        temperature=0.3,
        stream=True
    )

    # full_response = ""
    for chunk in stream:
        # Ollama chunks contain delta under choices[0].delta.content
        try:
            delta = getattr(chunk.choices[0].delta, "content", None)
        except Exception:
            delta = None

        if delta:
            yield delta


def build_messages( query: str, conversation_history: list | None = None, system_prompt: str = SYSTEM_PROMPT):
    """
    Build the final messages array for chat.completions.

    Args:
        query: Current user message
        conversation_history: List of dicts with {role, content}
        system_prompt: Optional system prompt override
        history_limit: Max number of past messages to include

    Returns:
        List[dict]: messages ready for OpenAI/Ollama chat API
    """

    messages = []

    # 1) System prompt first
    messages.append({"role": "system", "content": system_prompt})

    # 2) Add trimmed history (latest N only)
    if conversation_history:
        for msg in conversation_history:
            role = msg.get("role")
            content = msg.get("content")

            # Skip malformed entries
            if not role or not content:
                continue

            # Only allow valid roles
            if role not in ("user", "assistant", "system"):
                continue

            messages.append({"role": role, "content": content})

    # 3) Add current user message LAST
    messages.append({"role": "user", "content": query})

    return messages
