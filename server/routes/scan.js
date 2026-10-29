import { Router } from "express";
import { getGmailClient } from "../utils/gmail.js";
import { classifyEmail } from "../utils/rules.js";
import { setScan, getScan } from "../utils/scanStore.js";

const router = Router();

router.post("/start", async (req, res) => {
    try {
        if (!req.session.user) return res.status(401).json({ error: "Not authenticated" });
        const { age = "1m" } = req.body;

        const ageMap = { "1w": "7d", "1m": "30d", "3m": "90d" };
        const olderThan = ageMap[age] || "30d";

        const gmail = await getGmailClient(req.session.user.id);

        const q = `(verification OR verify OR "verification code" OR OTP OR "one-time password" OR "one time password" OR "one-time code" OR "one time code" OR passcode OR "security code" OR "authentication code" OR "access code" OR "login code" OR "sign in code" OR "confirm your email" OR "confirm your account" OR 2fa) older_than:${olderThan} -in:trash -in:spam -is:starred`;

        const listRes = await gmail.users.messages.list({
            userId: "me",
            q,
            maxResults: 50,
        });

        const messages = listRes.data.messages || [];
        if (messages.length === 0) {
            setScan(req.sessionID, [], age);
            return res.json({ results: [], count: 0 });
        }

        const results = [];
        for (const m of messages) {
            try {
                const msg = await gmail.users.messages.get({
                    userId: "me",
                    id: m.id,
                    format: "metadata",
                    metadataHeaders: ["From", "Subject", "Date"],
                });
                const headers = msg.data.payload?.headers || [];
                const getH = (name) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
                const from = getH("From");
                const subject = getH("Subject");
                const date = getH("Date");
                const snippet = msg.data.snippet || "";
                const labelIds = msg.data.labelIds || [];

                const classification = classifyEmail({ subject, snippet });

                // Don't store or return emails we know aren't verification/OTP related
                if (classification.label === "Not a match") continue;

                results.push({
                    id: m.id,
                    from,
                    subject,
                    date,
                    // snippet,
                    isImportant: labelIds.includes("IMPORTANT"),
                    isStarred: labelIds.includes("STARRED"),
                    ...classification,
                });
            } catch (err) {
                console.error("Failed to fetch message", m.id, err.message);
            }
        }

        results.sort((a, b) => new Date(b.date) - new Date(a.date));
        setScan(req.sessionID, results, age);
        res.json({ results, count: results.length });
    } catch (e) {
        console.error("FULL SCAN ERROR:", e.response?.data || e);
        res.status(500).json({ error: e.response?.data?.error?.message || e.message || "Scan failed" });
    }
});

router.get("/results", (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "Not authenticated" });
    const results = getScan(req.sessionID);
    res.json({ results, count: results.length });
});

export default router;