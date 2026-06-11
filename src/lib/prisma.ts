import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL 환경변수가 설정되지 않았습니다.");
}

// pg가 connectionString의 sslmode를 파싱하며 내는 deprecation 경고를 피하기 위해
// sslmode/channel_binding 파라미터는 제거하고 ssl 옵션으로 명시 전달한다.
// Neon은 공개 신뢰 인증서라 rejectUnauthorized:true(=verify-full 상당)로 검증된다.
const url = new URL(databaseUrl);
url.searchParams.delete("sslmode");
url.searchParams.delete("channel_binding");

// Postgres(Neon) driver adapter
const adapter = new PrismaPg({
  connectionString: url.toString(),
  ssl: { rejectUnauthorized: true },
});

// 전역 싱글톤 — 개발 HMR뿐 아니라 서버리스(모듈 반복 평가)에서의
// 커넥션 풀 중복 생성을 막기 위해 모든 환경에서 캐시한다.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });
globalForPrisma.prisma = prisma;
