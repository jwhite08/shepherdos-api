// src/controllers/attendance.controller.js
// Handles two distinct flows:
//   1. Adult member check-in  → AttendanceLog records
//   2. Child secure check-in  → CheckIn records with security codes

import prisma from "../lib/prisma.js";
import { ministryFilter, nestedMinistryFilter, canManageMinistry } from "../lib/scope.js";

// ─── Helper: generate a unique security code ─────────────────
function generateSecurityCode(orgName) {
  const prefix = orgName
    .split(" ")
    .map(w => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 3);
  const digits = String(Math.floor(Math.random() * 9000) + 1000);
  return `${prefix}-${digits}`;
}

// ─── Helper: get today's date range ──────────────────────────
function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { gte: start, lte: end };
}

// ═══════════════════════════════════════════════════════════════
// ADULT ATTENDANCE
// ═══════════════════════════════════════════════════════════════

// ─── GET /api/attendance ─────────────────────────────────────
// Returns today's attendance log with optional date filter.
export async function getAttendance(req, res) {
  const { organizationId } = req.user;
  const { date, eventId, page = 1, limit = 50 } = req.query;

  const dateRange = date
    ? (() => {
        const d = new Date(date);
        const start = new Date(d); start.setHours(0,0,0,0);
        const end   = new Date(d); end.setHours(23,59,59,999);
        return { gte: start, lte: end };
      })()
    : todayRange();

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const where = {
    organizationId,
    date: dateRange,
    ...(eventId && { eventId }),
  };

  const [logs, total] = await Promise.all([
    prisma.attendanceLog.findMany({
      where,
      skip,
      take: parseInt(limit),
      orderBy: { date: "desc" },
      include: {
        member: { select: { id: true, firstName: true, lastName: true, isMinor: true } },
        event:  { select: { id: true, title: true } },
      },
    }),
    prisma.attendanceLog.count({ where }),
  ]);

  res.json({ logs, total, page: parseInt(page) });
}

// ─── GET /api/attendance/stats ────────────────────────────────
// Dashboard-style stats: today's count, weekly trend.
export async function getAttendanceStats(req, res) {
  const { organizationId } = req.user;

  const today = todayRange();

  // Last 8 Sundays for trend
  const sundays = [];
  const d = new Date();
  d.setHours(0,0,0,0);
  while (d.getDay() !== 0) d.setDate(d.getDate() - 1); // Back to last Sunday
  for (let i = 0; i < 8; i++) {
    const start = new Date(d); start.setDate(d.getDate() - (i * 7));
    const end   = new Date(start); end.setHours(23,59,59,999);
    sundays.push({ start, end, label: start.toLocaleDateString("en-US", { month: "short", day: "numeric" }) });
  }

  const [todayCount, todayChildren, weeklyTrend] = await Promise.all([
    prisma.attendanceLog.count({ where: { organizationId, date: today } }),
    prisma.checkIn.count({ where: { organizationId, checkedInAt: today, checkedOutAt: null } }),
    Promise.all(
      sundays.reverse().map(async s => ({
        label: s.label,
        count: await prisma.attendanceLog.count({
          where: { organizationId, date: { gte: s.start, lte: s.end } },
        }),
      }))
    ),
  ]);

  res.json({ todayCount, todayChildren, weeklyTrend });
}

// ─── POST /api/attendance/checkin ─────────────────────────────
// Check in a member (adult attendance).
export async function checkInMember(req, res) {
  const { organizationId } = req.user;
  const { memberId, eventId, notes } = req.body;

  if (!memberId) return res.status(400).json({ error: "memberId is required." });

  const member = await prisma.member.findFirst({ where: { id: memberId, organizationId } });
  if (!member) return res.status(404).json({ error: "Member not found." });

  // Check if already checked in today
  const existing = await prisma.attendanceLog.findFirst({
    where: { organizationId, memberId, date: todayRange() },
  });
  if (existing) {
    return res.status(409).json({
      error: "This member is already checked in today.",
      existing,
    });
  }

  const log = await prisma.attendanceLog.create({
    data: {
      organizationId,
      memberId,
      eventId: eventId || null,
      date:    new Date(),
      notes:   notes?.trim() || null,
    },
    include: {
      member: { select: { id: true, firstName: true, lastName: true } },
      event:  { select: { id: true, title: true } },
    },
  });

  res.status(201).json(log);
}

