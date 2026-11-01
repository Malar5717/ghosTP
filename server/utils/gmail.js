import { google } from "googleapis";
import { db } from "../db/index.js";
import { tokens } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { decrypt } from "./crypto.js";

export async function getGmailClient(userId) {
    const [tokenRow] = await db
        .select()
        .from(tokens)
        .where(eq(tokens.userId, userId))
        .limit(1);

    if (!tokenRow?.encryptedRefreshToken) {
        const err = new Error("Gmail needs to be reconnected");
        err.code = "GMAIL_RECONNECT_REQUIRED";
        throw err;
    }

    const refreshToken = decrypt(tokenRow.encryptedRefreshToken);

    const auth = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );

    auth.setCredentials({ refresh_token: refreshToken });

    try {
        const { credentials } = await auth.refreshAccessToken();
        const accessToken = credentials.access_token;

        auth.setCredentials({
            access_token: accessToken,
            refresh_token: refreshToken,
        });

        if (!credentials.access_token) {
            const err = new Error("Google did not return an access token");
            err.code = "GMAIL_RECONNECT_REQUIRED";
            throw err;
        }

        return google.gmail({ version: "v1", auth });
    } catch (e) {
        const error = e.response?.data?.error || e.error || e.message;
        if (error === "invalid_grant") {
            try {
                await db.delete(tokens).where(eq(tokens.userId, userId));
            } catch {}
            const err = new Error("Gmail needs to be reconnected");
            err.code = "GMAIL_RECONNECT_REQUIRED";
            throw err;
        }
        throw e;
    }
}
