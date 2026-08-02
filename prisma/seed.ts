import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME?.trim() || "System Admin";
  if (!email) {
    throw new Error("Set SEED_ADMIN_EMAIL before seeding");
  }
  const existingAdmin = await prisma.user.findUnique({
    where: { email },
  });

  if (existingAdmin) {
    console.log("Admin user already exists");
    return;
  }

  if (!password || password.length < 12) {
    throw new Error("Set SEED_ADMIN_PASSWORD (12+ characters) to create the first admin");
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const admin = await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      role: "ADMIN",
      country: process.env.SEED_ADMIN_COUNTRY?.trim() || "Palestine",
      timezone: process.env.SEED_ADMIN_TIMEZONE?.trim() || "Asia/Hebron",
      locale: "ar",
    },
  });

  console.log("Created admin:", admin.email);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
