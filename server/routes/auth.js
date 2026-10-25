import { Router } from "express";
import { OAuth2Client } from "google-auth-library";
import { eq } from "drizzle-orm";
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
} from "../utils/pkce.js";
import { db } from "../db/index.js";
import { users, tokens } from "../db/schema.js";
import { encrypt, decrypt } from "../utils/crypto.js";

const router = Router();

const SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/gmail.modify",
];

const oAuth2Client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

router.get("/google", (req, res) => {
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  req.session.oauth = {
    state,
    codeVerifier,
  };

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
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
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  });
});

router.get("/google/callback", async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code || !state) return res.status(400).send("Missing code/state");
    if (!req.session.oauth?.state || req.session.oauth.state !== state) {
      return res.status(400).send("Invalid state");
    }

    const { codeVerifier } = req.session.oauth;
    delete req.session.oauth;

    // Exchange code for tokens
    const { tokens: googleTokens } = await oAuth2Client.getToken({
      code,
      codeVerifier,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    });
    oAuth2Client.setCredentials(googleTokens);

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
      await db.update(users).set({ updatedAt: new Date() }).where(eq(users.id, user.id));
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