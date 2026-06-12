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
      // displayName이 비어 있으면 username(=아이디)으로 대체 표기하므로 username도 내려준다.
      // (메인 ABOUT US에서도 이미 @username을 노출 중)
      select: { id: true, username: true, displayName: true, birthday: true },
      orderBy: { id: "asc" },
    });

    return NextResponse.json({ members });
  } catch (error) {
    console.error("[GET /api/members]", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
