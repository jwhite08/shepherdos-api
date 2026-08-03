// src/lib/prisma.js
// Exports a single shared Prisma client instance.
// Prevents creating too many database connections in development.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["query", "error"] : ["error"],
});

export default prisma;
