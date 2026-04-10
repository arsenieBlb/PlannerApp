/**
 * Realistic demo seed — simulates a student's actual week.
 * Run with: npm run db:seed
 */

import { PrismaClient } from "@prisma/client";
import {
  addDays, subDays, setHours, setMinutes, startOfDay,
} from "date-fns";

const prisma = new PrismaClient();

const now = new Date();
const today = startOfDay(now);

function daysAgo(n: number, h = 9, m = 0) {
  return setMinutes(setHours(startOfDay(subDays(today, n)), h), m);
}
function daysFromNow(n: number, h = 9, m = 0) {
  return setMinutes(setHours(startOfDay(addDays(today, n)), h), m);
}

async function main() {
  console.log("🌱 Seeding realistic demo data…");

  // Use the first real (non-demo) profile if it exists, otherwise fall back to demo
  let profile = await prisma.profile.findFirst({
    where: { email: { not: "demo@example.com" } },
    orderBy: { createdAt: "desc" },
  });

  if (!profile) {
    profile = await prisma.profile.upsert({
      where: { email: "demo@example.com" },
      create: { email: "demo@example.com", name: "Demo User", avatarUrl: null },
      update: {},
    });
  }

  console.log(`   → Seeding for profile: ${profile.email}`);

  await prisma.settings.upsert({
    where: { profileId: profile.id },
    create: { profileId: profile.id, aiProvider: "mock", gmailSyncEnabled: false, calendarSyncEnabled: false },
    update: {},
  });

  // ─── Clear ALL old seed data (across all profiles, by known gmailIds) ──────
  const seedGmailIds = [
    "seed_001","seed_002","seed_003","seed_004","seed_005",
    "seed_006","seed_007","seed_008","seed_009","seed_010",
  ];

  // Delete in dependency order
  const oldEmails = await prisma.email.findMany({
    where: { gmailId: { in: seedGmailIds } },
    select: { id: true },
  });
  const oldEmailIds = oldEmails.map((e) => e.id);

  if (oldEmailIds.length > 0) {
    await prisma.approvalItem.deleteMany({
      where: { OR: [{ profileId: profile.id }, { emailId: { in: oldEmailIds } }] },
    });
    await prisma.replyDraft.deleteMany({ where: { emailId: { in: oldEmailIds } } });
    await prisma.calendarSuggestion.deleteMany({ where: { emailId: { in: oldEmailIds } } });
    await prisma.task.deleteMany({ where: { emailId: { in: oldEmailIds } } });
    await prisma.email.deleteMany({ where: { id: { in: oldEmailIds } } });
  } else {
    await prisma.approvalItem.deleteMany({ where: { profileId: profile.id } });
  }

  await prisma.plannerItem.deleteMany({ where: { profileId: profile.id } });

  // ─── Emails ───────────────────────────────────────────────────────────────

  const emailsData = [
    // 1 — Professor: project deadline
    {
      gmailId: "seed_001",
      threadId: "thread_001",
      subject: "IT-PRO2X — Group Project submission deadline extended",
      fromName: "Prof. van der Berg",
      fromEmail: "j.vanderberg@university.edu",
      snippet: "Dear students, due to the bank holiday the final group project submission deadline has been moved to Sunday 13 April at 23:59. Please ensure all team members push their code to the shared repo before then.",
      bodyText: `Dear students,

Due to the upcoming bank holiday, the final group project submission deadline for IT-PRO2X has been moved to Sunday 13 April at 23:59 CET.

Please ensure:
- All team members have pushed their latest code to the shared GitLab repo
- The README is up to date with setup instructions
- A short 3-minute demo video is uploaded to the course portal

If you have any questions, come to my office hours on Tuesday 10:00–12:00.

Best regards,
Prof. van der Berg`,
      receivedAt: daysAgo(1, 14, 32),
      aiSummary: "Professor moved the IT-PRO2X group project deadline to Sunday 13 April 23:59 due to bank holiday. Requires code push, README update, and demo video.",
      aiCategory: "deadline",
      aiPriority: "high",
      aiTags: JSON.stringify(["deadline", "school", "action_required", "needs_reply"]),
      aiConfidence: 0.94,
    },
    // 2 — Group member: meeting request
    {
      gmailId: "seed_002",
      threadId: "thread_002",
      subject: "IT-PRO2X — Team sync before deadline?",
      fromName: "Lena Kowalski",
      fromEmail: "l.kowalski@student.university.edu",
      snippet: "Hey, should we do a quick Zoom call on Saturday morning to review each other's code before the Sunday deadline? I'm free from 10am.",
      bodyText: `Hey,

Should we do a quick Zoom call on Saturday morning to review each other's code before the Sunday deadline? I'm thinking 10:00–11:30 so we have time to fix anything before submitting.

I can set up the call if you confirm.

Let me know!
Lena`,
      receivedAt: daysAgo(0, 10, 15),
      aiSummary: "Teammate Lena proposes a Zoom code review session Saturday 10:00–11:30 before the Sunday project deadline.",
      aiCategory: "meeting",
      aiPriority: "high",
      aiTags: JSON.stringify(["meeting", "needs_reply", "school", "urgent"]),
      aiConfidence: 0.91,
    },
    // 3 — Part-time job: shift schedule
    {
      gmailId: "seed_003",
      threadId: "thread_003",
      subject: "Your shifts for next week — please confirm",
      fromName: "Marco (Supervisor)",
      fromEmail: "marco.shifts@cafebarcelona.nl",
      snippet: "Hi, your shifts next week: Tuesday 17:00–22:00 and Friday 18:00–23:00. Please reply to confirm or let me know if you need to swap.",
      bodyText: `Hi,

Your scheduled shifts for next week:
- Tuesday 15 April: 17:00 – 22:00
- Friday 18 April: 18:00 – 23:00

Please reply by tomorrow to confirm or if you need to swap with someone.

Cheers,
Marco`,
      receivedAt: daysAgo(0, 9, 0),
      aiSummary: "Work shift schedule for next week: Tuesday 17-22h and Friday 18-23h. Needs reply to confirm.",
      aiCategory: "work",
      aiPriority: "normal",
      aiTags: JSON.stringify(["needs_reply", "work"]),
      aiConfidence: 0.87,
    },
    // 4 — Friend: weekend plans
    {
      gmailId: "seed_004",
      threadId: "thread_004",
      subject: "Saturday night plans?",
      fromName: "Daan",
      fromEmail: "daan.visser@gmail.com",
      snippet: "Yo! A few of us are going to the rooftop bar on Saturday around 9pm. You coming? Tom and Sarah will be there too.",
      bodyText: `Yo!

A few of us are heading to the Rooftop Bar on Saturday around 21:00. Tom and Sarah will be there too, might go to the club after.

You coming? Let me know so I can add you to the group chat.

Daan`,
      receivedAt: daysAgo(0, 11, 42),
      aiSummary: "Friend Daan inviting to rooftop bar Saturday ~21:00 with Tom and Sarah.",
      aiCategory: "personal",
      aiPriority: "low",
      aiTags: JSON.stringify(["needs_reply", "personal"]),
      aiConfidence: 0.82,
    },
    // 5 — University: exam schedule released
    {
      gmailId: "seed_005",
      threadId: "thread_005",
      subject: "Final Exam Schedule — Spring 2026",
      fromName: "Student Administration",
      fromEmail: "admin@university.edu",
      snippet: "The final exam schedule for Spring 2026 has been published. Your exams: IT-SEF2X on 22 May 09:00, IT-SWE1X on 26 May 13:00. Room assignments attached.",
      bodyText: `Dear Student,

The final exam schedule for Spring 2026 has been published on the student portal.

Your registered exams:
- IT-SEF2X (Software Engineering Fundamentals): 22 May 2026 at 09:00, Room A-214
- IT-SWE1X (Software Architecture): 26 May 2026 at 13:00, Room B-108

Please arrive 15 minutes early. Student ID required.

Student Administration`,
      receivedAt: daysAgo(2, 8, 0),
      aiSummary: "Exam schedule published: IT-SEF2X on 22 May 09:00 (Room A-214) and IT-SWE1X on 26 May 13:00 (Room B-108).",
      aiCategory: "school",
      aiPriority: "high",
      aiTags: JSON.stringify(["deadline", "school"]),
      aiConfidence: 0.96,
    },
    // 6 — Bank: payment confirmation
    {
      gmailId: "seed_006",
      threadId: "thread_006",
      subject: "Payment received — April rent",
      fromName: "ING Bank",
      fromEmail: "noreply@ing.nl",
      snippet: "Your transfer of €750.00 to Verhuur Amsterdam BV has been processed successfully on 10 Apr 2026.",
      bodyText: `Your transfer has been processed:

Amount: €750.00
To: Verhuur Amsterdam BV
Date: 10 April 2026
Reference: Huur April 2026

No action required.

ING Bank`,
      receivedAt: daysAgo(0, 7, 3),
      aiSummary: "Rent payment of €750 to landlord processed successfully.",
      aiCategory: "personal",
      aiPriority: "low",
      aiTags: JSON.stringify(["no_reply_needed"]),
      aiConfidence: 0.98,
    },
    // 7 — Study group: notes sharing
    {
      gmailId: "seed_007",
      threadId: "thread_007",
      subject: "IT-SEF2X — Shared notes for Chapter 7 & 8",
      fromName: "Priya Sharma",
      fromEmail: "p.sharma@student.university.edu",
      snippet: "Hi everyone, I uploaded my notes for Chapter 7 (Design Patterns) and Chapter 8 (Testing) to the shared Drive folder. Let me know if anything needs fixing.",
      bodyText: `Hi everyone,

I uploaded my notes for the exam chapters to the shared Google Drive folder:
- Chapter 7: Design Patterns (Factory, Observer, Strategy)
- Chapter 8: Unit Testing & TDD

Link: drive.google.com/shared/sef2x-notes

Let me know if anything is wrong or missing. Can someone do Chapter 9?

Priya`,
      receivedAt: daysAgo(1, 20, 15),
      aiSummary: "Priya shared study notes for IT-SEF2X Chapters 7 and 8 in shared Drive. Asking someone to cover Chapter 9.",
      aiCategory: "school",
      aiPriority: "normal",
      aiTags: JSON.stringify(["school"]),
      aiConfidence: 0.85,
    },
    // 8 — Internship: interview invitation
    {
      gmailId: "seed_008",
      threadId: "thread_008",
      subject: "Software Engineering Internship — Interview Invitation",
      fromName: "HR Team — TechNova",
      fromEmail: "hr@technova.io",
      snippet: "Congratulations! We reviewed your application and would like to invite you for a technical interview on Tuesday 15 April at 14:00 via Google Meet. Please confirm your availability.",
      bodyText: `Dear Applicant,

Congratulations! After reviewing your application, we would like to invite you to a technical interview for our Summer 2026 Software Engineering Internship.

Interview details:
- Date: Tuesday 15 April 2026
- Time: 14:00 – 15:00 CET
- Format: Google Meet (link will be sent upon confirmation)
- Topics: Data structures, algorithms, one small live coding exercise

Please reply to confirm your availability by end of day tomorrow.

Best regards,
HR Team
TechNova`,
      receivedAt: daysAgo(0, 13, 0),
      aiSummary: "TechNova invited you for a technical internship interview on Tuesday 15 April at 14:00 via Google Meet. Needs confirmation today.",
      aiCategory: "work",
      aiPriority: "high",
      aiTags: JSON.stringify(["needs_reply", "meeting", "work", "urgent"]),
      aiConfidence: 0.97,
    },
    // 9 — Newsletter (low priority)
    {
      gmailId: "seed_009",
      threadId: "thread_009",
      subject: "GitHub Education Pack — New tools available",
      fromName: "GitHub Education",
      fromEmail: "education@github.com",
      snippet: "New tools have been added to your GitHub Student Developer Pack. Check out the latest offers from JetBrains, Notion, and more.",
      bodyText: `New tools in your Student Pack!

Your GitHub Student Developer Pack now includes:
- JetBrains All Products Pack (free while student)
- Notion Pro (free)
- Namecheap domain (1 year free)

Log in to github.com/education to activate.`,
      receivedAt: daysAgo(3, 10, 0),
      aiSummary: "GitHub Education added new tools to Student Pack: JetBrains, Notion Pro, Namecheap domain.",
      aiCategory: "newsletter",
      aiPriority: "low",
      aiTags: JSON.stringify(["no_reply_needed"]),
      aiConfidence: 0.93,
    },
    // 10 — Landlord: maintenance
    {
      gmailId: "seed_010",
      threadId: "thread_010",
      subject: "Apartment maintenance visit — Monday 14 April 10:00–12:00",
      fromName: "Verhuur Amsterdam BV",
      fromEmail: "beheer@verhuuramsterdam.nl",
      snippet: "We will send a technician to check the heating system on Monday 14 April between 10:00 and 12:00. Please ensure someone is home.",
      bodyText: `Dear Tenant,

We will send a technician to inspect and service the central heating system in your apartment on:

Monday 14 April 2026, between 10:00 and 12:00

Please ensure someone is home during this time window. If this is not possible, please contact us before Friday.

Verhuur Amsterdam BV`,
      receivedAt: daysAgo(1, 16, 0),
      aiSummary: "Landlord scheduling heating maintenance visit Monday 14 April 10:00–12:00. Must be home.",
      aiCategory: "personal",
      aiPriority: "high",
      aiTags: JSON.stringify(["action_required", "meeting"]),
      aiConfidence: 0.89,
    },
  ];

  const createdEmails: Record<string, string> = {}; // gmailId -> db id

  for (const e of emailsData) {
    const created = await prisma.email.create({
      data: {
        profileId: profile.id,
        gmailId: e.gmailId,
        threadId: e.threadId,
        subject: e.subject,
        fromName: e.fromName,
        fromEmail: e.fromEmail,
        toEmails: JSON.stringify([profile.email]),
        snippet: e.snippet,
        bodyText: e.bodyText,
        receivedAt: e.receivedAt,
        aiSummary: e.aiSummary,
        aiCategory: e.aiCategory,
        aiPriority: e.aiPriority,
        aiTags: e.aiTags,
        aiConfidence: e.aiConfidence,
        aiProcessedAt: new Date(),
        isRead: false,
      },
    });
    createdEmails[e.gmailId] = created.id;
  }

  // ─── Reply drafts + approval items ────────────────────────────────────────

  // Draft reply to professor
  const draft1 = await prisma.replyDraft.create({
    data: {
      emailId: createdEmails["seed_001"],
      subject: "Re: IT-PRO2X — Group Project submission deadline extended",
      body: `Dear Prof. van der Berg,

Thank you for the update — the extended deadline is much appreciated.

I have notified my team and we will ensure all code is pushed, the README updated, and the demo video uploaded before Sunday 13 April at 23:59.

Best regards`,
      style: "formal",
      confidence: 0.82,
    },
  });

  await prisma.approvalItem.create({
    data: {
      profileId: profile.id,
      type: "reply",
      status: "pending",
      priority: "normal",
      title: "Reply to Prof. van der Berg — project deadline",
      description: "Formal acknowledgment of extended deadline",
      emailId: createdEmails["seed_001"],
      replyDraftId: draft1.id,
    },
  });

  // Draft reply to Lena (meeting)
  const draft2 = await prisma.replyDraft.create({
    data: {
      emailId: createdEmails["seed_002"],
      subject: "Re: IT-PRO2X — Team sync before deadline?",
      body: `Hey Lena,

Saturday 10:00 works great for me! Yes please set up the Zoom call.

I'll review my part of the code tonight so I'm ready for the session.

See you Saturday!`,
      style: "normal",
      confidence: 0.79,
    },
  });

  await prisma.approvalItem.create({
    data: {
      profileId: profile.id,
      type: "reply",
      status: "pending",
      priority: "high",
      title: "Reply to Lena — Saturday code review",
      description: "Confirm Saturday 10:00 Zoom session",
      emailId: createdEmails["seed_002"],
      replyDraftId: draft2.id,
    },
  });

  // Draft reply to internship interview
  const draft3 = await prisma.replyDraft.create({
    data: {
      emailId: createdEmails["seed_008"],
      subject: "Re: Software Engineering Internship — Interview Invitation",
      body: `Dear HR Team,

Thank you for the invitation — I am very excited about this opportunity!

Tuesday 15 April at 14:00 works perfectly for me. Please send the Google Meet link at your convenience.

Looking forward to the interview.

Best regards`,
      style: "formal",
      confidence: 0.91,
    },
  });

  await prisma.approvalItem.create({
    data: {
      profileId: profile.id,
      type: "reply",
      status: "pending",
      priority: "high",
      title: "Reply to TechNova — confirm interview",
      description: "Confirm Tuesday 15 April 14:00 interview",
      emailId: createdEmails["seed_008"],
      replyDraftId: draft3.id,
    },
  });

  // Draft reply to work shifts
  const draft4 = await prisma.replyDraft.create({
    data: {
      emailId: createdEmails["seed_003"],
      subject: "Re: Your shifts for next week — please confirm",
      body: `Hi Marco,

Confirmed — both shifts work for me.

Tuesday 15 April 17:00–22:00 ✓
Friday 18 April 18:00–23:00 ✓

See you Tuesday!`,
      style: "concise",
      confidence: 0.88,
    },
  });

  await prisma.approvalItem.create({
    data: {
      profileId: profile.id,
      type: "reply",
      status: "pending",
      priority: "normal",
      title: "Reply to Marco — confirm work shifts",
      description: "Confirm Tuesday + Friday shifts",
      emailId: createdEmails["seed_003"],
      replyDraftId: draft4.id,
    },
  });

  // ─── Calendar suggestions ──────────────────────────────────────────────────

  // Project deadline
  const cal1 = await prisma.calendarSuggestion.create({
    data: {
      emailId: createdEmails["seed_001"],
      title: "IT-PRO2X Project Submission Deadline",
      description: "Push code, update README, upload demo video to course portal",
      startTime: daysFromNow(3, 23, 59),
      endTime: null,
      type: "deadline",
      confidence: 0.94,
    },
  });

  await prisma.approvalItem.create({
    data: {
      profileId: profile.id,
      type: "calendar_event",
      status: "pending",
      priority: "high",
      title: "Add deadline: IT-PRO2X Project — Sunday 23:59",
      description: "Detected from professor email",
      emailId: createdEmails["seed_001"],
      calendarSuggestionId: cal1.id,
    },
  });

  // Team Zoom call
  const cal2 = await prisma.calendarSuggestion.create({
    data: {
      emailId: createdEmails["seed_002"],
      title: "IT-PRO2X Team Code Review — Zoom",
      description: "Review each other's code with Lena and team before Sunday submission",
      startTime: daysFromNow(1, 10, 0),
      endTime: daysFromNow(1, 11, 30),
      location: "Zoom (link from Lena)",
      type: "meeting",
      confidence: 0.91,
    },
  });

  await prisma.approvalItem.create({
    data: {
      profileId: profile.id,
      type: "calendar_event",
      status: "pending",
      priority: "high",
      title: "Add meeting: Team code review Saturday 10:00",
      description: "Detected from Lena's email",
      emailId: createdEmails["seed_002"],
      calendarSuggestionId: cal2.id,
    },
  });

  // Internship interview
  const cal3 = await prisma.calendarSuggestion.create({
    data: {
      emailId: createdEmails["seed_008"],
      title: "TechNova Internship Interview",
      description: "Technical interview — data structures, algorithms, live coding. Google Meet link coming.",
      startTime: daysFromNow(5, 14, 0),
      endTime: daysFromNow(5, 15, 0),
      location: "Google Meet",
      type: "meeting",
      confidence: 0.97,
    },
  });

  await prisma.approvalItem.create({
    data: {
      profileId: profile.id,
      type: "calendar_event",
      status: "pending",
      priority: "high",
      title: "Add meeting: TechNova interview Tuesday 14:00",
      description: "Software engineering internship interview",
      emailId: createdEmails["seed_008"],
      calendarSuggestionId: cal3.id,
    },
  });

  // Apartment maintenance
  const cal4 = await prisma.calendarSuggestion.create({
    data: {
      emailId: createdEmails["seed_010"],
      title: "Heating maintenance — stay home",
      description: "Technician from landlord visiting for heating inspection",
      startTime: daysFromNow(4, 10, 0),
      endTime: daysFromNow(4, 12, 0),
      location: "Home",
      type: "reminder",
      confidence: 0.89,
    },
  });

  await prisma.approvalItem.create({
    data: {
      profileId: profile.id,
      type: "calendar_event",
      status: "pending",
      priority: "normal",
      title: "Add: Heating maintenance — Monday 10:00–12:00",
      description: "Must be home for technician visit",
      emailId: createdEmails["seed_010"],
      calendarSuggestionId: cal4.id,
    },
  });

  // Exam IT-SEF2X
  const cal5 = await prisma.calendarSuggestion.create({
    data: {
      emailId: createdEmails["seed_005"],
      title: "EXAM: IT-SEF2X — Software Engineering",
      description: "Room A-214. Arrive 15 minutes early. Bring student ID.",
      startTime: new Date("2026-05-22T09:00:00"),
      endTime: new Date("2026-05-22T12:00:00"),
      location: "Room A-214",
      type: "deadline",
      confidence: 0.96,
    },
  });

  await prisma.approvalItem.create({
    data: {
      profileId: profile.id,
      type: "calendar_event",
      status: "pending",
      priority: "high",
      title: "Add exam: IT-SEF2X — 22 May 09:00",
      description: "Room A-214",
      emailId: createdEmails["seed_005"],
      calendarSuggestionId: cal5.id,
    },
  });

  // Exam IT-SWE1X
  const cal6 = await prisma.calendarSuggestion.create({
    data: {
      emailId: createdEmails["seed_005"],
      title: "EXAM: IT-SWE1X — Software Architecture",
      description: "Room B-108. Arrive 15 minutes early. Bring student ID.",
      startTime: new Date("2026-05-26T13:00:00"),
      endTime: new Date("2026-05-26T16:00:00"),
      location: "Room B-108",
      type: "deadline",
      confidence: 0.96,
    },
  });

  await prisma.approvalItem.create({
    data: {
      profileId: profile.id,
      type: "calendar_event",
      status: "pending",
      priority: "high",
      title: "Add exam: IT-SWE1X — 26 May 13:00",
      description: "Room B-108",
      emailId: createdEmails["seed_005"],
      calendarSuggestionId: cal6.id,
    },
  });

  // ─── Tasks extracted from emails ──────────────────────────────────────────

  const task1 = await prisma.task.create({
    data: {
      emailId: createdEmails["seed_001"],
      title: "Push final code to GitLab before Sunday 23:59",
      description: "IT-PRO2X group project — coordinate with team",
      dueDate: daysFromNow(3, 23, 0),
      priority: "high",
    },
  });

  await prisma.approvalItem.create({
    data: {
      profileId: profile.id,
      type: "task",
      status: "pending",
      priority: "high",
      title: "Push final code to GitLab before Sunday 23:59",
      emailId: createdEmails["seed_001"],
      taskId: task1.id,
    },
  });

  const task2 = await prisma.task.create({
    data: {
      emailId: createdEmails["seed_001"],
      title: "Upload demo video to IT-PRO2X course portal",
      description: "3 minute demo video required for submission",
      dueDate: daysFromNow(3, 22, 0),
      priority: "high",
    },
  });

  await prisma.approvalItem.create({
    data: {
      profileId: profile.id,
      type: "task",
      status: "pending",
      priority: "high",
      title: "Upload demo video to course portal",
      emailId: createdEmails["seed_001"],
      taskId: task2.id,
    },
  });

  const task3 = await prisma.task.create({
    data: {
      emailId: createdEmails["seed_008"],
      title: "Prepare for TechNova technical interview",
      description: "Review: data structures, algorithms, sorting, graph traversal, live coding practice",
      dueDate: daysFromNow(5, 9, 0),
      priority: "high",
    },
  });

  await prisma.approvalItem.create({
    data: {
      profileId: profile.id,
      type: "task",
      status: "pending",
      priority: "high",
      title: "Prepare for TechNova technical interview",
      description: "Data structures, algorithms, live coding",
      emailId: createdEmails["seed_008"],
      taskId: task3.id,
    },
  });

  // ─── Planner items (manual / already-known schedule) ──────────────────────

  const plannerItems = [
    // Today
    {
      title: "IT-PRO2X Lecture",
      type: "event",
      priority: "normal",
      tags: JSON.stringify(["school"]),
      startTime: setMinutes(setHours(today, 9), 0),
      endTime: setMinutes(setHours(today, 11), 0),
      description: "Weekly project lecture — check for any last-minute deadline updates",
    },
    {
      title: "Write Chapter 9 summary notes for study group",
      type: "task",
      priority: "normal",
      tags: JSON.stringify(["school"]),
      startTime: setMinutes(setHours(today, 14), 0),
      endTime: setMinutes(setHours(today, 16), 0),
      description: "Priya asked someone to cover Chapter 9 for IT-SEF2X shared notes",
    },
    // Tomorrow (Saturday)
    {
      title: "IT-PRO2X Team Code Review — Zoom",
      type: "event",
      priority: "high",
      tags: JSON.stringify(["school", "meeting"]),
      startTime: daysFromNow(1, 10, 0),
      endTime: daysFromNow(1, 11, 30),
      description: "Zoom with Lena and team — review code before Sunday deadline",
    },
    {
      title: "Finish IT-PRO2X project — personal part",
      type: "block",
      priority: "high",
      tags: JSON.stringify(["school"]),
      startTime: daysFromNow(1, 13, 0),
      endTime: daysFromNow(1, 17, 0),
      description: "Deep work block — finish implementation and write tests",
    },
    {
      title: "Rooftop bar with Daan, Tom & Sarah",
      type: "event",
      priority: "low",
      tags: JSON.stringify(["personal"]),
      startTime: daysFromNow(1, 21, 0),
      endTime: daysFromNow(1, 23, 59),
      description: "If project is done in time",
    },
    // Sunday — deadline day
    {
      title: "Final review + submit IT-PRO2X project",
      type: "deadline",
      priority: "high",
      tags: JSON.stringify(["school", "deadline"]),
      startTime: daysFromNow(2, 18, 0),
      endTime: daysFromNow(2, 23, 59),
      description: "Check all requirements: code pushed, README done, video uploaded",
    },
    // Monday
    {
      title: "Heating maintenance — stay home",
      type: "reminder",
      priority: "normal",
      tags: JSON.stringify(["personal"]),
      startTime: daysFromNow(3, 10, 0),
      endTime: daysFromNow(3, 12, 0),
      description: "Technician from landlord. Must be home 10:00–12:00.",
    },
    {
      title: "IT-SEF2X Study session — Design Patterns",
      type: "block",
      priority: "high",
      tags: JSON.stringify(["school"]),
      startTime: daysFromNow(3, 14, 0),
      endTime: daysFromNow(3, 17, 0),
      description: "Chapter 7 & 8 — use Priya's shared notes",
    },
    // Tuesday
    {
      title: "Work shift — Café Barcelona",
      type: "block",
      priority: "normal",
      tags: JSON.stringify(["work"]),
      startTime: daysFromNow(5, 17, 0),
      endTime: daysFromNow(5, 22, 0),
      description: "Evening shift",
    },
    {
      title: "TechNova Internship Interview",
      type: "event",
      priority: "high",
      tags: JSON.stringify(["work", "meeting"]),
      startTime: daysFromNow(5, 14, 0),
      endTime: daysFromNow(5, 15, 0),
      description: "Google Meet — technical interview: DS, algorithms, live coding. Prepare tonight.",
    },
    {
      title: "Interview prep — algorithms & LeetCode",
      type: "block",
      priority: "high",
      tags: JSON.stringify(["work"]),
      startTime: daysFromNow(4, 19, 0),
      endTime: daysFromNow(4, 21, 30),
      description: "Practice: arrays, hashmaps, BFS/DFS, 2-3 LeetCode medium problems",
    },
    // Upcoming exams reminders
    {
      title: "Exam study plan: IT-SEF2X (22 May)",
      type: "task",
      priority: "high",
      tags: JSON.stringify(["school"]),
      startTime: daysFromNow(7, 9, 0),
      description: "Create a 2-week study schedule for IT-SEF2X exam",
    },
    {
      title: "EXAM — IT-SEF2X Software Engineering",
      type: "deadline",
      priority: "high",
      tags: JSON.stringify(["school", "deadline"]),
      startTime: new Date("2026-05-22T09:00:00"),
      endTime: new Date("2026-05-22T12:00:00"),
      description: "Room A-214. Student ID required.",
    },
    {
      title: "EXAM — IT-SWE1X Software Architecture",
      type: "deadline",
      priority: "high",
      tags: JSON.stringify(["school", "deadline"]),
      startTime: new Date("2026-05-26T13:00:00"),
      endTime: new Date("2026-05-26T16:00:00"),
      description: "Room B-108. Student ID required.",
    },
    // Recurring personal
    {
      title: "Grocery shopping",
      type: "task",
      priority: "low",
      tags: JSON.stringify(["personal"]),
      startTime: daysFromNow(2, 11, 0),
      description: "Coffee, bread, pasta, vegetables, snacks for study week",
    },
    {
      title: "Gym",
      type: "block",
      priority: "low",
      tags: JSON.stringify(["personal"]),
      startTime: daysFromNow(4, 7, 0),
      endTime: daysFromNow(4, 8, 30),
      description: "Morning workout before interview day",
    },
    // Work shift Friday
    {
      title: "Work shift — Café Barcelona",
      type: "block",
      priority: "normal",
      tags: JSON.stringify(["work"]),
      startTime: daysFromNow(8, 18, 0),
      endTime: daysFromNow(8, 23, 0),
      description: "Evening shift",
    },
  ];

  for (const item of plannerItems) {
    await prisma.plannerItem.create({
      data: {
        profileId: profile.id,
        title: item.title,
        type: item.type,
        priority: item.priority,
        tags: item.tags,
        description: item.description,
        startTime: item.startTime ?? null,
        endTime: item.endTime ?? null,
        status: "pending",
      },
    });
  }

  const emailCount = await prisma.email.count({ where: { profileId: profile.id } });
  const approvalCount = await prisma.approvalItem.count({ where: { profileId: profile.id } });
  const plannerCount = await prisma.plannerItem.count({ where: { profileId: profile.id } });

  console.log("\n✅ Seed complete!");
  console.log(`   📧 ${emailCount} emails`);
  console.log(`   ✅ ${approvalCount} approval items (replies, events, tasks)`);
  console.log(`   📅 ${plannerCount} planner items`);
  console.log("\n💡 Sign in at http://localhost:3000 with any Google account added as test user.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
