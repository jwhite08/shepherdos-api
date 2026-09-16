// src/routes/auth.js

import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma.js";
import { GLOBAL_ROLES } from "../lib/scope.js";

const router = Router();

// Serializes the authenticated user for the client, including the permission
// data the frontend needs to decide what to render. Kept in one place so the
// login and /me responses can't drift apart.
function serializeUser(user) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    canViewFinance: user.canViewFinance,
    hasGlobalAccess: GLOBAL_ROLES.includes(user.role),
    ministryAccess: (user.ministryAccess ?? []).map(a => ({
      ministryId:  a.ministry.id,
      name:        a.ministry.name,
      accessLevel: a.accessLevel,
    })),
    organization: {
      id: user.organization.id,
      name: user.organization.name,
      slug: user.organization.slug,
      primaryColor: user.organization.primaryColor,
      accentColor: user.organization.accentColor,
    },
  };
}

const AUTH_USER_INCLUDE = {
  organization: true,
  ministryAccess: { include: { ministry: { select: { id: true, name: true } } } },
};


// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  try {
    const user = await prisma.user.findFirst({
      where: { email: email.toLowerCase().trim() },
      include: AUTH_USER_INCLUDE,
    });

    if (!user) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: "This account has been deactivated." });
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    // Update last login timestamp
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const token = jwt.sign(
      {
        userId: user.id,
        organizationId: user.organizationId,
        role: user.role,
        email: user.email,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    res.json({ token, user: serializeUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed. Please try again." });
  }
});

// GET /api/auth/me — returns current user from token
router.get("/me", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Not authenticated." });
  }
  try {
    const decoded = jwt.verify(authHeader.split(" ")[1], process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: AUTH_USER_INCLUDE,
    });
    if (!user) return res.status(404).json({ error: "User not found." });
    res.json(serializeUser(user));
  } catch {
    res.status(401).json({ error: "Invalid token." });
  }
});

export default router;
