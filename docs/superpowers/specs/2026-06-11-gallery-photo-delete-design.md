# 갤러리 사진 삭제 — 설계

작성일: 2026-06-11
상태: 승인됨 (구현 대기)

## 목표

갤러리에서 사진을 삭제하는 기능을 추가한다. 진입점은 갤러리 상단 `+` 버튼을 팝오버
메뉴로 바꾸고, "사진 삭제"를 고르면 **다중 선택 모드**로 들어가 여러 장을 골라 한 번에
지운다. 삭제 직전 확인 다이얼로그를 거친다.

## 결정 사항 (확정)

| 항목 | 결정 | 근거 |
|------|------|------|
| 삭제 권한 | **공유** — 로그인한 두 사용자 모두 누구 사진이든 삭제 | `Anniversary` 모델 컨벤션과 일치(폐쇄형 2인 앱) |
| 선택 방식 | **다중 선택 모드** | 여러 장 정리에 편함 |
| 확인 단계 | **확인 다이얼로그** ("N장의 사진을 삭제할까요?") | 실수 방지(undo 없음) |
| API 형태 | **`DELETE /api/photos`** 일괄 (`{ ids }` 바디) | 한 번의 확인 = 한 번의 요청 |
| 썸네일 키 | 삭제 시 `thumbKey`도 함께 정리 | 현재 비어있으나 미래 대비, 무해 |
| 체크 표시 | 타일 **좌상단** — 선택됨: 파란 원 + 흰 체크 / 미선택: 반투명 빈 원 | 사용자 지정 |
| 푸터 | 선택 모드 시 `BottomNav`가 **[취소] [삭제 (N)]** 두 버튼으로 교체 | 사용자 지정 |

## 백엔드

### `DELETE /api/photos` (기존 `src/app/api/photos/route.ts`에 핸들러 추가)

처리 순서:
1. 최상위 `try-catch`로 래핑(스택 트레이스 유출 방지).
2. `isSameOriginRequest(req)` 아니면 403 (변경 요청).
3. `getSession()` 없으면 401.
4. `req.json()`을 `try-catch`로 파싱, 실패 시 400(경고 로그).
5. Zod 검증: `{ ids: number[] }` — 양의 정수, `min(1)`, `max(100)`. 유저 대면 메시지 일본어.
6. `prisma.photo.findMany({ where: { id: { in: ids } }, select: { id, dataKey, thumbKey } })`로
   삭제 대상의 스토리지 키 수집.
7. **DB 먼저** `prisma.photo.deleteMany({ where: { id: { in: ids } } })` → `count`.
   - 순서가 뒤집혀 실패하면 "행은 있는데 파일 없는 깨진 이미지"가 생긴다. DB를 먼저
     지우면 최악이 "고아 파일"(디스크만 낭비)이라 덜 해롭다.
8. 스토리지 best-effort 정리: 수집한 `dataKey`/`thumbKey`(null 제외)를
   `Promise.allSettled(keys.map(k => storage.delete(k)))`로 삭제, 실패는 한국어 로그만(요청은 성공 처리).
9. `{ deleted: count }` 반환(200).

- **권한**: 인증만 되면 됨. 소유자 필터 없음(공유 모델).
- 레거시 사진(`data` base64, `dataKey` null)은 스토리지 객체가 없으니 키 정리에서 자연히 빠진다.

### Zod 스키마 — `src/lib/schemas/photo.ts`

```ts
export const photoDeleteSchema = z.object({
  ids: z
    .array(z.number().int().positive())
    .min(1, "削除する写真を選択してください")
    .max(100, "一度に削除できるのは100枚までです"),
});
```

### OpenAPI — `src/lib/openapi.ts`

`DELETE /api/photos` 스펙 추가(요청 바디 `{ ids }`, 200 `{ deleted }`, 400/401/403). 실제 동작과 일치시킨다.

## 프론트엔드

### 상태 — `src/lib/gallery-selection-store.ts` (신규, Zustand)

```ts
interface GallerySelectionState {
  selecting: boolean;
  selectedIds: Set<number>;
  confirmOpen: boolean;
  enter: () => void;       // selecting=true, 선택 초기화
  exit: () => void;        // 전부 초기화(selecting=false, set 비움, confirm 닫기)
  toggle: (id: number) => void; // 새 Set 생성 후 add/delete
  openConfirm: () => void; // size>0일 때만 confirmOpen=true
  closeConfirm: () => void;
}
```

- `toggle`/`exit`는 매번 **새 `Set`** 을 만들어 구독자 리렌더를 보장한다.
- 갤러리·푸터·다이얼로그가 이 스토어 하나를 공유.

### `+` 버튼 팝오버 — `GalleryUpload`

