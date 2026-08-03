// src/routes/attendance.js

import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  getAttendance,
  getAttendanceStats,
  checkInMember,
  removeAttendance,
  getChildren,
  getDepartmentCounts,
  checkInChild,
  checkOutChild,
  getActiveCheckIns,
} from "../controllers/attendance.controller.js";

const router = Router();
router.use(requireAuth);

// ─── Adult Attendance ─────────────────────────────────────────
router.get( "/",              getAttendance);
router.get( "/stats",         getAttendanceStats);
router.post("/checkin",       requireRole("ADMIN","STAFF","VOLUNTEER"), checkInMember);
router.delete("/:id",         requireRole("ADMIN","STAFF"),             removeAttendance);

// ─── Child Secure Check-In ────────────────────────────────────
router.get( "/children",         getChildren);
router.get( "/children/active",  getActiveCheckIns);
router.get( "/departments",      getDepartmentCounts);
router.post("/children/checkin", requireRole("ADMIN","STAFF","VOLUNTEER"), checkInChild);
router.post("/children/checkout",requireRole("ADMIN","STAFF","VOLUNTEER"), checkOutChild);

export default router;
