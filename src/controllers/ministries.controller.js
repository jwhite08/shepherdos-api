// src/controllers/ministries.controller.js
// Ministry dashboards: roster (subDepartments), volunteers, and volunteer scheduling.
// Giving/Event CRUD for a ministry goes through the existing finance/events
// controllers via an optional ministryId filter — not duplicated here.

import prisma from "../lib/prisma.js";

// ─── GET /api/ministries ──────────────────────────────────────
export async function getMinistries(req, res) {
  const { organizationId } = req.user;

  const ministries = await prisma.ministry.findMany({
    where: { organizationId },
    orderBy: { sortOrder: "asc" },
    include: {
      subDepartments: { orderBy: { sortOrder: "asc" } },
      _count: { select: { volunteers: true, events: true } },
    },
  });

  res.json({
    ministries: ministries.map(m => ({
      ...m,
      volunteerCount: m._count.volunteers,
      eventCount: m._count.events,
      _count: undefined,
    })),
  });
}

// ─── GET /api/ministries/:id ───────────────────────────────────
export async function getMinistryById(req, res) {
  const { organizationId } = req.user;
  const { id } = req.params;

  const ministry = await prisma.ministry.findFirst({
    where: { id, organizationId },
    include: {
      subDepartments: { orderBy: { sortOrder: "asc" } },
      _count: { select: { volunteers: true } },
    },
  });
  if (!ministry) return res.status(404).json({ error: "Ministry not found." });

  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);

  const [givingAgg, upcomingEventCount] = await Promise.all([
    prisma.contribution.aggregate({
      where: { organizationId, ministryId: id, date: { gte: yearStart } },
      _sum: { amount: true },
    }),
    prisma.event.count({
      where: { organizationId, ministryId: id, startDate: { gte: now } },
    }),
  ]);

  res.json({
    ...ministry,
    volunteerCount: ministry._count.volunteers,
    _count: undefined,
    ytdGiving: givingAgg._sum.amount || 0,
    upcomingEventCount,
  });
}

// ─── Volunteers ─────────────────────────────────────────────────

export async function listVolunteers(req, res) {
  const { organizationId } = req.user;
  const { id: ministryId } = req.params;

  const ministry = await prisma.ministry.findFirst({ where: { id: ministryId, organizationId } });
  if (!ministry) return res.status(404).json({ error: "Ministry not found." });

  const volunteers = await prisma.volunteer.findMany({
    where: { ministryId, organizationId },
    include: {
      member: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
      _count: { select: { schedules: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  res.json({
    volunteers: volunteers.map(v => ({ ...v, scheduleCount: v._count.schedules, _count: undefined })),
  });
}

export async function addVolunteer(req, res) {
  const { organizationId } = req.user;
  const { id: ministryId } = req.params;
  const { memberId, roleTitle, notes } = req.body;

  if (!memberId) return res.status(400).json({ error: "memberId is required." });

  const [ministry, member] = await Promise.all([
    prisma.ministry.findFirst({ where: { id: ministryId, organizationId } }),
    prisma.member.findFirst({ where: { id: memberId, organizationId } }),
  ]);
  if (!ministry) return res.status(404).json({ error: "Ministry not found." });
  if (!member)   return res.status(404).json({ error: "Member not found." });

  const existing = await prisma.volunteer.findUnique({
    where: { ministryId_memberId: { ministryId, memberId } },
  });
  if (existing) return res.status(409).json({ error: "This member is already a volunteer for this ministry." });

  const volunteer = await prisma.volunteer.create({
    data: { organizationId, ministryId, memberId, roleTitle: roleTitle?.trim() || null, notes: notes?.trim() || null },
    include: { member: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } } },
  });

  res.status(201).json(volunteer);
}

export async function updateVolunteer(req, res) {
  const { organizationId } = req.user;
  const { id: ministryId, volunteerId } = req.params;
  const { roleTitle, status, notes } = req.body;

  const existing = await prisma.volunteer.findFirst({ where: { id: volunteerId, ministryId, organizationId } });
  if (!existing) return res.status(404).json({ error: "Volunteer not found." });

  const updated = await prisma.volunteer.update({
    where: { id: volunteerId },
    data: {
      ...(roleTitle !== undefined && { roleTitle: roleTitle?.trim() || null }),
      ...(status    && { status }),
      ...(notes     !== undefined && { notes: notes?.trim() || null }),
    },
    include: { member: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } } },
  });

  res.json(updated);
}

export async function removeVolunteer(req, res) {
  const { organizationId } = req.user;
  const { id: ministryId, volunteerId } = req.params;

  const existing = await prisma.volunteer.findFirst({ where: { id: volunteerId, ministryId, organizationId } });
  if (!existing) return res.status(404).json({ error: "Volunteer not found." });

  await prisma.volunteer.delete({ where: { id: volunteerId } });
  res.json({ message: "Volunteer removed." });
}

// ─── Sub-Departments ────────────────────────────────────────────

export async function listSubDepartments(req, res) {
  const { organizationId } = req.user;
  const { id: ministryId } = req.params;

  const ministry = await prisma.ministry.findFirst({ where: { id: ministryId, organizationId } });
  if (!ministry) return res.status(404).json({ error: "Ministry not found." });

  const subDepartments = await prisma.subDepartment.findMany({
    where: { ministryId, organizationId },
    include: { _count: { select: { members: true } } },
    orderBy: { sortOrder: "asc" },
  });

  res.json({
    subDepartments: subDepartments.map(sd => ({ ...sd, memberCount: sd._count.members, _count: undefined })),
  });
}

export async function createSubDepartment(req, res) {
  const { organizationId } = req.user;
  const { id: ministryId } = req.params;
  const { name, ageRangeMin, ageRangeMax, sortOrder } = req.body;

  if (!name?.trim()) return res.status(400).json({ error: "name is required." });

  const ministry = await prisma.ministry.findFirst({ where: { id: ministryId, organizationId } });
  if (!ministry) return res.status(404).json({ error: "Ministry not found." });

  const subDepartment = await prisma.subDepartment.create({
    data: {
      organizationId,
      ministryId,
      name: name.trim(),
      ageRangeMin: ageRangeMin !== undefined && ageRangeMin !== "" ? parseInt(ageRangeMin) : null,
      ageRangeMax: ageRangeMax !== undefined && ageRangeMax !== "" ? parseInt(ageRangeMax) : null,
      sortOrder: sortOrder ?? 0,
    },
  });

  res.status(201).json(subDepartment);
}

export async function updateSubDepartment(req, res) {
  const { organizationId } = req.user;
  const { id: ministryId, subDepartmentId } = req.params;
  const { name, ageRangeMin, ageRangeMax, sortOrder } = req.body;

  const existing = await prisma.subDepartment.findFirst({ where: { id: subDepartmentId, ministryId, organizationId } });
  if (!existing) return res.status(404).json({ error: "Sub-department not found." });

  const updated = await prisma.subDepartment.update({
    where: { id: subDepartmentId },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(ageRangeMin !== undefined && { ageRangeMin: ageRangeMin === "" ? null : parseInt(ageRangeMin) }),
      ...(ageRangeMax !== undefined && { ageRangeMax: ageRangeMax === "" ? null : parseInt(ageRangeMax) }),
      ...(sortOrder !== undefined && { sortOrder }),
    },
  });

  res.json(updated);
}

