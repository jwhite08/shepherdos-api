// src/controllers/admin.controller.js
//
// Global-admin management of who can see what.
// Every route using this controller is restricted to ADMIN / SUPER_ADMIN
// at the router level — see routes/admin.js.

import prisma from "../lib/prisma.js";
import { GLOBAL_ROLES } from "../lib/scope.js";

const VALID_ROLES  = ["SUPER_ADMIN", "ADMIN", "STAFF", "VOLUNTEER", "MEMBER"];
const VALID_LEVELS = ["VIEW", "MANAGE"];

// ─── GET /api/admin/users ─────────────────────────────────────
// Staff accounts with their current role and ministry grants.
export async function listUsers(req, res) {
  const { organizationId } = req.user;

  const users = await prisma.user.findMany({
    where: { organizationId },
    orderBy: [{ isActive: "desc" }, { lastName: "asc" }],
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      isActive: true,
      canViewFinance: true,
      lastLoginAt: true,
      ministryAccess: {
        select: {
          accessLevel: true,
          ministry: { select: { id: true, name: true, icon: true } },
        },
      },
    },
  });

  res.json({
    users: users.map(u => ({
      ...u,
      // Global roles ignore ministry grants entirely — surface that in the UI
      // so an admin isn't confused about why grants appear to have no effect.
      hasGlobalAccess: GLOBAL_ROLES.includes(u.role),
      ministryAccess: u.ministryAccess.map(a => ({
        ministryId:  a.ministry.id,
        name:        a.ministry.name,
        icon:        a.ministry.icon,
        accessLevel: a.accessLevel,
      })),
    })),
  });
}

// ─── PUT /api/admin/users/:id/access ─────────────────────────
// Replaces a user's full set of ministry grants in one call.
// Sending the complete desired state avoids the drift that per-row
// add/remove endpoints produce when a request is lost mid-edit.
export async function setUserAccess(req, res) {
  const { organizationId, userId: actingUserId } = req.user;
  const { id } = req.params;
  const { role, canViewFinance, ministryAccess } = req.body;

  const target = await prisma.user.findFirst({ where: { id, organizationId } });
  if (!target) return res.status(404).json({ error: "User not found." });

  // Guard against an admin removing their own admin rights and locking
  // the organization out of its own access-control screen.
  if (id === actingUserId && role && !GLOBAL_ROLES.includes(role)) {
    return res.status(400).json({ error: "You cannot remove your own administrator access." });
  }

  if (role !== undefined) {
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `Role must be one of: ${VALID_ROLES.join(", ")}.` });
    }
    // Only a SUPER_ADMIN may mint another SUPER_ADMIN.
    if (role === "SUPER_ADMIN" && req.user.role !== "SUPER_ADMIN") {
      return res.status(403).json({ error: "Only a super administrator can grant that role." });
    }
  }

  let grants = [];
  if (ministryAccess !== undefined) {
    if (!Array.isArray(ministryAccess)) {
      return res.status(400).json({ error: "ministryAccess must be an array." });
    }

    for (const g of ministryAccess) {
      if (!g?.ministryId) return res.status(400).json({ error: "Each grant needs a ministryId." });
      if (!VALID_LEVELS.includes(g.accessLevel)) {
        return res.status(400).json({ error: `accessLevel must be one of: ${VALID_LEVELS.join(", ")}.` });
      }
    }

    // Confirm every ministry belongs to this organization — otherwise an
    // admin could grant access to another church's ministry by id.
    const ids = [...new Set(ministryAccess.map(g => g.ministryId))];
    const found = await prisma.ministry.findMany({
      where: { id: { in: ids }, organizationId },
      select: { id: true },
    });
    if (found.length !== ids.length) {
      return res.status(400).json({ error: "One or more ministries were not found." });
    }

    grants = ids.map(mid => ({
      userId: id,
      ministryId: mid,
      accessLevel: ministryAccess.find(g => g.ministryId === mid).accessLevel,
    }));
  }

  // Replace grants and update the user atomically, so a partial failure
  // can't leave someone with grants that don't match their role.
  await prisma.$transaction(async tx => {
    if (role !== undefined || canViewFinance !== undefined) {
      await tx.user.update({
        where: { id },
        data: {
          ...(role !== undefined && { role }),
          ...(canViewFinance !== undefined && { canViewFinance: Boolean(canViewFinance) }),
        },
      });
    }

    if (ministryAccess !== undefined) {
      await tx.userMinistryAccess.deleteMany({ where: { userId: id } });
      if (grants.length) await tx.userMinistryAccess.createMany({ data: grants });
    }
  });

  const updated = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true, email: true, firstName: true, lastName: true,
      role: true, isActive: true, canViewFinance: true,
      ministryAccess: {
        select: {
          accessLevel: true,
          ministry: { select: { id: true, name: true, icon: true } },
        },
      },
    },
  });

  res.json({
    ...updated,
    hasGlobalAccess: GLOBAL_ROLES.includes(updated.role),
    ministryAccess: updated.ministryAccess.map(a => ({
      ministryId:  a.ministry.id,
      name:        a.ministry.name,
      icon:        a.ministry.icon,
      accessLevel: a.accessLevel,
    })),
  });
}
