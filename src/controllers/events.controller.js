// src/controllers/events.controller.js
// Handles event CRUD, registration management, and attendance marking.

import prisma from "../lib/prisma.js";
import { ministryFilter, canViewMinistry, assertCanManage } from "../lib/scope.js";

const EVENT_TYPES = ["Worship","Study","Youth","Conference","Fellowship","Training","Outreach","General"];

// ─── GET /api/events ──────────────────────────────────────────
// Returns paginated events for the org, with registration counts.
export async function getEvents(req, res) {
  const { organizationId } = req.user;
  const {
    page    = 1,
    limit   = 20,
    search  = "",
    type    = "",
    ministryId = "",
    upcoming = "",    // "true" = only future events
    past     = "",    // "true" = only past events
  } = req.query;

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const now  = new Date();

  // Events with no ministryId are church-wide and visible to everyone;
  // ministry-tagged events are restricted to users granted that ministry.
  const scopeFilter = ministryFilter(req.scope, { includeUntagged: true });

  const where = {
    organizationId,
    ...(type       && { type }),
    ...(ministryId && { ministryId }),
    ...(search && { title: { contains: search, mode: "insensitive" } }),
    ...(upcoming === "true" && { startDate: { gte: now } }),
    ...(past     === "true" && { startDate: { lt:  now } }),
    // Spread last so the scope filter can't be overridden by a query param.
    ...scopeFilter,
  };

  const [events, total] = await Promise.all([
    prisma.event.findMany({
      where,
      skip,
      take: parseInt(limit),
      orderBy: { startDate: upcoming === "true" ? "asc" : "desc" },
      include: {
        _count: { select: { registrations: true } },
      },
    }),
    prisma.event.count({ where }),
  ]);

  res.json({
    events: events.map(e => ({
      ...e,
      registrationCount: e._count.registrations,
      _count: undefined,
    })),
    pagination: {
      total,
      page:       parseInt(page),
      limit:      parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit)),
    },
  });
}

// ─── GET /api/events/:id ──────────────────────────────────────
export async function getEventById(req, res) {
  const { organizationId } = req.user;
  const { id } = req.params;

  // Scope is applied to the lookup itself rather than after fetching, so an
  // out-of-scope id is indistinguishable from a nonexistent one.
  const event = await prisma.event.findFirst({
    where: {
      id,
      organizationId,
      ...ministryFilter(req.scope, { includeUntagged: true }),
    },
    include: {
      registrations: {
        include: {
          member: {
            select: { id: true, firstName: true, lastName: true, email: true, phone: true, isMinor: true },
          },
        },
        orderBy: { registeredAt: "asc" },
      },
      _count: { select: { registrations: true } },
    },
  });

  if (!event) return res.status(404).json({ error: "Event not found." });

  res.json({
    ...event,
    registrationCount: event._count.registrations,
    _count: undefined,
  });
}

// ─── POST /api/events ─────────────────────────────────────────
export async function createEvent(req, res) {
  const { organizationId } = req.user;
  const {
    title, description, location,
    startDate, endDate, capacity,
    type, isRecurring, recurringRule,
    ministryId,
  } = req.body;

  if (!title?.trim())  return res.status(400).json({ error: "Event title is required." });
  if (!startDate)      return res.status(400).json({ error: "Start date is required." });

  if (ministryId) {
    const ministry = await prisma.ministry.findFirst({ where: { id: ministryId, organizationId } });
    if (!ministry) return res.status(404).json({ error: "Ministry not found." });
  }

  const event = await prisma.event.create({
    data: {
      organizationId,
      ministryId:   ministryId || null,
      title:        title.trim(),
      description:  description?.trim()  || null,
      location:     location?.trim()     || null,
      startDate:    new Date(startDate),
      endDate:      endDate  ? new Date(endDate)  : null,
      capacity:     capacity ? parseInt(capacity) : null,
      type:         type || "General",
      isRecurring:  isRecurring  || false,
      recurringRule: recurringRule?.trim() || null,
    },
    include: {
      _count: { select: { registrations: true } },
    },
  });

  res.status(201).json({ ...event, registrationCount: event._count.registrations, _count: undefined });
}

// ─── PATCH /api/events/:id ────────────────────────────────────
export async function updateEvent(req, res) {
  const { organizationId } = req.user;
  const { id } = req.params;

  const existing = await prisma.event.findFirst({ where: { id, organizationId } });
  if (!existing) return res.status(404).json({ error: "Event not found." });

  // Editing requires MANAGE on the event's ministry. Church-wide events
  // (no ministryId) are admin-only, which canManageMinistry already enforces
  // by returning false for a null ministry.
  const updateError = assertCanManage(req.scope, existing.ministryId);
  if (updateError) return res.status(403).json({ error: updateError });

  const {
    title, description, location,
    startDate, endDate, capacity,
    type, isRecurring, recurringRule,
    ministryId,
  } = req.body;

  if (ministryId) {
    const ministry = await prisma.ministry.findFirst({ where: { id: ministryId, organizationId } });
    if (!ministry) return res.status(404).json({ error: "Ministry not found." });
  }

  const updated = await prisma.event.update({
    where: { id },
    data: {
      ...(title        && { title: title.trim() }),
      ...(description  !== undefined && { description: description?.trim() || null }),
      ...(location     !== undefined && { location:    location?.trim()    || null }),
      ...(startDate    && { startDate: new Date(startDate) }),
      ...(endDate      !== undefined && { endDate: endDate ? new Date(endDate) : null }),
      ...(capacity     !== undefined && { capacity: capacity ? parseInt(capacity) : null }),
      ...(type         && { type }),
      ...(isRecurring  !== undefined && { isRecurring }),
      ...(recurringRule !== undefined && { recurringRule: recurringRule?.trim() || null }),
      ...(ministryId   !== undefined && { ministryId: ministryId || null }),
    },
    include: {
      _count: { select: { registrations: true } },
    },
  });

  res.json({ ...updated, registrationCount: updated._count.registrations, _count: undefined });
}