- 로컬 `menuOpen` state.
- **선택 모드 아님**: `+` 클릭 시 팝오버 토글. 팝오버(작은 카드, 배경 탭하면 닫힘)에
  - "사진 추가" → 기존 파일 선택 트리거 후 닫기
  - "사진 삭제" → `enter()` 후 닫기 — **`hasPhotos`일 때만 노출**
- **선택 모드**: `+` 자리에 **"취소"** 버튼(=`exit()`), 팝오버 비표시.
- 기존 파일 input·업로드 로직·프로그레스바는 그대로.

### 타일 — `GalleryTile` (in `gallery-grid.tsx`)

- 구독: `selecting`, `selectedIds.has(photo.id)`(불리언 슬라이스라 자기 것만 바뀔 때 리렌더), `toggle`.
- `onClick`: 선택 모드면 `toggle(id)`, 아니면 기존 `onSelect(photo)`(상세 모달).
- 선택 모드일 때 **좌상단 체크 원** 오버레이:
  - 선택됨: 파란 배경(`bg-primary`) 원 + 흰 체크 SVG.
  - 미선택: 반투명 흰 테두리 빈 원(`border-white/70`, 약한 배경).
- 선택된 타일은 약한 피드백(예: `ring-2 ring-primary` 또는 opacity 살짝).
- `aspectRatio`·fade-in `img` 로직은 유지. 버튼에 `aria-pressed={selected}`(선택 모드 시).

### 푸터 교체 — `BottomNav`

- 구독: `selecting`, `selectedIds.size`, `exit`, `openConfirm`.
- `pathname.startsWith("/gallery") && selecting`이면 4탭 대신 동일 컨테이너 안에
  **[취소]**(=`exit`) / **[삭제 (N)]**(=`openConfirm`, `size===0`이면 비활성) 두 버튼.
- 그 외에는 기존 탭 그대로. 컨테이너 스타일(rounded-t, border, safe-area)·z-40 유지.

### 삭제 실행 — `src/app/gallery/gallery-selection-controller.tsx` (신규, client)

- `page.tsx`의 **사진 존재 분기**에 마운트(`GalleryGrid`와 형제).
- 구독: `confirmOpen`, `selectedIds`, `closeConfirm`, `exit`. 로컬 `deleting`/`error` state.
- **언마운트 cleanup에서 `exit()`** — 갤러리를 벗어나면 선택 모드 자동 종료.
- `confirmOpen`이면 확인 다이얼로그(작은 모달, `role="dialog"`): "N장의 사진을 삭제할까요?"
  - [취소] → `closeConfirm()`
  - [삭제] → `DELETE /api/photos`(바디 `{ ids: Array.from(selectedIds) }`) →
    성공 시 `router.refresh()` + `exit()`. 실패 시 다이얼로그에 에러 메시지(요청은 막지 않음).
  - 진행 중엔 버튼 비활성 + "삭제 중…".
- API 호출은 갤러리 기존 코드와 동일하게 **`fetch`** 사용(업로드·무한스크롤과 일관).

### `page.tsx`

- 사진 존재 분기에 `<GallerySelectionController />` 추가. `hasPhotos`는 이미 전달 중.

## 데이터 흐름

```
+ 탭 → 팝오버 "사진 삭제" → enter() (selecting=true)
  └ BottomNav가 [취소][삭제(N)]로 교체, 타일 좌상단 체크 원 표시
  타일 탭 → toggle(id) (파란 체크 / 선택 ring)
  [삭제(N)] → openConfirm() → 확인 다이얼로그
    [삭제] → DELETE /api/photos {ids} → router.refresh() → exit()
  [취소] → exit()
  (갤러리 이탈 → controller 언마운트 → exit())
```

## 삭제 후 갱신

`router.refresh()`로 서버 재시드(삭제분 제외). `GalleryGrid` 마운트 시 `clear()`가 낙관적
스토어(`added`)도 정리. 삭제는 명시적 파괴 동작이라 첫 페이지 재시드(스크롤 리셋)는 수용 가능.
전부 삭제해 빈 갤러리가 되면 `page.tsx`가 안내문 분기로 전환된다.

## 보안·규칙 체크리스트

- [x] 변경 요청 same-origin 가드, 인증 가드
- [x] Route Handler 최상위 try-catch
- [x] `req.json()` bare catch 금지(에러 로깅)
- [x] Zod 검증, 유저 대면 메시지 일본어 / 로그 한국어, PII 없음
- [x] `as` 단언 대신 Zod safeParse
- [x] OpenAPI 스펙 동기화
- [x] 공유 권한(소유자 필터 없음)은 의도된 모델 — 코드 주석에 명시

## 범위 밖 (YAGNI)

- 삭제 되돌리기(undo)·휴지통
- 상세 모달 내 단건 삭제 버튼
- 소유자 기반 권한