export async function deleteSubDepartment(req, res) {
  const { organizationId } = req.user;
  const { id: ministryId, subDepartmentId } = req.params;

  const existing = await prisma.subDepartment.findFirst({ where: { id: subDepartmentId, ministryId, organizationId } });
  if (!existing) return res.status(404).json({ error: "Sub-department not found." });

  await prisma.subDepartment.delete({ where: { id: subDepartmentId } });
  res.json({ message: "Sub-department removed." });
}

// ─── Sub-Department Roster ─────────────────────────────────────

export async function listSubDepartmentMembers(req, res) {
  const { organizationId } = req.user;
  const { id: ministryId, subDepartmentId } = req.params;

  const subDepartment = await prisma.subDepartment.findFirst({ where: { id: subDepartmentId, ministryId, organizationId } });
  if (!subDepartment) return res.status(404).json({ error: "Sub-department not found." });

  const members = await prisma.memberSubDepartment.findMany({
    where: { subDepartmentId },
    include: {
      member: { select: { id: true, firstName: true, lastName: true, isMinor: true, memberStatus: true } },
    },
    orderBy: { joinedAt: "desc" },
  });

  res.json({ members });
}

export async function addSubDepartmentMember(req, res) {
  const { organizationId } = req.user;
  const { id: ministryId, subDepartmentId } = req.params;
  const { memberId, role } = req.body;

  if (!memberId) return res.status(400).json({ error: "memberId is required." });

  const [subDepartment, member] = await Promise.all([
    prisma.subDepartment.findFirst({ where: { id: subDepartmentId, ministryId, organizationId } }),
    prisma.member.findFirst({ where: { id: memberId, organizationId } }),
  ]);
  if (!subDepartment) return res.status(404).json({ error: "Sub-department not found." });
  if (!member)        return res.status(404).json({ error: "Member not found." });

  const existing = await prisma.memberSubDepartment.findUnique({
    where: { memberId_subDepartmentId: { memberId, subDepartmentId } },
  });
  if (existing) return res.status(409).json({ error: "This member is already in this sub-department." });

  const entry = await prisma.memberSubDepartment.create({
    data: { memberId, subDepartmentId, role: role?.trim() || null },
    include: { member: { select: { id: true, firstName: true, lastName: true, isMinor: true, memberStatus: true } } },
  });

  res.status(201).json(entry);
}

