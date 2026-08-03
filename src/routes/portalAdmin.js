// src/routes/portalAdmin.js
// Admin-side Member Portal management — invites, resets, enable/disable.
// Entirely ADMIN/STAFF gated; distinct from routes/portal.js (member self-service).

import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  getOverview,
  getMembers,
  inviteMember,
  resetPassword,
  setAccess,
  bulkInvite,
  bulkSetAccess,
} from "../controllers/portalAdmin.controller.js";

const router = Router();
router.use(requireAuth, requireRole("ADMIN", "STAFF"));

router.get(  "/overview", getOverview);
router.get(  "/members",  getMembers);

router.post( "/members/:memberId/invite",         inviteMember);
router.post( "/members/:memberId/reset-password", resetPassword);
router.patch("/members/:memberId/access",          setAccess);

router.post( "/bulk-invite", bulkInvite);
router.post( "/bulk-access", bulkSetAccess);

export default router;
