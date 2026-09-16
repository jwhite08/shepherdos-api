// src/routes/ministries.js

import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { attachScope, requireMinistryAccess } from "../lib/scope.js";
import {
  getMinistries,
  getMinistryById,
  listVolunteers,
  addVolunteer,
  updateVolunteer,
  removeVolunteer,
  listSchedule,
  createScheduleEntry,
  updateScheduleEntry,
  deleteScheduleEntry,
  listSubDepartments,
  createSubDepartment,
  updateSubDepartment,
  deleteSubDepartment,
  listSubDepartmentMembers,
  addSubDepartmentMember,
  removeSubDepartmentMember,
} from "../controllers/ministries.controller.js";

const router = Router();
router.use(requireAuth, attachScope);

// Every route below with an :id operates on that ministry's data, so the
// access check is applied once at the param level rather than repeated in
// each handler. New sub-resources under /:id inherit it automatically.
const canView   = requireMinistryAccess("view");
const canManage = requireMinistryAccess("manage");

// ─── Ministry ───────────────────────────────────────────────────
// The list endpoint filters to the caller's ministries (see controller).
router.get("/",    getMinistries);
router.get("/:id", canView, getMinistryById);

// ─── Volunteers ─────────────────────────────────────────────────
router.get(   "/:id/volunteers",               canView,   listVolunteers);
router.post(  "/:id/volunteers",               canManage, requireRole("ADMIN","STAFF"), addVolunteer);
router.patch( "/:id/volunteers/:volunteerId",  canManage, requireRole("ADMIN","STAFF"), updateVolunteer);
router.delete("/:id/volunteers/:volunteerId",  canManage, requireRole("ADMIN","STAFF"), removeVolunteer);

// ─── Volunteer Schedule ───────────────────────────────────────
router.get(   "/:id/schedule",              canView,   listSchedule);
router.post(  "/:id/schedule",              canManage, requireRole("ADMIN","STAFF"), createScheduleEntry);
router.patch( "/:id/schedule/:scheduleId",  canManage, requireRole("ADMIN","STAFF"), updateScheduleEntry);
router.delete("/:id/schedule/:scheduleId",  canManage, requireRole("ADMIN","STAFF"), deleteScheduleEntry);

// ─── Sub-Departments ────────────────────────────────────────────
router.get(   "/:id/subdepartments",                   canView,   listSubDepartments);
router.post(  "/:id/subdepartments",                   canManage, requireRole("ADMIN","STAFF"), createSubDepartment);
router.patch( "/:id/subdepartments/:subDepartmentId",  canManage, requireRole("ADMIN","STAFF"), updateSubDepartment);
router.delete("/:id/subdepartments/:subDepartmentId",  canManage, requireRole("ADMIN","STAFF"), deleteSubDepartment);

// ─── Sub-Department Roster ─────────────────────────────────────
router.get(   "/:id/subdepartments/:subDepartmentId/members",             canView,   listSubDepartmentMembers);
router.post(  "/:id/subdepartments/:subDepartmentId/members",             canManage, requireRole("ADMIN","STAFF"), addSubDepartmentMember);
router.delete("/:id/subdepartments/:subDepartmentId/members/:memberId",   canManage, requireRole("ADMIN","STAFF"), removeSubDepartmentMember);

export default router;
