// src/controllers/finance.controller.js
import prisma from "../lib/prisma.js";

const VALID_TYPES   = ["TITHE","OFFERING","BUILDING_FUND","MISSIONS","BENEVOLENCE","YOUTH_FUND","OTHER"];
const VALID_METHODS = ["CASH","CHECK","ONLINE","ACH","CARD","OTHER"];

// ─── GET /api/finance/contributions ──────────────────────────
export async function getContributions(req, res) {
  const { organizationId } = req.user;
  const { page = 1, limit = 25, search = "", type = "", method = "", year = "", ministryId = "" } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const where = {
    organizationId,
    ...(type       && { type }),
    ...(method     && { method }),
    ...(ministryId && { ministryId }),
    ...(year   && { date: { gte: new Date(`${year}-01-01`), lte: new Date(`${year}-12-31`) } }),
    ...(search && { member: { OR: [
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName:  { contains: search, mode: "insensitive" } },
    ]}}),
  };

  const [contributions, total, totals] = await Promise.all([
    prisma.contribution.findMany({
      where, skip, take: parseInt(limit),
      orderBy: { date: "desc" },
      include: { member: { select: { id: true, firstName: true, lastName: true } } },
    }),
    prisma.contribution.count({ where }),
    prisma.contribution.aggregate({ where, _sum: { amount: true }, _count: true }),
  ]);

  res.json({
    contributions,
    pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) },
    totals: { sum: Number(totals._sum.amount ?? 0), count: totals._count },
  });
}

// ─── POST /api/finance/contributions ─────────────────────────
export async function createContribution(req, res) {
  const { organizationId } = req.user;
  const { memberId, ministryId, amount, type, method, date, notes } = req.body;

  if (!amount || isNaN(parseFloat(amount))) return res.status(400).json({ error: "A valid amount is required." });

  if (memberId) {
    const member = await prisma.member.findFirst({ where: { id: memberId, organizationId } });
    if (!member) return res.status(404).json({ error: "Member not found." });
  }
  if (ministryId) {
    const ministry = await prisma.ministry.findFirst({ where: { id: ministryId, organizationId } });
    if (!ministry) return res.status(404).json({ error: "Ministry not found." });
  }

  const contribution = await prisma.contribution.create({
    data: {
      organizationId,
      memberId: memberId || null,
      ministryId: ministryId || null,
      amount: parseFloat(amount),
      type: type || "TITHE",
      method: method || "CASH",
      date: date ? new Date(date) : new Date(),
      notes: notes?.trim() || null,
    },
    include: { member: { select: { id: true, firstName: true, lastName: true } } },
  });

  res.status(201).json(contribution);
}

// ─── POST /api/finance/contributions/batch ───────────────────
export async function createBatchContributions(req, res) {
  const { organizationId } = req.user;
  const { contributions, serviceDate, defaultMethod } = req.body;

  if (!Array.isArray(contributions) || contributions.length === 0) {
    return res.status(400).json({ error: "A non-empty contributions array is required." });
  }

  const results = [], errors = [];

  for (const [i, c] of contributions.entries()) {
    if (!c.amount || isNaN(parseFloat(c.amount))) { errors.push({ index: i, error: "Invalid amount" }); continue; }
    try {
      const created = await prisma.contribution.create({
        data: {
          organizationId,
          memberId: c.memberId || null,
          amount: parseFloat(c.amount),
          type: c.type || "TITHE",
          method: c.method || defaultMethod || "CASH",
          date: serviceDate ? new Date(serviceDate) : new Date(),
          notes: c.notes?.trim() || null,
        },
        include: { member: { select: { id: true, firstName: true, lastName: true } } },
      });
      results.push(created);
    } catch (err) { errors.push({ index: i, error: err.message }); }
  }

  res.status(201).json({
    created: results.length, errors: errors.length, results, errors,
    total: results.reduce((s, c) => s + Number(c.amount), 0),
  });
}

