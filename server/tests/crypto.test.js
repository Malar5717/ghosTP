import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { encrypt, decrypt } from "../utils/crypto.js";

const KEY_A = "a".repeat(64);
const KEY_B = "b".repeat(64);
const original = process.env.TOKEN_ENC_KEY;

beforeEach(() => {
    process.env.TOKEN_ENC_KEY = KEY_A;
});

afterEach(() => {
    if (original === undefined) delete process.env.TOKEN_ENC_KEY;
    else process.env.TOKEN_ENC_KEY = original;
});

// Flip one character in the middle of a base64 string.
const tamper = (b64, index) => {
    const bytes = Buffer.from(b64, "base64");
    bytes[index] ^= 1;
    return bytes.toString("base64");
};

describe("encrypt / decrypt", () => {
    test("round trip returns the original text", () => {
        const token = "1//0gRefreshTokenExample-abc_123";
        expect(decrypt(encrypt(token))).toBe(token);
    });

    test("works with unicode text", () => {
        expect(decrypt(encrypt("héllo 👻 日本語"))).toBe("héllo 👻 日本語");
    });

    test("same text gives a different result each time (random nonce)", () => {
        expect(encrypt("same")).not.toBe(encrypt("same"));
    });

    test("the output does not contain the plain text", () => {
        const out = encrypt("super-secret-token");
        expect(out).not.toContain("super-secret-token");
        expect(Buffer.from(out, "base64").toString("utf8")).not.toContain("super-secret-token");
    });
});

describe("failures", () => {
    test("wrong key cannot decrypt", () => {
        const out = encrypt("token");
        process.env.TOKEN_ENC_KEY = KEY_B;
        expect(() => decrypt(out)).toThrow();
    });

    test("tampered ciphertext is rejected", () => {
        const out = encrypt("a-long-enough-token-value");
        expect(() => decrypt(tamper(out, 30))).toThrow();
    });

    test("tampered tag is rejected", () => {
        const out = encrypt("token");
        expect(() => decrypt(tamper(out, 15))).toThrow();
    });

    test("tampered nonce is rejected", () => {
        const out = encrypt("token");
        expect(() => decrypt(tamper(out, 2))).toThrow();
    });

    test("truncated input is rejected", () => {
        expect(() => decrypt(encrypt("token").slice(0, 20))).toThrow();
    });

    test("empty input is rejected", () => {
        expect(() => encrypt("")).toThrow("Nothing to encrypt");
        expect(() => decrypt("")).toThrow("Nothing to decrypt");
    });
});

describe("key checks", () => {
    test("missing key", () => {
        delete process.env.TOKEN_ENC_KEY;
        expect(() => encrypt("x")).toThrow("TOKEN_ENC_KEY missing");
    });

    test("wrong length", () => {
        process.env.TOKEN_ENC_KEY = "abc123";
        expect(() => encrypt("x")).toThrow("64 hex");
    });

    test("64 characters that are not hex", () => {
        process.env.TOKEN_ENC_KEY = "z".repeat(64);
        expect(() => encrypt("x")).toThrow("64 hex");
    });
});

describe("input checks", () => {
    test("a value that is too short gives a clear error", () => {
        expect(() => decrypt(Buffer.alloc(10).toString("base64"))).toThrow("too short");
    });
});