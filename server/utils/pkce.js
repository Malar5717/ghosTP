import {
    randomBytes,
    createHash,
} from "crypto";

export function generateCodeVerifier() {
    return randomBytes(32).toString("base64url");
}

export function generateCodeChallenge(verifier) {
    return createHash("sha256")
        .update(verifier)
        .digest("base64url");
}

export function generateState() {
    return randomBytes(32).toString("hex");
}
