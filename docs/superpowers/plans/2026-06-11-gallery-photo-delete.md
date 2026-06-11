# 갤러리 사진 삭제 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 갤러리 `+` 버튼 팝오버에서 "사진 삭제"를 골라 다중 선택 후 확인 다이얼로그를 거쳐 일괄 삭제하는 기능을 추가한다.

**Architecture:** Zustand 스토어 하나(`gallery-selection-store`)로 선택 모드 상태를 `+` 메뉴·타일·푸터(`BottomNav`)·확인 다이얼로그가 공유한다. 삭제는 `DELETE /api/photos`(일괄, `{ ids }`)로 DB 행을 먼저 지우고 스토리지는 best-effort 정리한다. 삭제 후 `router.refresh()`로 재시드한다.

**Tech Stack:** Next.js 16 App Router(React 19 + React Compiler), Zustand, Prisma 7, Tailwind v4.

> **검증 방식:** 이 저장소엔 단위 테스트 러너가 없다. 각 태스크는 `pnpm lint` + `pnpm exec tsc --noEmit`로 검증하고 커밋하며, 마지막 태스크에서 `pnpm build` + 수동 체크리스트로 통합 검증한다(프로젝트 CLAUDE.md 방침).

> **참고 — 권한 모델:** 삭제는 **공유 권한**(인증만 되면 누구 사진이든 삭제). `Anniversary` 컨벤션과 동일. 소유자 필터를 넣지 않는 것이 의도다.

> **참고 — 색상:** 선택 체크 원의 파란색은 테마(모노크롬)에 토큰이 없어 명시값 `#007aff`(iOS 시스템 블루)를 쓴다.

---

### Task 1: 선택 모드 스토어

**Files:**
- Create: `src/lib/gallery-selection-store.ts`

- [ ] **Step 1: 스토어 작성**

```ts
import { create } from "zustand";

// 갤러리 삭제용 다중 선택 모드 상태. + 메뉴·타일·푸터(BottomNav)·확인 다이얼로그가 공유한다.
interface GallerySelectionState {
  selecting: boolean; // 선택 모드 on/off
  selectedIds: Set<number>; // 선택된 사진 id
  confirmOpen: boolean; // 삭제 확인 다이얼로그 표시 여부
  enter: () => void;
  exit: () => void;
  toggle: (id: number) => void;
  openConfirm: () => void;
  closeConfirm: () => void;
}

export const useGallerySelectionStore = create<GallerySelectionState>((set) => ({
  selecting: false,
  selectedIds: new Set(),
  confirmOpen: false,
  enter: () =>
    set({ selecting: true, selectedIds: new Set(), confirmOpen: false }),
  exit: () =>
    set({ selecting: false, selectedIds: new Set(), confirmOpen: false }),
  // 매번 새 Set을 만들어 구독 컴포넌트가 리렌더되게 한다
  toggle: (id) =>
    set((state) => {
      const next = new Set(state.selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedIds: next };
    }),
  // 선택이 하나도 없으면 다이얼로그를 열지 않는다
  openConfirm: () =>
    set((state) => (state.selectedIds.size > 0 ? { confirmOpen: true } : state)),
  closeConfirm: () => set({ confirmOpen: false }),
}));
```

- [ ] **Step 2: 린트·타입 검증**

Run: `pnpm lint; pnpm exec tsc --noEmit`
Expected: 오류 없음

- [ ] **Step 3: 커밋**

```bash
git add src/lib/gallery-selection-store.ts
git commit -m "feat: 갤러리 선택 모드 스토어 추가"
```

---

### Task 2: 일괄 삭제 API

**Files:**
- Modify: `src/lib/schemas/photo.ts` (스키마 추가)
- Modify: `src/app/api/photos/route.ts` (DELETE 핸들러 추가)

- [ ] **Step 1: Zod 스키마 추가** — `src/lib/schemas/photo.ts` 끝에 추가

```ts
// 사진 일괄 삭제 — 선택한 사진 id 배열(유저 대면 메시지 일본어)
export const photoDeleteSchema = z.object({
  ids: z
    .array(z.number().int().positive())
    .min(1, "削除する写真を選択してください")
    .max(100, "一度に削除できるのは100枚までです"),
});
```

