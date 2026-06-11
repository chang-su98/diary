import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL 환경변수가 설정되지 않았습니다.");
}

// Postgres(Neon) driver adapter — 연결 문자열(DATABASE_URL)을 그대로 전달
const adapter = new PrismaPg({ connectionString: databaseUrl });

// 전역 싱글톤 — 개발 HMR뿐 아니라 서버리스(모듈 반복 평가)에서의
// 커넥션 풀 중복 생성을 막기 위해 모든 환경에서 캐시한다.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });
globalForPrisma.prisma = prisma;
