// src/controllers/portalAdmin.controller.js
// Admin-side management of Member Portal accounts: invites, password
// resets, and enable/disable — organizationId always comes from req.user.

import crypto  from "crypto";
import prisma  from "../lib/prisma.js";
import { sendMail, portalInviteEmail, passwordResetEmail } from "../lib/mailer.js";

const INVITE_TTL_MS = 7  * 24 * 60 * 60 * 1000; // 7 days
const RESET_TTL_MS  = 24 * 60 * 60 * 1000;      // 24 hours

function frontendUrl() { return process.env.FRONTEND_URL || "http://localhost:3000"; }
function makeToken()   { return crypto.randomBytes(32).toString("hex"); }

async function issueInvite(member) {
  const token     = makeToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  await prisma.portalInvite.create({
    data: { organizationId: member.organizationId, memberId: member.id, email: member.email, token, expiresAt },
  });
  const link = `${frontendUrl()}/portal?invite=${token}`;
  const { subject, html } = portalInviteEmail({ orgName: member.organization.name, memberFirstName: member.firstName, link });
  await sendMail({ to: member.email, subject, html });
  return expiresAt;
}

// ─── GET /api/portal-admin/overview ───────────────────────────
export async function getOverview(req, res) {
  const { organizationId } = req.user;

  const [totalMembers, users, pendingInvites] = await Promise.all([
    prisma.member.count({ where: { organizationId } }),
    prisma.user.findMany({ where: { organizationId, memberId: { not: null } }, select: { isActive: true, lastLoginAt: true } }),
    prisma.portalInvite.count({ where: { organizationId, usedAt: null, expiresAt: { gt: new Date() } } }),
  ]);

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const withAccount   = users.length;
  const active        = users.filter(u => u.isActive).length;
  const disabled       = users.filter(u => !u.isActive).length;
  const activeLast30  = users.filter(u => u.lastLoginAt && u.lastLoginAt >= thirtyDaysAgo).length;
  const neverLoggedIn = users.filter(u => u.isActive && !u.lastLoginAt).length;

  res.json({ totalMembers, withAccount, noAccount: totalMembers - withAccount, active, disabled, activeLast30, neverLoggedIn, pendingInvites });
}

// ─── GET /api/portal-admin/members ────────────────────────────
export async function getMembers(req, res) {
  const { organizationId } = req.user;
  const { page = 1, limit = 25, search = "", status = "" } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const statusWhere = {
    NO_ACCOUNT: { user: null },
    ACTIVE:     { user: { is: { isActive: true } } },
    DISABLED:   { user: { is: { isActive: false } } },
    PENDING:    { user: null, portalInvites: { some: { usedAt: null, expiresAt: { gt: new Date() } } } },
  }[status] || {};

  const where = {
    organizationId,
    ...statusWhere,
    ...(search && { OR: [
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName:  { contains: search, mode: "insensitive" } },
      { email:     { contains: search, mode: "insensitive" } },
    ]}),
  };

  const [members, total] = await Promise.all([
    prisma.member.findMany({
      where, skip, take: parseInt(limit),
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      include: {
        user: { select: { isActive: true, lastLoginAt: true, email: true } },
        portalInvites: { where: { usedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" }, take: 1 },
      },
    }),
    prisma.member.count({ where }),
  ]);

  const shaped = members.map(m => {
    const pendingInvite = m.portalInvites[0] || null;
    return {
      id: m.id, firstName: m.firstName, lastName: m.lastName, email: m.email,
      hasAccount: !!m.user,
      isActive: m.user?.isActive ?? null,
      lastLoginAt: m.user?.lastLoginAt ?? null,
      pendingInviteExpiresAt: pendingInvite?.expiresAt || null,
      portalStatus: m.user ? (m.user.isActive ? "ACTIVE" : "DISABLED") : (pendingInvite ? "PENDING" : "NO_ACCOUNT"),
    };
  });

  res.json({
    members: shaped,
    pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) },
  });
}

