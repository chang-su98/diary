---
globs:
  - "prisma/**"
  - "src/lib/prisma.ts"
  - "src/generated/**"
---
### Prisma / Data Layer 규칙

- **Database**: Neon Postgres, Prisma 7 + `@prisma/adapter-pg`
- **Schema**: `prisma/schema.prisma` — Prisma CLI는 `DATABASE_URL` from `.env` via `prisma.config.ts`
- **Client**: `src/lib/prisma.ts` — Singleton PrismaClient with pg adapter
  - 런타임 환경변수: `DATABASE_URL`(Neon 다이렉트 엔드포인트)
- **파일/이미지**: DB에 저장하지 않고 `src/lib/storage.ts` 스토리지 추상화 사용(dev=로컬 디스크, prod=R2 예정)
- **Generated code**: `src/generated/prisma/` (gitignored) — import from `@/generated/prisma/client`
- 스키마 변경 후 반드시 `pnpm prisma generate` 실행
- 모델명: PascalCase 단수형 (e.g. `User`, `Post`)
- 필드명: camelCase (e.g. `createdAt`, `userId`)
- 앱 전체에서 `@/lib/prisma`의 싱글톤 인스턴스 사용
