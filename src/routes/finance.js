// src/routes/finance.js

import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
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
router.use(requireAuth);

// ─── Contributions ────────────────────────────────────────────
router.get(   "/contributions",       getContributions);
router.post(  "/contributions",       requireRole("ADMIN","STAFF"), createContribution);
router.post(  "/contributions/batch", requireRole("ADMIN","STAFF"), createBatchContributions);
router.post(  "/contributions/import",requireRole("ADMIN","STAFF"), importContributions);
router.patch( "/contributions/:id",   requireRole("ADMIN","STAFF"), updateContribution);
router.delete("/contributions/:id",   requireRole("ADMIN"),         deleteContribution);

// ─── Donors ───────────────────────────────────────────────────
router.get("/donors", getDonors);

// ─── Budgets ──────────────────────────────────────────────────
router.get(   "/budgets",     getBudgets);
router.post(  "/budgets",     requireRole("ADMIN","STAFF"), createBudget);
router.patch( "/budgets/:id", requireRole("ADMIN","STAFF"), updateBudget);
router.delete("/budgets/:id", requireRole("ADMIN"),         deleteBudget);

export default router;
