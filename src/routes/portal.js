// src/routes/portal.js
// Member portal endpoints — members can only access their own data.
// All routes are protected and scoped to req.user.memberId.

import { Router } from "express";
import jwt        from "jsonwebtoken";
import prisma     from "../lib/prisma.js";

const router = Router();

// ─── Member auth middleware (portal-specific) ─────────────────
function requireMember(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "Not authenticated." });
  try {
    const decoded = jwt.verify(authHeader.split(" ")[1], process.env.JWT_SECRET);
    if (!decoded.memberId) return res.status(403).json({ error: "Member access required." });
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}

router.use(requireMember);

// ─── GET /api/portal/profile ──────────────────────────────────
router.get("/profile", async (req, res) => {
  const { memberId, organizationId } = req.user;

  const member = await prisma.member.findFirst({
    where: { id: memberId, organizationId },
    include: {
      family: {
        include: {
          members: {
            select: { id: true, firstName: true, lastName: true, isMinor: true, memberStatus: true, dateOfBirth: true },
            orderBy: [{ isMinor: "asc" }, { firstName: "asc" }],
          },
        },
      },
      subDepartments: {
        include: {
          subDepartment: {
            include: { ministry: { select: { name: true, icon: true } } },
          },
        },
      },
    },
  });

  if (!member) return res.status(404).json({ error: "Member record not found." });
  res.json(member);
});

// ─── PATCH /api/portal/profile ────────────────────────────────
// Members can update their own contact info only.
router.patch("/profile", async (req, res) => {
  const { memberId, organizationId } = req.user;
  const { phone, address, city, state, zip, email } = req.body;

  const updated = await prisma.member.update({
    where: { id: memberId },
    data: {
      ...(phone   !== undefined && { phone:   phone?.trim()   || null }),
      ...(address !== undefined && { address: address?.trim() || null }),
      ...(city    !== undefined && { city:    city?.trim()    || null }),
      ...(state   !== undefined && { state:   state?.trim()   || null }),
      ...(zip     !== undefined && { zip:     zip?.trim()     || null }),
      // Email update also updates the user account
      ...(email   !== undefined && email?.trim() && { email: email.toLowerCase().trim() }),
    },
  });

  // Keep user email in sync
  if (email?.trim()) {
    await prisma.user.updateMany({
      where: { memberId },
      data:  { email: email.toLowerCase().trim() },
    });
  }

  res.json(updated);
});

// ─── GET /api/portal/giving ───────────────────────────────────
router.get("/giving", async (req, res) => {
  const { memberId, organizationId } = req.user;
  const { year = new Date().getFullYear() } = req.query;

  const contributions = await prisma.contribution.findMany({
    where: {
      memberId,
      organizationId,
      date: {
        gte: new Date(`${year}-01-01`),
        lte: new Date(`${year}-12-31`),
      },
    },
    orderBy: { date: "desc" },
  });

  const total   = contributions.reduce((s, c) => s + Number(c.amount), 0);
  const byType  = {};
  contributions.forEach(c => { byType[c.type] = (byType[c.type] || 0) + Number(c.amount); });

  res.json({ contributions, total, byType, year: parseInt(year) });
});

// ─── GET /api/portal/events ───────────────────────────────────
// Upcoming events with this member's registration status.
router.get("/events", async (req, res) => {
  const { memberId, organizationId } = req.user;

  const events = await prisma.event.findMany({
    where: {
      organizationId,
      startDate: { gte: new Date() },
    },
    orderBy: { startDate: "asc" },
    include: {
      _count:       { select: { registrations: true } },
      registrations: {
        where: { memberId },
        select: { id: true, status: true, registeredAt: true },
      },
    },
  });

  res.json({
    events: events.map(e => ({
      ...e,
      registrationCount: e._count.registrations,
      myRegistration:    e.registrations[0] || null,
      registrations:     undefined,
      _count:            undefined,
    })),
  });
});

// ─── POST /api/portal/events/:id/register ────────────────────
router.post("/events/:id/register", async (req, res) => {
  const { memberId, organizationId } = req.user;
  const { id: eventId } = req.params;

  const event = await prisma.event.findFirst({
    where: { id: eventId, organizationId },
    include: { _count: { select: { registrations: true } } },
  });
  if (!event) return res.status(404).json({ error: "Event not found." });

  const existing = await prisma.eventRegistration.findUnique({
    where: { eventId_memberId: { eventId, memberId } },
  });
  if (existing) return res.status(409).json({ error: "You are already registered for this event." });

  const isFull = event.capacity && event._count.registrations >= event.capacity;
  const status = isFull ? "WAITLISTED" : "REGISTERED";

  const reg = await prisma.eventRegistration.create({
    data: { organizationId, eventId, memberId, status },
  });

  res.status(201).json({ registration: reg, waitlisted: isFull });
});

// ─── DELETE /api/portal/events/:id/register ──────────────────
router.delete("/events/:id/register", async (req, res) => {
  const { memberId } = req.user;
  const { id: eventId } = req.params;

  const reg = await prisma.eventRegistration.findUnique({
    where: { eventId_memberId: { eventId, memberId } },
  });
  if (!reg) return res.status(404).json({ error: "Registration not found." });

  await prisma.eventRegistration.delete({ where: { id: reg.id } });
  res.json({ message: "Registration cancelled." });
});

// ─── GET /api/portal/family/checkins ─────────────────────────
// Recent child check-in history for this member's family.
router.get("/family/checkins", async (req, res) => {
  const { memberId, organizationId } = req.user;

  const member = await prisma.member.findFirst({
    where: { id: memberId, organizationId },
    select: { familyId: true },
  });

  if (!member?.familyId) return res.json({ checkIns: [] });

  // Get all minors in the same family
  const familyMinors = await prisma.member.findMany({
    where: { familyId: member.familyId, isMinor: true, organizationId },
    select: { id: true, firstName: true, lastName: true },
  });

  const checkIns = await prisma.checkIn.findMany({
    where: { memberId: { in: familyMinors.map(m => m.id) } },
    include: {
      member:       { select: { firstName: true, lastName: true } },
      subDepartment:{ select: { name: true } },
    },
    orderBy: { checkedInAt: "desc" },
    take: 30,
  });

  res.json({ checkIns, familyMinors });
});

export default router;
