// prisma/seed_events.js
// Run AFTER main seed: node prisma/seed_events.js
// Seeds sample events for the Praise Cathedral org.

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding events...");

  const org = await prisma.organization.findFirst({ where: { slug: "praise-cathedral" } });
  if (!org) { console.error("❌ Organization not found. Run the main seed first."); process.exit(1); }

  await prisma.eventRegistration.deleteMany({ where: { organizationId: org.id } });
  await prisma.event.deleteMany({ where: { organizationId: org.id } });

  const eventsData = [
    { title: "Sunday Worship Service",    type: "Worship",     location: "Main Sanctuary",       startDate: new Date("2026-07-06T10:00:00"), capacity: 800,  isRecurring: true, recurringRule: "Weekly",    description: "Join us for powerful worship and the Word." },
    { title: "Sunday Worship Service",    type: "Worship",     location: "Main Sanctuary",       startDate: new Date("2026-07-13T10:00:00"), capacity: 800,  isRecurring: true, recurringRule: "Weekly",    description: "Join us for powerful worship and the Word." },
    { title: "Wednesday Bible Study",     type: "Study",       location: "Fellowship Hall",      startDate: new Date("2026-07-08T19:00:00"), capacity: 200,  isRecurring: true, recurringRule: "Weekly",    description: "Midweek Bible study and prayer." },
    { title: "Wednesday Bible Study",     type: "Study",       location: "Fellowship Hall",      startDate: new Date("2026-07-15T19:00:00"), capacity: 200,  isRecurring: true, recurringRule: "Weekly",    description: "Midweek Bible study and prayer." },
    { title: "Youth Night",               type: "Youth",       location: "Youth Center",         startDate: new Date("2026-07-11T18:30:00"), capacity: 100,  isRecurring: true, recurringRule: "Bi-weekly", description: "Games, worship, and fellowship for teens." },
    { title: "Men's Breakfast",           type: "Fellowship",  location: "Fellowship Hall",      startDate: new Date("2026-07-18T08:00:00"), capacity: 80,   isRecurring: true, recurringRule: "Monthly",   description: "Brotherhood, breakfast, and the Word." },
    { title: "Women's Conference 2026",   type: "Conference",  location: "Main Sanctuary",       startDate: new Date("2026-08-15T09:00:00"), capacity: 500,  isRecurring: false,                            description: "Annual women's conference: Unshakeable Faith." },
    { title: "Volunteer Training",        type: "Training",    location: "Room 201",             startDate: new Date("2026-07-19T09:00:00"), capacity: 50,   isRecurring: false,                            description: "New volunteer orientation and training." },
    { title: "Community Outreach Day",    type: "Outreach",    location: "Community Park",       startDate: new Date("2026-07-26T08:00:00"), capacity: 150,  isRecurring: false,                            description: "Serving our neighbors with love." },
    { title: "New Members Class",         type: "Study",       location: "Room 102",             startDate: new Date("2026-08-02T11:30:00"), capacity: 30,   isRecurring: false,                            description: "Orientation for those considering church membership." },
    { title: "Summer BBQ & Fellowship",   type: "Fellowship",  location: "Outdoor Pavilion",     startDate: new Date("2026-08-08T12:00:00"), capacity: 300,  isRecurring: false,                            description: "A fun afternoon of food and fellowship for the whole family." },
    { title: "Prayer & Worship Night",    type: "Worship",     location: "Main Sanctuary",       startDate: new Date("2026-07-25T19:00:00"), capacity: 400,  isRecurring: false,                            description: "An evening of extended worship and intercession." },
  ];

  for (const e of eventsData) {
    await prisma.event.create({
      data: { organizationId: org.id, ...e },
    });
  }

  // Add some registrations to a few events
  const createdEvents = await prisma.event.findMany({ where: { organizationId: org.id } });
  const members = await prisma.member.findMany({ where: { organizationId: org.id, isMinor: false }, take: 6 });

  const sundayService = createdEvents.find(e => e.title === "Sunday Worship Service" && e.startDate.toISOString().includes("07-06"));
  const youthNight    = createdEvents.find(e => e.title === "Youth Night");
  const mensBreakfast = createdEvents.find(e => e.title === "Men's Breakfast");

  if (sundayService && members.length > 0) {
    for (const m of members.slice(0, 5)) {
      await prisma.eventRegistration.create({
        data: { organizationId: org.id, eventId: sundayService.id, memberId: m.id, status: "REGISTERED" },
      }).catch(() => {});
    }
  }
  if (mensBreakfast && members.length > 0) {
    for (const m of members.slice(0, 3)) {
      await prisma.eventRegistration.create({
        data: { organizationId: org.id, eventId: mensBreakfast.id, memberId: m.id, status: "REGISTERED" },
      }).catch(() => {});
    }
  }

  console.log(`✅ ${eventsData.length} events seeded with sample registrations.`);
}

main()
  .catch(e => { console.error("❌ Events seed failed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
