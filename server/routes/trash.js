import { Router } from "express";
import { getGmailClient } from "../utils/gmail.js";
import { getMessageState, trashMessages, untrashMessages } from "../utils/gmailActions.js";
import {
    getScan,
    getScanAge,
    addTrashed,
    getTrashed,
    removeTrashed,
} from "../utils/scanStore.js";

const router = Router();

const MAX_IDS = 100;
const AGE_DAYS = { "1w": 7, "1m": 30, "3m": 90 };

function isValidId(id) {
    return typeof id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(id);
}

router.post("/move", async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: "Not authenticated" });
        }

        const { ids } = req.body;
        const allowProtected = req.body.allowProtected === true;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: "No message IDs provided" });
        }
        if (ids.length > MAX_IDS) {
            return res.status(400).json({ error: `Too many IDs (max ${MAX_IDS})` });
        }
        if (!ids.every(isValidId)) {
            return res.status(400).json({ error: "Invalid message ID format" });
        }

        // Only IDs that came from the current scan are eligible.
        const scannedIds = new Set(getScan(req.sessionID).map((r) => r.id));
        const age = getScanAge(req.sessionID);
        const ageDays = AGE_DAYS[age];
        const cutoff = ageDays ? Date.now() - ageDays * 24 * 60 * 60 * 1000 : null;

        const gmail = await getGmailClient(req.session.user.id);

        const toTrash = [];
        const skipped = [];
        const display = new Map();

        for (const id of ids) {
            if (!scannedIds.has(id)) {
                skipped.push({ id, reason: "Not part of the current scan" });
                continue;
            }

            let state;
            try {
                state = await getMessageState(gmail, id);
            } catch (e) {
                skipped.push({ id, reason: "Message not found or inaccessible" });
                continue;
            }

            if (state.isTrash) {
                skipped.push({ id, reason: "Already in Trash" });
                continue;
            }
            if (state.isSpam) {
                skipped.push({ id, reason: "In Spam" });
                continue;
            }
            if (state.isStarred) {
                skipped.push({ id, reason: "Starred" });
                continue;
            }
            if (state.isImportant && !allowProtected) {
                skipped.push({ id, reason: "Marked important" });
                continue;
            }
            if (cutoff && state.internalDate && state.internalDate > cutoff) {
                skipped.push({ id, reason: "Not old enough anymore" });
                continue;
            }

            toTrash.push(id);
            display.set(id, { from: state.from, subject: state.subject, date: state.date });
        }

        const results = await trashMessages(gmail, toTrash);
        const moved = results.filter((r) => r.ok).map((r) => r.id);
        const failed = results.filter((r) => !r.ok);

        if (moved.length > 0) {
            addTrashed(
                req.sessionID,
                moved.map((id) => ({
                    id,
                    movedAt: new Date().toISOString(),
                    ...(display.get(id) || {}),
                }))
            );
        }

        res.json({
            movedCount: moved.length,
            skippedCount: skipped.length + failed.length,
            moved,
            skipped: [
                ...skipped,
                ...failed.map((f) => ({ id: f.id, reason: f.reason || "Trash failed" })),
            ],
        });
    } catch (e) {
        console.error("TRASH MOVE ERROR:", e.response?.data || e);
        res.status(500).json({
            error: e.response?.data?.error?.message || e.message || "Move to Trash failed",
        });
    }
});

router.get("/recent", (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Not authenticated" });
    }
    res.json({ items: getTrashed(req.sessionID) });
});

router.post("/undo", async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: "Not authenticated" });
        }

        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: "No message IDs provided" });
        }
        if (ids.length > MAX_IDS) {
            return res.status(400).json({ error: `Too many IDs (max ${MAX_IDS})` });
        }
        if (!ids.every(isValidId)) {
            return res.status(400).json({ error: "Invalid message ID format" });
        }

        // Only restore what this session actually trashed.
        const known = new Set(getTrashed(req.sessionID).map((t) => t.id));
        const restorable = ids.filter((id) => known.has(id));
        const skipped = ids
            .filter((id) => !known.has(id))
            .map((id) => ({ id, reason: "Not in this session's recent Trash list" }));

        const gmail = await getGmailClient(req.session.user.id);
        const results = await untrashMessages(gmail, restorable);

        const restored = results.filter((r) => r.ok).map((r) => r.id);
        const failed = results.filter((r) => !r.ok);

        if (restored.length > 0) {
            removeTrashed(req.sessionID, restored);
        }

        res.json({
            restoredCount: restored.length,
            skippedCount: skipped.length + failed.length,
            restored,
            skipped: [
                ...skipped,
                ...failed.map((f) => ({ id: f.id, reason: f.reason || "Restore failed" })),
            ],
        });
    } catch (e) {
        console.error("TRASH UNDO ERROR:", e.response?.data || e);
        res.status(500).json({
            error: e.response?.data?.error?.message || e.message || "Restore failed",
        });
    }
});

export default router;
