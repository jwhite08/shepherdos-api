// src/controllers/members.controller.js
// All member CRUD operations.
// organizationId is always taken from req.user — never from the request body.
// This enforces multi-tenant data isolation.

import prisma from "../lib/prisma.js";

// ─── GET /api/members ─────────────────────────────────────────
// Returns paginated, searchable list of members for the org.
export async function getMembers(req, res) {
  const { organizationId } = req.user;
  const {
    page = 1,
    limit = 20,
    search = "",
    status = "",
    familyId = "",
    isMinor = "",
  } = req.query;

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const where = {
    organizationId,
    ...(status && { memberStatus: status }),
    ...(familyId && { familyId }),
    ...(isMinor !== "" && { isMinor: isMinor === "true" }),
    ...(search && {
      OR: [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName:  { contains: search, mode: "insensitive" } },
        { email:     { contains: search, mode: "insensitive" } },
        { phone:     { contains: search, mode: "insensitive" } },
      ],
    }),
  };

  const [members, total] = await Promise.all([
    prisma.member.findMany({
      where,
      skip,
      take: parseInt(limit),
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      include: {
        family: { select: { id: true, familyName: true } },
        subDepartments: {
          include: {
            subDepartment: {
              select: { id: true, name: true, ministry: { select: { name: true } } },
            },
          },
        },
      },
    }),
    prisma.member.count({ where }),
  ]);

  res.json({
    members,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit)),
    },
  });
}

// ─── GET /api/members/:id ─────────────────────────────────────
export async function getMemberById(req, res) {
  const { organizationId } = req.user;
  const { id } = req.params;

  const member = await prisma.member.findFirst({
    where: { id, organizationId },
    include: {
      family: {
        include: {
          members: {
            select: { id: true, firstName: true, lastName: true, isMinor: true, memberStatus: true },
          },
        },
      },
      subDepartments: {
        include: {
          subDepartment: {
            include: { ministry: { select: { id: true, name: true, icon: true } } },
          },
        },
      },
      contributions: {
        orderBy: { date: "desc" },
        take: 10,
        select: { id: true, amount: true, type: true, method: true, date: true },
      },
      attendanceLogs: {
        orderBy: { date: "desc" },
        take: 5,
      },
    },
  });

  if (!member) return res.status(404).json({ error: "Member not found." });
  res.json(member);
}

// ─── POST /api/members ────────────────────────────────────────
export async function createMember(req, res) {
  const { organizationId } = req.user;
  const {
    firstName, lastName, email, phone,
    address, city, state, zip,
    dateOfBirth, gender, maritalStatus,
    memberStatus, joinDate, familyId,
    isMinor, allergies, medicalNotes,
    guardianName, guardianPhone, authorizedPickup,
    notes,
  } = req.body;

  if (!firstName || !lastName) {
    return res.status(400).json({ error: "First name and last name are required." });
  }

  // Check for duplicate email within the org
  if (email) {
    const existing = await prisma.member.findFirst({
      where: { organizationId, email: email.toLowerCase().trim() },
    });
    if (existing) {
      return res.status(409).json({ error: "A member with this email already exists." });
    }
  }

  const member = await prisma.member.create({
    data: {
      organizationId,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email?.toLowerCase().trim() || null,
      phone: phone?.trim() ?? null,
      address: address?.trim() ?? null,
      city: city?.trim() ?? null,
      state: state?.trim() ?? null,
      zip: zip?.trim() ?? null,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      gender: gender || null,
      maritalStatus: maritalStatus || null,
      memberStatus: memberStatus ?? "ACTIVE",
      joinDate: joinDate ? new Date(joinDate) : new Date(),
      familyId: familyId || null,
      isMinor: isMinor ?? false,
      allergies: allergies?.trim() ?? null,
      medicalNotes: medicalNotes?.trim() ?? null,
      guardianName: guardianName?.trim() ?? null,
      guardianPhone: guardianPhone?.trim() ?? null,
      authorizedPickup: authorizedPickup?.trim() ?? null,
      notes: notes?.trim() ?? null,
    },
    include: {
      family: { select: { id: true, familyName: true } },
    },
  });

  res.status(201).json(member);
}

// ─── PATCH /api/members/:id ───────────────────────────────────
export async function updateMember(req, res) {
  const { organizationId } = req.user;
  const { id } = req.params;

  const existing = await prisma.member.findFirst({ where: { id, organizationId } });
  if (!existing) return res.status(404).json({ error: "Member not found." });

  const {
    firstName, lastName, email, phone,
    address, city, state, zip,
    dateOfBirth, gender, maritalStatus,
    memberStatus, joinDate, familyId,
    isMinor, allergies, medicalNotes,
    guardianName, guardianPhone, authorizedPickup,
    notes,
  } = req.body;

  const updated = await prisma.member.update({
    where: { id },
    data: {
      ...(firstName    && { firstName: firstName.trim() }),
      ...(lastName     && { lastName: lastName.trim() }),
      ...(email        !== undefined && { email: email?.toLowerCase().trim() || null }),
      ...(phone        !== undefined && { phone: phone?.trim() ?? null }),
      ...(address      !== undefined && { address: address?.trim() ?? null }),
      ...(city         !== undefined && { city: city?.trim() ?? null }),
      ...(state        !== undefined && { state: state?.trim() ?? null }),
      ...(zip          !== undefined && { zip: zip?.trim() ?? null }),
      ...(dateOfBirth  !== undefined && { dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null }),
      ...(gender       !== undefined && { gender: gender || null }),
      ...(maritalStatus !== undefined && { maritalStatus: maritalStatus || null }),
      ...(memberStatus && { memberStatus }),
      ...(joinDate     !== undefined && { joinDate: joinDate ? new Date(joinDate) : null }),
      ...(familyId     !== undefined && { familyId: familyId || null }),
      ...(isMinor      !== undefined && { isMinor }),
      ...(allergies    !== undefined && { allergies: allergies?.trim() ?? null }),
      ...(medicalNotes !== undefined && { medicalNotes: medicalNotes?.trim() ?? null }),
      ...(guardianName !== undefined && { guardianName: guardianName?.trim() ?? null }),
      ...(guardianPhone !== undefined && { guardianPhone: guardianPhone?.trim() ?? null }),
      ...(authorizedPickup !== undefined && { authorizedPickup: authorizedPickup?.trim() ?? null }),
      ...(notes        !== undefined && { notes: notes?.trim() ?? null }),
    },
    include: {
      family: { select: { id: true, familyName: true } },
    },
  });

  res.json(updated);
}

// ─── DELETE /api/members/:id ──────────────────────────────────
export async function deleteMember(req, res) {
  const { organizationId } = req.user;
  const { id } = req.params;

  const existing = await prisma.member.findFirst({ where: { id, organizationId } });
  if (!existing) return res.status(404).json({ error: "Member not found." });

  await prisma.member.delete({ where: { id } });
  res.json({ message: "Member deleted successfully." });
}

// ─── GET /api/members/:id/giving ─────────────────────────────
export async function getMemberGiving(req, res) {
  const { organizationId } = req.user;
  const { id } = req.params;

  const member = await prisma.member.findFirst({ where: { id, organizationId } });
  if (!member) return res.status(404).json({ error: "Member not found." });

  const contributions = await prisma.contribution.findMany({
    where: { memberId: id },
    orderBy: { date: "desc" },
  });

  const ytdTotal = contributions
    .filter(c => new Date(c.date).getFullYear() === new Date().getFullYear())
    .reduce((sum, c) => sum + Number(c.amount), 0);

  res.json({ contributions, ytdTotal });
}
