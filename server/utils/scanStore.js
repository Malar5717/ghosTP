// Server-side in-memory store for scan results.
// We deliberately keep email metadata out of req.session, because
// connect-pg-simple persists sessions to Postgres.

const STORE_TTL_MS = 15 * 60 * 1000; // 15 minutes

const scans = new Map(); // sessionId -> { results, age, createdAt }
const trashHistory = new Map(); // sessionId -> { items: [{ id, movedAt }], createdAt }

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

export function addTrashed(sessionId, items) {
  let entry = getEntry(trashHistory, sessionId);
  if (!entry) {
    entry = { items: [], createdAt: Date.now() };
    trashHistory.set(sessionId, entry);
  }
  entry.items.unshift(...items);
  entry.items = entry.items.slice(0, 100); // keep it bounded
}

export function getTrashed(sessionId) {
  const entry = getEntry(trashHistory, sessionId);
  return entry ? entry.items : [];
}

export function removeTrashed(sessionId, ids) {
  const entry = getEntry(trashHistory, sessionId);
  if (!entry) return;
  const remove = new Set(ids);
  entry.items = entry.items.filter((item) => !remove.has(item.id));
}

export function clearTrashed(sessionId) {
  trashHistory.delete(sessionId);
}

// Periodic cleanup so the maps don't grow forever.
setInterval(() => {
  for (const store of [scans, trashHistory]) {
    for (const [key, entry] of store) {
      if (isExpired(entry)) store.delete(key);
    }
  }
}, 5 * 60 * 1000).unref();
