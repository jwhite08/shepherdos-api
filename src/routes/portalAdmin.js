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
router.use(requireAuth);

router.get(  "/overview", requireRole("ADMIN", "STAFF"), getOverview);
router.get(  "/members",  requireRole("ADMIN", "STAFF"), getMembers);

// Invite emails and password resets hand out portal credentials directly,
// so these are admin-only — tighter than the ADMIN/STAFF default for the
// rest of this file. A STAFF-visible UI option must never rely solely on
// the frontend hiding it; the API enforces this independently.
router.post( "/members/:memberId/invite",         requireRole("ADMIN", "SUPER_ADMIN"), inviteMember);
router.post( "/members/:memberId/reset-password", requireRole("ADMIN", "SUPER_ADMIN"), resetPassword);
router.patch("/members/:memberId/access",          requireRole("ADMIN", "STAFF"), setAccess);

router.post( "/bulk-invite", requireRole("ADMIN", "STAFF"), bulkInvite);
router.post( "/bulk-access", requireRole("ADMIN", "STAFF"), bulkSetAccess);

export default router;
