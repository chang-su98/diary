# 프론트엔드 개발 가이드

Diary 프로젝트의 프론트엔드 개발 시 참고할 패턴을 정리한다.
코딩 컨벤션(`docs/coding-conventions.md`), React Compiler 린트 규칙(`CLAUDE.md`)과 **중복되지 않는 내용만** 다룬다.

---

## Part 1. API 데이터 흐름 (Zod + TanStack Query)

> 참고: https://blog.devgrr.kr/posts/zod-react-typescript

### 1-1. API 응답 런타임 검증

서버(Route Handler)에서는 `safeParse`로 요청을 검증하고 있으나,
클라이언트에서 API 응답을 받을 때는 `as` 타입 단언에 의존하는 경우가 있다.

외부 API 응답은 런타임에 검증해야 안전하다.

```ts
// src/lib/schemas/ 에 응답 스키마 정의
const userResponseSchema = z.object({
  data: z.object({
    userId: z.string(),
    userNm: z.string().nullable(),
    email: z.string().nullable(),
  }),
});

// 호출부
const res = await api.get("/auth/me");
const parsed = userResponseSchema.safeParse(res.data);
if (!parsed.success) {
  console.error("API 응답 스키마 불일치:", parsed.error);
  throw new Error("予期しないレスポンス形式です");
}
return parsed.data.data;
```

| 상황 | 검증 여부 |
|------|----------|
| QSP 등 외부 API 프록시 응답 | **필수** (이미 적용됨) |
| 자체 Route Handler → 클라이언트 | 선택 (동일 코드베이스) |
| 구조 변경이 잦은 초기 개발 API | 권장 |

### 1-2. Zod Transform — 검증 + 변환 통합

API 응답 → UI 모델 변환이 3개 필드 이상이면 `.transform()`으로 한 단계에 처리할 수 있다.

```ts
// 검증 + 변환 + 타입 추론을 한번에 처리
const codeHeaderResponseSchema = z.object({
  id: z.number().transform(String),
  headerCode: z.string(),
  headerAlias: z.string(),
  headerName: z.string(),
  relCode1: z.string().nullable().transform((v) => v ?? ""),
  isActive: z.boolean().transform((v) => (v ? "Y" : "N") as "Y" | "N"),
});

type CodeHeaderItem = z.infer<typeof codeHeaderResponseSchema>;
```

변환이 1~2개뿐이면 수동 함수가 더 명확하다.

### 1-3. 배열 부분 실패 처리

외부 API 목록에서 일부 항목이 스키마에 맞지 않을 때, 유효한 것만 필터링한다.
자체 API에서는 스키마가 보장되므로 일반적으로 불필요.

```ts
function parseArraySafe<T>(schema: z.ZodType<T>, items: unknown[]): T[] {
  return items
    .map((item) => schema.safeParse(item))
    .filter((r) => r.success)
    .map((r) => r.data);
}
```

### 1-4. TanStack Query + Zod 에러 retry 전략

Zod 검증 실패는 재시도해도 해결되지 않으므로 retry에서 제외한다.

```ts
const { data } = useQuery({
  queryKey: ["codes"],
  queryFn: async () => {
    const res = await api.get<{ data: ApiCodeHeader[] }>("/codes");
    return res.data.data;
  },
  retry: (failureCount, error) => {
    if (error instanceof z.ZodError) return false; // 스키마 불일치 → 재시도 무의미
    return failureCount < 3;
  },
});
```

### 1-5. Zod 스키마 위치 규칙

| 용도 | 위치 | 예시 |
|------|------|------|
| 요청 검증 (서버) | `src/lib/schemas/` | `auth.ts`, `code.ts`, `signup.ts` |
| 응답 검증 (서버 프록시) | 동일 파일 | `qspLoginResponseSchema` |
| 응답 검증 (클라이언트) | 동일 파일에 추가 | `codeHeaderResponseSchema` |

도메인 단위로 관리하며, 요청/응답 스키마를 같은 파일에 둔다.

---

## Part 2. React 19 활용 패턴

> 참고: https://blog.devgrr.kr/posts/react-19-guide

React Compiler 린트 규칙(`set-state-in-effect`, `set-state-in-render` 등)은
`CLAUDE.md`에 상세히 정의되어 있으므로 여기서는 다루지 않는다.
아래는 프로젝트에서 아직 활용하지 않는 React 19 신규 기능이다.

### 2-1. use() API — 조건부 리소스 읽기

기존 Hook과 달리 **조건문 안에서 호출 가능**하며, Suspense와 연동된다.

```tsx
import { use, Suspense } from "react";

// 조건부 Context 읽기
function AdminPanel({ isAdmin }: { isAdmin: boolean }) {
  if (!isAdmin) return <p>権限がありません</p>;
  const config = use(AdminConfigContext); // useContext와 달리 조건부 가능
  return <div>{config.dashboardTitle}</div>;
}

// Promise 읽기 (Suspense 연동)
function UserProfile({ userPromise }: { userPromise: Promise<User> }) {
  const user = use(userPromise);
  return <p>{user.userNm}</p>;
}

<Suspense fallback={<p>読み込み中...</p>}>
  <UserProfile userPromise={fetchUser()} />
</Suspense>
```

