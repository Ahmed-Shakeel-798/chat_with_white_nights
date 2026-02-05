import { useState } from "react";
import { signup } from "../api";
import { useNavigate } from "react-router-dom";
import "./signup.css";

export default function Signup() {
  const [username, setU] = useState("");
  const [password, setP] = useState("");
  const [error, setError] = useState("");
  const nav = useNavigate();

  const handleSignup = async () => {
    if (!username || !password) {
      setError("Username and password required");
      return;
    }
    try {
      const res = await signup(username, password);
      console.log("[SIGNUP] User created:", res.data);
      alert("Account created! Redirecting to login...");
      nav("/");
    } catch (err) {
      setError(err.response?.data?.error || "Signup failed");
      console.error("[SIGNUP] Error:", err);
    }
  };

  return (
    <div className="signup-container">
      <div className="signup-form">
        <h2>Signup</h2>
        {error && <p className="error">{error}</p>}
        <input
          placeholder="Username"
          value={username}
          onChange={e => setU(e.target.value)}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setP(e.target.value)}
        />
        <button onClick={handleSignup}>Signup</button>
        <p className="login-link">
          Already have an account? <a href="/">Login here</a>
        </p>
      </div>
    </div>
  );
}