- [ ] **Step 2: route.ts import 수정** — 기존 import 라인 교체

기존:
```ts
import { photoCreateSchema } from "@/lib/schemas/photo";
```
변경:
```ts
import { photoCreateSchema, photoDeleteSchema } from "@/lib/schemas/photo";
```

- [ ] **Step 3: DELETE 핸들러 추가** — `route.ts` 맨 끝(POST 핸들러 다음)에 추가

```ts
// 사진 일괄 삭제 — 공유 권한(인증만 되면 누구 사진이든 삭제).
// DB 행을 먼저 지우고 스토리지 객체는 best-effort 정리한다.
// (순서가 뒤집혀 실패하면 "행은 있는데 파일 없는 깨진 이미지"가 생긴다.
//  DB 먼저면 최악이 "고아 파일"이라 덜 해롭다.)
export async function DELETE(req: NextRequest) {
  try {
    if (!isSameOriginRequest(req)) {
      return NextResponse.json(
        { error: "許可されていないリクエストです" },
        { status: 403 }
      );
    }
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch (error) {
      console.warn("[DELETE /api/photos] Request body 파싱 실패:", error);
      return NextResponse.json(
        { error: "リクエストが正しくありません" },
        { status: 400 }
      );
    }

    const parsed = photoDeleteSchema.safeParse(body);
    if (!parsed.success) {
      console.warn("[DELETE /api/photos] 입력 검증 실패:", parsed.error.issues);
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "入力値が正しくありません" },
        { status: 400 }
      );
    }
    const { ids } = parsed.data;

    // 행 삭제 전에 스토리지 키 수집
    const targets = await prisma.photo.findMany({
      where: { id: { in: ids } },
      select: { dataKey: true, thumbKey: true },
    });

    // DB 먼저 삭제
    const { count } = await prisma.photo.deleteMany({
      where: { id: { in: ids } },
    });

    // 스토리지 best-effort 정리 — 실패해도 요청은 성공 처리(고아 파일만 남음)
    const keys = targets
      .flatMap((p) => [p.dataKey, p.thumbKey])
      .filter((k): k is string => typeof k === "string");
    if (keys.length > 0) {
      const storage = getStorage();
      const results = await Promise.allSettled(
        keys.map((k) => storage.delete(k))
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        console.warn(
          `[DELETE /api/photos] 스토리지 정리 일부 실패: ${failed}/${keys.length}`
        );
      }
    }

    return NextResponse.json({ deleted: count });
  } catch (error) {
    console.error("[DELETE /api/photos]", error);
    return NextResponse.json(
      { error: "サーバーエラーが発生しました" },
      { status: 500 }
    );
  }
}
```

> `NextRequest`/`NextResponse`/`isSameOriginRequest`/`getSession`/`prisma`/`getStorage`는 route.ts 상단에 이미 import 되어 있다(추가 import 불필요).

- [ ] **Step 4: 린트·타입 검증**

Run: `pnpm lint; pnpm exec tsc --noEmit`
Expected: 오류 없음

- [ ] **Step 5: 커밋**

```bash
git add src/lib/schemas/photo.ts src/app/api/photos/route.ts
git commit -m "feat: 사진 일괄 삭제 API(DELETE /api/photos) 추가"
```

---

### Task 3: `+` 버튼 팝오버 메뉴 + 선택 모드 진입

**Files:**
- Modify: `src/app/gallery/gallery-upload.tsx`

- [ ] **Step 1: import·스토어·메뉴 state 추가**

`gallery-upload.tsx` 상단 import 블록에 추가(다른 `@/lib` import 옆):
```ts
import { useGallerySelectionStore } from "@/lib/gallery-selection-store";
```

컴포넌트 본문에서 `const prependMany = useGalleryStore((s) => s.prependMany);` 아래에 추가:
```ts
  const selecting = useGallerySelectionStore((s) => s.selecting);
  const enterSelection = useGallerySelectionStore((s) => s.enter);
  const exitSelection = useGallerySelectionStore((s) => s.exit);
  const [menuOpen, setMenuOpen] = useState(false);
```

- [ ] **Step 2: `+` 버튼을 메뉴 트리거/취소 버튼 + 팝오버로 교체**

