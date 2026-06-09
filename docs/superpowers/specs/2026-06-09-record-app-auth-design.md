# 기록 앱 — 인증 토대 설계 (마일스톤 0)

작성일: 2026-06-09
상태: 승인 대기

## 1. 프로젝트 개요

두 사람이 함께 쓰는 **기록 앱**. PWA(설치형 웹)로 배포하며 Android·iOS 모두 지원.
백엔드는 기존 Next.js 16 + Prisma 7 + MariaDB 토대를 그대로 사용한다.

### 전체 마일스톤 (분해)

| 순서 | 마일스톤 | 내용 |
|------|----------|------|
| **0** | **인증 토대** | 아이디/비번 로그인, 계정 시드 (이 문서의 범위) |
| 1 | 기념일/D-day + 알림 | 데이팅·기념일 날짜 지정, D-day 카운트, 웹 푸시 |
| 2 | 갤러리 | 사진 업로드 + 핀터레스트식 그리드 |

각 마일스톤은 별도 스펙 → 계획 → 구현 사이클을 따른다.
이 문서는 **마일스톤 0**만 다룬다.

## 2. 마일스톤 0 범위

- 공개 회원가입 **없음**. 계정은 미리 시드한다(폐쇄형 2인 앱).
- 1차로 계정 1개(`kcs___chang`)만 시드. 2번째 계정과 두 사람 연결은 후속 마일스톤.
- 아이디 + 비밀번호 로그인, 로그아웃, 세션 유지, 보호 라우트.

### 범위 밖 (후속 마일스톤)
2번째 계정, 두 사람 연결, D-day, 기념일, 갤러리, 푸시 알림.

## 3. 데이터 모델 (Prisma)

```prisma
model User {
  id           Int      @id @default(autoincrement())
  username     String   @unique @db.VarChar(50)
  passwordHash String   @db.VarChar(255)
  displayName  String?  @db.VarChar(50)
  createdAt    DateTime @default(now())

  @@map("users")
}
```

- 기존 `Diary` 모델은 **제거**한다(기록 앱으로 피벗하여 미사용).
- 시드(`prisma/seed.ts`): `kcs___chang` / 비밀번호 `20260330`(bcrypt 해시) 1명 생성. 멱등(이미 있으면 skip/upsert).

## 4. 인증 흐름

- **`POST /api/auth/login`**: `{ username, password }` 수신 → 사용자 조회 → `bcrypt.compare` →
  성공 시 JWT 발급, **httpOnly 쿠키**로 설정. 실패 시 401 + 일반화된 메시지.
- **`POST /api/auth/logout`**: 인증 쿠키 만료(삭제).
- **세션 확인**: 서버 유틸 `getSession()`이 쿠키의 JWT를 `jose`로 검증.
- **미들웨어(`middleware.ts`)**: 보호 경로(`/` 등) 접근 시 쿠키 JWT 검증 실패하면 `/login`으로 리다이렉트.
  이미 로그인 상태로 `/login` 접근 시 `/`로 리다이렉트.
- **`/login` 페이지**: 아이디·비번 폼(최소 UI, Pretendard). 클라이언트에서 `/api/auth/login` 호출.

## 5. 보안 고려사항 (토이여도 준수)

| 항목 | 방침 |
|------|------|
| 비밀번호 저장 | 평문 금지. **bcrypt** 해시(cost factor 12). |
| 비밀번호 비교 | `bcrypt.compare`(상수시간) 사용. |
| 로그인 실패 응답 | 아이디 존재 여부를 노출하지 않도록 **일반화된 메시지**("아이디 또는 비밀번호가 올바르지 않습니다"). |
| JWT 서명 키 | `JWT_SECRET`을 `.env`에 보관(32바이트 이상 랜덤). `.env`는 git 미추적, `.env.example`에 placeholder. |
| JWT 만료 | 적정 만료(예: 7일). `exp` 포함. |
| 인증 쿠키 | `httpOnly` + `sameSite=lax` + `path=/` + 프로덕션에서 `secure`. |
| CSRF | SameSite 쿠키로 1차 완화(상태변경 API는 동일 출처 전제). |
| 시크릿/비번 | 코드·리포지토리에 평문 비밀번호·시크릿 하드코딩 금지. 시드는 환경값 또는 상수에서 읽되 해시 저장. |
| 전송 | 프로덕션 HTTPS 전제(PWA 요건과 동일). |

> 구현 완료 후 `security-review`(또는 security-architect)로 인증 경로를 점검한다.

## 6. 기술 선택

| 결정 | 선택 | 이유 |
|------|------|------|
| 세션 | JWT httpOnly 쿠키 | 무상태, 세션 테이블 불필요 |
| 해시 | bcryptjs(순수 JS) | 네이티브 빌드 이슈(Windows EPERM) 회피 |
| JWT | jose | Edge 미들웨어에서 검증 가능 |

추가 의존성: `bcryptjs`(+`@types/bcryptjs`), `jose`.

## 7. 완료 기준 (Acceptance)

- [ ] `User` 모델 마이그레이션 적용, `Diary` 모델 제거.
- [ ] 시드 실행 시 `kcs___chang` 계정이 해시 비번으로 생성됨(멱등).
- [ ] 잘못된 자격증명으로 로그인 시 401 + 일반화 메시지.
- [ ] 올바른 자격증명으로 로그인 시 httpOnly 쿠키 발급, `/`로 이동.
- [ ] 비로그인 상태로 `/` 접근 시 `/login`으로 리다이렉트.
- [ ] 로그아웃 시 쿠키 제거되어 보호 라우트 접근 불가.
- [ ] `JWT_SECRET` 미설정 시 명확히 실패(안전 기본값 없음).
- [ ] lint · typecheck · build 통과.
