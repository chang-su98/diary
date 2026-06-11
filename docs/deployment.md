# 배포 가이드 (Vercel + Neon + R2)

로컬 개발·테스트 완료 후 배포할 때 이 문서를 따른다.
스택: **Vercel**(앱) + **Neon Postgres**(DB) + **Cloudflare R2**(이미지 스토리지). 모두 무료 티어.

> 실제 비밀값(비밀번호·키)은 이 문서가 아니라 `.env`(gitignore) / Vercel 환경변수에 있다. 여기엔 비밀 아닌 식별자만 기재한다.

---

## 현재 상태 (✅ 완료 / ⬜ 배포 시)

- ✅ **DB**: Neon Postgres로 이전 완료. 마이그레이션 적용·계정 시드 완료. dev·prod 동일 Neon 사용.
- ✅ **스토리지 추상화**(`src/lib/storage.ts`): `local` 디스크 어댑터 + `r2`(S3 호환) 어댑터. R2 연결 검증 완료.
- ✅ **빌드 설정**: `postinstall: prisma generate` + pnpm `onlyBuiltDependencies`(Vercel 새 클론 대응).
- ⬜ **Vercel 프로젝트 생성·배포** (아래 절차)

이미지는 우리 라우트(`/api/photos/[id]/raw`)가 서버에서 스토리지를 읽어 서빙한다 → **R2 버킷 CORS 설정 불필요**.

---

## 1. 브랜치 전략

작업이 `development`에 있고 `main`은 구버전이다. 배포 전 택1:

- **(A) 정석**: `development` → `main` 병합 후 `main`을 Vercel Production Branch로 사용
  ```bash
  git checkout main && git merge development && git push
  git checkout development
  ```
- **(B) 간단**: Vercel 프로젝트 Settings → Git → **Production Branch = development** 로 변경

---

## 2. 환경 변수 (Vercel → Project Settings → Environment Variables)

| 변수 | 용도 | 값/위치 |
|------|------|--------|
| `DATABASE_URL` | Neon 연결 (런타임·마이그레이션) | Neon 대시보드의 **다이렉트(언풀드)** 연결 문자열. `.env`와 동일 |
| `JWT_SECRET` | 세션 토큰 서명 | `.env`의 기존 값 그대로 |
| `STORAGE_DRIVER` | 스토리지 드라이버 | **`r2`** (로컬은 미설정 → `local`) |
| `R2_ACCOUNT_ID` | R2 엔드포인트 구성 | `1e314aaed0d9b84fa87b14ab295c54a3` (비밀 아님) |
| `R2_ACCESS_KEY_ID` | R2 인증 | 🔒 `.env` 참조 (비밀) |
| `R2_SECRET_ACCESS_KEY` | R2 인증 | 🔒 `.env` 참조 (비밀, 발급 시 1회만 표시) |
| `R2_BUCKET` | 버킷 이름 | `diary-photos` |

> `SEED_*_PASSWORD`는 배포 시 불필요 (계정은 이미 Neon에 존재). 재시드가 필요하면 로컬에서 `pnpm exec prisma db seed`.

---

## 3. Vercel 배포 절차

1. **vercel.com** → GitHub로 로그인 (카드 불필요)
2. **Add New → Project** → `diary` 레포 Import
3. Framework = **Next.js** 자동 감지. 빌드/설치 명령 기본값 유지
   - 설치: `pnpm install` (lockfile 자동 감지) → `postinstall`이 `prisma generate` 실행
   - 빌드: `next build`
4. **2번 표의 환경변수** 입력 (Production, 필요 시 Preview도)
5. **Deploy** → `https://<프로젝트>.vercel.app` 발급
6. 휴대폰에서 접속 → 로그인 → 사진 업로드(→ R2 저장 확인) → **홈 화면에 추가**(PWA)

---

## 4. 배포 후 점검

- [ ] 로그인 동작 (Neon 계정)
- [ ] 사진 업로드 → R2 버킷에 객체 생성 확인 (Cloudflare R2 대시보드)
- [ ] 갤러리 썸네일 로딩 + 상세(원본) 로딩
- [ ] 무한 스크롤 동작
- [ ] iOS PWA 설치(홈 화면) 및 safe-area·하단 탭바 정상

---

## 5. 최적화 (선택)

- **리전 정합**: Neon이 `ap-southeast-1`(싱가포르)이므로 Vercel 함수 리전을 **Singapore(sin1)**로 맞추면 DB 왕복 지연 감소. (Settings → Functions → Region, 또는 `vercel.json`의 `regions`)
- **Neon 자동 일시정지**: 유휴 후 첫 요청 시 웨이크업 지연(수백 ms) — 개인 앱이라 무방.

---

## 6. 보안 — 자격증명 로테이션

개발 중 채팅 등에 노출됐을 수 있는 **Neon 비밀번호·R2 키**는 배포 안정화 후 한 번 재발급(rotate) 권장:

- **Neon**: 대시보드에서 비밀번호 reset → `.env`·Vercel `DATABASE_URL` 갱신
- **R2**: API 토큰 재발급 → `.env`·Vercel `R2_*` 갱신

---

## 7. 로컬 개발 메모

- 로컬도 **Neon**을 사용한다(로컬 MariaDB 없음). 연결은 `.env`의 `DATABASE_URL`.
- 로컬 이미지 스토리지는 **`STORAGE_DRIVER` 미설정 → 로컬 디스크(`.storage/`, gitignore)**. R2를 쓰지 않으므로 dev 업로드는 디스크에 저장된다.
- 로컬에서 R2 동작을 테스트하려면 일시적으로 `STORAGE_DRIVER=r2`로 실행. (단, 드라이버를 섞으면 키는 같아도 바이트 위치가 달라 "not found"가 날 수 있으니 환경별로 일관되게 사용)
- 스키마 변경 시: `pnpm exec prisma migrate dev --name <name>` → 새 마이그레이션이 Neon에 적용됨. 배포는 Vercel 빌드가 `prisma generate`만 하므로, **새 마이그레이션은 로컬에서 `migrate dev`로 이미 Neon에 반영**된 상태여야 한다(동일 DB 공유). 별도 prod DB를 두면 `prisma migrate deploy` 단계 추가 필요.