기존 `<button ... aria-label="사진 추가" ...> ... </button>` 블록 전체를 아래로 교체:

```tsx
      {selecting ? (
        <button
          type="button"
          onClick={exitSelection}
          className="absolute right-6 top-[calc(2rem+env(safe-area-inset-top))] p-1 text-sm font-medium text-text transition-opacity hover:opacity-60"
        >
          취소
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          disabled={busy}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="메뉴 열기"
          className="absolute right-6 top-[calc(2rem+env(safe-area-inset-top))] p-1 transition-opacity hover:opacity-60 disabled:opacity-40"
        >
          {/* plus.svg를 mask로 사용 → 테마색(bg-text)으로 채색 */}
          <span
            aria-hidden
            className="block size-6 bg-text"
            style={{
              maskImage: "url(/asset/images/contents/plus.svg)",
              WebkitMaskImage: "url(/asset/images/contents/plus.svg)",
              maskRepeat: "no-repeat",
              WebkitMaskRepeat: "no-repeat",
              maskPosition: "center",
              WebkitMaskPosition: "center",
              maskSize: "contain",
              WebkitMaskSize: "contain",
            }}
          />
        </button>
      )}

      {/* 팝오버 메뉴 — 배경 탭하면 닫힘 */}
      {menuOpen && !selecting && (
        <>
          <button
            type="button"
            aria-label="메뉴 닫기"
            onClick={() => setMenuOpen(false)}
            className="fixed inset-0 z-[65] cursor-default"
          />
          <div
            role="menu"
            className="absolute right-6 top-[calc(3.75rem+env(safe-area-inset-top))] z-[66] w-36 overflow-hidden rounded-xl border border-line bg-surface shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                fileRef.current?.click();
              }}
              className="flex w-full items-center px-4 py-3 text-sm text-text transition-colors hover:bg-line/40"
            >
              사진 추가
            </button>
            {hasPhotos && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  enterSelection();
                }}
                className="flex w-full items-center border-t border-line px-4 py-3 text-sm text-text transition-colors hover:bg-line/40"
              >
                사진 삭제
              </button>
            )}
          </div>
        </>
      )}
```

- [ ] **Step 3: 린트·타입 검증**

Run: `pnpm lint; pnpm exec tsc --noEmit`
Expected: 오류 없음 (set-state-in-effect 경고 없어야 함 — menuOpen은 이벤트 핸들러에서만 변경)

- [ ] **Step 4: 커밋**

```bash
git add src/app/gallery/gallery-upload.tsx
git commit -m "feat: 갤러리 + 버튼 팝오버 메뉴(추가/삭제) 추가"
```

---

### Task 4: 타일 선택 + 좌상단 체크 표시

**Files:**
- Modify: `src/app/gallery/gallery-grid.tsx` (`GalleryTile` 컴포넌트 + import)

- [ ] **Step 1: import 추가**

`gallery-grid.tsx` 상단 import 블록의 `import { useGalleryStore } from "@/lib/gallery-store";` 아래에 추가:
```ts
import { useGallerySelectionStore } from "@/lib/gallery-selection-store";
```

- [ ] **Step 2: `GalleryTile` 교체**

기존 `function GalleryTile({ photo, onSelect }: {...}) { return ( ... ); }` 전체를 아래로 교체:

