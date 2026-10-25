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
        throw new Error("No refresh token found for user");
    }

    const refreshToken = decrypt(tokenRow.encryptedRefreshToken);

    const auth = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );

    auth.setCredentials({ refresh_token: refreshToken });

    const { credentials } = await auth.refreshAccessToken();
    const accessToken = credentials.access_token;

    auth.setCredentials({
        access_token: accessToken,
        refresh_token: refreshToken,
    });

    if (!credentials.access_token) {
        throw new Error("Google did not return an access token");
    }

    return google.gmail({ version: "v1", auth });
}
