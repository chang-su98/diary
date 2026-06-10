import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

// 등록된 회원(폐쇄형 2인)의 이름·생일 조회. 캘린더 생일 표시에 사용.
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const members = await prisma.user.findMany({
      // 로그인 ID(username)는 노출하지 않는다 — 화면엔 displayName만 필요
      select: { id: true, displayName: true, birthday: true },
      orderBy: { id: "asc" },
    });

    return NextResponse.json({ members });
  } catch (error) {
    console.error("[GET /api/members]", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
