-- CreateEnum
CREATE TYPE "MinistryAccessLevel" AS ENUM ('VIEW', 'MANAGE');

-- AlterTable: explicit finance grant, separate from role.
-- Defaults to false so the migration fails closed: nobody gains access
-- to giving data by virtue of this deploy.
ALTER TABLE "users" ADD COLUMN "canViewFinance" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: budgets can now belong to a ministry. NULL = organization-wide.
ALTER TABLE "budgets" ADD COLUMN "ministryId" TEXT;

-- CreateTable
CREATE TABLE "user_ministry_access" (
    "userId" TEXT NOT NULL,
    "ministryId" TEXT NOT NULL,
    "accessLevel" "MinistryAccessLevel" NOT NULL DEFAULT 'VIEW',
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_ministry_access_pkey" PRIMARY KEY ("userId","ministryId")
);

-- AddForeignKey
ALTER TABLE "user_ministry_access" ADD CONSTRAINT "user_ministry_access_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_ministry_access" ADD CONSTRAINT "user_ministry_access_ministryId_fkey"
    FOREIGN KEY ("ministryId") REFERENCES "ministries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "budgets" ADD CONSTRAINT "budgets_ministryId_fkey"
    FOREIGN KEY ("ministryId") REFERENCES "ministries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Replace the budget uniqueness rule: category names are now unique per
-- ministry rather than per organization, so two ministries can each have
-- their own "Supplies" line.
DROP INDEX IF EXISTS "budgets_organizationId_category_year_key";
CREATE UNIQUE INDEX "budgets_organizationId_ministryId_category_year_key"
    ON "budgets"("organizationId", "ministryId", "category", "year");

-- Existing admins keep working exactly as before. ADMIN and SUPER_ADMIN
-- bypass ministry scoping in application code, but they still need the
-- finance flag set since it is checked independently of role.
UPDATE "users" SET "canViewFinance" = true WHERE "role" IN ('ADMIN', 'SUPER_ADMIN');
