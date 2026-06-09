# Diary

온라인 일기 앱. Next.js 16 + Prisma 7 + MariaDB 기반의 풀스택 프로젝트이며, PWA(설치형 웹)를 지원한다.

## 기술 스택

| 영역 | 사용 기술 |
|------|-----------|
| Framework | Next.js 16 (App Router, React 19, Turbopack) |
| Styling | Tailwind CSS v4 |
| Database | MariaDB 12 (Windows 네이티브, Docker 미사용) |
| ORM | Prisma 7 (`@prisma/adapter-mariadb`) |
| State (client) | Zustand |
| State (server) | TanStack Query |
| Package Manager | pnpm |
| PWA | Web Manifest + Service Worker |

## 사전 준비

- **Node.js** 20+ (권장 24)
- **pnpm** 10+
- **MariaDB** 11/12 — Windows 네이티브 서비스로 실행 (Docker 불필요)
  - winget: `winget install MariaDB.Server` (관리자 권한)
  - 설치 후 서비스가 `localhost:3306`에서 실행 중인지 확인: `Get-Service MariaDB`

## 시작하기

```bash
# 1. 의존성 설치
pnpm install

# 2. 환경 변수 설정 (.env.example 복사)
copy .env.example .env   # PowerShell: Copy-Item .env.example .env
#   .env 의 DATABASE_URL 을 본인 환경에 맞게 수정
#   기본값: mysql://diary:diary@localhost:3306/diary

# 3. DB·사용자 생성 (최초 1회, MariaDB root로)
#   CREATE DATABASE diary CHARACTER SET utf8mb4;
#   CREATE USER 'diary'@'localhost' IDENTIFIED BY 'diary';
#   GRANT ALL PRIVILEGES ON *.* TO 'diary'@'localhost';

# 4. Prisma 클라이언트 생성 + 마이그레이션 적용
pnpm exec prisma generate
pnpm exec prisma migrate dev

# 5. 개발 서버 실행
pnpm dev
```

→ http://localhost:3000

## 자주 쓰는 명령어

| 명령 | 설명 |
|------|------|
| `pnpm dev` | 개발 서버 |
| `pnpm build` | 프로덕션 빌드 (Turbopack) |
| `pnpm lint` | ESLint |
| `pnpm exec tsc --noEmit` | 타입 체크 |
| `pnpm exec prisma generate` | 스키마 변경 후 클라이언트 재생성 |
| `pnpm exec prisma migrate dev --name <name>` | 마이그레이션 생성·적용 |
| `pnpm exec prisma studio` | 데이터 GUI 확인 |

## 프로젝트 구조

```
src/
  app/
    _components/        # QueryProvider, PWARegister 등 공용 클라이언트 컴포넌트
    layout.tsx          # 루트 레이아웃 (Provider 래핑, 메타데이터)
    manifest.ts         # PWA 매니페스트
    page.tsx
  generated/prisma/     # Prisma 생성 클라이언트 (git 미추적)
  lib/
    prisma.ts           # Prisma 클라이언트 싱글톤 (MariaDB 어댑터)
prisma/
  schema.prisma         # 데이터 모델
  migrations/           # 마이그레이션 이력
public/
  sw.js                 # 서비스 워커 (프로덕션에서만 등록)
  icon.svg              # PWA 아이콘
prisma.config.ts        # Prisma 7 설정 (마이그레이션 연결)
```

## PWA

- 프로덕션 빌드에서 서비스 워커가 등록되어 **설치형 웹**으로 동작한다.
- 테스트: `pnpm build && pnpm start` → 브라우저에서 "설치" / 모바일 "홈 화면에 추가".
- 실제 배포 시 HTTPS만 충족하면 된다.

## 참고

- 코딩 컨벤션·가이드는 `docs/`, AI 협업 규칙은 `CLAUDE.md` 및 `.claude/` 참조.
- pnpm은 `.npmrc`의 `node-linker=hoisted`를 사용한다(Windows 백신 EPERM 회피). 클론 후 `pnpm install` → `pnpm exec prisma generate` 순으로 복원한다.
