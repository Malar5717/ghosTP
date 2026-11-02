import nodemailer from "nodemailer";
import "dotenv/config";

const testEmails = [
    {
        subject: "[ghosTP TEST] Your verification code",
        text: "Your verification code is 482913. It expires in 10 minutes.",
    },
    {
        subject: "[ghosTP TEST] Verify your email address",
        text: "Please verify your email address using code 739204.",
    },
    {
        subject: "[ghosTP TEST] Two-factor authentication",
        text: "Your security code is 582103.",
    },
    {
        subject: "[ghosTP TEST] Login OTP",
        text: "Use OTP 123456 to log in to your account.",
    },
    {
        subject: "[ghosTP TEST] Password reset code",
        text: "Your password reset code is 456789.",
    },
    {
        subject: "[ghosTP TEST] Your previous code expired",
        text: "Your previous verification code has expired. Request a new one.",
    },
    {
        subject: "[ghosTP TEST] Exclusive offer!",
        text: "Use code SAVE20 to get 20% off your next purchase.",
    },
    {
        subject: "[ghosTP TEST] Your order confirmation",
        text: "Your order number is 482913. Thank you for shopping!",
    },
    {
        subject: "[ghosTP TEST] Meeting tomorrow",
        text: "Hey! Are we still meeting tomorrow at 10 AM?",
    },
    {
        subject: "[ghosTP TEST] Digital footprint report",
        text: "Your digital footprint report is ready. Read it now!",
    },
];

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.SEED_EMAIL,
        pass: process.env.SEED_EMAIL_APP_PASSWORD,
    },
});

async function seedEmails() {
    console.log(`Sending ${testEmails.length} test emails to ${process.env.SEED_EMAIL} `);

    for (const email of testEmails) {
        await transporter.sendMail({
            from: process.env.SEED_EMAIL,
            to: process.env.SEED_EMAIL,
            subject: email.subject,
            text: email.text,
        });

        console.log(`Sent: ${email.subject} `);
    }

    console.log("Seeding complete!");
}

seedEmails().catch(console.error);
