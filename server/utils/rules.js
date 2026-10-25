const VERIFICATION_PHRASES = [
    "verification code",
    "verify your email",
    "verify your account",
    "confirm your email",
    "confirm your account",
    "security code",
    "login code",
    "sign-in code",
    "sign in code",
    "one-time password",
    "one time password",
    "one-time passcode",
    "one-time code",
    "one time code",
    "otp",
    "2fa",
];

// Matches 4-8 digits, or grouped digits: 123456, 123 456, 123-456
const CODE_REGEX = /\b\d{3}[- ]?\d{3}\b|\b\d{4,8}\b/;

function normalize(value = "") {
    return String(value).toLowerCase();
}

function includesAny(text, phrases) {
    return phrases.some((phrase) => text.includes(phrase));
}

export function classifyEmail({ subject = "", snippet = "" }) {
    const text = `${normalize(subject)} ${normalize(snippet)}`;

    const hasVerificationPhrase = includesAny(text, VERIFICATION_PHRASES);
    const hasCode = CODE_REGEX.test(text);

    if (hasVerificationPhrase && hasCode) {
        return { label: "Match", reason: "Verification phrase and code found" };
    }

    if (hasVerificationPhrase) {
        return { label: "Unclear", reason: "Verification phrase found, but no code-shaped number" };
    }

    return { label: "Not a match", reason: "No verification signals" };
}