// src/routes/members.js

import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { attachScope, requireFinanceAccess } from "../lib/scope.js";
import {
  getMembers,
  getMemberById,
  createMember,
  updateMember,
  deleteMember,
  getMemberGiving,
} from "../controllers/members.controller.js";

const router = Router();

// All member routes require authentication
router.use(requireAuth, attachScope);

router.get("/",           getMembers);
router.get("/:id",        getMemberById);
// The member directory stays organization-wide (children's ministry staff
// need contact details for the kids in their classrooms), but an individual's
// giving history is finance data and gated separately.
router.get("/:id/giving", requireFinanceAccess, getMemberGiving);
router.post("/",          requireRole("ADMIN", "STAFF"), createMember);
router.patch("/:id",      requireRole("ADMIN", "STAFF"), updateMember);
router.delete("/:id",     requireRole("ADMIN"),          deleteMember);

export default router;
