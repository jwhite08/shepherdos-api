// src/routes/members.js

import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
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
router.use(requireAuth);

router.get("/",           getMembers);
router.get("/:id",        getMemberById);
router.get("/:id/giving", getMemberGiving);
router.post("/",          requireRole("ADMIN", "STAFF"), createMember);
router.patch("/:id",      requireRole("ADMIN", "STAFF"), updateMember);
router.delete("/:id",     requireRole("ADMIN"),          deleteMember);

export default router;
