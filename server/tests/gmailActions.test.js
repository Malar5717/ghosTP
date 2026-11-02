import { describe, test, expect, vi, beforeEach } from "vitest";
import { getMessageState, trashMessages, untrashMessages } from "../utils/gmailActions.js";

let messages;
let gmail;

beforeEach(() => {
    messages = { get: vi.fn(), trash: vi.fn(), untrash: vi.fn(), delete: vi.fn(), batchDelete: vi.fn() };
    gmail = { users: { messages, threads: { delete: vi.fn() } } };
});

describe("getMessageState", () => {
    test("asks Gmail for metadata only, never the email body", async () => {
        messages.get.mockResolvedValue({ data: {} });
        await getMessageState(gmail, "m1");
        expect(messages.get).toHaveBeenCalledWith({
            userId: "me",
            id: "m1",
            format: "metadata",
            metadataHeaders: ["From", "Subject", "Date"],
        });
    });

    test("reads the headers, whatever the letter case", async () => {
        messages.get.mockResolvedValue({
            data: {
                payload: {
                    headers: [
                        { name: "FROM", value: "Google <no-reply@accounts.google.com>" },
                        { name: "subject", value: "123456 is your code" },
                        { name: "Date", value: "Mon, 2 Nov 2026 10:00:00 +0530" },
                    ],
                },
            },
        });
        const state = await getMessageState(gmail, "m1");
        expect(state).toMatchObject({
            id: "m1",
            from: "Google <no-reply@accounts.google.com>",
            subject: "123456 is your code",
            date: "Mon, 2 Nov 2026 10:00:00 +0530",
        });
    });

    test("turns labels into flags", async () => {
        messages.get.mockResolvedValue({ data: { labelIds: ["INBOX", "STARRED", "IMPORTANT", "TRASH", "SPAM"] } });
        const state = await getMessageState(gmail, "m1");
        expect(state).toMatchObject({ isStarred: true, isImportant: true, isTrash: true, isSpam: true });
    });

    test("an email with no labels has every flag off", async () => {
        messages.get.mockResolvedValue({ data: {} });
        const state = await getMessageState(gmail, "m1");
        expect(state).toMatchObject({ isStarred: false, isImportant: false, isTrash: false, isSpam: false, labelIds: [] });
    });

    test("internalDate becomes a number, or null when missing", async () => {
        messages.get.mockResolvedValue({ data: { internalDate: "1700000000000" } });
        expect((await getMessageState(gmail, "m1")).internalDate).toBe(1700000000000);
        messages.get.mockResolvedValue({ data: {} });
        expect((await getMessageState(gmail, "m1")).internalDate).toBeNull();
    });

    test("missing headers become empty strings", async () => {
        messages.get.mockResolvedValue({ data: { payload: { headers: [] } } });
        expect(await getMessageState(gmail, "m1")).toMatchObject({ from: "", subject: "", date: "" });
    });

    test("a Gmail error is passed on unchanged, so callers can read its status", async () => {
        const err = Object.assign(new Error("Not found"), { response: { status: 404 } });
        messages.get.mockRejectedValue(err);
        await expect(getMessageState(gmail, "m1")).rejects.toBe(err);
    });
});

describe.each([
    ["trashMessages", trashMessages, "trash"],
    ["untrashMessages", untrashMessages, "untrash"],
])("%s", (_name, fn, method) => {
    test("does nothing for an empty list", async () => {
        expect(await fn(gmail, [])).toEqual([]);
        expect(await fn(gmail)).toEqual([]);
        expect(messages[method]).not.toHaveBeenCalled();
    });

    test("calls Gmail once per id and reports success in order", async () => {
        messages[method].mockResolvedValue({});
        const results = await fn(gmail, ["a", "b", "c"]);
        expect(results).toEqual([
            { id: "a", ok: true },
            { id: "b", ok: true },
            { id: "c", ok: true },
        ]);
        expect(messages[method].mock.calls).toEqual([
            [{ userId: "me", id: "a" }],
            [{ userId: "me", id: "b" }],
            [{ userId: "me", id: "c" }],
        ]);
    });

    test("one failure does not stop the others", async () => {
        messages[method]
            .mockResolvedValueOnce({})
            .mockRejectedValueOnce(Object.assign(new Error("fallback"), { response: { data: { error: { message: "Rate Limit Exceeded" } } } }))
            .mockResolvedValueOnce({});
        const results = await fn(gmail, ["a", "b", "c"]);
        expect(results).toEqual([
            { id: "a", ok: true },
            { id: "b", ok: false, reason: "Rate Limit Exceeded" },
            { id: "c", ok: true },
        ]);
    });

    test("uses the plain error message when Gmail gives no details", async () => {
        messages[method].mockRejectedValue(new Error("socket hang up"));
        expect(await fn(gmail, ["a"])).toEqual([{ id: "a", ok: false, reason: "socket hang up" }]);
    });

    test("never permanently deletes anything", async () => {
        messages[method].mockResolvedValue({});
        await fn(gmail, ["a", "b"]);
        expect(messages.delete).not.toHaveBeenCalled();
        expect(messages.batchDelete).not.toHaveBeenCalled();
        expect(gmail.users.threads.delete).not.toHaveBeenCalled();
    });
});