import { describe, test, expect } from "vitest";
import { classifyEmail } from "../utils/rules.js";

const label = (email) => classifyEmail(email).label;

describe("classifyEmail", () => {
    describe("Match: real one-time codes", () => {
        test.each([
            ["123456 is your verification code", "It expires in 10 minutes"],
            ["Welcome", "Your code is 482 913. Do not share it."],
            ["Your Swiggy OTP", "OTP 4821 to log in"],
            ["Your Amazon sign-in code", "Code: 4X9K2B"],
        ])("%s", (subject, snippet) => {
            expect(label({ subject, snippet })).toBe("Match");
        });
    });

    describe("Unclear: phrase but no code", () => {
        test.each([
            ["Confirm your email", "Click the button to finish signing up"],
            ["Verify your account", "Your Dec 2024 account is ready"],
        ])("%s", (subject, snippet) => {
            expect(label({ subject, snippet })).toBe("Unclear");
        });
    });

    describe("Unclear: looks like a code but also like marketing", () => {
        test("promo email", () => {
            expect(
                label({ subject: "Verify your email for 50% off", snippet: "Use code 4821, limited offer" })
            ).toBe("Unclear");
        });
    });

    describe("Not a match: ordinary mail", () => {
        test.each([
            ["Lunch?", "Please verify the plan, meet at 1300"],
            ["Your order has shipped", "Track order 123456 for delivery"],
            ["Weekly newsletter", "Your digital footprint in 2024"],
            ["Your statement", "Statement 20240101 is ready"],
        ])("%s", (subject, snippet) => {
            expect(label({ subject, snippet })).toBe("Not a match");
        });
    });

    describe("Bad input does not crash", () => {
        test("empty object", () => expect(label({})).toBe("Not a match"));
        test("undefined", () => expect(label(undefined)).toBe("Not a match"));
        test("null fields", () => expect(label({ subject: null, snippet: null })).toBe("Not a match"));
    });

    test("returns a reason", () => {
        const result = classifyEmail({ subject: "123456 is your verification code", snippet: "" });
        expect(result.reason).toBeTruthy();
    });
});