```tsx
function GalleryTile({
  photo,
  onSelect,
}: {
  photo: Photo;
  onSelect: (photo: Photo) => void;
}) {
  // 자기 선택 여부만 구독(불리언 슬라이스) → 자기 것이 바뀔 때만 리렌더
  const selecting = useGallerySelectionStore((s) => s.selecting);
  const selected = useGallerySelectionStore((s) => s.selectedIds.has(photo.id));
  const toggle = useGallerySelectionStore((s) => s.toggle);

  return (
    <button
      type="button"
      onClick={() => (selecting ? toggle(photo.id) : onSelect(photo))}
      aria-label={
        selecting
          ? selected
            ? "선택 해제"
            : "사진 선택"
          : "사진 자세히 보기"
      }
      aria-pressed={selecting ? selected : undefined}
      className={`relative block w-full break-inside-avoid overflow-hidden rounded-xl border bg-bg transition hover:opacity-90 active:opacity-80 ${
        selected ? "border-[#007aff] ring-2 ring-[#007aff]" : "border-line"
      }`}
      // 저장된 원본 비율로 높이를 미리 확정 → 이미지 로드 전에도 정확히 측정/배치
      style={{ aspectRatio: `${photo.width} / ${photo.height}` }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- 라우트 서빙 이미지 */}
      <img
        src={rawUrl(photo.id)}
        alt=""
        loading="lazy"
        ref={(el) => {
          // 이미 캐시되어 로드 완료면 트랜지션 없이 즉시 표시(스크롤 복귀 시 재fade 방지)
          if (el?.complete) {
            el.style.transition = "none";
            el.style.opacity = "1";
          }
        }}
        onLoad={(e) => {
          e.currentTarget.style.opacity = "1";
        }}
        className="size-full object-cover opacity-0 transition-opacity duration-500"
      />

      {/* 선택 모드 좌상단 체크 원 — 선택됨: 파란 원+흰 체크 / 미선택: 빈 원 */}
      {selecting && (
        <span
          aria-hidden
          className={`absolute left-2 top-2 flex size-6 items-center justify-center rounded-full border transition-colors ${
            selected
              ? "border-[#007aff] bg-[#007aff]"
              : "border-white/80 bg-black/20"
          }`}
        >
          {selected && (
            <svg
              viewBox="0 0 24 24"
              width={14}
              height={14}
              fill="none"
              className="text-white"
            >
              <path
                d="M5 12.5l4 4 10-10"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </span>
      )}
    </button>
  );
}
```

> `rawUrl`·`Photo` 는 이미 같은 파일에 정의/임포트되어 있다.

- [ ] **Step 3: 린트·타입 검증**

Run: `pnpm lint; pnpm exec tsc --noEmit`
Expected: 오류 없음

- [ ] **Step 4: 커밋**

```bash
git add src/app/gallery/gallery-grid.tsx
git commit -m "feat: 선택 모드 시 타일 선택·좌상단 체크 표시"
```

---

### Task 5: 푸터(BottomNav) 취소/삭제 버튼 교체

**Files:**
- Modify: `src/app/_components/bottom-nav.tsx`

- [ ] **Step 1: import 추가**

`bottom-nav.tsx` 상단 import 블록에 추가:
```ts
import { useGallerySelectionStore } from "@/lib/gallery-selection-store";
```

- [ ] **Step 2: 선택 상태 구독 + 분기 렌더**

기존 `export function BottomNav() { ... }` 전체를 아래로 교체:

```tsx
export function BottomNav() {
  const pathname = usePathname();
  const standalone = useStandalone();
  const selecting = useGallerySelectionStore((s) => s.selecting);
  const count = useGallerySelectionStore((s) => s.selectedIds.size);
  const exitSelection = useGallerySelectionStore((s) => s.exit);
  const openConfirm = useGallerySelectionStore((s) => s.openConfirm);

  // 로그인 화면에서는 숨김
  if (pathname === "/login") return null;

  // 갤러리에서 선택 모드일 때만 취소/삭제 버튼으로 교체
  const selectionMode = selecting && pathname.startsWith("/gallery");

  return (
    <nav
      className={`fixed inset-x-0 bottom-0 z-40 rounded-t-2xl border-t border-line shadow-[0_-2px_16px_rgba(0,0,0,0.05)] ${
        standalone ? "bg-surface/75 backdrop-blur-xl" : "bg-surface"
      }`}
    >
      {selectionMode ? (
        <div className="mx-auto flex max-w-md items-stretch pb-[env(safe-area-inset-bottom)]">
          <button
            type="button"
            onClick={exitSelection}
            className="flex-1 py-3 text-sm font-medium text-text-muted transition-opacity hover:opacity-60"
          >
            취소
          </button>
          <button
            type="button"
            onClick={openConfirm}
            disabled={count === 0}
            className="flex-1 py-3 text-sm font-semibold text-error transition-opacity hover:opacity-60 disabled:opacity-40"
          >
            삭제{count > 0 ? ` (${count})` : ""}
          </button>
        </div>
      ) : (
        <ul className="mx-auto flex max-w-md items-stretch justify-around pb-[env(safe-area-inset-bottom)]">
          {ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className="flex flex-col items-center justify-center gap-1 py-2"
                >
                  {/* SVG를 mask로 사용 → 테마 색(currentColor 대신 bg)으로 채색 */}
                  <span
                    aria-hidden
                    className={`size-6 transition-colors duration-200 ${
                      active ? "bg-primary" : "bg-text-muted"
                    }`}
                    style={{
                      maskImage: `url(${item.icon})`,
                      WebkitMaskImage: `url(${item.icon})`,
                      maskRepeat: "no-repeat",
                      WebkitMaskRepeat: "no-repeat",
                      maskPosition: "center",
                      WebkitMaskPosition: "center",
                      maskSize: "contain",
                      WebkitMaskSize: "contain",
                    }}
                  />
                  {/* 아이콘 아래 라벨 — 활성 탭은 강조색 */}
                  <span
                    className={`text-[0.6875rem] leading-none transition-colors duration-200 ${
                      active ? "font-medium text-primary" : "text-text-muted"
                    }`}
                  >
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}
```

