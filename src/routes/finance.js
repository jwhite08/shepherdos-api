// src/routes/finance.js

import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { attachScope, requireFinanceAccess } from "../lib/scope.js";
import {
  getContributions,
  createContribution,
  createBatchContributions,
  importContributions,
  updateContribution,
  deleteContribution,
  getDonors,
  getBudgets,
  createBudget,
  updateBudget,
  deleteBudget,
} from "../controllers/finance.controller.js";

const router = Router();
router.use(requireAuth, attachScope);

// ─── Contributions ────────────────────────────────────────────
// Contributions are NOT ministry-scoped: most giving carries no ministryId
// (general tithe, offering, building fund), so row-filtering would show a
// scoped user a misleading fraction of total giving rather than a useful
// subset. Gate access to the module instead.
router.get(   "/contributions",       requireFinanceAccess, getContributions);
router.post(  "/contributions",       requireRole("ADMIN","STAFF"), requireFinanceAccess, createContribution);
router.post(  "/contributions/batch", requireRole("ADMIN","STAFF"), requireFinanceAccess, createBatchContributions);
router.post(  "/contributions/import",requireRole("ADMIN","STAFF"), requireFinanceAccess, importContributions);
router.patch( "/contributions/:id",   requireRole("ADMIN","STAFF"), requireFinanceAccess, updateContribution);
router.delete("/contributions/:id",   requireRole("ADMIN"),         deleteContribution);

// ─── Donors ───────────────────────────────────────────────────
// Per-donor giving totals — the most sensitive read in the app.
router.get("/donors", requireFinanceAccess, getDonors);

// ─── Budgets ──────────────────────────────────────────────────
// Budgets ARE ministry-scoped (see getBudgets). No finance gate here: a
// children's ministry director should see their own supplies budget without
// being granted access to congregational giving records.
router.get(   "/budgets",     getBudgets);
router.post(  "/budgets",     requireRole("ADMIN","STAFF"), createBudget);
router.patch( "/budgets/:id", requireRole("ADMIN","STAFF"), updateBudget);
router.delete("/budgets/:id", requireRole("ADMIN"),         deleteBudget);

export default router;
