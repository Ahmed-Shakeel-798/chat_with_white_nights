import { useState, useEffect } from "react";
import { createConversation } from "../api";
import { useNavigate } from "react-router-dom";
import "../css/chatSelect.css";

export default function ChatSelect() {
  const nav = useNavigate();
  const [conversations, setConversations] = useState([]);
  const [newTitle, setNewTitle] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const userId = localStorage.getItem("userId");

  useEffect(() => {
    const savedConvos = JSON.parse(localStorage.getItem("conversations") || "[]");
    setConversations(savedConvos);
  }, []);

  const handleCreateNew = async () => {
    if (!newTitle.trim()) {
      setError("Chat title cannot be empty");
      return;
    }

    try {
      setLoading(true);
      const res = await createConversation(userId, newTitle);
      console.log("[CHAT SELECT] New conversation created:", res.data);
      
      // Add new conversation to local state
      const newConvo = {
        id: res.data.conversationId,
        title: newTitle
      };
      setConversations([...conversations, newConvo]);
      localStorage.setItem("conversations", JSON.stringify([...conversations, newConvo]));
      
      setNewTitle("");
      setError("");
      nav(`/chat/${res.data.conversationId}`);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to create chat");
      console.error("[CHAT SELECT] Error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("userId");
    localStorage.removeItem("conversations");
    nav("/");
  };

  return (
    <div className="chat-select-wrapper">
      <div className="chat-select-header">
        <h2>My Chats</h2>
        <button className="logout-btn" onClick={handleLogout}>
          Logout
        </button>
      </div>
      
      <div className="create-chat-container">
        <h3>Create New Chat</h3>
        {error && <p className="chat-error">{error}</p>}
        <input
          type="text"
          className="create-chat-input"
          placeholder="Enter chat title"
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyPress={e => e.key === "Enter" && handleCreateNew()}
        />
        <button
          className="create-btn"
          onClick={handleCreateNew}
          disabled={loading}
        >
          {loading ? "Creating..." : "Create"}
        </button>
      </div>

      <div className="conversations-section">
        <h3>Your Conversations</h3>
        {conversations.length === 0 ? (
          <p className="conversations-empty">No conversations yet. Create one above!</p>
        ) : (
          <div className="conversations-list">
            {conversations.map(c => (
              <button
                key={c.id}
                className="conversation-item"
                onClick={() => nav(`/chat/${c.id}`)}
              >
                {c.title} <span className="conversation-id">#{c.id}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
