// In-memory cache of Google access tokens, keyed by userId.
//
// Kept separate from scanStore on purpose: scanStore is keyed by session and
// holds email metadata, while this holds short-lived credentials that are
// invalidated by disconnect, revocation or an expired refresh token.
const SAFETY_MS = 60 * 1000; // refresh a minute early

const cache = new Map(); // userId -> { accessToken, expiresAt }

export function getCachedAccessToken(userId) {
    const entry = cache.get(userId);
    if (!entry) return null;
    if (entry.expiresAt - SAFETY_MS <= Date.now()) {
        cache.delete(userId);
        return null;
    }
    return entry.accessToken;
}

export function setCachedAccessToken(userId, accessToken, expiresAt) {
    if (!accessToken) return;
    cache.set(userId, { accessToken, expiresAt });
}

export function clearCachedAccessToken(userId) {
    cache.delete(userId);
}

// Periodic cleanup so the map doesn't grow forever.
setInterval(() => {
    const now = Date.now();
    for (const [userId, entry] of cache) {
        if (entry.expiresAt <= now) cache.delete(userId);
    }
}, 5 * 60 * 1000).unref();
