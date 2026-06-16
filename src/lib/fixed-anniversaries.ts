import { SINCE } from "@/lib/relationship";

// 달력에 "고정"으로 띄우는 매년 반복 일정 — DB 일정이 아니라 파생 데이터.
// 단일 출처: 처음 만난 날 = relationship.SINCE, 생일 = User.birthday(프로필).
// DB에 시드하지 않고 클라이언트에서 합성해 출처가 갈라지지 않게 한다.

// 달력(AnniversarySection)이 다루는 일정 형태. virtual=true면 읽기 전용(수정·삭제 불가).
export type CalendarAnniversary = {
  id: number;
  title: string;
  date: string; // ISO 문자열(UTC 자정)
  endDate: string | null;
  yearly: boolean;
  author: { displayName: string | null; username: string } | null;
  virtual?: boolean;
};

// 생일 표기에 필요한 최소 회원 정보(/api/members 응답과 동일 형태)
export type FixedMember = {
  id: number;
  username: string;
  displayName: string | null;
  birthday: string | null; // ISO 문자열 또는 null
};

// 처음 만난 날 — 연도는 매년 반복이라 표시에 쓰이지 않지만 ISO 형식상 포함(UTC 자정).
const SINCE_ISO = `${SINCE.year}-${String(SINCE.month).padStart(2, "0")}-${String(
  SINCE.day
).padStart(2, "0")}T00:00:00Z`;

// 가상 일정 id는 음수 — DB 일정(양수 id)과 React key·식별에서 충돌하지 않게.
const SINCE_ID = -1;
const birthdayId = (memberId: number) => -1000 - memberId;

// 회원 목록 + 처음 만난 날을 매년 반복 가상 일정으로 변환.
export function buildFixedAnniversaries(
  members: FixedMember[]
): CalendarAnniversary[] {
  const result: CalendarAnniversary[] = [
    {
      id: SINCE_ID,
      title: "처음 만난 날",
      date: SINCE_ISO,
      endDate: null,
      yearly: true,
      author: null,
      virtual: true,
    },
  ];
  for (const m of members) {
    if (m.birthday === null) continue;
    result.push({
      id: birthdayId(m.id),
      title: `${m.displayName ?? m.username}님의 생일`,
      date: m.birthday,
      endDate: null,
      yearly: true,
      author: null,
      virtual: true,
    });
  }
  return result;
}
