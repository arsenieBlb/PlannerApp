import { PrismaClient } from "@prisma/client";

async function main() {
  const p = new PrismaClient();
  const profiles = await p.profile.findMany({ select: { id: true, email: true } });
  console.log("Profiles in DB:", JSON.stringify(profiles, null, 2));
  await p.$disconnect();
}

main();