// ─── POST /api/finance/contributions/import ──────────────────
export async function importContributions(req, res) {
  const { organizationId } = req.user;
  const { rows, defaultType, defaultMethod } = req.body;

  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: "A non-empty rows array is required." });
  }

  const results = [], errors = [], unmatchedRows = [];

  for (const [i, r] of rows.entries()) {
    if (!r.amount || isNaN(parseFloat(r.amount))) { errors.push({ index: i, error: "Invalid or missing amount" }); continue; }

    const firstName = r.firstName?.trim() || "";
    const lastName  = r.lastName?.trim()  || "";
    const email     = r.email?.trim()     || "";

    let memberId = null;
    if (email) {
      const m = await prisma.member.findFirst({ where: { organizationId, email: { equals: email, mode: "insensitive" } } });
      if (m) memberId = m.id;
    }
    if (!memberId && (firstName || lastName)) {
      const m = await prisma.member.findFirst({ where: {
        organizationId,
        firstName: { equals: firstName, mode: "insensitive" },
        lastName:  { equals: lastName,  mode: "insensitive" },
      }});
      if (m) memberId = m.id;
    }
    if (!memberId && (firstName || lastName || email)) {
      unmatchedRows.push({ index: i, name: [firstName, lastName].filter(Boolean).join(" ") || email });
    }

    let date = new Date();
    if (r.date) {
      const parsed = new Date(r.date);
      if (!isNaN(parsed.getTime())) date = parsed;
    }

    try {
      const created = await prisma.contribution.create({
        data: {
          organizationId,
          memberId,
          amount: parseFloat(r.amount),
          type:   VALID_TYPES.includes(r.type)     ? r.type   : (defaultType   || "TITHE"),
          method: VALID_METHODS.includes(r.method) ? r.method : (defaultMethod || "CASH"),
          date,
          notes: r.notes?.trim() || null,
        },
        include: { member: { select: { id: true, firstName: true, lastName: true } } },
      });
      results.push(created);
    } catch (err) { errors.push({ index: i, error: err.message }); }
  }

  res.status(201).json({
    created: results.length, errors: errors.length, unmatched: unmatchedRows.length,
    results, errors, unmatchedRows,
    total: results.reduce((s, c) => s + Number(c.amount), 0),
  });
}

// ─── PATCH /api/finance/contributions/:id ────────────────────
export async function updateContribution(req, res) {
  const { organizationId } = req.user;
  const { id } = req.params;

  const existing = await prisma.contribution.findFirst({ where: { id, organizationId } });
  if (!existing) return res.status(404).json({ error: "Contribution not found." });

  const { amount, type, method, date, notes, receiptSent, ministryId } = req.body;

  const updated = await prisma.contribution.update({
    where: { id },
    data: {
      ...(amount      !== undefined && { amount: parseFloat(amount) }),
      ...(type        && { type }),
      ...(method      && { method }),
      ...(date        !== undefined && { date: date ? new Date(date) : existing.date }),
      ...(notes       !== undefined && { notes: notes?.trim() || null }),
      ...(receiptSent !== undefined && { receiptSent }),
      ...(ministryId  !== undefined && { ministryId: ministryId || null }),
    },
    include: { member: { select: { id: true, firstName: true, lastName: true } } },
  });

  res.json(updated);
}

// ─── DELETE /api/finance/contributions/:id ───────────────────
export async function deleteContribution(req, res) {
  const { organizationId } = req.user;
  const { id } = req.params;

  const existing = await prisma.contribution.findFirst({ where: { id, organizationId } });
  if (!existing) return res.status(404).json({ error: "Contribution not found." });

  await prisma.contribution.delete({ where: { id } });
  res.json({ message: "Contribution deleted." });
}

