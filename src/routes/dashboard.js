// src/routes/dashboard.js
// Aggregates real database stats for the dashboard view.
//
// Financial figures are omitted entirely for users without finance access,
// rather than zeroed out — a zero would misrepresent the data. The frontend
// checks for the absence of the `giving` key and hides those widgets.

import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { attachScope, nestedMinistryFilter } from "../lib/scope.js";
import prisma from "../lib/prisma.js";

const router = Router();
router.use(requireAuth, attachScope);

router.get("/stats", async (req, res) => {
  const { organizationId } = req.user;
  const scope = req.scope;
  const now = new Date();
  const startOfYear  = new Date(now.getFullYear(), 0, 1);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Membership counts stay organization-wide: the member directory is not
  // ministry-scoped (see access-control notes), so scoping these totals
  // would contradict what the Members page shows.
  const [totalMembers, activeMembers, newMembers, totalMinors, membersByStatus] =
    await Promise.all([
      prisma.member.count({ where: { organizationId } }),
      prisma.member.count({ where: { organizationId, memberStatus: "ACTIVE", isMinor: false } }),
      prisma.member.count({ where: { organizationId, memberStatus: "NEW_MEMBER" } }),
      prisma.member.count({ where: { organizationId, isMinor: true } }),
      prisma.member.groupBy({
        by: ["memberStatus"],
        where: { organizationId },
        _count: { memberStatus: true },
      }),
    ]);

  const payload = {
    members: {
      total: totalMembers,
      active: activeMembers,
      newMembers,
      minors: totalMinors,
      byStatus: membersByStatus.map(s => ({
        status: s.memberStatus,
        count: s._count.memberStatus,
      })),
    },
    // Advertises to the client what it's allowed to render, so the frontend
    // never has to infer permissions from missing data.
    permissions: {
      canViewFinance: scope.canViewFinance,
      scopedToMinistries: !scope.all,
    },
  };

  if (scope.canViewFinance) {
    const [ytdGiving, monthGiving, recentContributions] = await Promise.all([
      prisma.contribution.aggregate({
        where: { organizationId, date: { gte: startOfYear } },
        _sum: { amount: true },
      }),
      prisma.contribution.aggregate({
        where: { organizationId, date: { gte: startOfMonth } },
        _sum: { amount: true },
      }),
      prisma.contribution.findMany({
        where: { organizationId },
        orderBy: { date: "desc" },
        take: 10,
        include: { member: { select: { firstName: true, lastName: true } } },
      }),
    ]);

    payload.giving = {
      ytd: Number(ytdGiving._sum.amount ?? 0),
      thisMonth: Number(monthGiving._sum.amount ?? 0),
    };
    payload.recentContributions = recentContributions.map(c => ({
      id: c.id,
      amount: Number(c.amount),
      type: c.type,
      method: c.method,
      date: c.date,
      memberName: c.member ? `${c.member.firstName} ${c.member.lastName}` : "Anonymous",
    }));
  }

  // Check-in counts reach a ministry through SubDepartment, so scoped users
  // see only their own classrooms.
  const activeCheckIns = await prisma.checkIn.count({
    where: {
      organizationId,
      checkedOutAt: null,
      ...nestedMinistryFilter(scope, "subDepartment"),
    },
  });
  payload.checkIns = { active: activeCheckIns };

  res.json(payload);
});

export default router;
