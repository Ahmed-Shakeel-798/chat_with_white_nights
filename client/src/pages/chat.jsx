import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import "../css/chat.css";

export default function Chat() {
  const { id: conversationId } = useParams();
  const nav = useNavigate();
  const [messages, setMessages] = useState([]);
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
  }, [conversationId, userId, nav]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const jsonStr = line.slice(6);
            if (jsonStr.trim()) {
              const data = JSON.parse(jsonStr);
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
