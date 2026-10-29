import { Router } from "express";
import { google } from "googleapis";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "../db/index.js";
import { users, tokens, activity } from "../db/schema.js";
import { encrypt, decrypt } from "../utils/crypto.js";

function generateState() {
  return randomBytes(32).toString("hex");
}

const router = Router();

// permissions
const SCOPES = [
  "openid", // OIDC authentication
  "https://www.googleapis.com/auth/userinfo.email", // access to the user's email identity info
  "https://www.googleapis.com/auth/gmail.modify", // allows Gmail operations
];

// Fresh client per request: a module-level singleton would leak one user's
// credentials into another user's request via setCredentials().
function createOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID, // identifies ghosTP
    process.env.GOOGLE_CLIENT_SECRET, // authenticates ghosTP
    process.env.GOOGLE_REDIRECT_URI // after authorization
  );
}

router.get("/google", async (req, res) => {
  try {
    const state = generateState();
    const oAuth2Client = createOAuthClient();
    const { codeVerifier, codeChallenge } = await oAuth2Client.generateCodeVerifierAsync();

    // Save the temporary values in the session
    req.session.oauth = {
      state,
      codeVerifier,
    };

    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: "offline",
      scope: SCOPES,
      prompt: "consent",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

    req.session.save((err) => {
      if (err) {
        console.error("Failed to save session before OAuth redirect", err);
        return res.status(500).send("Session error");
      }
      // saves the session before redirecting
      res.redirect(authUrl);
    });
  } catch (e) {
    console.error("Failed to start OAuth flow", e);
    res.status(500).send("OAuth failed");
  }
});

router.get("/google/callback", async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code || !state) return res.status(400).send("Missing code/state");
    if (!req.session.oauth?.state || req.session.oauth.state !== state) {
      return res.status(400).send("Invalid state");
    }

    const { codeVerifier } = req.session.oauth;
    // the verifier is needed for this exchange, but it shouldn't remain in the session unnecessarily after use.
    delete req.session.oauth;

    const oAuth2Client = createOAuthClient();

    // handles the token request
    // Exchange code for tokens
    const { tokens: googleTokens } = await oAuth2Client.getToken({
      code,
      codeVerifier,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    });
    oAuth2Client.setCredentials(googleTokens);
    // the client object handle the full OAuth flow

    // Get user info
    const ticket = await oAuth2Client.verifyIdToken({
      idToken: googleTokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const googleId = payload.sub;
    const email = payload.email;

    // Upsert user
    let user;
    const existing = await db.select().from(users).where(eq(users.googleId, googleId)).limit(1);
    if (existing.length > 0) {
      user = existing[0];
      // Keep the stored email in sync (users can change their Gmail address).
      const [updated] = await db
        .update(users)
        .set({ email, updatedAt: new Date() })
        .where(eq(users.id, user.id))
        .returning();
      user = updated;
    } else {
      const [created] = await db.insert(users).values({ googleId, email }).returning();
      user = created;
    }

    // Encrypt and store refresh token if present (only first time / when consent forces it)
    if (googleTokens.refresh_token) {
      const encrypted = encrypt(googleTokens.refresh_token);
      await db
        .insert(tokens)
        .values({ userId: user.id, encryptedRefreshToken: encrypted })
        .onConflictDoUpdate({
          target: tokens.userId,
          set: { encryptedRefreshToken: encrypted, updatedAt: new Date() },
        });
    }

    // Put minimal user in session
    req.session.user = { id: user.id, email: user.email, googleId: user.googleId };

    req.session.save((err) => {
      if (err) {
        console.error("Failed to save session after login", err);
        return res.status(500).send("Session error");
      }
      // Redirect back to frontend
      res.redirect(process.env.CLIENT_ORIGIN || "http://localhost:5173");
    });
  } catch (e) {
    console.error("OAuth callback error", e);
    res.status(500).send("OAuth failed");
  }
});

router.get("/me", (req, res) => {
  if (!req.session.user) return res.status(401).json({ authenticated: false });
  res.json({ authenticated: true, user: req.session.user });
});

router.get("/disconnect", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ authenticated: false });
    }

    const userId = req.session.user.id;

    const [tokenRow] = await db
      .select()
      .from(tokens)
      .where(eq(tokens.userId, userId))
      .limit(1);

    if (tokenRow?.encryptedRefreshToken) {
      try {
        const refreshToken = decrypt(tokenRow.encryptedRefreshToken);
        await fetch("https://oauth2.googleapis.com/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: refreshToken }),
        });
      } catch (e) {
        console.error("Failed to revoke token at Google:", e.message);
      }

      await db.delete(tokens).where(eq(tokens.userId, userId));
    }

    // Disconnect deletes stored data. Activity rows are kept so the log
    // survives a reconnect, but the email content (subject/sender) is scrubbed.
    await db
      .update(activity)
      .set({ subject: null, sender: null })
      .where(eq(activity.userId, userId));

    req.session.destroy((err) => {
      if (err) {
        console.error("Disconnect session destroy error", err);
        return res.status(500).json({ ok: false });
      }
      res.clearCookie("connect.sid");
      res.json({ ok: true });
    });
  } catch (e) {
    console.error("Disconnect error", e);
    res.status(500).json({ ok: false });
  }
});

router.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Logout error", err);
      return res.status(500).send("Logout failed");
    }
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});

export default router;