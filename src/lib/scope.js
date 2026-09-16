// src/lib/scope.js
//
// Central authorization scope resolution.
//
// Every ministry-scoped query in the API should build its `where` clause
// through the helpers here rather than hand-rolling a filter. Keeping this
// in one place means an access-control bug is fixed once, and an unscoped
// query is visibly missing a call rather than silently leaking rows.
//
// Two independent axes:
//   role  — what KIND of thing you may do (from UserRole)
//   scope — WHICH ministries' data you may touch (from UserMinistryAccess)
//
// ADMIN and SUPER_ADMIN bypass ministry scoping entirely. Everyone else is
// limited to their granted ministries, and an empty grant set means no
// scoped data at all. This fails closed by design.

import prisma from "./prisma.js";

// Roles that see the whole organization regardless of ministry grants.
export const GLOBAL_ROLES = ["SUPER_ADMIN", "ADMIN"];

export function isGlobalRole(role) {
  return GLOBAL_ROLES.includes(role);
}

/**
 * Resolve a user's ministry scope.
 *
 * Deliberately read from the database per request rather than baked into the
 * JWT: tokens live for 7 days, and revoking someone's access shouldn't wait
 * for their token to expire.
 */
export async function getScope(user) {
  if (isGlobalRole(user.role)) {
    return { all: true, ministryIds: [], manageIds: [], canViewFinance: true };
  }

  const [rows, record] = await Promise.all([
    prisma.userMinistryAccess.findMany({
      where: { userId: user.userId },
      select: { ministryId: true, accessLevel: true },
    }),
    prisma.user.findUnique({
      where: { id: user.userId },
      select: { canViewFinance: true },
    }),
  ]);

  return {
    all: false,
    ministryIds: rows.map(r => r.ministryId),
    manageIds: rows.filter(r => r.accessLevel === "MANAGE").map(r => r.ministryId),
    canViewFinance: record?.canViewFinance ?? false,
  };
}

/** Express middleware — attaches req.scope. Must run after requireAuth. */
export async function attachScope(req, res, next) {
  try {
    req.scope = await getScope(req.user);
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Build a Prisma filter fragment restricting rows to the user's ministries.
 *
 * @param scope             from req.scope
 * @param field             the ministry FK on the model (default "ministryId")
 * @param includeUntagged   if true, rows with a null ministry are also visible.
 *                          Use for church-wide records (e.g. events). Leave
 *                          false for anything where untagged means org-level
 *                          and therefore privileged (e.g. budgets).
 *
 * Returns {} for global roles so it can be spread into any where clause.
 */
export function ministryFilter(scope, { field = "ministryId", includeUntagged = false } = {}) {
  if (scope.all) return {};

  const ids = scope.ministryIds;

  // No grants: deny. `in: []` matches nothing, which is what we want —
  // returning {} here would silently expose the entire organization.
  if (ids.length === 0) {
    return includeUntagged ? { [field]: null } : { [field]: { in: [] } };
  }

  if (includeUntagged) {
    return { OR: [{ [field]: { in: ids } }, { [field]: null }] };
  }
  return { [field]: { in: ids } };
}

/**
 * Filter for models that reach a ministry through a relation rather than a
 * direct FK — e.g. CheckIn → SubDepartment → ministryId.
 *
 * @param relation  the relation field name, e.g. "subDepartment"
 */
export function nestedMinistryFilter(scope, relation, { field = "ministryId" } = {}) {
  if (scope.all) return {};
  return { [relation]: { [field]: { in: scope.ministryIds } } };
}

/** True if the user may modify data belonging to this ministry. */
export function canManageMinistry(scope, ministryId) {
  if (scope.all) return true;
  if (!ministryId) return false; // org-wide records are admin-only
  return scope.manageIds.includes(ministryId);
}

/** True if the user may read data belonging to this ministry. */
export function canViewMinistry(scope, ministryId) {
  if (scope.all) return true;
  if (!ministryId) return false;
  return scope.ministryIds.includes(ministryId);
}

/**
 * Guard for a single record after fetching it. Use when a route takes an :id
 * and you need to confirm the caller may touch that specific record.
 * Returns an error message, or null if allowed.
 */
export function assertCanView(scope, ministryId) {
  return canViewMinistry(scope, ministryId)
    ? null
    : "You do not have access to this ministry's data.";
}

export function assertCanManage(scope, ministryId) {
  return canManageMinistry(scope, ministryId)
    ? null
    : "You do not have permission to modify this ministry's data.";
}

/** Middleware factory: require the finance grant (or a global role). */
export function requireFinanceAccess(req, res, next) {
  if (!req.scope) return res.status(500).json({ error: "Scope not loaded." });
  if (!req.scope.canViewFinance) {
    return res.status(403).json({ error: "You do not have access to financial data." });
  }
  next();
}

/**
 * Middleware factory guarding routes whose path contains a ministry id.
 * Covers every nested ministry route in one place, so adding a new
 * sub-resource under /ministries/:id inherits the check automatically.
 *
 * @param level  "view" or "manage"
 * @param param  the route param holding the ministry id (default "id")
 */
export function requireMinistryAccess(level = "view", param = "id") {
  return (req, res, next) => {
    if (!req.scope) return res.status(500).json({ error: "Scope not loaded." });

    const ministryId = req.params[param];
    if (!ministryId) return res.status(400).json({ error: "Ministry id missing from request." });

    const allowed = level === "manage"
      ? canManageMinistry(req.scope, ministryId)
      : canViewMinistry(req.scope, ministryId);

    if (!allowed) {
      // 404 rather than 403: a scoped user shouldn't be able to probe which
      // ministry ids exist in the organization.
      return res.status(404).json({ error: "Ministry not found." });
    }
    next();
  };
}