// ─── DELETE /api/attendance/:id ───────────────────────────────
// Remove an attendance record (undo check-in).
export async function removeAttendance(req, res) {
  const { organizationId } = req.user;
  const { id } = req.params;

  const log = await prisma.attendanceLog.findFirst({ where: { id, organizationId } });
  if (!log) return res.status(404).json({ error: "Attendance record not found." });

  await prisma.attendanceLog.delete({ where: { id } });
  res.json({ message: "Check-in removed." });
}

// ═══════════════════════════════════════════════════════════════
// CHILD SECURE CHECK-IN
// ═══════════════════════════════════════════════════════════════

// ─── GET /api/attendance/children ────────────────────────────
// Returns all children (minors) with their current check-in status.
export async function getChildren(req, res) {
  const { organizationId } = req.user;
  const { search = "", department = "" } = req.query;

  const members = await prisma.member.findMany({
    where: {
      organizationId,
      isMinor: true,
      ...(search && {
        OR: [
          { firstName:    { contains: search, mode: "insensitive" } },
          { lastName:     { contains: search, mode: "insensitive" } },
          { guardianName: { contains: search, mode: "insensitive" } },
        ],
      }),
    },
    include: {
      family: { select: { id: true, familyName: true } },
      checkIns: {
        where: { checkedInAt: todayRange(), checkedOutAt: null },
        include: {
          subDepartment: { select: { id: true, name: true } },
        },
        take: 1,
      },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  // Attach checkedIn flag and current check-in details
  const withStatus = members.map(m => ({
    ...m,
    checkedIn:    m.checkIns.length > 0,
    activeCheckIn: m.checkIns[0] || null,
    checkIns:     undefined,
  }));

  // Filter by department if requested
  const filtered = department
    ? withStatus.filter(m => m.activeCheckIn?.subDepartment?.name === department)
    : withStatus;

  res.json({ children: filtered, total: filtered.length });
}

// ─── GET /api/attendance/departments ─────────────────────────
// Returns department check-in counts for minors.
export async function getDepartmentCounts(req, res) {
  const { organizationId } = req.user;

  // Get all minor-serving departments
  const ministries = await prisma.ministry.findMany({
    where: {
      organizationId,
      servesMinors: true,
      ...ministryFilter(req.scope, { field: "id" }),
    },
    include: {
      subDepartments: {
        include: {
          checkIns: {
            where: { checkedInAt: todayRange(), checkedOutAt: null },
          },
        },
      },
    },
  });

  const departments = [];
  ministries.forEach(m => {
    m.subDepartments.forEach(sd => {
      departments.push({
        id:       sd.id,
        name:     sd.name,
        ministry: m.name,
        count:    sd.checkIns.length,
        ageRangeMin: sd.ageRangeMin,
        ageRangeMax: sd.ageRangeMax,
      });
    });
  });

  res.json({ departments, totalChildren: departments.reduce((s, d) => s + d.count, 0) });
}

// ─── POST /api/attendance/children/checkin ────────────────────
// Secure child check-in — generates security code, creates CheckIn record.
export async function checkInChild(req, res) {
  const { organizationId, userId } = req.user;
  const { memberId, subDepartmentId, notes } = req.body;

  if (!memberId)        return res.status(400).json({ error: "memberId is required." });
  if (!subDepartmentId) return res.status(400).json({ error: "subDepartmentId is required." });

  const [member, subDept, org] = await Promise.all([
    prisma.member.findFirst({ where: { id: memberId, organizationId, isMinor: true } }),
    prisma.subDepartment.findFirst({ where: { id: subDepartmentId, organizationId } }),
    prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
  ]);

  if (!member) return res.status(404).json({ error: "Child not found." });
  if (!subDept) return res.status(404).json({ error: "Department not found." });

  // A user may only check children into classrooms in ministries they manage.
  if (!canManageMinistry(req.scope, subDept.ministryId)) {
    return res.status(403).json({ error: "You do not have permission to check children into this department." });
  }

  // Check if already checked in today
  const existing = await prisma.checkIn.findFirst({
    where: { memberId, checkedInAt: todayRange(), checkedOutAt: null },
    include: { subDepartment: { select: { name: true } } },
  });
  if (existing) {
    return res.status(409).json({
      error: `${member.firstName} is already checked in to ${existing.subDepartment.name}.`,
      existing,
    });
  }

  // Generate a unique security code
  let securityCode;
  let attempts = 0;
  do {
    securityCode = generateSecurityCode(org.name);
    const taken = await prisma.checkIn.findFirst({
      where: { organizationId, securityCode, checkedInAt: todayRange(), checkedOutAt: null },
    });
    if (!taken) break;
    attempts++;
  } while (attempts < 10);

  const checkIn = await prisma.checkIn.create({
    data: {
      organizationId,
      memberId,
      subDepartmentId,
      securityCode,
      checkedInBy: userId || null,
      notes: notes?.trim() || null,
    },
    include: {
      member: {
        include: {
          family: { select: { familyName: true } },
        },
      },
      subDepartment: {
        include: { ministry: { select: { name: true } } },
      },
    },
  });

  res.status(201).json(checkIn);
}

// ─── POST /api/attendance/children/checkout ───────────────────
// Verify security code and check out child(ren).
export async function checkOutChild(req, res) {
  const { organizationId } = req.user;
  const { securityCode, checkedOutBy } = req.body;

  if (!securityCode?.trim()) return res.status(400).json({ error: "Security code is required." });

  const checkIns = await prisma.checkIn.findMany({
    where: {
      organizationId,
      securityCode: securityCode.trim().toUpperCase(),
      checkedInAt: todayRange(),
      checkedOutAt: null,
    },
    include: {
      member: { select: { id: true, firstName: true, lastName: true } },
      subDepartment: { select: { name: true } },
    },
  });

  if (checkIns.length === 0) {
    return res.status(404).json({ error: "No active check-ins found for that security code." });
  }

  // Check out all children with this code
  await prisma.checkIn.updateMany({
    where: {
      organizationId,
      securityCode: securityCode.trim().toUpperCase(),
      checkedInAt: todayRange(),
      checkedOutAt: null,
    },
    data: {
      checkedOutAt: new Date(),
      checkedOutBy: checkedOutBy?.trim() || null,
    },
  });

  res.json({
    message:  `${checkIns.length} child(ren) checked out successfully.`,
    count:    checkIns.length,
    children: checkIns.map(c => ({ name: `${c.member.firstName} ${c.member.lastName}`, department: c.subDepartment.name })),
  });
}

// ─── GET /api/attendance/children/active ─────────────────────
// Returns all children currently checked in today.
export async function getActiveCheckIns(req, res) {
  const { organizationId } = req.user;

  // Child check-in records carry allergies and medical notes, so scoped
  // users see only the classrooms in ministries they've been granted.
  const checkIns = await prisma.checkIn.findMany({
    where: {
      organizationId,
      checkedInAt: todayRange(),
      checkedOutAt: null,
      ...nestedMinistryFilter(req.scope, "subDepartment"),
    },
    include: {
      member: {
        select: {
          id: true, firstName: true, lastName: true,
          allergies: true, medicalNotes: true,
          guardianName: true, guardianPhone: true,
        },
      },
      subDepartment: {
        select: { id: true, name: true, ministry: { select: { name: true } } },
      },
    },
    orderBy: { checkedInAt: "asc" },
  });

  res.json({ checkIns, total: checkIns.length });
}
