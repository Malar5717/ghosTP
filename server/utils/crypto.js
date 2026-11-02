import crypto from "crypto";

const ALGO = "aes-256-gcm";
const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;

function getKey() {
    const key = process.env.TOKEN_ENC_KEY;
    if (!key) throw new Error("TOKEN_ENC_KEY missing from .env");
    if (!/^[0-9a-fA-F]{64}$/.test(key)) throw new Error("TOKEN_ENC_KEY must be 64 hex chars (32 bytes)");
    return Buffer.from(key, "hex");
}

export function encrypt(plaintext) {
    if (!plaintext) throw new Error("Nothing to encrypt");
    const key = getKey();
    const nonce = crypto.randomBytes(NONCE_LENGTH); // GCM nonce
    const cipher = crypto.createCipheriv(ALGO, key, nonce, { authTagLength: TAG_LENGTH });
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    // iv + tag + ciphertext
    return Buffer.concat([nonce, tag, encrypted]).toString("base64");
}

export function decrypt(ciphertextB64) {
    if (!ciphertextB64) throw new Error("Nothing to decrypt");
    const key = getKey();
    const buf = Buffer.from(ciphertextB64, "base64");
    if (buf.length <= NONCE_LENGTH + TAG_LENGTH) throw new Error("Encrypted value is too short");
    const nonce = buf.subarray(0, NONCE_LENGTH);
    const tag = buf.subarray(NONCE_LENGTH, NONCE_LENGTH + TAG_LENGTH);
    const enc = buf.subarray(NONCE_LENGTH + TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGO, key, nonce, { authTagLength: TAG_LENGTH });
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(enc), decipher.final()]);
    return decrypted.toString("utf8");
}