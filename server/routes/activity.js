import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { activity } from "../db/schema.js";
import { getGmailClient } from "../utils/gmail.js";
import { getMessageState } from "../utils/gmailActions.js";

const router = Router();
const MAX_ROWS = 100;
const CONCURRENCY = 8;

async function backfillContent(userId, rows, gmail) {
    // Rows whose content was scrubbed on disconnect (or never stored).
    const todo = rows.filter((r) => !r.subject && !r.sender);
    if (todo.length === 0) return;

    for (let i = 0; i < todo.length; i += CONCURRENCY) {
        const chunk = todo.slice(i, i + CONCURRENCY);
        await Promise.all(
            chunk.map(async (row) => {
                try {
                    const state = await getMessageState(gmail, row.messageId);
                    const subject = state.subject || null;
                    const sender = state.from || null;

                    await db
                        .update(activity)
                        .set({ subject, sender })
                        .where(
                            and(
                                eq(activity.userId, userId),
                                eq(activity.messageId, row.messageId)
                            )
                        );

                    row.subject = subject;
                    row.sender = sender;
                } catch (e) {
                    // 404: permanently gone, leave the row without content.
                    if (e.response?.status !== 404) {
                        console.error("Activity backfill failed", row.messageId, e.message);
                    }
                }
            })
        );
    }
}

async function syncStatuses(userId, rows, gmail) {
    const todo = rows.filter((r) => r.status === "trashed");
    if (todo.length === 0) return rows;

    const patch = new Map(); // messageId -> { status }

    for (let i = 0; i < todo.length; i += CONCURRENCY) {
        const chunk = todo.slice(i, i + CONCURRENCY);
        await Promise.all(
            chunk.map(async (row) => {
                try {
                    const state = await getMessageState(gmail, row.messageId);
                    const status = state.isTrash ? "trashed" : "restored";
                    if (status !== row.status) patch.set(row.messageId, { status });
                } catch (e) {
                    if (e.response?.status === 404) {
                        patch.set(row.messageId, { status: "deleted" });
                    } else {
                        console.error("Activity sync failed", row.messageId, e.message);
                    }
                }
            })
        );
    }

    const now = new Date();
    for (const [messageId, p] of patch) {
        await db
            .update(activity)
            .set({ status: p.status, checkedAt: now })
            .where(
                and(
                    eq(activity.userId, userId),
                    eq(activity.messageId, messageId)
                )
            );
        const row = rows.find((r) => r.messageId === messageId);
        if (row) row.status = p.status;
    }

    return rows;
}

router.get("/", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Not authenticated" });
    }

    try {
        const rows = await db
            .select()
            .from(activity)
            .where(eq(activity.userId, req.session.user.id))
            .orderBy(desc(activity.movedAt))
            .limit(MAX_ROWS);

        const needsGmail =
            rows.some((r) => r.status === "trashed") ||
            rows.some((r) => !r.subject && !r.sender);

        if (needsGmail && rows.length > 0) {
            const gmail = await getGmailClient(req.session.user.id);
            await backfillContent(req.session.user.id, rows, gmail);
            await syncStatuses(req.session.user.id, rows, gmail);
        }

        res.json({
            items: rows.map((r) => ({
                id: r.messageId,
                subject: r.subject,
                sender: r.sender,
                status: r.status,
                movedAt: r.movedAt,
                restoredAt: r.restoredAt,
            })),
            counts: {
                trashed: rows.filter((r) => r.status === "trashed").length,
                restored: rows.filter((r) => r.status === "restored").length,
                deleted: rows.filter((r) => r.status === "deleted").length,
            },
        });
    } catch (e) {
        console.error("Activity load error", e);
        res.status(500).json({ error: "Failed to load activity" });
    }
});

export default router;
