const VERIFICATION_PHRASES = [
    "verification code",
    "verify your email",
    "verify your account",
    "verify code",
    "confirm your email",
    "confirm your account",
    "confirmation code",
    "security code",
    "authentication code",
    "auth code",
    "access code",
    "login code",
    "sign-in code",
    "sign in code",
    "one-time password",
    "one time password",
    "one-time passcode",
    "one-time code",
    "one time code",
    "passcode",
    "your code",
    "otp",
    "2fa",
    "two-factor",
    "two factor",
];

// Words that usually sit next to a real one-time code.
const CODE_WORDS = "code|otp|pin|passcode|verification|verify|confirm|confirmation|authenticate|authentication|auth|login|sign[- ]?in|2fa|two[- ]?factor";

// A code-shaped string: numeric (3-8 digits, possibly split) or alphanumeric (4-8 chars).
const NUMERIC_CODE = "(?:\\d{3}[- ]?\\d{3}|\\d{3,8})";
const ALPHANUM_CODE = "(?:[A-Za-z0-9]{4,8})";
const CODE_TOKEN = `(?:${NUMERIC_CODE}|${ALPHANUM_CODE})`;

// The number must be close to a code word, in either order.
// This stops years, prices and order numbers from counting as codes.
const CODE_REGEX = new RegExp(
    `\\b(?:${CODE_WORDS})\\b\\D{0,40}\\b${CODE_TOKEN}\\b|\\b${CODE_TOKEN}\\b\\D{0,40}\\b(?:${CODE_WORDS})\\b`
);

// Marketing or receipt words. They never reject an email, they only
// downgrade a Match to Unclear so the user decides.
const MARKETING_WORDS = [
    "newsletter", "unsubscribe", "sale", "offer", "discount", "deal",
    "invoice", "receipt", "order", "statement", "subscription", "promo",
];

const normalize = (value) => String(value ?? "").toLowerCase();

// Whole words only, so "otp" does not match "footprint".
const includesAny = (text, phrases) =>
    phrases.some((phrase) => {
        const escaped = phrase.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
        return new RegExp(`\\b${escaped}\\b`).test(text);
    });

export function classifyEmail({ subject, snippet } = {}) {
    const text = `${normalize(subject)} ${normalize(snippet)}`;

    const hasPhrase = includesAny(text, VERIFICATION_PHRASES);
    const hasCode = CODE_REGEX.test(text);
    const looksLikeMarketing = includesAny(text, MARKETING_WORDS);

    if (hasPhrase && hasCode) {
        if (looksLikeMarketing) {
            return { label: "Unclear", reason: "Looks like a code, but also like marketing or a receipt" };
        }
        return { label: "Match", reason: "Verification phrase and code found" };
    }

    if (hasCode && (includesAny(text, ["code", "otp", "pin", "passcode", "verification", "verify", "confirm", "confirmation", "auth", "2fa"]) || hasPhrase)) {
        if (looksLikeMarketing) {
            return { label: "Unclear", reason: "Looks like a code, but also like marketing or a receipt" };
        }
        return { label: "Unclear", reason: "Code found near verification context" };
    }

    if (hasPhrase) {
        return { label: "Unclear", reason: "Verification phrase found, but no code next to a code word" };
    }

    return { label: "Not a match", reason: "No verification signals" };
}