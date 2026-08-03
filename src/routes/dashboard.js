// src/routes/dashboard.js
// Aggregates real database stats for the dashboard view.

import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import prisma from "../lib/prisma.js";

const router = Router();
router.use(requireAuth);

router.get("/stats", async (req, res) => {
  const { organizationId } = req.user;
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    totalMembers,
    activeMembers,
    newMembers,
    totalMinors,
    ytdGiving,
    monthGiving,
    recentContributions,
    membersByStatus,
  ] = await Promise.all([
    prisma.member.count({ where: { organizationId } }),

    prisma.member.count({ where: { organizationId, memberStatus: "ACTIVE", isMinor: false } }),

    prisma.member.count({
      where: { organizationId, memberStatus: "NEW_MEMBER" },
    }),

    prisma.member.count({ where: { organizationId, isMinor: true } }),

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
      include: {
        member: { select: { firstName: true, lastName: true } },
      },
    }),

    prisma.member.groupBy({
      by: ["memberStatus"],
      where: { organizationId },
      _count: { memberStatus: true },
    }),
  ]);

  res.json({
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
    giving: {
      ytd: Number(ytdGiving._sum.amount ?? 0),
      thisMonth: Number(monthGiving._sum.amount ?? 0),
    },
    recentContributions: recentContributions.map(c => ({
      id: c.id,
      amount: Number(c.amount),
      type: c.type,
      method: c.method,
      date: c.date,
      memberName: c.member ? `${c.member.firstName} ${c.member.lastName}` : "Anonymous",
    })),
  });
});

export default router;