// ─── GET /api/finance/donors ──────────────────────────────────
export async function getDonors(req, res) {
  const { organizationId } = req.user;
  const { year = new Date().getFullYear(), search = "" } = req.query;

  const contributions = await prisma.contribution.findMany({
    where: {
      organizationId,
      date: { gte: new Date(`${year}-01-01`), lte: new Date(`${year}-12-31`) },
      ...(search && { member: { OR: [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName:  { contains: search, mode: "insensitive" } },
      ]}}),
    },
    include: { member: { select: { id: true, firstName: true, lastName: true, email: true } } },
    orderBy: { date: "asc" },
  });

  const donorMap = {};
  for (const c of contributions) {
    const key  = c.memberId || "anonymous";
    const name = c.member ? `${c.member.firstName} ${c.member.lastName}` : "Anonymous";
    if (!donorMap[key]) {
      donorMap[key] = { memberId: c.memberId, memberName: name, email: c.member?.email || null, total: 0, count: 0, byType: {}, contributions: [] };
    }
    donorMap[key].total  += Number(c.amount);
    donorMap[key].count  += 1;
    donorMap[key].byType[c.type] = (donorMap[key].byType[c.type] || 0) + Number(c.amount);
    donorMap[key].contributions.push({ id: c.id, date: c.date, amount: Number(c.amount), type: c.type, method: c.method });
  }

  const donors = Object.values(donorMap).sort((a, b) => b.total - a.total);
  res.json({ donors, year: parseInt(year), totalGiving: donors.reduce((s, d) => s + d.total, 0) });
}

// ─── GET /api/finance/budgets ─────────────────────────────────
export async function getBudgets(req, res) {
  const { organizationId } = req.user;
  const { year = new Date().getFullYear() } = req.query;

  const budgets = await prisma.budget.findMany({
    where: { organizationId, year: parseInt(year) },
    orderBy: { category: "asc" },
  });

  const totalBudgeted = budgets.reduce((s, b) => s + Number(b.budgetedAmount), 0);
  const totalSpent    = budgets.reduce((s, b) => s + Number(b.spentAmount),    0);

  res.json({ budgets, totalBudgeted, totalSpent, year: parseInt(year) });
}

// ─── POST /api/finance/budgets ────────────────────────────────
export async function createBudget(req, res) {
  const { organizationId } = req.user;
  const { category, icon, budgetedAmount, spentAmount, year, notes } = req.body;

  if (!category?.trim())  return res.status(400).json({ error: "Category name is required." });
  if (!budgetedAmount || isNaN(parseFloat(budgetedAmount))) return res.status(400).json({ error: "A valid budgeted amount is required." });

  const existing = await prisma.budget.findFirst({
    where: { organizationId, category: category.trim(), year: parseInt(year) || new Date().getFullYear() },
  });
  if (existing) return res.status(409).json({ error: `A budget category named "${category}" already exists for ${year}.` });

  const budget = await prisma.budget.create({
    data: {
      organizationId,
      category: category.trim(),
      icon: icon || "💰",
      budgetedAmount: parseFloat(budgetedAmount),
      spentAmount:    parseFloat(spentAmount || 0),
      year: parseInt(year) || new Date().getFullYear(),
      notes: notes?.trim() || null,
    },
  });

  res.status(201).json(budget);
}

// ─── PATCH /api/finance/budgets/:id ──────────────────────────
export async function updateBudget(req, res) {
  const { organizationId } = req.user;
  const { id } = req.params;

  const existing = await prisma.budget.findFirst({ where: { id, organizationId } });
  if (!existing) return res.status(404).json({ error: "Budget category not found." });

  const { category, icon, budgetedAmount, spentAmount, notes } = req.body;

  const updated = await prisma.budget.update({
    where: { id },
    data: {
      ...(category       && { category: category.trim() }),
      ...(icon           !== undefined && { icon: icon || "💰" }),
      ...(budgetedAmount !== undefined && { budgetedAmount: parseFloat(budgetedAmount) }),
      ...(spentAmount    !== undefined && { spentAmount:    parseFloat(spentAmount) }),
      ...(notes          !== undefined && { notes: notes?.trim() || null }),
    },
  });

  res.json(updated);
}

// ─── DELETE /api/finance/budgets/:id ─────────────────────────
export async function deleteBudget(req, res) {
  const { organizationId } = req.user;
  const { id } = req.params;

  const existing = await prisma.budget.findFirst({ where: { id, organizationId } });
  if (!existing) return res.status(404).json({ error: "Budget category not found." });

  await prisma.budget.delete({ where: { id } });
  res.json({ message: "Budget category deleted." });
}
