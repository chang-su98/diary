import { z } from "zod";

// 날짜는 YYYY-MM-DD 포맷만 허용(타임존 모호성 차단). 저장은 UTC 자정으로 통일.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// YYYY-MM-DD 엄격 검증.
// 정규식만으로는 2026-13-45 같은 "존재하지 않는 날짜"가 통과하고,
// new Date("2026-13-45T00:00:00Z")는 NaN이 아니라 다음 달로 롤오버되어
// 조용히 잘못된 날짜가 저장된다. 파싱 결과를 원본과 재대조해 차단한다.
export function isStrictDate(v: string): boolean {
  if (!DATE_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

// YYYY-MM-DD 문자열 zod 스키마(엄격 캘린더 검증 포함).
export const strictDateString = z
  .string()
  .refine(isStrictDate, "유효한 날짜가 아닙니다.");

// 허용 래스터 이미지 data URL 정규식 — 스키마 검증(.regex)과 스토리지 디코더
// (.exec)가 공유하는 단일 소스. svg 등 스크립트 실행 가능 포맷은 차단하고,
// 캡처 그룹 1=콘텐츠타입, 2=base64 본문. 한쪽만 바뀌어 조용히 갈라지는 것을 방지.
export const IMAGE_DATA_URL_RE =
  /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/;