| 상황 | 권장 방식 |
|------|----------|
| 서버 데이터 fetch (CRUD) | TanStack Query |
| 조건부 Context 읽기 | `use(Context)` |
| Server → Client Component 데이터 전달 | `use(promise)` + Suspense |

### 2-2. Ref as Props — forwardRef 불필요

React 19부터 ref를 일반 prop으로 직접 전달한다. `forwardRef`는 사용하지 않는다.

```tsx
function InputBox({ ref, ...props }: { ref?: React.Ref<HTMLInputElement> } & React.InputHTMLAttributes<HTMLInputElement>) {
  return <input ref={ref} {...props} />;
}

function Parent() {
  const inputRef = useRef<HTMLInputElement>(null);
  return <InputBox ref={inputRef} placeholder="入力" />;
}
```

### 2-3. Ref Cleanup Functions

ref 콜백에서 cleanup 함수를 반환하여 언마운트 시 자동 정리한다.

```tsx
<video
  ref={(el) => {
    if (el) el.play();
    return () => {
      el?.pause();
      el?.removeAttribute("src");
    };
  }}
/>
```

활용: 이벤트 리스너 해제, 외부 라이브러리 정리, Observer 연결/해제

### 2-4. useOptimistic — 낙관적 UI 업데이트

서버 응답 전에 UI를 즉시 반영하고, 실패 시 자동 롤백한다.

```tsx
import { useOptimistic } from "react";

function TodoList({ todos }: { todos: Todo[] }) {
  const [optimisticTodos, addOptimisticTodo] = useOptimistic(
    todos,
    (state, newTodo: Todo) => [...state, newTodo]
  );

  const handleAdd = async (title: string) => {
    addOptimisticTodo({ id: `temp-${Date.now()}`, title, done: false });
    try {
      await api.post("/todos", { title });
    } catch {
      // 실패 시 자동 롤백
    }
  };

  return <ul>{optimisticTodos.map((t) => <li key={t.id}>{t.title}</li>)}</ul>;
}
```

| 상황 | 권장 |
|------|------|
| 즉각 피드백 (좋아요, 토글) | `useOptimistic` |
| 목록 CRUD (AG Grid 등) | TanStack Query mutation + invalidate |
| 복잡한 폼 제출 | mutation + 로딩 상태 |

### 2-5. Resource Preloading

`react-dom`의 `preload()`, `preinit()`으로 리소스를 미리 로드한다.

```tsx
import { preload, preinit } from "react-dom";

function AppLayout() {
  preload("/asset/fonts/NotoSansJP-Regular.woff2", {
    as: "font", type: "font/woff2", crossOrigin: "anonymous",
  });
  preinit("https://cdn.example.com/analytics.js", { as: "script" });
  return <main>...</main>;
}
```

현재 적용 가능: NotoSansJP / Pretendard 웹폰트 프리로드 (현재 SCSS `@font-face` 로드 중)

---

## 프로젝트 내부 리소스 활용 원칙

새로운 기능을 구현하기 전에 프로젝트 내부 파일을 확인하고, 이미 존재하는 리소스를 우선 활용한다.

| 리소스 | 위치 | 용도 |
|--------|------|------|
| `api` (axios) | `src/lib/axios.ts` | API 호출 (`baseURL: "/api"`) — `fetch` 대신 사용 |
| Zod 스키마 | `src/lib/schemas/` | 요청/응답 검증 및 타입 추론 |
| TanStack Query | `src/lib/query-provider.tsx` | 서버 데이터 fetch — root layout에 설정됨 |
| Zustand store | `src/lib/store.ts` | 클라이언트 전역 상태 (팝업, 사이드바, 알림) |
| 공통 컴포넌트 | `src/components/common/` | Button, Checkbox, Spinner 등 재사용 |

새 유틸이나 타입을 만들기 전에 기존 파일에 이미 정의되어 있는지 확인할 것.

---

## API / 스키마 / DB / lib 영역 분리 원칙

API Route Handler(`src/app/api/`), Zod 스키마(`src/lib/schemas/`), Prisma 스키마(`prisma/`)는 **프론트엔드 담당 영역이 아니다.**
이 영역의 파일은 **수정 및 신규 생성을 절대 하지 않는다.**
API나 스키마 변경이 필요한 경우, 필요한 내용을 정리하여 담당자에게 **알려주기만** 한다.

`src/lib/` 디렉토리 내부도 `store.ts`를 제외하고는 **수정하지 않는다.**
`src/lib/axios.ts`, `src/lib/auth-client.ts`, `src/lib/jwt.ts` 등 유틸리티 파일은 백엔드 담당 영역이다.

---

## PDCA 문서 저장 위치

PDCA 작성 시 Plan은 `docs/ref/01-plan`, Design 문서는 `docs/ref/02-design` 폴더 안에 저장한다.
