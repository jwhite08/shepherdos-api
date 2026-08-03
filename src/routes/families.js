// src/routes/families.js

import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import prisma from "../lib/prisma.js";

const router = Router();
router.use(requireAuth);

// GET /api/families — list all families
router.get("/", async (req, res) => {
  const { organizationId } = req.user;
  const { search = "" } = req.query;

  const families = await prisma.family.findMany({
    where: {
      organizationId,
      ...(search && {
        familyName: { contains: search, mode: "insensitive" },
      }),
    },
    include: {
      members: {
        select: { id: true, firstName: true, lastName: true, isMinor: true, memberStatus: true, email: true },
        orderBy: [{ isMinor: "asc" }, { firstName: "asc" }],
      },
    },
    orderBy: { familyName: "asc" },
  });

  res.json(families);
});

// GET /api/families/:id
router.get("/:id", async (req, res) => {
  const { organizationId } = req.user;
  const family = await prisma.family.findFirst({
    where: { id: req.params.id, organizationId },
    include: {
      members: {
        include: {
          subDepartments: {
            include: { subDepartment: { include: { ministry: true } } },
          },
        },
        orderBy: [{ isMinor: "asc" }, { firstName: "asc" }],
      },
    },
  });
  if (!family) return res.status(404).json({ error: "Family not found." });
  res.json(family);
});

// POST /api/families
router.post("/", requireRole("ADMIN", "STAFF"), async (req, res) => {
  const { organizationId } = req.user;
  const { familyName, address, city, state, zip, phone, notes } = req.body;

  if (!familyName) return res.status(400).json({ error: "Family name is required." });

  const family = await prisma.family.create({
    data: {
      organizationId,
      familyName: familyName.trim(),
      address: address?.trim() ?? null,
      city: city?.trim() ?? null,
      state: state?.trim() ?? null,
      zip: zip?.trim() ?? null,
      phone: phone?.trim() ?? null,
      notes: notes?.trim() ?? null,
    },
  });
  res.status(201).json(family);
});

// PATCH /api/families/:id
router.patch("/:id", requireRole("ADMIN", "STAFF"), async (req, res) => {
  const { organizationId } = req.user;
  const existing = await prisma.family.findFirst({ where: { id: req.params.id, organizationId } });
  if (!existing) return res.status(404).json({ error: "Family not found." });

  const { familyName, address, city, state, zip, phone, notes } = req.body;
  const updated = await prisma.family.update({
    where: { id: req.params.id },
    data: {
      ...(familyName !== undefined && { familyName: familyName.trim() }),
      ...(address    !== undefined && { address: address?.trim() ?? null }),
      ...(city       !== undefined && { city: city?.trim() ?? null }),
      ...(state      !== undefined && { state: state?.trim() ?? null }),
      ...(zip        !== undefined && { zip: zip?.trim() ?? null }),
      ...(phone      !== undefined && { phone: phone?.trim() ?? null }),
      ...(notes      !== undefined && { notes: notes?.trim() ?? null }),
    },
    include: { members: true },
  });
  res.json(updated);
});

// DELETE /api/families/:id
router.delete("/:id", requireRole("ADMIN"), async (req, res) => {
  const { organizationId } = req.user;
  const existing = await prisma.family.findFirst({ where: { id: req.params.id, organizationId } });
  if (!existing) return res.status(404).json({ error: "Family not found." });
  await prisma.family.delete({ where: { id: req.params.id } });
  res.json({ message: "Family deleted successfully." });
});

export default router;
