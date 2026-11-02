import { describe, test, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import express from "express";
import request from "supertest";
import router from "../routes/trash.js";


// ---- Mocks: no real database, no real Gmail ----
const m = vi.hoisted(() => ({
    state: { user: { id: 1 }, activityRows: [], scan: [], age: "1m" },
    insertValues: vi.fn(),
    updateSet: vi.fn(),
    getMessageState: vi.fn(),
    trashMessages: vi.fn(),
    untrashMessages: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
    and: (...a) => a,
    eq: (...a) => a,
    inArray: (...a) => a,
    sql: (strings) => strings.join("?"),
}));
vi.mock("../db/schema.js", () => ({
    activity: { userId: "userId", messageId: "messageId", subject: "subject", sender: "sender" },
}));
vi.mock("../db/index.js", () => ({
    db: {
        select: () => ({ from: () => ({ where: async () => m.state.activityRows }) }),
        insert: () => ({
            values: (v) => {
                m.insertValues(v);
                return { onConflictDoUpdate: async () => { } };
            },
        }),
        update: () => ({
            set: (s) => {
                m.updateSet(s);
                return { where: async () => { } };
            },
        }),
    },
}));
vi.mock("../utils/gmail.js", () => ({ getGmailClient: async () => ({}) }));
vi.mock("../utils/gmailActions.js", () => ({
    getMessageState: (...a) => m.getMessageState(...a),
    trashMessages: (...a) => m.trashMessages(...a),
    untrashMessages: (...a) => m.untrashMessages(...a),
}));
vi.mock("../utils/scanStore.js", () => ({
    getScan: () => m.state.scan,
    getScanAge: () => m.state.age,
}));

// ---- Helpers ----
const DAY = 24 * 60 * 60 * 1000;
const OLD = Date.now() - 100 * DAY;

const gmailState = (over = {}) => ({
    isTrash: false, isSpam: false, isStarred: false, isImportant: false,
    internalDate: OLD, from: "no-reply@x.com", subject: "123456 is your code", date: "d",
    ...over,
});

const googleError = (status, message) =>
    Object.assign(new Error(message), { code: status, response: { status } });

const app = () => {
    const a = express();
    a.use(express.json());
    a.use((req, _res, next) => {
        req.session = { user: m.state.user };
        req.sessionID = "sess";
        next();
    });
    a.use("/trash", router);
    return a;
};

const move = (body) => request(app()).post("/trash/move").send(body);
const undo = (body) => request(app()).post("/trash/undo").send(body);

beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => { });
    m.insertValues.mockReset();
    m.updateSet.mockReset();
    m.getMessageState.mockReset().mockResolvedValue(gmailState());
    m.trashMessages.mockReset().mockImplementation(async (_g, ids) => ids.map((id) => ({ id, ok: true })));
    m.untrashMessages.mockReset().mockImplementation(async (_g, ids) => ids.map((id) => ({ id, ok: true })));
    m.state.user = { id: 1 };
    m.state.activityRows = [];
    m.state.scan = [{ id: "m1" }, { id: "m2" }];
    m.state.age = "1m";
});

// ---- /trash/move ----
describe("POST /trash/move: input checks", () => {
    test("401 when not signed in", async () => {
        m.state.user = null;
        const res = await move({ ids: ["m1"] });
        expect(res.status).toBe(401);
        expect(m.trashMessages).not.toHaveBeenCalled();
    });

    test.each([
        ["no ids", {}],
        ["empty list", { ids: [] }],
        ["ids is not a list", { ids: "m1" }],
    ])("400: %s", async (_name, body) => {
        expect((await move(body)).status).toBe(400);
    });

    test("400: more than 100 ids", async () => {
        const ids = Array.from({ length: 101 }, (_, i) => `m${i}`);
        const res = await move({ ids });
        expect(res.status).toBe(400);
        expect(m.trashMessages).not.toHaveBeenCalled();
    });

    test.each([["bad id!"], ["../etc/passwd"], [5], [""]])("400: invalid id %j", async (bad) => {
        expect((await move({ ids: ["m1", bad] })).status).toBe(400);
    });
});

