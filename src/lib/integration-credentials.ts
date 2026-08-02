import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

const ALGORITHM = "aes-256-gcm";

function encryptionKey() {
  const secret = process.env.INTEGRATION_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!secret) throw new Error("مفتاح تشفير بيانات التكامل غير مهيأ");
  return createHash("sha256").update(secret).digest();
}

function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${encrypted.toString("base64")}`;
}

function decrypt(payload: string) {
  const [ivValue, tagValue, encryptedValue] = payload.split(".");
  if (!ivValue || !tagValue || !encryptedValue) throw new Error("بيانات الاعتماد المشفرة غير صالحة");
  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(ivValue, "base64"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export async function getIntegrationCredential(provider: string) {
  const record = await prisma.integrationCredential.findUnique({ where: { provider } });
  if (!record) return null;
  return {
    value: decrypt(record.encryptedValue),
    updatedAt: record.updatedAt,
    updatedById: record.updatedById,
  };
}

export async function setIntegrationCredential(provider: string, value: string, updatedById: string) {
  return prisma.integrationCredential.upsert({
    where: { provider },
    create: { provider, encryptedValue: encrypt(value), updatedById },
    update: { encryptedValue: encrypt(value), updatedById },
    select: { provider: true, updatedAt: true },
  });
}

export async function deleteIntegrationCredential(provider: string) {
  return prisma.integrationCredential.deleteMany({ where: { provider } });
}
