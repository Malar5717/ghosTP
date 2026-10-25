import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";

const API = "http://localhost:4000";

const RISKY_SENDER = /(bank|gov|tax|irs|payment|paypal|stripe|visa|mastercard|invoice|billing)/i;

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [age, setAge] = useState("1m");
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [selectedProtected, setSelectedProtected] = useState(new Set());

  const [confirming, setConfirming] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [recent, setRecent] = useState([]);

  const checkAuth = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/auth/me`, { credentials: "include" });
      const data = await res.json();
      setUser(data.authenticated ? data.user : null);
    } catch {
      setError("Failed to check session");
    } finally {
      setLoading(false);
    }
  };

  const loadRecent = async () => {
    try {
      const res = await fetch(`${API}/trash/recent`, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setRecent(data.items || []);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (user) loadRecent();
  }, [user]);

  const connect = () => {
    window.location.href = `${API}/auth/google`;
  };

  const disconnect = async () => {
    try {
      await fetch(`${API}/auth/disconnect`, { credentials: "include" });
      setUser(null);
      setResults([]);
      setSelected(new Set());
      setSelectedProtected(new Set());
      setRecent([]);
      setResult(null);
    } catch {
      setError("Failed to disconnect");
    }
  };

  const scan = async () => {
    setScanning(true);
    setError("");
    setResult(null);
    setSelected(new Set());
    setSelectedProtected(new Set());
    try {
      const res = await fetch(`${API}/scan/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ age }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scan failed");
      setResults(data.results || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setScanning(false);
    }
  };

  const toggle = (id) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const toggleAll = () => {
    setSelected(selected.size === selectableIds.length ? new Set() : new Set(selectableIds));
  };

  const toggleProtected = (id) => {
    const next = new Set(selectedProtected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedProtected(next);
  };

  const toggleAllProtected = () => {
    setSelectedProtected(
      selectedProtected.size === protectedRows.length
        ? new Set()
        : new Set(protectedRows.map((r) => r.id))
    );
  };

  const moveToTrash = async () => {
    if (!confirming) return;
    const { ids, protected: isProtected } = confirming;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`${API}/trash/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids, allowProtected: !!isProtected }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Move failed");

      setResult(data);
      setConfirming(null);
      setSelected(new Set());
      setSelectedProtected(new Set());
      setResults((prev) => prev.filter((r) => !data.moved.includes(r.id)));
      loadRecent();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const undo = async (ids) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`${API}/trash/undo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Restore failed");
      setResult(data);
      loadRecent();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div style={{ padding: 20 }}>Loading...</div>;

  const matches = results.filter((r) => r.label === "Match" && !r.isImportant);
  const unclear = results.filter((r) => r.label === "Unclear" && !r.isImportant);
  const protectedRows = results.filter((r) => r.isImportant);
  const selectableIds = results.filter((r) => !r.isImportant).map((r) => r.id);
  const risky = results.filter(
    (r) => (selected.has(r.id) || selectedProtected.has(r.id)) && RISKY_SENDER.test(r.from)
  );

  const renderTable = (rows, selection, onToggle) => (
    <table border="1" cellPadding="6" cellSpacing="0" style={{ borderCollapse: "collapse", width: "100%" }}>
      <thead>
        <tr>
          <th></th>
          <th>From</th>
          <th>Subject</th>
          <th>Date</th>
          <th>Why</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td>
              <input
                type="checkbox"
                checked={selection.has(r.id)}
                onChange={() => onToggle(r.id)}
              />
            </td>
            <td>{r.from}</td>
            <td>{r.subject}</td>
            <td>{r.date}</td>
            <td>{r.reason}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div style={{ padding: 20, fontFamily: "system-ui", maxWidth: 1100 }}>
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
          <p>
            Signed in as <strong>{user.email}</strong>{" "}
            <button onClick={disconnect} disabled={busy}>Disconnect</button>
          </p>

          <div style={{ marginTop: 16 }}>
            <label>
              Age:{" "}
              <select value={age} onChange={(e) => setAge(e.target.value)} disabled={scanning}>
                <option value="1w">1 week</option>
                <option value="1m">1 month</option>
                <option value="3m">3 months</option>
              </select>
            </label>{" "}
            <button onClick={scan} disabled={scanning}>
              {scanning ? "Scanning..." : "Scan"}
            </button>
          </div>

          {result && (
            <div style={{ margin: "16px 0", padding: 12, border: "1px solid #ccc", background: "#f7f7f7" }}>
              <strong>
                {result.movedCount !== undefined
                  ? `Moved ${result.movedCount} to Trash, skipped ${result.skippedCount}.`
                  : `Restored ${result.restoredCount}, skipped ${result.skippedCount}.`}
              </strong>
              {result.moved?.length > 0 && (
                <>
                  {" "}
                  <button onClick={() => undo(result.moved)} disabled={busy}>Undo</button>
                </>
              )}
              {result.skipped?.length > 0 && (
                <ul style={{ fontSize: 13, color: "#555", marginBottom: 0 }}>
                  {result.skipped.slice(0, 10).map((s) => (
                    <li key={s.id}>{s.reason}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {results.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <p>
                Found: {results.length} | Selected: {selected.size}{" "}
                <button onClick={toggleAll}>Select all / none</button>{" "}
                <button
                  onClick={() => setConfirming({ ids: [...selected], protected: false })}
                  disabled={selected.size === 0 || busy}
                >
                  Move to Trash
                </button>
              </p>

              {risky.length > 0 && (
                <p style={{ color: "#b45309" }}>
                  Heads up: {risky.length} selected sender(s) look like a bank, government or
                  payment service. Double-check those before moving.
                </p>
              )}

              {matches.length > 0 && (
                <>
                  <h3>Matches ({matches.length})</h3>
                  {renderTable(matches, selected, toggle)}
                </>
              )}

              {unclear.length > 0 && (
                <>
                  <h3>Unclear ({unclear.length})</h3>
                  <p style={{ fontSize: 13, color: "#555" }}>
                    These might be verification emails. Review them yourself before selecting.
                  </p>
                  {renderTable(unclear, selected, toggle)}
                </>
              )}

              {protectedRows.length > 0 && (
                <>
                  <h3>Important (protected) ({protectedRows.length})</h3>
                  <p style={{ fontSize: 13, color: "#555" }}>
                    Gmail marks these as important. You can select and move them, but you'll get
                    an extra confirmation first. They can be restored from "Recently trashed".
                  </p>
                  <p>
                    Selected: {selectedProtected.size}{" "}
                    <button onClick={toggleAllProtected}>Select all / none</button>{" "}
                    <button
                      onClick={() =>
                        setConfirming({ ids: [...selectedProtected], protected: true })
                      }
                      disabled={selectedProtected.size === 0 || busy}
                    >
                      Move {selectedProtected.size || ""} important to Trash
                    </button>
                  </p>
                  {renderTable(protectedRows, selectedProtected, toggleProtected)}
                </>
              )}
            </div>
          )}

          {recent.length > 0 && (
            <div style={{ marginTop: 28 }}>
              <h3>Recently trashed ({recent.length})</h3>
              <ul>
                {recent.map((item) => (
                  <li key={item.id}>
                    {item.subject || item.id}
                    {item.from ? ` — ${item.from}` : ""}{" "}
                    <button onClick={() => undo([item.id])} disabled={busy}>Restore</button>
                  </li>
                ))}
              </ul>
              <button onClick={() => undo(recent.map((r) => r.id))} disabled={busy}>
                Restore all
              </button>
            </div>
          )}

          {confirming && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div style={{ background: "#fff", padding: 20, borderRadius: 8, maxWidth: 460 }}>
                <h3>
                  Move {confirming.ids.length} email{confirming.ids.length === 1 ? "" : "s"} to Trash?
                </h3>
                <p>They will be moved to Gmail Trash, not deleted. You can restore them here.</p>
                {confirming.protected && (
                  <p style={{ color: "#b45309" }}>
                    These emails are marked important by Gmail. This is an explicit exception
                    to the usual safety rule.
                  </p>
                )}
                {risky.length > 0 && (
                  <p style={{ color: "#b45309" }}>
                    {risky.length} of them look like bank, government or payment senders.
                  </p>
                )}
                <button onClick={moveToTrash} disabled={busy}>
                  {busy ? "Moving..." : "Yes, move to Trash"}
                </button>{" "}
                <button onClick={() => setConfirming(null)} disabled={busy}>Cancel</button>
              </div>
            </div>
          )}
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