- [ ] **Step 3: 린트·타입 검증**

Run: `pnpm lint; pnpm exec tsc --noEmit`
Expected: 오류 없음

- [ ] **Step 4: 커밋**

```bash
git add src/app/_components/bottom-nav.tsx
git commit -m "feat: 갤러리 선택 모드 시 하단바를 취소/삭제 버튼으로 교체"
```

---

### Task 6: 확인 다이얼로그 + 삭제 실행 컨트롤러

**Files:**
- Create: `src/app/gallery/gallery-selection-controller.tsx`
- Modify: `src/app/gallery/page.tsx` (마운트)

- [ ] **Step 1: 컨트롤러 작성**

```tsx
"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useGallerySelectionStore } from "@/lib/gallery-selection-store";

// 삭제 확인 다이얼로그 + 실제 삭제 실행. 갤러리 페이지에만 마운트되어,
// 페이지를 벗어나면(언마운트) 선택 모드를 자동 종료한다.
export function GallerySelectionController() {
  const router = useRouter();
  const confirmOpen = useGallerySelectionStore((s) => s.confirmOpen);
  const selectedIds = useGallerySelectionStore((s) => s.selectedIds);
  const closeConfirm = useGallerySelectionStore((s) => s.closeConfirm);
  const exit = useGallerySelectionStore((s) => s.exit);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 갤러리 이탈 시 선택 모드 정리(스토어 getState로 최신값 직접 호출)
  useEffect(() => {
    return () => {
      useGallerySelectionStore.getState().exit();
    };
  }, []);

  if (!confirmOpen) return null;

  const ids = Array.from(selectedIds);

  async function onConfirmDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/photos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => null);
        const msg =
          body !== null &&
          typeof body === "object" &&
          "error" in body &&
          typeof body.error === "string"
            ? body.error
            : "삭제에 실패했습니다.";
        throw new Error(msg);
      }
      exit();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제에 실패했습니다.");
      setDeleting(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[75] flex items-center justify-center px-8"
      style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
      role="dialog"
      aria-modal="true"
      aria-label="사진 삭제 확인"
    >
      <div className="w-full max-w-xs overflow-hidden rounded-2xl bg-surface">
        <div className="px-6 pb-5 pt-6 text-center">
          <p className="text-base font-medium text-text">
            {ids.length}장의 사진을 삭제할까요?
          </p>
          <p className="mt-1 text-sm text-text-muted">삭제하면 되돌릴 수 없어요.</p>
          {error && <p className="mt-2 text-sm text-error">{error}</p>}
        </div>
        <div className="flex border-t border-line">
          <button
            type="button"
            onClick={closeConfirm}
            disabled={deleting}
            className="flex-1 border-r border-line py-3 text-sm font-medium text-text-muted transition-opacity hover:opacity-60 disabled:opacity-40"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirmDelete}
            disabled={deleting}
            className="flex-1 py-3 text-sm font-semibold text-error transition-opacity hover:opacity-60 disabled:opacity-40"
          >
            {deleting ? "삭제 중…" : "삭제"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
```