// ─── DELETE /api/events/:id ───────────────────────────────────
export async function deleteEvent(req, res) {
  const { organizationId } = req.user;
  const { id } = req.params;

  const existing = await prisma.event.findFirst({ where: { id, organizationId } });
  if (!existing) return res.status(404).json({ error: "Event not found." });

  const deleteError = assertCanManage(req.scope, existing.ministryId);
  if (deleteError) return res.status(403).json({ error: deleteError });

  await prisma.event.delete({ where: { id } });
  res.json({ message: "Event deleted." });
}

// ─── GET /api/events/:id/registrations ───────────────────────
export async function getRegistrations(req, res) {
  const { organizationId } = req.user;
  const { id } = req.params;

  const event = await prisma.event.findFirst({
    where: { id, organizationId, ...ministryFilter(req.scope, { includeUntagged: true }) },
  });
  if (!event) return res.status(404).json({ error: "Event not found." });

  const registrations = await prisma.eventRegistration.findMany({
    where: { eventId: id },
    include: {
      member: {
        select: { id: true, firstName: true, lastName: true, email: true, phone: true, isMinor: true },
      },
    },
    orderBy: { registeredAt: "asc" },
  });

  res.json({ registrations, event });
}

// ─── POST /api/events/:id/register ───────────────────────────
// Register a member for an event.
export async function registerMember(req, res) {
  const { organizationId } = req.user;
  const { id: eventId } = req.params;
  const { memberId, notes } = req.body;

  if (!memberId) return res.status(400).json({ error: "memberId is required." });

  const [event, member] = await Promise.all([
    prisma.event.findFirst({
      where: { id: eventId, organizationId, ...ministryFilter(req.scope, { includeUntagged: true }) },
      include: { _count: { select: { registrations: true } } },
    }),
    prisma.member.findFirst({ where: { id: memberId, organizationId } }),
  ]);

  if (!event)  return res.status(404).json({ error: "Event not found." });
  if (!member) return res.status(404).json({ error: "Member not found." });

  // Check for existing registration
  const existing = await prisma.eventRegistration.findUnique({
    where: { eventId_memberId: { eventId, memberId } },
  });
  if (existing) return res.status(409).json({ error: "This member is already registered for this event." });

  // Check capacity — auto-waitlist if full
  const isFull   = event.capacity && event._count.registrations >= event.capacity;
  const status   = isFull ? "WAITLISTED" : "REGISTERED";

  const registration = await prisma.eventRegistration.create({
    data: { organizationId, eventId, memberId, status, notes: notes?.trim() || null },
    include: {
      member: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });

  res.status(201).json({ registration, waitlisted: isFull });
}

// ─── PATCH /api/events/:id/registrations/:regId ───────────────
// Update a registration status (e.g. mark attended, cancel, move off waitlist).
export async function updateRegistration(req, res) {
  const { organizationId } = req.user;
  const { id: eventId, regId } = req.params;
  const { status, notes, checkedInAt } = req.body;

  const reg = await prisma.eventRegistration.findFirst({
    where: { id: regId, eventId, organizationId },
  });
  if (!reg) return res.status(404).json({ error: "Registration not found." });

  const updated = await prisma.eventRegistration.update({
    where: { id: regId },
    data: {
      ...(status      && { status }),
      ...(notes       !== undefined && { notes: notes?.trim() || null }),
      ...(checkedInAt !== undefined && { checkedInAt: checkedInAt ? new Date(checkedInAt) : null }),
    },
    include: {
      member: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });

  res.json(updated);
}

// ─── DELETE /api/events/:id/registrations/:regId ─────────────
export async function cancelRegistration(req, res) {
  const { organizationId } = req.user;
  const { id: eventId, regId } = req.params;

  const reg = await prisma.eventRegistration.findFirst({
    where: { id: regId, eventId, organizationId },
  });
  if (!reg) return res.status(404).json({ error: "Registration not found." });

  await prisma.eventRegistration.delete({ where: { id: regId } });

  // If someone was waitlisted, promote the first waitlisted person
  if (reg.status === "REGISTERED" ) {
    const nextWaitlisted = await prisma.eventRegistration.findFirst({
      where: { eventId, status: "WAITLISTED" },
      orderBy: { registeredAt: "asc" },
    });
    if (nextWaitlisted) {
      await prisma.eventRegistration.update({
        where: { id: nextWaitlisted.id },
        data:  { status: "REGISTERED" },
      });
    }
  }

  res.json({ message: "Registration cancelled." });
}

// ─── GET /api/events/types ────────────────────────────────────
export async function getEventTypes(req, res) {
  res.json({ types: EVENT_TYPES });
}
