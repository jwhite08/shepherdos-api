// src/routes/ministries.js

import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
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
router.use(requireAuth);

// ─── Ministry ───────────────────────────────────────────────────
router.get("/",   getMinistries);
router.get("/:id", getMinistryById);

// ─── Volunteers ─────────────────────────────────────────────────
router.get(   "/:id/volunteers",               listVolunteers);
router.post(  "/:id/volunteers",               requireRole("ADMIN","STAFF"), addVolunteer);
router.patch( "/:id/volunteers/:volunteerId",  requireRole("ADMIN","STAFF"), updateVolunteer);
router.delete("/:id/volunteers/:volunteerId",  requireRole("ADMIN","STAFF"), removeVolunteer);

// ─── Volunteer Schedule ───────────────────────────────────────
router.get(   "/:id/schedule",              listSchedule);
router.post(  "/:id/schedule",              requireRole("ADMIN","STAFF"), createScheduleEntry);
router.patch( "/:id/schedule/:scheduleId",  requireRole("ADMIN","STAFF"), updateScheduleEntry);
router.delete("/:id/schedule/:scheduleId",  requireRole("ADMIN","STAFF"), deleteScheduleEntry);

// ─── Sub-Departments ────────────────────────────────────────────
router.get(   "/:id/subdepartments",                   listSubDepartments);
router.post(  "/:id/subdepartments",                   requireRole("ADMIN","STAFF"), createSubDepartment);
router.patch( "/:id/subdepartments/:subDepartmentId",  requireRole("ADMIN","STAFF"), updateSubDepartment);
router.delete("/:id/subdepartments/:subDepartmentId",  requireRole("ADMIN","STAFF"), deleteSubDepartment);

// ─── Sub-Department Roster ─────────────────────────────────────
router.get(   "/:id/subdepartments/:subDepartmentId/members",             listSubDepartmentMembers);
router.post(  "/:id/subdepartments/:subDepartmentId/members",             requireRole("ADMIN","STAFF"), addSubDepartmentMember);
router.delete("/:id/subdepartments/:subDepartmentId/members/:memberId",   requireRole("ADMIN","STAFF"), removeSubDepartmentMember);

export default router;