// ─── POST /api/portal-admin/members/:memberId/invite ──────────
// Also used to resend an invite to a member with no account yet.
export async function inviteMember(req, res) {
  const { organizationId } = req.user;
  const { memberId } = req.params;

  const member = await prisma.member.findFirst({ where: { id: memberId, organizationId }, include: { user: true, organization: true } });
  if (!member) return res.status(404).json({ error: "Member not found." });
  if (!member.email) return res.status(400).json({ error: "This member has no email on file. Add one before sending an invite." });
  if (member.user)   return res.status(409).json({ error: "This member already has a portal account. Use \"Reset Password\" instead." });

  const expiresAt = await issueInvite(member);
  res.status(201).json({ message: `Invite sent to ${member.email}.`, expiresAt });
}

// ─── POST /api/portal-admin/members/:memberId/reset-password ──
export async function resetPassword(req, res) {
  const { organizationId } = req.user;
  const { memberId } = req.params;

  const member = await prisma.member.findFirst({ where: { id: memberId, organizationId }, include: { user: true, organization: true } });
  if (!member) return res.status(404).json({ error: "Member not found." });
  if (!member.user) return res.status(400).json({ error: "This member doesn't have a portal account yet. Send an invite instead." });

  const token     = makeToken();
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);
  await prisma.passwordResetToken.create({ data: { userId: member.user.id, token, expiresAt } });

  const link = `${frontendUrl()}/portal?reset=${token}`;
  const { subject, html } = passwordResetEmail({ orgName: member.organization.name, memberFirstName: member.firstName, link });
  await sendMail({ to: member.user.email, subject, html });

  res.json({ message: `Password reset email sent to ${member.user.email}.` });
}

// ─── PATCH /api/portal-admin/members/:memberId/access ─────────
export async function setAccess(req, res) {
  const { organizationId } = req.user;
  const { memberId } = req.params;
  const { isActive } = req.body;

  if (typeof isActive !== "boolean") return res.status(400).json({ error: "isActive (boolean) is required." });

  const member = await prisma.member.findFirst({ where: { id: memberId, organizationId }, include: { user: true } });
  if (!member) return res.status(404).json({ error: "Member not found." });
  if (!member.user) return res.status(400).json({ error: "This member doesn't have a portal account." });

  const updated = await prisma.user.update({ where: { id: member.user.id }, data: { isActive } });
  res.json({ message: isActive ? "Portal access enabled." : "Portal access disabled.", isActive: updated.isActive });
}

// ─── POST /api/portal-admin/bulk-invite ────────────────────────
export async function bulkInvite(req, res) {
  const { organizationId } = req.user;
  const { memberIds } = req.body;
  if (!Array.isArray(memberIds) || memberIds.length === 0) return res.status(400).json({ error: "A non-empty memberIds array is required." });

  const members = await prisma.member.findMany({ where: { id: { in: memberIds }, organizationId }, include: { user: true, organization: true } });

  let sent = 0;
  const skipped = [];
  for (const member of members) {
    const name = `${member.firstName} ${member.lastName}`;
    if (member.user)   { skipped.push({ id: member.id, name, reason: "already has an account" }); continue; }
    if (!member.email) { skipped.push({ id: member.id, name, reason: "no email on file" }); continue; }
    await issueInvite(member);
    sent++;
  }

  res.status(201).json({ sent, skipped: skipped.length, skippedDetail: skipped });
}

// ─── POST /api/portal-admin/bulk-access ────────────────────────
export async function bulkSetAccess(req, res) {
  const { organizationId } = req.user;
  const { memberIds, isActive } = req.body;
  if (!Array.isArray(memberIds) || memberIds.length === 0) return res.status(400).json({ error: "A non-empty memberIds array is required." });
  if (typeof isActive !== "boolean") return res.status(400).json({ error: "isActive (boolean) is required." });

  const members = await prisma.member.findMany({ where: { id: { in: memberIds }, organizationId }, include: { user: true } });
  const userIds = members.filter(m => m.user).map(m => m.user.id);
  const result  = await prisma.user.updateMany({ where: { id: { in: userIds } }, data: { isActive } });

  res.json({ updated: result.count, skipped: members.length - userIds.length });
}
