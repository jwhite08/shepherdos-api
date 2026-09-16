// src/routes/admin.js
// Access-control administration. Global admins only.

import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { listUsers, setUserAccess } from "../controllers/admin.controller.js";

const router = Router();

// Deliberately gated at the router level rather than per-route, so a new
// endpoint added here can't accidentally ship without an admin check.
router.use(requireAuth, requireRole("ADMIN", "SUPER_ADMIN"));

router.get("/users",         listUsers);
router.put("/users/:id/access", setUserAccess);

export default router;
