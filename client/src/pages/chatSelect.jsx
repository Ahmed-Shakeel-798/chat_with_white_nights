import { useState, useEffect } from "react";
import { createConversation } from "../api";
import { useNavigate } from "react-router-dom";

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

  return (
    <div style={{ padding: "20px", maxWidth: "600px", margin: "0 auto" }}>
      <h2>My Chats</h2>
      
      <div style={{ marginBottom: "30px", padding: "20px", backgroundColor: "white", borderRadius: "8px" }}>
        <h3>Create New Chat</h3>
        {error && <p style={{ color: "#d32f2f", marginBottom: "10px" }}>{error}</p>}
        <input
          type="text"
          placeholder="Enter chat title"
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyPress={e => e.key === "Enter" && handleCreateNew()}
          style={{ width: "80%", marginRight: "10px", padding: "8px" }}
        />
        <button
          onClick={handleCreateNew}
          disabled={loading}
          style={{
            backgroundColor: loading ? "#ccc" : "#667eea",
            color: "white",
            border: "none",
            padding: "8px 16px",
            borderRadius: "4px",
            cursor: loading ? "not-allowed" : "pointer"
          }}
        >
          {loading ? "Creating..." : "Create"}
        </button>
      </div>

      <div>
        <h3>Your Conversations</h3>
        {conversations.length === 0 ? (
          <p style={{ color: "#666" }}>No conversations yet. Create one above!</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {conversations.map(c => (
              <button
                key={c.id}
                onClick={() => nav(`/chat/${c.id}`)}
                style={{
                  padding: "12px",
                  backgroundColor: "#f0f0f0",
                  border: "1px solid #ddd",
                  borderRadius: "4px",
                  cursor: "pointer",
                  textAlign: "left",
                  fontSize: "1em",
                  transition: "background-color 0.2s"
                }}
              >
                {c.title} <span style={{ color: "#999", fontSize: "0.9em" }}>#{c.id}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
