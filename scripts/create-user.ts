/**
 * CLI helper to create a user in the database.
 *
 * Usage:
 *   npx tsx scripts/create-user.ts <email> <password> [role]
 *
 * Examples:
 *   npx tsx scripts/create-user.ts admin@example.com secret123 admin
 *   npx tsx scripts/create-user.ts user@example.com secret123
 *
 * This script is also used as the Prisma seed when you run:
 *   npx prisma db seed
 * (seeds with the first user if DATABASE_URL is set in .env / .env.local)
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const [, , email, password, role = "user"] = process.argv;

  if (!email || !password) {
    console.error("Usage: npx tsx scripts/create-user.ts <email> <password> [role]");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where:  { email },
    update: { passwordHash, role },
    create: { email, passwordHash, role },
  });

  console.log(`✔ User ${role === "admin" ? "(admin)" : ""} created/updated: ${user.email} [id: ${user.id}]`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
