import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const email   = "joshtwhite08@gmail.com";
const newPass = "NewPassword123!";

const user = await prisma.user.findFirst({ where: { email } });
if (!user) { console.log("No user found with that email."); process.exit(1); }

const hash = await bcrypt.hash(newPass, 10);
await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hash } });

console.log(`✓ Password reset for ${user.firstName} ${user.lastName} (${user.email})`);
await prisma.$disconnect();