import { z } from "zod";

// 캘린더 클라이언트가 받는 API 응답 검증 스키마.
// 자체 API라도 .claude/rules/api.md 원칙(응답에 `as`/타입 단언 금지, safeParse 필수)을
// 클라이언트 파싱에도 동일 적용한다. 날짜는 Prisma가 ISO 문자열로 직렬화해 내려준다.

// /api/members — 캘린더 생일 표시용
export const membersResponseSchema = z.object({
  members: z.array(
    z.object({
      id: z.number().int(),
      username: z.string(),
      displayName: z.string().nullable(),
      birthday: z.string().nullable(),
    })
  ),
});

// /api/anniversaries — 일정 목록
export const anniversariesResponseSchema = z.object({
  anniversaries: z.array(
    z.object({
      id: z.number().int(),
      title: z.string(),
      date: z.string(),
      endDate: z.string().nullable(),
      yearly: z.boolean(),
      author: z
        .object({ displayName: z.string().nullable(), username: z.string() })
        .nullable(),
    })
  ),
});
