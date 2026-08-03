// src/routes/events.js

import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  getEvents,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
  getRegistrations,
  registerMember,
  updateRegistration,
  cancelRegistration,
  getEventTypes,
} from "../controllers/events.controller.js";

const router = Router();
router.use(requireAuth);

// ─── Event CRUD ───────────────────────────────────────────────
router.get( "/types",           getEventTypes);
router.get( "/",                getEvents);
router.get( "/:id",             getEventById);
router.post("/",                requireRole("ADMIN","STAFF"), createEvent);
router.patch("/:id",            requireRole("ADMIN","STAFF"), updateEvent);
router.delete("/:id",           requireRole("ADMIN"),         deleteEvent);

// ─── Registrations ────────────────────────────────────────────
router.get(   "/:id/registrations",          getRegistrations);
router.post(  "/:id/register",               requireRole("ADMIN","STAFF"), registerMember);
router.patch( "/:id/registrations/:regId",   requireRole("ADMIN","STAFF"), updateRegistration);
router.delete("/:id/registrations/:regId",   requireRole("ADMIN","STAFF"), cancelRegistration);

export default router;
