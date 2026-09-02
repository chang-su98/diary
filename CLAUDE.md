@AGENTS.md

# CLAUDE.md

이 파일은 Claude Code가 이 저장소에서 작업할 때 참고하는 가이드다.

## Commands

- `pnpm dev` — 개발 서버 (http://localhost:3000)
- `pnpm build` — 프로덕션 빌드 (Turbopack)
- `pnpm lint` — ESLint (flat config, eslint v9)
- `pnpm exec tsc --noEmit` — 타입 체크
- `pnpm test` — 의존성 없는 순수 로직 자체 점검 (`node --test`, `src/**/*.test.ts`)
- `pnpm exec prisma generate` — Prisma 클라이언트 재생성 (스키마 변경 후)
- `pnpm exec prisma migrate dev --name <name>` — 마이그레이션 생성·적용
- `pnpm exec prisma studio` — 데이터 GUI 확인

### Database (Neon Postgres)

- **Neon**(서버리스 Postgres)을 dev·prod 공통으로 사용한다. 로컬에 DB를 띄우지 않는다.
- 연결 문자열은 `.env`의 `DATABASE_URL`(Neon **다이렉트**/언풀드 엔드포인트). 풀드(-pooler)는 pg 어댑터 + PgBouncer prepared-statement 충돌이 있어 사용하지 않는다.
- 계정은 시드로 생성: `pnpm exec prisma db seed` (`.env`의 `SEED_*_PASSWORD` 사용).
- (참고: 이전엔 로컬 MariaDB였으나 배포를 위해 Neon Postgres로 이전함.)

## Architecture

- **Framework**: Next.js 16.2, App Router (`src/app/`), React 19, Turbopack, React Compiler 활성화
- **Styling**: Tailwind CSS v4 (`@tailwindcss/postcss`); 테마 토큰은 `src/app/globals.css`의 `@theme inline`
- **Path alias**: `@/*` → `./src/*`
- **Database**: Neon Postgres + Prisma 7
  - 런타임 연결: `@prisma/adapter-pg` 어댑터 (`src/lib/prisma.ts`, `DATABASE_URL`)
  - 마이그레이션 연결: `prisma.config.ts`의 `datasource.url` (동일 `DATABASE_URL`)
  - Prisma 7 신규 `prisma-client` generator → 생성물은 `src/generated/prisma` (import는 `@/generated/prisma/client`)
  - **이미지 등 파일은 DB에 두지 않고 스토리지(`src/lib/storage.ts`)에**: dev=로컬 디스크(`.storage/`), prod=R2(예정). `STORAGE_DRIVER`로 전환.
- **State**: Zustand (클라이언트 UI) + TanStack Query (서버 데이터, `src/app/_components/query-provider.tsx`)
- **Validation**: Zod 스키마는 `src/lib/schemas/`에 정의 (도입 예정)
- **PWA**: `src/app/manifest.ts` + `public/sw.js`(미니 서비스워커, 프로덕션에서만 등록) + `public/icon.svg`

> React Compiler: **활성화됨** (`next.config.ts`의 `reactCompiler: true` + `babel-plugin-react-compiler`). 수동 `useMemo`/`useCallback`은 대부분 불필요 — Rules of React를 지키면 컴파일러가 자동 메모이제이션한다.

## Key Conventions

- ESLint flat config (`eslint.config.mjs`) — `next/core-web-vitals` + `next/typescript`. `src/generated/**`는 린트 제외.
- Tailwind v4 CSS 기반 설정(`tailwind.config.js` 없음); 다크모드는 `prefers-color-scheme`
- TypeScript strict 모드, `any` 타입 사용 금지
- 커밋 전 `pnpm lint` 실행
- pnpm은 `node-linker=hoisted`(`.npmrc`) — Windows 백신 EPERM 회피용. clone 후 `pnpm install` → `pnpm exec prisma generate` 순으로 복원.
- 영역별 세부 규칙: `.claude/rules/`(api, prisma, react-components, state, styling) — glob 자동 첨부
- 프론트 패턴: `docs/ref/frontend-guide.md`

## Git Commit Message

### 형식

```
<type>: <subject>

<body (선택)>
```

### Type

| Type | 용도 |
|------|------|
| `feat` | 새로운 기능 추가 |
| `fix` | 버그 수정 |
| `refactor` | 기능 변경 없는 코드 구조 개선 |
| `style` | 코드 포맷팅 등 (동작 변경 없음) |
| `docs` | 문서 변경 |
| `chore` | 빌드, 설정, 의존성 등 기타 변경 |
| `test` | 테스트 추가/수정 |

### 규칙

- 접두사(type)는 **영어**, subject·body는 **한국어**로 작성
- subject는 50자 이내, 동사 원형으로 시작
- body는 선택, "무엇을 왜" 변경했는지 간결히 서술 (subject와 빈 줄로 구분)

### 예시

```
feat: 일기 작성 API 추가

일기 CRUD 중 생성 라우트 핸들러를 구현하고 Zod로 요청을 검증한다.
```

```
fix: 개발 모드의 Prisma 클라이언트 싱글톤 누수 해결
```

## Memo

- 코드 작성 시 기본적으로 @docs/coding-conventions.md 를 반드시 참조한다.
- 모든 답변과 추론 과정은 **한국어**로 작성한다.
- task가 끝나면 **린트체크 · 타입체크 · 빌드체크**를 수행한다.
- 린트 오류는 반드시 해결하고 넘어가며, 경고도 가능한 한 해결한다.
- 커밋 시 접두사는 영어, 나머지 타이틀·내용은 한국어로 작성한다.
- task 완료 시 CLAUDE.md · README.md 업데이트가 필요하면 진행한다.
