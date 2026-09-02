"use client";

// 캘린더 영역 공용 폼 조각 — 일정(AnniversarySection)과 여행 계획(TripList·TripDetail)이
// 같은 입력 UI를 쓰도록 한 곳에 모은다.

/** 응답 body에서 error 문자열만 안전하게 꺼낸다(없으면 기본 문구). */
export async function errorMessage(res: Response): Promise<string> {
  const body: unknown = await res.json().catch(() => null);
  if (
    body !== null &&
    typeof body === "object" &&
    "error" in body &&
    typeof body.error === "string"
  ) {
    return body.error;
  }
  return "처리에 실패했습니다.";
}

/** 커스텀 날짜 입력 — 브라우저별 date UI 편차 대응(빈값 placeholder + 아이콘) */
export function DateField({
  value,
  onChange,
  min,
}: {
  value: string;
  onChange: (v: string) => void;
  min?: string;
}) {
  return (
    <div className="relative w-full min-w-0">
      <input
        type="date"
        value={value}
        min={min}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => {
          try {
            e.currentTarget.showPicker?.();
          } catch (err) {
            console.debug("[일정] showPicker 예외:", err);
          }
        }}
        className={`block w-full min-w-0 appearance-none border-b border-line bg-transparent py-2 pr-7 outline-none transition-colors [color-scheme:light] focus:border-primary [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-date-and-time-value]:text-left ${
          // 빈값일 때 브라우저 기본 표기("연도-월-일")를 숨기고 아래 placeholder만 보이게.
          // color:transparent만으로는 포커스된 하위 필드가 선택 하이라이트 색으로
          // 다시 그려져 "연도"가 비쳐 보인다 → datetime-edit 자체를 opacity로 끈다.
          value ? "" : "text-transparent [&::-webkit-datetime-edit]:opacity-0"
        }`}
      />
      {!value && (
        <span className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 text-text-muted">
          YYYY / MM / DD
        </span>
      )}
      <svg
        aria-hidden
        width={18}
        height={18}
        viewBox="0 0 24 24"
        fill="none"
        className="pointer-events-none absolute right-0 top-1/2 size-[18px] -translate-y-1/2 text-text-muted"
      >
        <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
        <path d="M3 9.5H21M8 3V6M16 3V6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </div>
  );
}

/** 추가(+) 아이콘 — 갤러리·일정과 동일한 plus.svg 마스크 */
export function PlusIcon({ className = "size-6" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`block bg-text ${className}`}
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
  );
}
