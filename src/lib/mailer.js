// src/lib/mailer.js
// Generic SMTP mailer — works with Gmail, SendGrid/Mailgun/Resend SMTP
// relays, Mailtrap, or any other SMTP provider via env vars.
// If SMTP isn't configured (e.g. local dev), emails are logged to the
// console instead of thrown as an error so the rest of the flow still works.

import nodemailer from "nodemailer";

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;

const transporter = SMTP_HOST
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT || "587"),
      secure: SMTP_PORT === "465",
      auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    })
  : null;

export async function sendMail({ to, subject, html }) {
  if (!transporter) {
    console.warn(`\n[mailer] SMTP not configured — simulating email instead of sending.\nTo: ${to}\nSubject: ${subject}\n${html}\n`);
    return { simulated: true };
  }
  return transporter.sendMail({ from: SMTP_FROM || SMTP_USER, to, subject, html });
}

export function portalInviteEmail({ orgName, memberFirstName, link }) {
  return {
    subject: `You're invited to the ${orgName} Member Portal`,
    html: `
      <p>Hi ${memberFirstName},</p>
      <p>${orgName} has invited you to create your Member Portal account, where you can view your giving history, register for events, and manage your family's info.</p>
      <p><a href="${link}">Click here to set up your account</a></p>
      <p>This link expires in 7 days.</p>
    `,
  };
}

export function staffInviteEmail({ orgName, firstName, link }) {
  return {
    subject: `You're invited to join ${orgName} on ShepherdOS`,
    html: `
      <p>Hi ${firstName},</p>
      <p>${orgName} has invited you to join their ShepherdOS staff platform.</p>
      <p><a href="${link}">Click here to set up your account</a></p>
      <p>This link expires in 7 days.</p>
    `,
  };
}

export function passwordResetEmail({ orgName, memberFirstName, link }) {
  return {
    subject: `Reset your ${orgName} Member Portal password`,
    html: `
      <p>Hi ${memberFirstName},</p>
      <p>An administrator at ${orgName} requested a password reset for your Member Portal account.</p>
      <p><a href="${link}">Click here to set a new password</a></p>
      <p>This link expires in 24 hours. If you didn't expect this, you can ignore it.</p>
    `,
  };
}
