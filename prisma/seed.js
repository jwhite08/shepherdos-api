// prisma/seed.js
// Seeds the database with a sample organization (Praise Cathedral)
// and realistic member/family data for development and testing.

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding ShepherdOS database...");

  // ── Clean slate ──────────────────────────────────────────────
  await prisma.checkIn.deleteMany();
  await prisma.attendanceLog.deleteMany();
  await prisma.volunteerSchedule.deleteMany();
  await prisma.volunteer.deleteMany();
  await prisma.memberSubDepartment.deleteMany();
  await prisma.contribution.deleteMany();
  await prisma.member.deleteMany();
  await prisma.family.deleteMany();
  await prisma.subDepartment.deleteMany();
  await prisma.ministry.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  // ── Organization ─────────────────────────────────────────────
  const org = await prisma.organization.create({
    data: {
      name: "Praise Cathedral",
      slug: "praise-cathedral",
      primaryColor: "#5B2D8E",
      accentColor: "#C9A84C",
    },
  });
  console.log(`✓ Organization: ${org.name}`);

  // ── Admin User ───────────────────────────────────────────────
  const passwordHash = await bcrypt.hash("admin1234", 10);
  const adminUser = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: "admin@praisecathedral.org",
      passwordHash,
      firstName: "Church",
      lastName: "Admin",
      role: "ADMIN",
      canViewFinance: true,
    },
  });
  console.log(`✓ Admin user: ${adminUser.email} (password: admin1234)`);

  // ── Ministries & Sub-Departments ─────────────────────────────
  const ministriesData = [
    {
      name: "Children's Ministry", icon: "🧒", servesMinors: true,
      subDepts: [
        { name: "Nursery", ageRangeMin: 0, ageRangeMax: 2 },
        { name: "Sunday School", ageRangeMin: 3, ageRangeMax: 5 },
        { name: "Children's Church", ageRangeMin: 6, ageRangeMax: 11 },
      ],
    },
    {
      name: "Youth Ministry", icon: "🎯", servesMinors: true,
      subDepts: [
        { name: "Middle School", ageRangeMin: 12, ageRangeMax: 14 },
        { name: "High School", ageRangeMin: 15, ageRangeMax: 17 },
      ],
    },
    {
      name: "Worship & Arts", icon: "🎵", servesMinors: false,
      subDepts: [
        { name: "Choir" }, { name: "Praise Team" },
        { name: "Band / Orchestra" }, { name: "Dance Ministry" },
      ],
    },
    {
      name: "Outreach & Missions", icon: "🌍", servesMinors: false,
      subDepts: [
        { name: "Local Outreach" }, { name: "Foreign Missions" },
        { name: "Community Service" },
      ],
    },
    {
      name: "Men's Ministry", icon: "👔", servesMinors: false,
      subDepts: [{ name: "Men's Bible Study" }, { name: "Men's Breakfast" }],
    },
    {
      name: "Women's Ministry", icon: "💐", servesMinors: false,
      subDepts: [{ name: "Women's Bible Study" }, { name: "Women's Conference" }],
    },
  ];

  const subDeptMap = {};
  const ministryMap = {};
  for (const [i, m] of ministriesData.entries()) {
    const ministry = await prisma.ministry.create({
      data: { organizationId: org.id, name: m.name, icon: m.icon, servesMinors: m.servesMinors, sortOrder: i },
    });
    ministryMap[m.name] = ministry.id;
    for (const [j, sd] of m.subDepts.entries()) {
      const subDept = await prisma.subDepartment.create({
        data: { organizationId: org.id, ministryId: ministry.id, name: sd.name, ageRangeMin: sd.ageRangeMin ?? null, ageRangeMax: sd.ageRangeMax ?? null, sortOrder: j },
      });
      subDeptMap[sd.name] = subDept.id;
    }
  }
  console.log(`✓ Ministries & sub-departments created`);

  // ── Families & Members ───────────────────────────────────────
  const familiesData = [
    {
      familyName: "The Johnson Family",
      address: "142 Oak Street", city: "Greenville", state: "SC", zip: "29601",
      phone: "(864) 555-0101",
      members: [
        { firstName: "Marcus",   lastName: "Johnson", email: "marcus.johnson@email.com",  phone: "(864) 555-0101", memberStatus: "ACTIVE",   joinDate: new Date("2018-03-15"), isMinor: false },
        { firstName: "Denise",   lastName: "Johnson", email: "denise.johnson@email.com",  phone: "(864) 555-0102", memberStatus: "ACTIVE",   joinDate: new Date("2018-03-15"), isMinor: false },
        { firstName: "Tyler",    lastName: "Johnson", dateOfBirth: new Date("2013-07-22"),memberStatus: "ACTIVE",  isMinor: true, allergies: "Peanut allergy", guardianName: "Marcus Johnson", guardianPhone: "(864) 555-0101" },
        { firstName: "Aaliyah",  lastName: "Johnson", dateOfBirth: new Date("2016-11-04"),memberStatus: "ACTIVE",  isMinor: true, guardianName: "Denise Johnson", guardianPhone: "(864) 555-0102" },
      ],
    },
    {
      familyName: "The Williams Family",
      address: "87 Maple Avenue", city: "Greenville", state: "SC", zip: "29605",
      phone: "(864) 555-0210",
      members: [
        { firstName: "Robert",   lastName: "Williams", email: "robert.williams@email.com", phone: "(864) 555-0210", memberStatus: "ACTIVE", joinDate: new Date("2019-06-01"), isMinor: false },
        { firstName: "Sandra",   lastName: "Williams", email: "sandra.williams@email.com", phone: "(864) 555-0211", memberStatus: "ACTIVE", joinDate: new Date("2019-06-01"), isMinor: false },
        { firstName: "Caleb",    lastName: "Williams", dateOfBirth: new Date("2009-02-14"),memberStatus: "ACTIVE", isMinor: true, medicalNotes: "Asthma — carries inhaler", guardianName: "Robert Williams", guardianPhone: "(864) 555-0210" },
      ],
    },
    {
      familyName: "The Davis Family",
      address: "315 Church Road", city: "Simpsonville", state: "SC", zip: "29680",
      phone: "(864) 555-0320",
      members: [
        { firstName: "Patricia", lastName: "Davis",  email: "patricia.davis@email.com",  phone: "(864) 555-0320", memberStatus: "ACTIVE",    joinDate: new Date("2017-01-08"), isMinor: false },
        { firstName: "Kevin",    lastName: "Davis",  email: "kevin.davis@email.com",     phone: "(864) 555-0321", memberStatus: "INACTIVE",  joinDate: new Date("2017-01-08"), isMinor: false },
        { firstName: "Zoe",      lastName: "Davis",  dateOfBirth: new Date("2020-05-30"),memberStatus: "ACTIVE",  isMinor: true, guardianName: "Patricia Davis", guardianPhone: "(864) 555-0320" },
      ],
    },
    {
      familyName: "The Thompson Family",
      address: "29 Cedar Lane", city: "Mauldin", state: "SC", zip: "29662",
      phone: "(864) 555-0430",
      members: [
        { firstName: "James",    lastName: "Thompson", email: "james.thompson@email.com", phone: "(864) 555-0430", memberStatus: "ACTIVE",   joinDate: new Date("2020-09-20"), isMinor: false },
        { firstName: "Angela",   lastName: "Thompson", email: "angela.thompson@email.com",phone: "(864) 555-0431", memberStatus: "ACTIVE",   joinDate: new Date("2020-09-20"), isMinor: false },
      ],
    },
    {
      familyName: "The Brown Family",
      address: "54 Birch Boulevard", city: "Greenville", state: "SC", zip: "29607",
      phone: "(864) 555-0540",
      members: [
        { firstName: "Charles",  lastName: "Brown", email: "charles.brown@email.com",  phone: "(864) 555-0540", memberStatus: "ACTIVE",   joinDate: new Date("2016-04-10"), isMinor: false },
        { firstName: "Brenda",   lastName: "Brown", email: "brenda.brown@email.com",   phone: "(864) 555-0541", memberStatus: "ACTIVE",   joinDate: new Date("2016-04-10"), isMinor: false },
        { firstName: "Isaiah",   lastName: "Brown", dateOfBirth: new Date("2011-08-19"),memberStatus: "ACTIVE",  isMinor: true, allergies: "Dairy allergy, Egg allergy", medicalNotes: "Carries EpiPen", guardianName: "Charles Brown", guardianPhone: "(864) 555-0540" },
        { firstName: "Naomi",    lastName: "Brown", dateOfBirth: new Date("2014-03-07"),memberStatus: "ACTIVE",  isMinor: true, guardianName: "Brenda Brown", guardianPhone: "(864) 555-0541" },
        { firstName: "Elijah",   lastName: "Brown", dateOfBirth: new Date("2018-12-25"),memberStatus: "ACTIVE",  isMinor: true, guardianName: "Brenda Brown", guardianPhone: "(864) 555-0541" },
      ],
    },
    {
      familyName: "Mitchell (Single)",
      address: "112 Elm Drive", city: "Greenville", state: "SC", zip: "29601",
      phone: "(864) 555-0650",
      members: [
        { firstName: "Dorothy",  lastName: "Mitchell", email: "dorothy.mitchell@email.com", phone: "(864) 555-0650", memberStatus: "ACTIVE", joinDate: new Date("2015-11-30"), isMinor: false },
      ],
    },
    {
      familyName: "The Garcia Family",
      address: "201 Pine Way", city: "Taylors", state: "SC", zip: "29687",
      phone: "(864) 555-0760",
      members: [
        { firstName: "Miguel",   lastName: "Garcia", email: "miguel.garcia@email.com",  phone: "(864) 555-0760", memberStatus: "ACTIVE",    joinDate: new Date("2022-02-14"), isMinor: false },
        { firstName: "Sofia",    lastName: "Garcia", email: "sofia.garcia@email.com",   phone: "(864) 555-0761", memberStatus: "ACTIVE",    joinDate: new Date("2022-02-14"), isMinor: false },
        { firstName: "Lucas",    lastName: "Garcia", dateOfBirth: new Date("2015-06-11"),memberStatus: "ACTIVE",  isMinor: true, guardianName: "Miguel Garcia", guardianPhone: "(864) 555-0760" },
      ],
    },
    {
      familyName: "Harris (New Member)",
      address: "78 Walnut Court", city: "Greenville", state: "SC", zip: "29609",
      phone: "(864) 555-0870",
      members: [
        { firstName: "Tanya",    lastName: "Harris", email: "tanya.harris@email.com",  phone: "(864) 555-0870", memberStatus: "NEW_MEMBER", joinDate: new Date("2026-01-05"), isMinor: false },
        { firstName: "Devon",    lastName: "Harris", email: "devon.harris@email.com",  phone: "(864) 555-0871", memberStatus: "NEW_MEMBER", joinDate: new Date("2026-01-05"), isMinor: false },
      ],
    },
  ];

  const createdMembers = [];
  for (const family of familiesData) {
    const dbFamily = await prisma.family.create({
      data: {
        organizationId: org.id,
        familyName: family.familyName,
        address: family.address,
        city: family.city,
        state: family.state,
        zip: family.zip,
        phone: family.phone,
      },
    });
    for (const m of family.members) {
      const member = await prisma.member.create({
        data: {
          organizationId: org.id,
          familyId: dbFamily.id,
          firstName: m.firstName,
          lastName: m.lastName,
          email: m.email ?? null,
          phone: m.phone ?? null,
          dateOfBirth: m.dateOfBirth ?? null,
          memberStatus: m.memberStatus,
          joinDate: m.joinDate ?? null,
          isMinor: m.isMinor,
          allergies: m.allergies ?? null,
          medicalNotes: m.medicalNotes ?? null,
          guardianName: m.guardianName ?? null,
          guardianPhone: m.guardianPhone ?? null,
        },
      });
      createdMembers.push(member);
    }
  }
  console.log(`✓ ${createdMembers.length} members across ${familiesData.length} families`);

  // ── Assign adult members to sub-departments ──────────────────
  const adults = createdMembers.filter(m => !m.isMinor);
  const deptAssignments = [
    [0, "Choir"], [1, "Praise Team"], [2, "Men's Bible Study"],
    [3, "Women's Bible Study"], [4, "Local Outreach"], [5, "Women's Conference"],
    [6, "Band / Orchestra"],
  ];
  for (const [idx, deptName] of deptAssignments) {
    if (adults[idx] && subDeptMap[deptName]) {
      await prisma.memberSubDepartment.create({
        data: { memberId: adults[idx].id, subDepartmentId: subDeptMap[deptName], role: "Member" },
      });
    }
  }
  console.log(`✓ Department assignments created`);

  // ── Ministry Volunteers & Scheduling ───────────────────────────
  const volunteerAssignments = [
    { ministryName: "Children's Ministry", memberIdx: 1, roleTitle: "Sunday School Teacher" },
    { ministryName: "Children's Ministry", memberIdx: 3, roleTitle: "Nursery Volunteer" },
    { ministryName: "Youth Ministry",      memberIdx: 6, roleTitle: "Youth Leader" },
    { ministryName: "Youth Ministry",      memberIdx: 8, roleTitle: "Youth Chaperone" },
    { ministryName: "Worship & Arts",      memberIdx: 0, roleTitle: "Choir Director" },
    { ministryName: "Outreach & Missions", memberIdx: 4, roleTitle: "Missions Coordinator" },
  ];

  const createdVolunteers = [];
  for (const va of volunteerAssignments) {
    if (adults[va.memberIdx] && ministryMap[va.ministryName]) {
      const volunteer = await prisma.volunteer.create({
        data: {
          organizationId: org.id,
          ministryId: ministryMap[va.ministryName],
          memberId: adults[va.memberIdx].id,
          roleTitle: va.roleTitle,
        },
      });
      createdVolunteers.push(volunteer);
    }
  }

  const daysFromNow = n => new Date(Date.now() + n * 24 * 60 * 60 * 1000);
  for (const [i, v] of createdVolunteers.entries()) {
    await prisma.volunteerSchedule.create({
      data: {
        organizationId: org.id,
        volunteerId: v.id,
        serveDate: daysFromNow(7 * ((i % 3) + 1)),
        status: "SCHEDULED",
      },
    });
  }
  console.log(`✓ ${createdVolunteers.length} ministry volunteers scheduled`);

  // ── Sample Contributions ─────────────────────────────────────
  const contributionData = [
    { memberIdx: 0, amount: 500.00,  type: "TITHE",          method: "CHECK",  date: new Date("2026-01-05") },
    { memberIdx: 0, amount: 500.00,  type: "TITHE",          method: "CHECK",  date: new Date("2026-02-02") },
    { memberIdx: 0, amount: 500.00,  type: "TITHE",          method: "CHECK",  date: new Date("2026-03-02") },
    { memberIdx: 1, amount: 250.00,  type: "OFFERING",       method: "ONLINE", date: new Date("2026-01-12") },
    { memberIdx: 1, amount: 250.00,  type: "OFFERING",       method: "ONLINE", date: new Date("2026-02-09") },
    { memberIdx: 2, amount: 750.00,  type: "TITHE",          method: "ACH",    date: new Date("2026-01-19") },
    { memberIdx: 2, amount: 750.00,  type: "TITHE",          method: "ACH",    date: new Date("2026-02-16") },
    { memberIdx: 2, amount: 200.00,  type: "BUILDING_FUND",  method: "CHECK",  date: new Date("2026-03-01") },
    { memberIdx: 3, amount: 100.00,  type: "OFFERING",       method: "CASH",   date: new Date("2026-01-26") },
    { memberIdx: 4, amount: 1200.00, type: "TITHE",          method: "ONLINE", date: new Date("2026-01-05") },
    { memberIdx: 4, amount: 1200.00, type: "TITHE",          method: "ONLINE", date: new Date("2026-02-02") },
    { memberIdx: 4, amount: 500.00,  type: "MISSIONS",       method: "CHECK",  date: new Date("2026-02-28") },
    { memberIdx: 5, amount: 300.00,  type: "TITHE",          method: "CARD",   date: new Date("2026-01-19") },
    { memberIdx: 6, amount: 150.00,  type: "BENEVOLENCE",    method: "CASH",   date: new Date("2026-02-23") },
    { memberIdx: 7, amount: 50.00,   type: "OFFERING",       method: "CASH",   date: new Date("2026-03-09") },
    { memberIdx: 1, amount: 75.00,   type: "YOUTH_FUND",     method: "CASH",   date: new Date("2026-02-15"), ministryName: "Children's Ministry" },
    { memberIdx: 6, amount: 120.00,  type: "YOUTH_FUND",     method: "ONLINE", date: new Date("2026-03-01"), ministryName: "Youth Ministry" },
  ];

  for (const c of contributionData) {
    if (adults[c.memberIdx]) {
      await prisma.contribution.create({
        data: {
          organizationId: org.id,
          memberId: adults[c.memberIdx].id,
          ministryId: c.ministryName ? ministryMap[c.ministryName] : null,
          amount: c.amount,
          type: c.type,
          method: c.method,
          date: c.date,
        },
      });
    }
  }
  console.log(`✓ ${contributionData.length} contributions seeded`);
  // ── Scoped Test Users ────────────────────────────────────────
  // Two accounts for exercising ministry-scoped access control.
  const scopedUsers = [
    {
      email: "children@praisecathedral.org",
      firstName: "Casey", lastName: "Childers",
      role: "STAFF",
      canViewFinance: false,
      grants: [{ ministry: "Children's Ministry", accessLevel: "MANAGE" }],
      note: "Children's Ministry only — no finance access",
    },
    {
      email: "finance@praisecathedral.org",
      firstName: "Dana", lastName: "Ledger",
      role: "STAFF",
      canViewFinance: true,
      grants: [],
      note: "Finance access, no ministry data",
    },
  ];

  for (const su of scopedUsers) {
    const u = await prisma.user.create({
      data: {
        organizationId: org.id,
        email: su.email,
        passwordHash,
        firstName: su.firstName,
        lastName: su.lastName,
        role: su.role,
        canViewFinance: su.canViewFinance,
      },
    });

    for (const g of su.grants) {
      if (!ministryMap[g.ministry]) continue;
      await prisma.userMinistryAccess.create({
        data: { userId: u.id, ministryId: ministryMap[g.ministry], accessLevel: g.accessLevel },
      });
    }
    console.log(`✓ Test user: ${su.email} (password: admin1234) — ${su.note}`);
  }

  // Tag a couple of budget lines to a ministry so scoping is observable.
  const childrensId = ministryMap["Children's Ministry"];
  if (childrensId) {
    await prisma.budget.updateMany({
      where: { organizationId: org.id, category: { in: ["Youth Programs"] } },
      data: { ministryId: childrensId },
    });
  }

  console.log(`\n✅ Seed complete! ShepherdOS is ready.\n`);
  console.log(`   Admin login: admin@praisecathedral.org / admin1234`);
}

main()
  .catch((e) => { console.error("❌ Seed failed:", e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
