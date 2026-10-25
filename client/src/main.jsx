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

  const [activityOpen, setActivityOpen] = useState(false);
  const [activityItems, setActivityItems] = useState([]);
  const [activityCounts, setActivityCounts] = useState({ trashed: 0, restored: 0, deleted: 0 });
  const [activityLoading, setActivityLoading] = useState(false);
  const [activitySelected, setActivitySelected] = useState(new Set());
  const [activityError, setActivityError] = useState("");

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

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (!activityOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") setActivityOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activityOpen]);

  const loadActivity = async () => {
    setActivityLoading(true);
    setActivityError("");
    try {
      const res = await fetch(`${API}/activity`, { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load activity");
      setActivityItems(data.items || []);
      setActivityCounts(data.counts || { trashed: 0, restored: 0, deleted: 0 });
      setActivitySelected(new Set());
    } catch (e) {
      setActivityError(e.message);
    } finally {
      setActivityLoading(false);
    }
  };

  const openActivity = () => {
    setActivityOpen(true);
    loadActivity();
  };

  const toggleActivityItem = (id) => {
    const next = new Set(activitySelected);
    next.has(id) ? next.delete(id) : next.add(id);
    setActivitySelected(next);
  };

  const restoreActivitySelected = async () => {
    const ids = [...activitySelected];
    if (ids.length === 0) return;
    setBusy(true);
    setActivityError("");
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
      await loadActivity();
    } catch (e) {
      setActivityError(e.message);
    } finally {
      setBusy(false);
    }
  };

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
      setActivityItems([]);
      setActivitySelected(new Set());
      setActivityOpen(false);
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

  const selectableActivityIds = activityItems
    .filter((i) => i.status === "trashed")
    .map((i) => i.id);

  const toggleAllActivity = () => {
    setActivitySelected(
      activitySelected.size === selectableActivityIds.length
        ? new Set()
        : new Set(selectableActivityIds)
    );
  };

  const formatDate = (value) => {
    if (!value) return "";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
  };

  const STATUS_LABEL = {
    trashed: "In Trash",
    restored: "Restored",
    deleted: "Deleted",
  };
  const STATUS_COLOR = {
    trashed: "#b45309",
    restored: "#166534",
    deleted: "#991b1b",
  };

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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>ghosTP</h1>
        {user && (
          <button
            onClick={openActivity}
            title="Activity log"
            aria-label="Activity log"
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              border: "1px solid #ccc",
              background: "#f2f2f2",
              fontWeight: 600,
              fontSize: 16,
              cursor: "pointer",
            }}
          >
            {user.email?.[0]?.toUpperCase() || "?"}
          </button>
        )}
      </div>

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

      {user && activityOpen && (
        <div
          onClick={() => setActivityOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            zIndex: 50,
          }}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              width: "min(520px, 100%)",
              background: "#fff",
              boxShadow: "-4px 0 16px rgba(0,0,0,0.15)",
              padding: 20,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ margin: 0 }}>Activity</h2>
              <button onClick={() => setActivityOpen(false)} aria-label="Close">✕</button>
            </div>

            <p style={{ margin: 0, fontSize: 14 }}>
              Signed in as <strong>{user.email}</strong>{" "}
              <button onClick={disconnect} disabled={busy}>Disconnect</button>
            </p>

            <p style={{ margin: 0, fontSize: 14, color: "#555" }}>
              In Trash: {activityCounts.trashed} · Restored: {activityCounts.restored} · Deleted:{" "}
              {activityCounts.deleted}
            </p>

            {activityError && <p style={{ color: "red", margin: 0 }}>{activityError}</p>}

            {activityLoading ? (
              <p>Loading activity...</p>
            ) : activityItems.length === 0 ? (
              <p style={{ color: "#555" }}>No emails moved to Trash yet.</p>
            ) : (
              <>
                <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
                  <span>Selected: {activitySelected.size}</span>
                  <button onClick={toggleAllActivity} disabled={selectableActivityIds.length === 0}>
                    Select all / none
                  </button>
                  <button
                    onClick={restoreActivitySelected}
                    disabled={activitySelected.size === 0 || busy}
                  >
                    {busy ? "Restoring..." : "Restore selected"}
                  </button>
                </div>

                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {activityItems.map((item) => {
                    const selectable = item.status === "trashed";
                    return (
                      <li
                        key={item.id}
                        style={{
                          display: "flex",
                          gap: 8,
                          padding: "10px 0",
                          borderBottom: "1px solid #eee",
                          opacity: selectable ? 1 : 0.75,
                        }}
                      >
                        <input
                          type="checkbox"
                          disabled={!selectable}
                          checked={activitySelected.has(item.id)}
                          onChange={() => toggleActivityItem(item.id)}
                          style={{ marginTop: 3 }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, wordBreak: "break-word" }}>
                            {item.subject || "(details no longer available)"}
                          </div>
                          <div style={{ fontSize: 13, color: "#555", wordBreak: "break-word" }}>
                            {item.sender || "unknown sender"}
                          </div>
                          <div style={{ fontSize: 12, color: "#666" }}>
                            Moved: {formatDate(item.movedAt)}
                            {item.restoredAt ? ` · Restored: ${formatDate(item.restoredAt)}` : ""}
                          </div>
                        </div>
                        <span
                          style={{
                            fontSize: 12,
                            color: STATUS_COLOR[item.status] || "#555",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {STATUS_LABEL[item.status] || item.status}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
