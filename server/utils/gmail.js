import { google } from "googleapis";
import { db } from "../db/index.js";
import { tokens } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { decrypt } from "./crypto.js";
import {
    getCachedAccessToken,
    setCachedAccessToken,
    clearCachedAccessToken,
} from "./accessTokenCache.js";

// Google access tokens normally last an hour. If the response does not say
// when it expires, assume a little less than that.
const DEFAULT_TOKEN_TTL_MS = 55 * 60 * 1000;

// The route checks for this code and shows "Reconnect Gmail".
function reconnectError(message = "Gmail needs to be reconnected") {
    const err = new Error(message);
    err.code = "GMAIL_RECONNECT_REQUIRED";
    return err;
}

export async function getGmailClient(userId) {
    const [tokenRow] = await db
        .select()
        .from(tokens)
        .where(eq(tokens.userId, userId))
        .limit(1);

    if (!tokenRow?.encryptedRefreshToken) {
        throw reconnectError();
    }

    let refreshToken;
    try {
        refreshToken = decrypt(tokenRow.encryptedRefreshToken);
    } catch (e) {
        // The saved token cannot be read (for example TOKEN_ENC_KEY changed).
        // Log the reason (never the token), and ask the user to reconnect.
        console.error("Could not decrypt the saved Gmail token:", e.message);
        throw reconnectError();
    }

    const auth = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );

    auth.setCredentials({ refresh_token: refreshToken });

    let accessToken = getCachedAccessToken(userId);

    if (!accessToken) {
        try {
            const { credentials } = await auth.refreshAccessToken();

            if (!credentials.access_token) {
                throw reconnectError("Google did not return an access token");
            }

            accessToken = credentials.access_token;
            const expiresAt =
                Number(credentials.expiry_date) || Date.now() + DEFAULT_TOKEN_TTL_MS;
            setCachedAccessToken(userId, accessToken, expiresAt);
        } catch (e) {
            const error = e.response?.data?.error || e.error || e.message;
            if (error === "invalid_grant") {
                clearCachedAccessToken(userId);
                try {
                    await db.delete(tokens).where(eq(tokens.userId, userId));
                } catch {}
                throw reconnectError();
            }
            throw e;
        }
    }

    auth.setCredentials({
        access_token: accessToken,
        refresh_token: refreshToken,
    });

    return google.gmail({ version: "v1", auth });
}