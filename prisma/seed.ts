import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

// 시드: 폐쇄형 2인 앱의 계정을 생성한다(공개 가입 없음).
// 멱등 — 이미 있으면 비밀번호를 재해시하지 않고 그대로 둔다.
const adapter = new PrismaMariaDb(process.env.DATABASE_URL as string);
const prisma = new PrismaClient({ adapter });

async function main() {
  const username = "kcs___chang";
  const password = "20260330";
  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.upsert({
    where: { username },
    update: {}, // 이미 존재하면 변경하지 않음
    create: { username, passwordHash, displayName: "chang" },
  });

  console.log(`seeded user: ${username}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
