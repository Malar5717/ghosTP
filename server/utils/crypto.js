import crypto from "crypto";

const ALGO = "aes-256-gcm";

function getKey() {
    const key = process.env.TOKEN_ENC_KEY;
    if (!key) throw new Error("TOKEN_ENC_KEY missing from .env");
    if (key.length !== 64) throw new Error("TOKEN_ENC_KEY must be 64 hex chars (32 bytes)");
    return Buffer.from(key, "hex");
}

export function encrypt(plaintext) {
    if (!plaintext) throw new Error("Nothing to encrypt");
    const key = getKey();
    const nonce = crypto.randomBytes(12); // GCM nonce
    const cipher = crypto.createCipheriv(ALGO, key, nonce);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    // iv + tag + ciphertext
    return Buffer.concat([nonce, tag, encrypted]).toString("base64");
}

export function decrypt(ciphertextB64) {
    if (!ciphertextB64) throw new Error("Nothing to decrypt");
    const key = getKey();
    const buf = Buffer.from(ciphertextB64, "base64");
    const nonce = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = crypto.createDecipheriv(ALGO, key, nonce);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(enc), decipher.final()]);
    return decrypted.toString("utf8");
}