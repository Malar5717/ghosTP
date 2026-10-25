import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const checkAuth = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("http://localhost:4000/auth/me", {
        credentials: "include",
      });
      const data = await res.json();
      if (data.authenticated) {
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch (e) {
      setError("Failed to check session");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const connect = () => {
    window.location.href = "http://localhost:4000/auth/google";
  };

  const disconnect = async () => {
    try {
      await fetch("http://localhost:4000/auth/disconnect", {
        credentials: "include",
      });
      setUser(null);
    } catch (e) {
      setError("Failed to disconnect");
    }
  };

  if (loading) return <div style={{ padding: 20 }}>Loading...</div>;

  return (
    <div style={{ padding: 20, fontFamily: "system-ui" }}>
      <h1>ghosTP</h1>

      {error && <p style={{ color: "red" }}>{error}</p>}

      {!user ? (
        <>
          <p>Sign in with Google to scan old OTP/verification emails.</p>
          <p style={{ fontSize: 14, color: "#555" }}>
            We'll request access to read and move emails to Trash (<code>gmail.modify</code>).
            Nothing is deleted automatically. You choose what moves.
          </p>
          <button onClick={connect}>Connect Gmail</button>
        </>
      ) : (
        <>
          <p>Signed in as <strong>{user.email}</strong></p>
          <button onClick={disconnect}>Disconnect</button>
        </>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