describe("POST /trash/move: safety checks", () => {
    test("moves a clean, old email that is part of the scan", async () => {
        const res = await move({ ids: ["m1"] });
        expect(res.status).toBe(200);
        expect(res.body.moved).toEqual(["m1"]);
        expect(m.trashMessages.mock.calls[0][1]).toEqual(["m1"]);
    });

    test("never touches an id that is not in the scan or in activity", async () => {
        const res = await move({ ids: ["zzz"] });
        expect(res.body.movedCount).toBe(0);
        expect(res.body.skipped[0]).toEqual({ id: "zzz", reason: "Not part of the current scan" });
        expect(m.getMessageState).not.toHaveBeenCalled();
        expect(m.trashMessages.mock.calls.flatMap((c) => c[1])).toEqual([]);
    });

    test("an empty scan means nothing can be moved", async () => {
        m.state.scan = [];
        const res = await move({ ids: ["m1", "m2"] });
        expect(res.body.movedCount).toBe(0);
    });

    test.each([
        ["isTrash", "Already in Trash"],
        ["isSpam", "In Spam"],
        ["isStarred", "Starred"],
        ["isImportant", "Marked important"],
    ])("skips when %s", async (flag, reason) => {
        m.getMessageState.mockResolvedValue(gmailState({ [flag]: true }));
        const res = await move({ ids: ["m1"] });
        expect(res.body.movedCount).toBe(0);
        expect(res.body.skipped).toEqual([{ id: "m1", reason }]);
    });

    test("an important email can be moved only with allowProtected", async () => {
        m.getMessageState.mockResolvedValue(gmailState({ isImportant: true }));
        const res = await move({ ids: ["m1"], allowProtected: true });
        expect(res.body.moved).toEqual(["m1"]);
    });

    test("allowProtected never overrides a starred email", async () => {
        m.getMessageState.mockResolvedValue(gmailState({ isStarred: true }));
        const res = await move({ ids: ["m1"], allowProtected: true });
        expect(res.body.movedCount).toBe(0);
    });

    test("skips an email that is newer than the chosen age", async () => {
        m.getMessageState.mockResolvedValue(gmailState({ internalDate: Date.now() - 5 * DAY }));
        const res = await move({ ids: ["m1"] });
        expect(res.body.skipped).toEqual([{ id: "m1", reason: "Not old enough anymore" }]);
    });

    test("an id from past activity can be trashed again (after a restore)", async () => {
        m.state.scan = [];
        m.state.activityRows = [{ messageId: "m9" }];
        const res = await move({ ids: ["m9"] });
        expect(res.body.moved).toEqual(["m9"]);
    });

    test("the same id sent twice is handled once", async () => {
        const res = await move({ ids: ["m1", "m1"] });
        expect(m.trashMessages.mock.calls[0][1]).toEqual(["m1"]);
        expect(res.body.movedCount).toBe(1);
        expect(m.insertValues.mock.calls[0][0]).toHaveLength(1);
    });
});