export async function removeSubDepartmentMember(req, res) {
  const { organizationId } = req.user;
  const { id: ministryId, subDepartmentId, memberId } = req.params;

  const subDepartment = await prisma.subDepartment.findFirst({ where: { id: subDepartmentId, ministryId, organizationId } });
  if (!subDepartment) return res.status(404).json({ error: "Sub-department not found." });

  const existing = await prisma.memberSubDepartment.findUnique({
    where: { memberId_subDepartmentId: { memberId, subDepartmentId } },
  });
  if (!existing) return res.status(404).json({ error: "Member is not in this sub-department." });

  await prisma.memberSubDepartment.delete({ where: { memberId_subDepartmentId: { memberId, subDepartmentId } } });
  res.json({ message: "Member removed from sub-department." });
}

// ─── Volunteer Schedule ───────────────────────────────────────

export async function listSchedule(req, res) {
  const { organizationId } = req.user;
  const { id: ministryId } = req.params;
  const { upcoming = "" } = req.query;

  const ministry = await prisma.ministry.findFirst({ where: { id: ministryId, organizationId } });
  if (!ministry) return res.status(404).json({ error: "Ministry not found." });

  const schedule = await prisma.volunteerSchedule.findMany({
    where: {
      organizationId,
      volunteer: { ministryId },
      ...(upcoming === "true" && { serveDate: { gte: new Date() } }),
    },
    include: {
      volunteer: {
        include: { member: { select: { id: true, firstName: true, lastName: true } } },
      },
      event: { select: { id: true, title: true, startDate: true } },
    },
    orderBy: { serveDate: "asc" },
  });

  res.json({ schedule });
}

export async function createScheduleEntry(req, res) {
  const { organizationId } = req.user;
  const { id: ministryId } = req.params;
  const { volunteerId, eventId, serveDate, role, notes } = req.body;

  if (!volunteerId) return res.status(400).json({ error: "volunteerId is required." });
  if (!serveDate)   return res.status(400).json({ error: "serveDate is required." });

  const volunteer = await prisma.volunteer.findFirst({ where: { id: volunteerId, ministryId, organizationId } });
  if (!volunteer) return res.status(404).json({ error: "Volunteer not found for this ministry." });

  if (eventId) {
    const event = await prisma.event.findFirst({ where: { id: eventId, organizationId } });
    if (!event) return res.status(404).json({ error: "Event not found." });
  }

  const entry = await prisma.volunteerSchedule.create({
    data: {
      organizationId,
      volunteerId,
      eventId: eventId || null,
      serveDate: new Date(serveDate),
      role: role?.trim() || null,
      notes: notes?.trim() || null,
    },
    include: {
      volunteer: { include: { member: { select: { id: true, firstName: true, lastName: true } } } },
      event: { select: { id: true, title: true, startDate: true } },
    },
  });

  res.status(201).json(entry);
}

export async function updateScheduleEntry(req, res) {
  const { organizationId } = req.user;
  const { id: ministryId, scheduleId } = req.params;
  const { eventId, serveDate, role, status, notes } = req.body;

  const existing = await prisma.volunteerSchedule.findFirst({
    where: { id: scheduleId, organizationId, volunteer: { ministryId } },
  });
  if (!existing) return res.status(404).json({ error: "Schedule entry not found." });

  if (eventId) {
    const event = await prisma.event.findFirst({ where: { id: eventId, organizationId } });
    if (!event) return res.status(404).json({ error: "Event not found." });
  }

  const updated = await prisma.volunteerSchedule.update({
    where: { id: scheduleId },
    data: {
      ...(eventId    !== undefined && { eventId: eventId || null }),
      ...(serveDate  && { serveDate: new Date(serveDate) }),
      ...(role       !== undefined && { role: role?.trim() || null }),
      ...(status     && { status }),
      ...(notes      !== undefined && { notes: notes?.trim() || null }),
    },
    include: {
      volunteer: { include: { member: { select: { id: true, firstName: true, lastName: true } } } },
      event: { select: { id: true, title: true, startDate: true } },
    },
  });

  res.json(updated);
}

export async function deleteScheduleEntry(req, res) {
  const { organizationId } = req.user;
  const { id: ministryId, scheduleId } = req.params;

  const existing = await prisma.volunteerSchedule.findFirst({
    where: { id: scheduleId, organizationId, volunteer: { ministryId } },
  });
  if (!existing) return res.status(404).json({ error: "Schedule entry not found." });

  await prisma.volunteerSchedule.delete({ where: { id: scheduleId } });
  res.json({ message: "Schedule entry removed." });
}
