// src/routes/memberAuth.js
// Separate auth flow for member self-registration and login.
// Members register using the email already on their member record.

import { Router }  from "express";
import bcrypt      from "bcryptjs";
import jwt         from "jsonwebtoken";
import prisma      from "../lib/prisma.js";

const router = Router();

// ─── POST /api/member-auth/register ──────────────────────────
// Member self-registration.
// Requires their email to already exist in the members table.
// Creates a User record with role MEMBER linked to that member.
router.post("/register", async (req, res) => {
  const { email, password, firstName, lastName } = req.body;

  if (!email?.trim())    return res.status(400).json({ error: "Email is required." });
  if (!password)         return res.status(400).json({ error: "Password is required." });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });

  const normalizedEmail = email.toLowerCase().trim();

  // Check if a user account already exists
  const existingUser = await prisma.user.findFirst({
    where: { email: normalizedEmail },
  });
  if (existingUser) {
    return res.status(409).json({ error: "An account with this email already exists. Please sign in." });
  }

  // Find the matching member record
  const member = await prisma.member.findFirst({
    where: { email: normalizedEmail },
    include: { organization: true },
  });

  if (!member) {
    return res.status(404).json({
      error: "We couldn't find a member record with that email address. Please contact your church administrator.",
    });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      organizationId: member.organizationId,
      email:          normalizedEmail,
      passwordHash,
      firstName:      firstName?.trim() || member.firstName,
      lastName:       lastName?.trim()  || member.lastName,
      role:           "MEMBER",
      memberId:       member.id,
    },
    include: { organization: true },
  });

  const token = jwt.sign(
    { userId: user.id, organizationId: user.organizationId, role: user.role, email: user.email, memberId: member.id },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );

  res.status(201).json({
    token,
    user: {
      id: user.id, email: user.email,
      firstName: user.firstName, lastName: user.lastName,
      role: user.role, memberId: member.id,
      organization: {
        id:           user.organization.id,
        name:         user.organization.name,
        slug:         user.organization.slug,
        primaryColor: user.organization.primaryColor,
        accentColor:  user.organization.accentColor,
      },
    },
  });
});

// ─── POST /api/member-auth/login ─────────────────────────────
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password are required." });

  const user = await prisma.user.findFirst({
    where: { email: email.toLowerCase().trim() },
    include: { organization: true },
  });

  if (!user) return res.status(401).json({ error: "Invalid email or password." });
  if (!user.isActive) return res.status(403).json({ error: "This account has been deactivated." });

  // Members should only use this endpoint; admins use /api/auth/login
  if (!["MEMBER","VOLUNTEER"].includes(user.role)) {
    return res.status(403).json({ error: "Please use the admin login." });
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) return res.status(401).json({ error: "Invalid email or password." });

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const token = jwt.sign(
    { userId: user.id, organizationId: user.organizationId, role: user.role, email: user.email, memberId: user.memberId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );

  res.json({
    token,
    user: {
      id: user.id, email: user.email,
      firstName: user.firstName, lastName: user.lastName,
      role: user.role, memberId: user.memberId,
      organization: {
        id:           user.organization.id,
        name:         user.organization.name,
        slug:         user.organization.slug,
        primaryColor: user.organization.primaryColor,
        accentColor:  user.organization.accentColor,
      },
    },
  });
});

// ─── POST /api/member-auth/accept-invite ──────────────────────
// Consumes an admin-issued PortalInvite token to create the
// member's portal account (replaces guessing at self-registration).
router.post("/accept-invite", async (req, res) => {
  const { token, password } = req.body;

  if (!token)               return res.status(400).json({ error: "Invite token is required." });
  if (!password)            return res.status(400).json({ error: "Password is required." });
  if (password.length < 8)  return res.status(400).json({ error: "Password must be at least 8 characters." });

  const invite = await prisma.portalInvite.findUnique({
    where: { token },
    include: { member: { include: { organization: true, user: true } } },
  });

  if (!invite)                return res.status(404).json({ error: "This invite link is invalid." });
  if (invite.usedAt)          return res.status(409).json({ error: "This invite has already been used. Please sign in." });
  if (invite.expiresAt < new Date()) return res.status(410).json({ error: "This invite link has expired. Ask your administrator to resend it." });
  if (invite.member.user)     return res.status(409).json({ error: "This member already has a portal account. Please sign in." });

  const passwordHash = await bcrypt.hash(password, 10);

  const [user] = await prisma.$transaction([
    prisma.user.create({
      data: {
        organizationId: invite.organizationId,
        email:          invite.email,
        passwordHash,
        firstName:      invite.member.firstName,
        lastName:       invite.member.lastName,
        role:           "MEMBER",
        memberId:       invite.memberId,
        lastLoginAt:    new Date(),
      },
      include: { organization: true },
    }),
    prisma.portalInvite.update({ where: { id: invite.id }, data: { usedAt: new Date() } }),
  ]);

  const jwtToken = jwt.sign(
    { userId: user.id, organizationId: user.organizationId, role: user.role, email: user.email, memberId: invite.memberId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );

  res.status(201).json({
    token: jwtToken,
    user: {
      id: user.id, email: user.email,
      firstName: user.firstName, lastName: user.lastName,
      role: user.role, memberId: invite.memberId,
      organization: {
        id:           user.organization.id,
        name:         user.organization.name,
        slug:         user.organization.slug,
        primaryColor: user.organization.primaryColor,
        accentColor:  user.organization.accentColor,
      },
    },
  });
});

// ─── POST /api/member-auth/reset-password ─────────────────────
// Consumes an admin-issued PasswordResetToken to set a new password.
router.post("/reset-password", async (req, res) => {
  const { token, password } = req.body;

  if (!token)               return res.status(400).json({ error: "Reset token is required." });
  if (!password)            return res.status(400).json({ error: "Password is required." });
  if (password.length < 8)  return res.status(400).json({ error: "Password must be at least 8 characters." });

  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { token },
    include: { user: { include: { organization: true } } },
  });

  if (!resetToken)               return res.status(404).json({ error: "This reset link is invalid." });
  if (resetToken.usedAt)         return res.status(409).json({ error: "This reset link has already been used." });
  if (resetToken.expiresAt < new Date()) return res.status(410).json({ error: "This reset link has expired. Ask your administrator to resend it." });

  const passwordHash = await bcrypt.hash(password, 10);

  const [user] = await prisma.$transaction([
    prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash, lastLoginAt: new Date() }, include: { organization: true } }),
    prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
  ]);

  const jwtToken = jwt.sign(
    { userId: user.id, organizationId: user.organizationId, role: user.role, email: user.email, memberId: user.memberId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );

  res.json({
    token: jwtToken,
    user: {
      id: user.id, email: user.email,
      firstName: user.firstName, lastName: user.lastName,
      role: user.role, memberId: user.memberId,
      organization: {
        id:           user.organization.id,
        name:         user.organization.name,
        slug:         user.organization.slug,
        primaryColor: user.organization.primaryColor,
        accentColor:  user.organization.accentColor,
      },
    },
  });
});

// ─── GET /api/member-auth/me ──────────────────────────────────
router.get("/me", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "Not authenticated." });
  try {
    const decoded = jwt.verify(authHeader.split(" ")[1], process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { organization: true },
    });
    if (!user) return res.status(404).json({ error: "User not found." });
    res.json({
      id: user.id, email: user.email,
      firstName: user.firstName, lastName: user.lastName,
      role: user.role, memberId: user.memberId,
      organization: user.organization,
    });
  } catch {
    res.status(401).json({ error: "Invalid token." });
  }
});

export default router;
