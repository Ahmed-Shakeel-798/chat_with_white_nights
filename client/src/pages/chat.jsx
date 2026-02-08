import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getConversationMessages } from "../api";
import "../css/chat.css";

export default function Chat() {
  const { id: conversationId } = useParams();
  const nav = useNavigate();
  const [messages, setMessages] = useState([]);
  const [totalMessages, setTotalMessages] = useState(0);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const messagesEndRef = useRef(null);

  const LLM_API_URL = import.meta.env.VITE_LLM_URL || "http://localhost:8000";
  const userId = localStorage.getItem("userId");

  useEffect(() => {
    if (!userId) {
      nav("/");
      return;
    }

    console.log("[CHAT] Loaded conversation:", conversationId);

    (async () => {
      try {
        const res = await getConversationMessages(conversationId, 0, 10);
        if (res?.data) {
          setMessages(res.data.messages || []);
          setTotalMessages(res.data.total || 0);
          setCurrentOffset(0);
          setTimeout(() => scrollToBottom(), 50);
        }
      } catch (err) {
        console.error('[CHAT] Failed to load messages', err);
      }
    })();
  }, [conversationId, userId, nav]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const loadMore = async () => {
    if (messages.length >= totalMessages) return;
    const pageSize = 10;
    const nextOffset = currentOffset + pageSize;

    try {
      const res = await getConversationMessages(conversationId, nextOffset, pageSize);
      if (res?.data?.messages?.length) {
        // prepend older messages
        setMessages((prev) => [...res.data.messages, ...prev]);
        setCurrentOffset(nextOffset);
      }
    } catch (err) {
      console.error('[CHAT] Failed to load more messages', err);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim()) {
      setError("Message cannot be empty");
      return;
    }

    try {
      setLoading(true);
      setError("");

      // Add user message to display
      setMessages((prev) => [...prev, { role: "user", content: input }]);
      const userMessage = input;
      setInput("");

      console.log("[CHAT] Sending message:", userMessage);

      // Send message to LLM and stream response
      const response = await fetch(
        `${LLM_API_URL}/message?conversation_id=${conversationId}&user_id=${userId}&message=${encodeURIComponent(
          userMessage
        )}`,
        { method: "POST" }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        // append new chunk to buffer
        buffer += chunk;
        // process complete SSE events separated by double newline
        let idx;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const eventStr = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 2);

          // each event may contain multiple lines; find data: lines
          const eventLines = eventStr.split(/\r?\n/);
          for (const el of eventLines) {
            if (el.startsWith("data: ")) {
              const jsonStr = el.slice(6).trim();
              if (!jsonStr) continue;
              try {
                const data = JSON.parse(jsonStr);
                console.debug('[CHAT] Stream chunk received', data);
                if (data.type === "message") {
                  setMessages((prev) => {
                    const lastMsg = prev[prev.length - 1];
                    if (lastMsg?.role === "assistant") {
                      return [
                        ...prev.slice(0, -1),
                        { role: "assistant", content: lastMsg.content + data.content },
                      ];
                    }
                    return [...prev, { role: "assistant", content: data.content }];
                  });
                  scrollToBottom();
                }
              } catch (err) {
                console.error('[CHAT] Error parsing stream JSON', err, jsonStr);
              }
            }
          }
        }
      }
    } catch (err) {
      console.error("[CHAT] Error sending message:", err);
      setError(err.message || "Failed to send message");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="chat-wrapper">
      <div className="chat-header">
        <h2>Conversation #{conversationId}</h2>
        <button className="back-btn" onClick={() => nav("/select")}>
          Back
        </button>
      </div>

      <div className="chat-messages">
        {messages.length < totalMessages && (
          <div className="load-more-container">
            <button className="load-more-btn" onClick={loadMore}>
              Load more
            </button>
          </div>
        )}
        {messages.length === 0 && (
          <p className="no-messages">Start a conversation by sending a message</p>
        )}
        {messages.map((msg, idx) => (
          <div key={idx} className={`message message-${msg.role}`}>
            <span className="message-role">{msg.role === "user" ? "You" : "Assistant"}:</span>
            <span className="message-content">{msg.content}</span>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {error && <p className="chat-error">{error}</p>}

      <div className="chat-input-area">
        <input
          type="text"
          className="chat-input"
          placeholder="Type your message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === "Enter" && !loading && handleSendMessage()}
          disabled={loading}
        />
        <button
          className="chat-send-btn"
          onClick={handleSendMessage}
          disabled={loading}
        >
          {loading ? "Sending..." : "Send"}
        </button>
      </div>
    </div>
  );
}