- [ ] **Step 2: page.tsx에 마운트**

`page.tsx` 상단 import에 추가(다른 `./` import 옆):
```ts
import { GallerySelectionController } from "./gallery-selection-controller";
```

사진 존재 분기를 교체 — 기존:
```tsx
      ) : (
        // 첫 페이지가 바뀌면(업로드·새로고침) key 변경으로 리마운트 → 목록 재시드
        <GalleryGrid
          key={`${photos[0].id}:${photos.length}`}
          initialPhotos={photos}
          initialCursor={initialCursor}
        />
      )}
```
변경:
```tsx
      ) : (
        <>
          {/* 첫 페이지가 바뀌면(업로드·새로고침) key 변경으로 리마운트 → 목록 재시드 */}
          <GalleryGrid
            key={`${photos[0].id}:${photos.length}`}
            initialPhotos={photos}
            initialCursor={initialCursor}
          />
          <GallerySelectionController />
        </>
      )}
```

- [ ] **Step 3: 린트·타입 검증**

Run: `pnpm lint; pnpm exec tsc --noEmit`
Expected: 오류 없음 (cleanup-only useEffect는 setState 미사용 → set-state-in-effect 무관)

- [ ] **Step 4: 커밋**

```bash
git add src/app/gallery/gallery-selection-controller.tsx src/app/gallery/page.tsx
git commit -m "feat: 사진 삭제 확인 다이얼로그·삭제 실행 컨트롤러 추가"
```

---

### Task 7: 통합 빌드 + 수동 E2E 검증

**Files:** (없음 — 검증 전용)

- [ ] **Step 1: 풀 검증**

Run: `pnpm lint; pnpm exec tsc --noEmit; pnpm build`
Expected: 셋 다 통과

- [ ] **Step 2: 수동 시나리오 — `pnpm dev` 후 `/gallery`에서 확인**

- [ ] `+` 탭 → 팝오버에 "사진 추가" / "사진 삭제" 노출. 배경 탭하면 닫힘.
- [ ] (사진이 없을 때) 팝오버에 "사진 삭제" 항목이 **안 보임**.
- [ ] "사진 삭제" 탭 → 선택 모드 진입. 하단바가 **[취소] [삭제]** 로 바뀜. `+` 자리가 **"취소"** 로 바뀜.
- [ ] 타일 탭 → 좌상단 **파란 원 + 흰 체크**, 타일 테두리 파란 강조. 다시 탭 → 해제.
- [ ] 선택 중 하단 **삭제 (N)** 의 N이 선택 수와 일치. 0장이면 삭제 버튼 비활성.
- [ ] **삭제 (N)** 탭 → "N장의 사진을 삭제할까요?" 다이얼로그 → **삭제** → 사진이 사라지고 그리드 재시드. 하단바·상단이 원상복귀.
- [ ] 다이얼로그에서 **취소** → 선택 모드 유지(다이얼로그만 닫힘).
- [ ] 하단 **취소** 또는 상단 **취소** → 선택 모드 종료(선택 해제).
- [ ] 선택 모드 중 다른 탭(홈 등)으로 이동 → 선택 모드 자동 종료. 갤러리 복귀 시 일반 4탭.
- [ ] 모든 사진 선택 후 삭제 → 빈 갤러리 안내문으로 전환.

- [ ] **Step 3: 최종 커밋(필요 시)** — 검증 중 수정이 있었다면 커밋. 없으면 생략.

---

## Self-Review (작성자 점검 완료)

- **Spec 커버리지:** 백엔드 DELETE(Task 2) / 선택 스토어(Task 1) / + 팝오버(Task 3) / 타일 체크(Task 4) / 푸터 교체(Task 5) / 확인 다이얼로그·삭제·이탈 정리(Task 6) — 스펙 전 항목 매핑됨. (스펙의 `openapi.ts`는 저장소에 없어 제외 — 본문 상단에 명시.)
- **타입 일관성:** 스토어 메서드 `enter/exit/toggle/openConfirm/closeConfirm`·필드 `selecting/selectedIds/confirmOpen`가 Task 1 정의와 Task 3~6 사용처에서 일치.
- **플레이스홀더:** 없음(모든 코드 블록 완성형).
