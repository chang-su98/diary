import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

// 시드: 폐쇄형 2인 앱의 계정을 생성한다(공개 가입 없음).
// 멱등 — 이미 있으면 비밀번호를 재해시하지 않고 그대로 둔다.
// 비밀번호는 코드/히스토리에 평문으로 남기지 않고 .env(gitignore)에서 읽는다.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL 환경변수가 설정되지 않았습니다 (.env 확인).");
}
const adapter = new PrismaMariaDb(databaseUrl);
const prisma = new PrismaClient({ adapter });

const accounts = [
  { username: "kcs___chang", displayName: "chang", passwordEnv: "SEED_CHANG_PASSWORD" },
  { username: "master", displayName: "master", passwordEnv: "SEED_MASTER_PASSWORD" },
];

async function main() {
  for (const { username, displayName, passwordEnv } of accounts) {
    const password = process.env[passwordEnv];
    if (!password) {
      throw new Error(`${passwordEnv} 환경변수가 설정되지 않았습니다 (.env 확인).`);
    }
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.upsert({
      where: { username },
      update: {}, // 이미 존재하면 변경하지 않음
      create: { username, passwordHash, displayName },
    });
    console.log(`seeded user: ${username}`);
  }
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
