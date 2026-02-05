import { useState } from "react";
import { login } from "../api";
import { useNavigate } from "react-router-dom";
import "../css/login.css";

export default function Login() {
  const [username, setU] = useState("");
  const [password, setP] = useState("");
  const [error, setError] = useState("");
  const nav = useNavigate();

  const handleLogin = async () => {
    if (!username || !password) {
      setError("Username and password required");
      return;
    }
    try {
      const res = await login(username, password);

      localStorage.setItem("token", res.data.token);
      localStorage.setItem("userId", res.data.userId);
      localStorage.setItem(
        "conversations",
        JSON.stringify(res.data.conversations)
      );
      console.log("[LOGIN] Success - User:", res.data.userId);
      nav("/select");
    } catch (err) {
      setError(err.response?.data?.error || "Login failed");
      console.error("[LOGIN] Error:", err);
    }
  };

  return (
    <div className="login-container">
      <div className="login-form">
        <h2>Login</h2>
        {error && <p className="error">{error}</p>}
        <input
          placeholder="Username"
          value={username}
          onChange={(e) => setU(e.target.value)}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setP(e.target.value)}
        />
        <button onClick={handleLogin}>Login</button>
        <p className="signup-link">
          Don't have an account? <a href="/signup">Signup here</a>
        </p>
      </div>
    </div>
  );
}