describe("POST /trash/move: results and activity", () => {
    test("records moved emails in activity", async () => {
        await move({ ids: ["m1"] });
        const rows = m.insertValues.mock.calls[0][0];
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ userId: 1, messageId: "m1", status: "trashed", sender: "no-reply@x.com" });
    });

    test("a partial Gmail failure is reported, and only successes are recorded", async () => {
        m.trashMessages.mockResolvedValue([{ id: "m1", ok: true }, { id: "m2", ok: false, reason: "Rate limit" }]);
        const res = await move({ ids: ["m1", "m2"] });
        expect(res.body.movedCount).toBe(1);
        expect(res.body.skipped).toContainEqual({ id: "m2", reason: "Rate limit" });
        expect(m.insertValues.mock.calls[0][0].map((r) => r.messageId)).toEqual(["m1"]);
    });

    test("a message Gmail cannot find is skipped, not an error", async () => {
        m.getMessageState.mockRejectedValue(googleError(404, "Requested entity was not found."));
        const res = await move({ ids: ["m1"] });
        expect(res.status).toBe(200);
        expect(res.body.skipped[0].id).toBe("m1");
    });

    test("a missing Gmail permission asks the user to reconnect", async () => {
        m.getMessageState.mockRejectedValue(googleError(403, "Request had insufficient authentication scopes."));
        const res = await move({ ids: ["m1"] });
        expect(res.status).toBe(401);
        expect(res.body.code).toBe("GMAIL_RECONNECT_REQUIRED");
    });

    test.each([[429], [503]])("Gmail error %i is not hidden as a normal skip", async (status) => {
        m.getMessageState.mockRejectedValue(googleError(status, "Gmail problem"));
        const res = await move({ ids: ["m1"] });
        expect(res.status).not.toBe(200);
    });

    test("an expired token asks the user to reconnect", async () => {
        m.getMessageState.mockRejectedValue(Object.assign(new Error("x"), { code: "GMAIL_RECONNECT_REQUIRED" }));
        const res = await move({ ids: ["m1"] });
        expect(res.status).toBe(401);
        expect(res.body.code).toBe("GMAIL_RECONNECT_REQUIRED");
    });

    test("errors come back as JSON, not HTML", async () => {
        m.trashMessages.mockRejectedValue(new Error("boom"));
        const res = await move({ ids: ["m1"] });
        expect(res.status).toBe(500);
        expect(res.headers["content-type"]).toMatch(/json/);
    });
});

// ---- /trash/undo ----
describe("POST /trash/undo", () => {
    test("401 when not signed in", async () => {
        m.state.user = null;
        expect((await undo({ ids: ["m1"] })).status).toBe(401);
    });

    test("400 for bad input", async () => {
        expect((await undo({ ids: [] })).status).toBe(400);
        expect((await undo({ ids: ["bad id!"] })).status).toBe(400);
    });

    test("restores only emails ghosTP moved, and skips the rest", async () => {
        m.state.activityRows = [
            { messageId: "m1", status: "trashed" },
            { messageId: "m2", status: "restored" },
        ];
        const res = await undo({ ids: ["m1", "m2", "m3"] });
        expect(m.untrashMessages.mock.calls[0][1]).toEqual(["m1"]);
        expect(res.body.restored).toEqual(["m1"]);
        expect(res.body.skipped).toEqual([
            { id: "m2", reason: "Not in your Trash activity" },
            { id: "m3", reason: "Not in your Trash activity" },
        ]);
    });

    test("marks restored emails in activity", async () => {
        m.state.activityRows = [{ messageId: "m1", status: "trashed" }];
        await undo({ ids: ["m1"] });
        expect(m.updateSet.mock.calls[0][0]).toMatchObject({ status: "restored" });
    });

    test("a failed restore is reported and not marked restored", async () => {
        m.state.activityRows = [{ messageId: "m1", status: "trashed" }];
        m.untrashMessages.mockResolvedValue([{ id: "m1", ok: false, reason: "Gmail error" }]);
        const res = await undo({ ids: ["m1"] });
        expect(res.body.restoredCount).toBe(0);
        expect(res.body.skipped).toContainEqual({ id: "m1", reason: "Gmail error" });
        expect(m.updateSet).not.toHaveBeenCalled();
    });
});

// ---- Promise: never permanently delete ----
describe("no permanent delete", () => {
    test("trash.js has no delete calls", () => {
        const src = readFileSync(new URL("../routes//trash.js", import.meta.url), "utf8");
        expect(src).not.toMatch(/messages\.delete|messages\.batchDelete|threads\.delete|\.batchDelete\(/);
    });
});