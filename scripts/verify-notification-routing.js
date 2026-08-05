const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const managementOnlyTypes = ["TASK_READY_FOR_REVIEW", "TASK_SELF_CREATED", "LEAVE_REQUESTED", "OVERTIME_REQUESTED", "SUBMISSION_RECEIVED"];
  const invalid = await prisma.notification.count({
    where: {
      type: { in: managementOnlyTypes },
      OR: [
        { audience: { not: "ADMIN" } },
        { user: { role: { notIn: ["MANAGER", "ADMIN"] } } },
      ],
    },
  });
  if (invalid) throw new Error(`Found ${invalid} invalid management-only notifications`);

  const invalidAudiences = await prisma.notification.count({
    where: { audience: { notIn: ["USER", "EMPLOYEE", "MANAGEMENT", "ADMIN"] } },
  });
  if (invalidAudiences) throw new Error(`Found ${invalidAudiences} invalid notification audiences`);
  console.log("Notification routing data is valid");
}

main().finally(() => prisma.$disconnect());
