import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ReactDOM from "react-dom/client";
import "./styles.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";

const RISKY_SENDER = /(bank|gov|tax|irs|payment|paypal|stripe|visa|mastercard|invoice|billing)/i;

function readCoverScale(element) {
  if (!element) return 0;
  const transform = window.getComputedStyle(element).transform;
  if (!transform || transform === "none") return 0;
  try {
    const matrix = new DOMMatrixReadOnly(transform);
    return Math.min(1, Math.max(0, Math.hypot(matrix.a, matrix.b)));
  } catch {
    return 1;
  }
}

function readGhostScale(element) {
  if (!element) return 1;
  const transform = window.getComputedStyle(element).transform;
  if (!transform || transform === "none") return 1;
  try {
    const matrix = new DOMMatrixReadOnly(transform);
    return Math.max(1, Math.hypot(matrix.a, matrix.b));
  } catch {
    return 1;
  }
}

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [age, setAge] = useState("1m");
  const [includeSpam, setIncludeSpam] = useState(false);
  const [includeStarred, setIncludeStarred] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [ghostSvgMarkup, setGhostSvgMarkup] = useState("");
  const [mouthAnimation, setMouthAnimation] = useState(0);
  const [mouthCover, setMouthCover] = useState(null);
  const [coverFinished, setCoverFinished] = useState(false);
  const [coverClose, setCoverClose] = useState(null);
  const [scanOutcome, setScanOutcome] = useState(null);
  const [darkHome, setDarkHome] = useState(false);
  const coverCircleRef = useRef(null);
  const ghostScalerRef = useRef(null);
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

      if (!data.authenticated) {
        setUser(null);
        setResults([]);
        setDarkHome(false);
        return;
      }

      setUser(data.user);

      try {
        const scanRes = await fetch(`${API}/scan/results`, { credentials: "include" });
        if (!scanRes.ok) throw new Error("Couldn't restore scan");
        const scanData = await scanRes.json();
        const restored = Array.isArray(scanData.results) ? scanData.results : [];
        setResults(restored);
        setDarkHome(restored.length > 0);
      } catch {
        setResults([]);
        setDarkHome(false);
      }
    } catch {
      setError("Couldn't check your session.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/ghost.svg")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load ghost illustration");
        return res.text();
      })
      .then((markup) => {
        const svgStart = markup.indexOf("<svg");
        if (active && svgStart !== -1) setGhostSvgMarkup(markup.slice(svgStart));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!activityOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") setActivityOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activityOpen]);

  useLayoutEffect(() => {
    const dark = Boolean(user && darkHome);
    document.documentElement.classList.toggle("results-dark", dark);
    document.body.classList.toggle("results-dark", dark);
    return () => {
      document.documentElement.classList.remove("results-dark");
      document.body.classList.remove("results-dark");
    };
  }, [user, darkHome]);

  useLayoutEffect(() => {
    if (!mouthCover) return;
    const mouth = document.querySelector("#ghost-mouth");
    const art = document.querySelector(".summon-button .ghost-art");
    if (!mouth && !art) return;
    let x;
    let y;
    if (mouth) {
      const rect = mouth.getBoundingClientRect();
      x = rect.left + rect.width / 2;
      y = rect.top + rect.height / 2;
    } else {
      const rect = art.getBoundingClientRect();
      x = rect.left + rect.width / 2;
      y = rect.top + rect.height * (286 / 512);
    }
    if (Math.abs(x - mouthCover.x) < 0.5 && Math.abs(y - mouthCover.y) < 0.5) return;
    setMouthCover((prev) =>
      prev && prev.id === mouthCover.id ? { ...prev, x, y } : prev
    );
  }, [mouthCover?.id]);

  useEffect(() => {
    if (!mouthCover || !scanOutcome) return;

    if (scanOutcome === "success") {
      if (!coverFinished) return;
      setDarkHome(true);
      setCoverClose(null);
      setMouthCover(null);
      setCoverFinished(false);
      return;
    }

    if (coverClose) return;

    const scale = readCoverScale(coverCircleRef.current);
    if (scale <= 0.01) {
      setMouthCover(null);
      setCoverFinished(false);
      setScanOutcome(null);
      setScanning(false);
      return;
    }

    setCoverClose({
      scale,
      ghostScale: readGhostScale(ghostScalerRef.current),
      duration: Math.max(200, Math.round(scale * 6000)),
    });
  }, [mouthCover, coverFinished, scanOutcome, coverClose]);

  const loadActivity = async () => {
    setActivityLoading(true);
    setActivityError("");
    try {
      const res = await fetch(`${API}/activity`, { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't load activity.");
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
      if (!res.ok) throw new Error(data.error || "Couldn't restore emails.");
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
      setMouthCover(null);
      setCoverFinished(false);
      setCoverClose(null);
      setScanOutcome(null);
      setDarkHome(false);
    } catch {
      setError("Couldn't disconnect. Try again.");
    }
  };

  const triggerMouthCover = () => {
    const mouth = document.querySelector("#ghost-mouth");
    const art = document.querySelector(".summon-button .ghost-art");
    if (!mouth && !art) return;

    let x;
    let y;
    if (mouth) {
      const rect = mouth.getBoundingClientRect();
      x = rect.left + rect.width / 2;
      y = rect.top + rect.height / 2;
    } else {
      const rect = art.getBoundingClientRect();
      x = rect.left + rect.width / 2;
      y = rect.top + rect.height * (286 / 512);
    }

    const artRect = art ? art.getBoundingClientRect() : null;

    let originX = 50;
    let originY = (286 / 512) * 100;
    const svg = art?.querySelector("svg");
    const viewBox = svg?.viewBox?.baseVal;
    if (mouth && viewBox?.width && viewBox?.height) {
      const bbox = mouth.getBBox();
      originX = ((bbox.x + bbox.width / 2 - viewBox.x) / viewBox.width) * 100;
      originY = ((bbox.y + bbox.height / 2 - viewBox.y) / viewBox.height) * 100;
    }

    const baseWidth = art?.offsetWidth || 54;
    const baseHeight = art?.offsetHeight || 54;
    const localX = (originX / 100) * baseWidth;
    const localY = (originY / 100) * baseHeight;
    const reachX = Math.max(localX, baseWidth - localX);
    const reachY = Math.max(localY, baseHeight - localY);
    const screenX = Math.max(x, window.innerWidth - x);
    const screenY = Math.max(y, window.innerHeight - y);
    const ghostScale = Math.max(
      1,
      reachX > 0 ? (screenX / reachX) * 1.25 : 1,
      reachY > 0 ? (screenY / reachY) * 1.25 : 1
    );

    setCoverFinished(false);
    setCoverClose(null);
    setMouthCover((prev) => ({
      x,
      y,
      ghostOriginX: originX,
      ghostOriginY: originY,
      ghostScale,
      labelX: artRect ? artRect.left + artRect.width / 2 : x,
      labelY: artRect ? artRect.bottom + 6 : y + 28,
      id: (prev?.id || 0) + 1,
    }));
  };

  const scan = async () => {
    if (scanning || mouthCover) return;
    setScanOutcome(null);
    triggerMouthCover();
    setMouthAnimation((count) => count + 1);
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
        body: JSON.stringify({ age, includeSpam: !!includeSpam, includeStarred: !!includeStarred }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scan failed. Try again.");
      setResults(data.results || []);
      setScanOutcome("success");
    } catch (e) {
      setError(e.message);
      setDarkHome(false);
      setScanOutcome("error");
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
      if (!res.ok) throw new Error(data.error || "Couldn't move emails to Trash.");

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
      if (!res.ok) throw new Error(data.error || "Couldn't restore emails.");
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="loading-screen">Loading…</div>;

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

  const formatDateTime = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return {
      iso: date.toISOString(),
      date: new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
      }).format(date),
      time: new Intl.DateTimeFormat("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }).format(date),
    };
  };

  const renderDateTime = (value) => {
    const formatted = formatDateTime(value);
    return formatted ? (
      <span className="date-time">
        <time dateTime={formatted.iso}>{formatted.date}</time>
        <time className="date-time-clock" dateTime={formatted.iso}>{formatted.time}</time>
      </span>
    ) : <span className="date-unavailable">—</span>;
  };

  const STATUS_LABEL = {
    trashed: "In Trash",
    restored: "Restored",
    deleted: "Deleted",
  };
  const renderTable = (rows, selection, onToggle) => (
    <table className="mail-table">
      <thead>
        <tr>
          <th></th>
          <th>From</th>
          <th>Subject</th>
          <th>Date</th>
          <th>Why flagged</th>
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
            <td>
              <div>{r.subject}</div>
              {(r.isSpam || r.isStarred) && (
                <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
                  {r.isSpam ? "From Spam" : ""}
                  {r.isSpam && r.isStarred ? " • " : ""}
                  {r.isStarred ? "Starred" : ""}
                </div>
              )}
            </td>
            <td>{renderDateTime(r.date)}</td>
            <td>{r.reason}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className={`app-shell${user ? "" : " landing-shell"}${user && darkHome ? " is-dark" : ""}${mouthCover ? " is-scanning" : ""}`}>
      {user && <header className="topbar">
        <h1 className="brand">ghosTP</h1>
          <button
            onClick={openActivity}
            title="Activity"
            aria-label="Activity"
            className="avatar-button"
          >
            {user.email?.[0]?.toUpperCase() || "?"}
          </button>
      </header>}

      {!user ? (
        <main className="landing-content">
          <section className="landing-panel">
            <h1 className="landing-brand">gh<span className="landing-ghost-o"><img src="/ghost-o.svg" alt="" /></span>sTP</h1>
            <p className="landing-tagline">for the ghosted OTPs haunting your inbox</p>
            <div className="landing-rule" aria-hidden="true" />
            <p className="landing-instruction">Sign in to scan your Gmail.</p>
            <p className="landing-description"><strong>ghosTP can find emails and move selected ones to Trash. Nothing moves without your approval.</strong></p>
            {error && <p className="notice notice-error landing-error" role="alert">{error}</p>}
          <button className="button button-primary landing-connect" onClick={connect}>Connect Gmail <span aria-hidden="true">↗</span></button></section>
        </main>
      ) : (
        <main className="main-content">
          {error && <p className="notice notice-error" role="alert">{error}</p>}
          <section className="workspace-heading account-heading"><p className="account-line"><span className="status-dot" />Signed in as <strong>{user.email}</strong>{" "}
            <button className="button button-quiet" onClick={disconnect} disabled={busy}>Disconnect</button></p></section>

          <section className="scan-panel"><div><h3>Scan older emails</h3><p className="muted">Find old verification codes.</p></div><div className="scan-controls">
            <label>
              Older than:{" "}
              <select value={age} onChange={(e) => setAge(e.target.value)} disabled={scanning}>
                <option value="1w">1 week</option>
                <option value="1m">1 month</option>
                <option value="3m">3 months</option>
              </select>
            </label>{" "}
            <label style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <input type="checkbox" checked={includeSpam} onChange={(e) => setIncludeSpam(e.target.checked)} disabled={scanning} />
              Include Spam
            </label>{" "}
            <label style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <input type="checkbox" checked={includeStarred} onChange={(e) => setIncludeStarred(e.target.checked)} disabled={scanning} />
              Include Starred Emails
            </label>{" "}
            <div className="summon-control">
              <button
                className="summon-button"
                onClick={scan}
                disabled={scanning}
                aria-label={scanning ? "Scanning emails" : "Summon old emails"}
                title={scanning ? undefined : "Summon old emails"}
              >
                <span className="summon-caption">
                  {scanning ? "summoning..." : results.length > 0 ? "scan again?" : "summon old emails"}
                </span>
                <span
                  key={mouthAnimation}
                  className={`ghost-art${mouthAnimation ? " mouth-opening" : ""}${mouthCover ? " is-scanning" : ""}`}
                  style={{
                    "--ghost-origin-x": `${mouthCover?.ghostOriginX ?? 50}%`,
                    "--ghost-origin-y": `${mouthCover?.ghostOriginY ?? (286 / 512) * 100}%`,
                    "--ghost-target-scale": `${mouthCover?.ghostScale ?? 1}`,
                    "--ghost-start-scale": `${coverClose?.ghostScale ?? 1}`,
                    "--cover-shrink-duration": `${coverClose?.duration ?? 6000}ms`,
                  }}
                  aria-hidden="true"
                >
                  <span
                    ref={ghostScalerRef}
                    className={`ghost-scaler${mouthCover ? (coverClose ? " is-returning" : " is-swallowing") : ""}`}
                  >
                    {ghostSvgMarkup ? (
                      <span
                        className="ghost-art-svg"
                        dangerouslySetInnerHTML={{ __html: ghostSvgMarkup }}
                      />
                    ) : (
                      <img src="/ghost.svg" alt="" />
                    )}
                  </span>
                </span>
                {scanning && !mouthCover && (
                  <span className="scan-loading" role="status">Scanning…</span>
                )}
              </button>
            </div>
          </div></section>

          {result && (
            <div className="notice notice-success">
              <strong>
                {result.movedCount !== undefined
                  ? `Moved ${result.movedCount} to Trash. Skipped ${result.skippedCount}.`
                  : `Restored ${result.restoredCount}. Skipped ${result.skippedCount}.`}
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
            <section className="results-section">
              <p>
                {results.length} found · {selected.size} selected{" "}
                  <button className="button button-outline" onClick={toggleAll}>Select all / none</button>{" "}
                <button
                  onClick={() => setConfirming({ ids: [...selected], protected: false })}
                  disabled={selected.size === 0 || busy}
                >
                  Move to Trash
                </button>
              </p>

              {risky.length > 0 && (
                <p className="warning-text" style={{ color: "#b45309" }}>
                  Heads up! Some selected emails may be important. Check them before moving to Trash.
                </p>
              )}

              {matches.length > 0 && (
                <>
                  <h3 className="group-title">Matches <span className="count">{matches.length}</span></h3>
                  {renderTable(matches, selected, toggle)}
                </>
              )}

              {unclear.length > 0 && (
                <>
                  <h3 className="group-title">Needs review <span className="count">{unclear.length}</span></h3>
                  <p style={{ fontSize: 13, color: "#555" }}>
                    These might be verification emails. Check before selecting.
                  </p>
                  {renderTable(unclear, selected, toggle)}
                </>
              )}

              {protectedRows.length > 0 && (
                <>
                  <h3 className="group-title">Important <span className="count">{protectedRows.length}</span></h3>
                  <p style={{ fontSize: 13, color: "#555" }}>
                    Gmail marks these as important. Moving them needs extra confirmation.
                  </p>
                  <p>
                    {selectedProtected.size} selected{" "}
                    <button className="button button-outline" onClick={toggleAllProtected}>Select all / none</button>{" "}
                    <button
                      onClick={() =>
                        setConfirming({ ids: [...selectedProtected], protected: true })
                      }
                      disabled={selectedProtected.size === 0 || busy}
                    >
                      Move {selectedProtected.size} important to Trash
                    </button>
                  </p>
                  {renderTable(protectedRows, selectedProtected, toggleProtected)}
                </>
              )}
            </section>
          )}

          {confirming && (
            <div className="modal-backdrop"
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div className="confirm-dialog">
                <h3>
                  Move {confirming.ids.length} email{confirming.ids.length === 1 ? "" : "s"} to Trash?
                </h3>
                <p>You can restore them later from Activity.</p>
                {confirming.protected && (
                  <p className="warning-text" style={{ color: "#b45309" }}>
                    Heads up! Gmail marks these emails as important. Move them anyway?
                  </p>
                )}
                {risky.length > 0 && (
                  <p className="warning-text" style={{ color: "#b45309" }}>
                    {risky.length} may be from a bank, government, or payment service.
                  </p>
                )}
                <button className="button button-primary" onClick={moveToTrash} disabled={busy}>
                  {busy ? "Moving…" : "Move to Trash"}
                </button>{" "}
                <button className="button button-outline" onClick={() => setConfirming(null)} disabled={busy}>Cancel</button>
              </div>
            </div>
          )}
        </main>
      )}

      {user && activityOpen && (
        <div
          onClick={() => setActivityOpen(false)}
          className="drawer-backdrop"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            zIndex: 50,
          }}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            className="activity-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="activity-title"
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
            <div className="drawer-heading">
              <div><h2 id="activity-title">Activity</h2></div>
              <button className="button button-quiet close-button" onClick={() => setActivityOpen(false)} aria-label="Close">✕</button>
            </div>

            <p className="drawer-account">
              <span>ACCOUNT <strong>{user.email}</strong></span>
              <button className="button button-quiet" onClick={disconnect} disabled={busy}>Disconnect</button>
            </p>

            <div className="activity-counts" aria-label="Activity totals">
              <div><strong>{activityCounts.trashed}</strong><span>In Trash</span></div>
              <div><strong>{activityCounts.restored}</strong><span>Restored</span></div>
              <div><strong>{activityCounts.deleted}</strong><span>Deleted</span></div>
            </div>

            {activityError && <p className="notice notice-error" role="alert">{activityError}</p>}

            {activityLoading ? (
              <p className="empty-state">Loading activity…</p>
            ) : activityItems.length === 0 ? (
              <p className="empty-state">No activity yet.</p>
            ) : (
              <>
                <div className="activity-toolbar">
                  <span>{activitySelected.size} selected</span>
                  <button className="button button-outline" onClick={toggleAllActivity} disabled={selectableActivityIds.length === 0}>
                    Select all / none
                  </button>
                  <button
                    className="button button-primary"
                    onClick={restoreActivitySelected}
                    disabled={activitySelected.size === 0 || busy}
                  >
                    {busy ? "Restoring…" : "Restore selected"}
                  </button>
                </div>

                <ul className="activity-list">
                  {activityItems.map((item) => {
                    const selectable = item.status === "trashed";
                    return (
                      <li key={item.id} className={!selectable ? "activity-row is-inactive" : "activity-row"}>
                        <input
                          className="activity-checkbox"
                          type="checkbox"
                          disabled={!selectable}
                          checked={activitySelected.has(item.id)}
                          onChange={() => toggleActivityItem(item.id)}
                          aria-label={item.subject ? `Select ${item.subject}` : "Select email"}
                        />
                        <div className="activity-entry">
                          <div className="activity-subject">
                            {item.subject || "Email details unavailable"}
                          </div>
                          <div className="activity-sender">
                            {item.sender || "Unknown sender"}
                          </div>
                          <div className="activity-dates">
                            <span className="activity-date-entry"><span className="activity-date-label">Moved</span>{renderDateTime(item.movedAt)}</span>
                            {item.restoredAt && <span className="activity-date-entry"><span className="activity-date-label">Restored</span>{renderDateTime(item.restoredAt)}</span>}
                          </div>
                        </div>
                        <span className={`activity-status status-${item.status}`}>
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

      {mouthCover &&
        createPortal(
          <div
            key={mouthCover.id}
            className="mouth-cover"
            style={{
              "--mouth-x": `${mouthCover.x}px`,
              "--mouth-y": `${mouthCover.y}px`,
              "--scan-label-x": `${mouthCover.labelX ?? mouthCover.x}px`,
              "--scan-label-y": `${mouthCover.labelY ?? mouthCover.y + 28}px`,
              "--cover-start-scale": `${coverClose?.scale ?? 1}`,
              "--cover-shrink-duration": `${coverClose?.duration ?? 6000}ms`,
              "--ghost-origin-x": `${mouthCover?.ghostOriginX ?? 50}%`,
              "--ghost-origin-y": `${mouthCover?.ghostOriginY ?? (286 / 512) * 100}%`,
              "--ghost-target-scale": `${mouthCover?.ghostScale ?? 1}`,
              "--ghost-start-scale": `${coverClose?.ghostScale ?? 1}`,
            }}
          >
            <span
              className="mouth-cover-ghost"
              aria-hidden="true"
              style={{
                "--ghost-origin-x": `${mouthCover?.ghostOriginX ?? 50}%`,
                "--ghost-origin-y": `${mouthCover?.ghostOriginY ?? (286 / 512) * 100}%`,
                "--ghost-target-scale": `${mouthCover?.ghostScale ?? 1}`,
                "--ghost-start-scale": `${coverClose?.ghostScale ?? 1}`,
                "--cover-shrink-duration": `${coverClose?.duration ?? 6000}ms`,
              }}
            >
              <span
                className={`ghost-art mouth-opening${mouthCover ? " is-scanning" : ""}`}
                style={{
                  "--ghost-origin-x": `${mouthCover?.ghostOriginX ?? 50}%`,
                  "--ghost-origin-y": `${mouthCover?.ghostOriginY ?? (286 / 512) * 100}%`,
                  "--ghost-target-scale": `${mouthCover?.ghostScale ?? 1}`,
                  "--ghost-start-scale": `${coverClose?.ghostScale ?? 1}`,
                  "--cover-shrink-duration": `${coverClose?.duration ?? 6000}ms`,
                }}
                aria-hidden="true"
              >
                <span
                  ref={ghostScalerRef}
                  className={`ghost-scaler${mouthCover ? (coverClose ? " is-returning" : " is-swallowing") : ""}`}
                >
                  {ghostSvgMarkup ? (
                    <span
                      className="ghost-art-svg"
                      dangerouslySetInnerHTML={{ __html: ghostSvgMarkup }}
                    />
                  ) : (
                    <img src="/ghost.svg" alt="" />
                  )}
                </span>
              </span>
            </span>
            <span
              ref={coverCircleRef}
              className={`mouth-cover-circle${coverClose ? " is-shrinking" : ""}`}
              aria-hidden="true"
              onAnimationEnd={(event) => {
                if (event.animationName === "mouth-cover-expand" && !coverClose) {
                  setCoverFinished(true);
                }
                if (event.animationName === "mouth-cover-shrink" && coverClose) {
                  setMouthCover(null);
                  setCoverFinished(false);
                  setCoverClose(null);
                  setScanOutcome(null);
                  setScanning(false);
                }
              }}
            />
            {!coverClose && <span className="scan-loading-overlay" role="status">summoning...</span>}
          </div>,
          document.body
        )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
