import { describe, test, expect, beforeEach, vi } from "vitest";
import { getGmailClient } from "../utils/gmail.js";

// ---- Mocks: no real Google, database or encryption ----
const m = vi.hoisted(() => {
    const auth = { setCredentials: vi.fn(), refreshAccessToken: vi.fn() };
    return {
        auth,
        OAuth2: vi.fn(function () {
            return auth;
        }),
        gmailFactory: vi.fn(),
        rows: [],
        dbDelete: vi.fn(),
        decrypt: vi.fn(),
    };
});

vi.mock("googleapis", () => ({
    google: { auth: { OAuth2: m.OAuth2 }, gmail: (...a) => m.gmailFactory(...a) },
}));
vi.mock("drizzle-orm", () => ({ eq: (...a) => a }));
vi.mock("../db/schema.js", () => ({ tokens: { userId: "userId" } }));
vi.mock("../db/index.js", () => ({
    db: {
        select: () => ({ from: () => ({ where: () => ({ limit: async () => m.rows }) }) }),
        delete: () => ({ where: (...a) => m.dbDelete(...a) }),
    },
}));
vi.mock("../utils/crypto.js", () => ({ decrypt: (...a) => m.decrypt(...a) }));

const RECONNECT = { code: "GMAIL_RECONNECT_REQUIRED" };
const fakeGmail = { fake: "gmail client" };

beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => { });
    process.env.GOOGLE_CLIENT_ID = "client-id";
    process.env.GOOGLE_CLIENT_SECRET = "client-secret";
    process.env.GOOGLE_REDIRECT_URI = "https://example.com/callback";

    m.OAuth2.mockClear();
    m.auth.setCredentials.mockReset();
    m.auth.refreshAccessToken.mockReset().mockResolvedValue({ credentials: { access_token: "access-1" } });
    m.gmailFactory.mockReset().mockReturnValue(fakeGmail);
    m.dbDelete.mockReset().mockResolvedValue(undefined);
    m.decrypt.mockReset().mockReturnValue("refresh-1");
    m.rows = [{ encryptedRefreshToken: "encrypted-blob" }];
});

describe("getGmailClient: when the user must reconnect", () => {
    test("no saved token row", async () => {
        m.rows = [];
        await expect(getGmailClient(1)).rejects.toMatchObject(RECONNECT);
    });

    test("saved row without a token", async () => {
        m.rows = [{ encryptedRefreshToken: null }];
        await expect(getGmailClient(1)).rejects.toMatchObject(RECONNECT);
        expect(m.decrypt).not.toHaveBeenCalled();
    });

    test("the saved token cannot be decrypted (for example the key changed)", async () => {
        m.decrypt.mockImplementation(() => {
            throw new Error("Unsupported state or unable to authenticate data");
        });
        await expect(getGmailClient(1)).rejects.toMatchObject(RECONNECT);
        expect(m.auth.refreshAccessToken).not.toHaveBeenCalled();
    });

    test("Google returns no access token", async () => {
        m.auth.refreshAccessToken.mockResolvedValue({ credentials: {} });
        await expect(getGmailClient(1)).rejects.toMatchObject(RECONNECT);
    });

    test.each([
        ["error in the response data", Object.assign(new Error("Request failed"), { response: { data: { error: "invalid_grant" } } })],
        ["error in the message", new Error("invalid_grant")],
    ])("invalid_grant (%s) deletes the saved token", async (_name, err) => {
        m.auth.refreshAccessToken.mockRejectedValue(err);
        await expect(getGmailClient(1)).rejects.toMatchObject(RECONNECT);
        expect(m.dbDelete).toHaveBeenCalledTimes(1);
    });

    test("invalid_grant still asks to reconnect when deleting the token fails", async () => {
        m.auth.refreshAccessToken.mockRejectedValue(new Error("invalid_grant"));
        m.dbDelete.mockRejectedValue(new Error("db down"));
        await expect(getGmailClient(1)).rejects.toMatchObject(RECONNECT);
    });
});

describe("getGmailClient: normal use", () => {
    test("refreshes the token and returns a Gmail v1 client", async () => {
        const client = await getGmailClient(1);

        expect(client).toBe(fakeGmail);
        expect(m.decrypt).toHaveBeenCalledWith("encrypted-blob");
        expect(m.OAuth2).toHaveBeenCalledWith("client-id", "client-secret", "https://example.com/callback");
        expect(m.auth.setCredentials).toHaveBeenNthCalledWith(1, { refresh_token: "refresh-1" });
        expect(m.auth.setCredentials).toHaveBeenLastCalledWith({ access_token: "access-1", refresh_token: "refresh-1" });
        expect(m.gmailFactory).toHaveBeenCalledWith({ version: "v1", auth: m.auth });
        expect(m.dbDelete).not.toHaveBeenCalled();
    });

    test.each([
        ["a network error", new Error("getaddrinfo ENOTFOUND oauth2.googleapis.com")],
        ["a Google server error", Object.assign(new Error("Backend Error"), { response: { status: 503, data: { error: "backend_error" } } })],
    ])("%s is passed on unchanged and the token is kept", async (_name, err) => {
        m.auth.refreshAccessToken.mockRejectedValue(err);
        await expect(getGmailClient(1)).rejects.toBe(err);
        expect(m.dbDelete).not.toHaveBeenCalled();
    });
});