// src/index.js — ShepherdOS API entry point

import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";

import authRoutes        from "./routes/auth.js";
import memberAuthRoutes  from "./routes/memberAuth.js";
import memberRoutes      from "./routes/members.js";
import familyRoutes      from "./routes/families.js";
import dashboardRoutes   from "./routes/dashboard.js";
import adminRoutes       from "./routes/admin.js";
import financeRoutes     from "./routes/finance.js";
import eventRoutes       from "./routes/events.js";
import attendanceRoutes  from "./routes/attendance.js";
import portalRoutes      from "./routes/portal.js";
import portalAdminRoutes from "./routes/portalAdmin.js";
import ministryRoutes    from "./routes/ministries.js";

const app  = express();
const PORT = process.env.PORT || 4000;

// ─── Middleware ───────────────────────────────────────────────
app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:3000", credentials: true }));
app.use(express.json());
app.use(morgan("dev"));

// ─── Health Check ─────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "ShepherdOS API", timestamp: new Date().toISOString() });
});

// ─── Routes ───────────────────────────────────────────────────
app.use("/api/auth",         authRoutes);
app.use("/api/member-auth",  memberAuthRoutes);
app.use("/api/members",      memberRoutes);
app.use("/api/families",     familyRoutes);
app.use("/api/dashboard",    dashboardRoutes);
app.use("/api/admin",        adminRoutes);
app.use("/api/finance",      financeRoutes);
app.use("/api/events",       eventRoutes);
app.use("/api/attendance",   attendanceRoutes);
app.use("/api/portal",       portalRoutes);
app.use("/api/portal-admin", portalAdminRoutes);
app.use("/api/ministries",   ministryRoutes);

// ─── 404 Handler ──────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// ─── Global Error Handler ─────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

// ─── Start ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 ShepherdOS API running on http://localhost:${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV}`);
  console.log(`   Health:      http://localhost:${PORT}/health\n`);
});
