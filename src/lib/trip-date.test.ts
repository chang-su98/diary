import assert from "node:assert/strict";
import test from "node:test";
import { nightsLabel, tripDayCount, tripDayIso } from "./trip-date.ts";

// 여행 일차 계산 자체 점검 — 의존성 없는 순수 함수라 런타임 그대로 돌린다.
//   실행: node --test src/lib/trip-date.test.ts

test("tripDayCount", () => {
  assert.equal(tripDayCount("2026-10-03", "2026-10-05"), 3); // 2박 3일
  assert.equal(tripDayCount("2026-10-03", "2026-10-03"), 1); // 당일치기
  assert.equal(tripDayCount("2026-10-05", "2026-10-03"), 0); // 역전 → 무효
  assert.equal(tripDayCount("2026-10-03", "안녕"), 0); // 파싱 실패 → 무효
  // DB가 내려주는 ISO 문자열도 같은 결과여야 한다(폼의 YYYY-MM-DD와 혼용)
  assert.equal(
    tripDayCount("2026-10-03T00:00:00.000Z", "2026-10-05T00:00:00.000Z"),
    3
  );
  // 월·연 경계에서도 UTC 기준으로 정확해야 한다
  assert.equal(tripDayCount("2026-12-30", "2027-01-02"), 4);
});

test("tripDayIso", () => {
  assert.equal(tripDayIso("2026-10-03", 1).slice(0, 10), "2026-10-03");
  assert.equal(tripDayIso("2026-10-03", 3).slice(0, 10), "2026-10-05");
  assert.equal(tripDayIso("2026-12-31", 2).slice(0, 10), "2027-01-01");
});

test("nightsLabel", () => {
  assert.equal(nightsLabel("2026-10-03", "2026-10-05"), "2박 3일");
  assert.equal(nightsLabel("2026-10-03", "2026-10-03"), "당일치기");
});
