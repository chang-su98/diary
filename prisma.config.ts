import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma 7 설정 파일(CLI 전용).
// - 런타임 연결: src/lib/prisma.ts 의 @prisma/adapter-pg 어댑터(Neon Postgres)
// - 마이그레이션(CLI) 연결: 아래 datasource.url (DATABASE_URL, 다이렉트 엔드포인트)
//
// env("DATABASE_URL") 헬퍼는 변수가 없으면 즉시 throw 한다. 그러면 DB URL이
// 필요 없는 `prisma generate`(스키마만 읽음)까지 실패해, Vercel 빌드의
// postinstall generate가 환경변수 누락으로 깨진다. process.env를 직접 읽어
// generate는 URL 없이도 통과시키고, URL이 실제로 필요한 migrate에서만 빈 값이
// 드러나게 한다.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
});
