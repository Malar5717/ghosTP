// Server-side in-memory store for scan results.
// We deliberately keep email metadata out of req.session, because
// connect-pg-simple persists sessions to Postgres.
//
// Trash/activity history is NOT stored here anymore: it lives in the
// Postgres `activity` table so it survives restarts.

const STORE_TTL_MS = 15 * 60 * 1000; // 15 minutes

const scans = new Map(); // sessionId -> { results, age, createdAt }

function isExpired(entry) {
  return !entry || Date.now() - entry.createdAt > STORE_TTL_MS;
}

function getEntry(store, sessionId) {
  const entry = store.get(sessionId);
  if (isExpired(entry)) {
    store.delete(sessionId);
    return null;
  }
  return entry;
}

export function setScan(sessionId, results, age) {
  scans.set(sessionId, { results, age, createdAt: Date.now() });
}

export function getScan(sessionId) {
  const entry = getEntry(scans, sessionId);
  return entry ? entry.results : [];
}

export function getScanAge(sessionId) {
  const entry = getEntry(scans, sessionId);
  return entry ? entry.age : null;
}

export function clearScan(sessionId) {
  scans.delete(sessionId);
}

// Periodic cleanup so the map doesn't grow forever.
setInterval(() => {
  for (const [key, entry] of scans) {
    if (isExpired(entry)) scans.delete(key);
  }
}, 5 * 60 * 1000).unref();
