import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma 7 설정 파일.
// - 런타임 연결: src/lib/prisma.ts 의 @prisma/adapter-mariadb 어댑터
// - 마이그레이션(CLI) 연결: 아래 datasource.url (DATABASE_URL)
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
