/**
 * Remove fake inbox data (gmailId prefix seed_ or demo_) and related queue rows.
 *
 *   npx tsx prisma/clear-demo-data.ts
 *   npx tsx prisma/clear-demo-data.ts --planner   # also delete all PlannerItem for affected profiles
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const fakeEmails = await prisma.email.findMany({
    where: {
      OR: [{ gmailId: { startsWith: "seed_" } }, { gmailId: { startsWith: "demo_" } }],
    },
    select: { id: true, profileId: true, gmailId: true },
  });

  const fakeEmailIds = fakeEmails.map((e) => e.id);
  const profileIds = [...new Set(fakeEmails.map((e) => e.profileId))];

  if (fakeEmailIds.length === 0) {
    console.log("No seed_/demo_ emails found — nothing to delete.");
    return;
  }

  console.log(`Found ${fakeEmailIds.length} fake email(s): ${fakeEmails.map((e) => e.gmailId).join(", ")}`);

  const delApprovals = await prisma.approvalItem.deleteMany({
    where: {
      OR: [
        { emailId: { in: fakeEmailIds } },
        { replyDraft: { is: { emailId: { in: fakeEmailIds } } } },
        { calendarSuggestion: { is: { emailId: { in: fakeEmailIds } } } },
        { task: { is: { emailId: { in: fakeEmailIds } } } },
      ],
    },
  });
  console.log(`Deleted ${delApprovals.count} approval item(s).`);

  const delDrafts = await prisma.replyDraft.deleteMany({
    where: { emailId: { in: fakeEmailIds } },
  });
  const delCal = await prisma.calendarSuggestion.deleteMany({
    where: { emailId: { in: fakeEmailIds } },
  });
  const delTasks = await prisma.task.deleteMany({
    where: { emailId: { in: fakeEmailIds } },
  });
  const delEmails = await prisma.email.deleteMany({
    where: { id: { in: fakeEmailIds } },
  });

  console.log(
    `Deleted reply drafts: ${delDrafts.count}, calendar suggestions: ${delCal.count}, tasks: ${delTasks.count}, emails: ${delEmails.count}.`
  );

  const clearPlanner = process.argv.includes("--planner");
  if (clearPlanner) {
    for (const pid of profileIds) {
      const n = await prisma.plannerItem.deleteMany({ where: { profileId: pid } });
      console.log(`Deleted ${n.count} planner item(s) for profile ${pid}.`);
    }
  } else {
    console.log("Omit seeded planner blocks? Re-run with --planner to remove them too.");
  }

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
