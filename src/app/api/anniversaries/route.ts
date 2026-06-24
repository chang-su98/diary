import { NextResponse, after, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { isSameOriginRequest } from "@/lib/security";
import { anniversaryCreateSchema } from "@/lib/schemas/anniversary";
import { sendPushToOthers } from "@/lib/push";

// 기념일 목록 조회
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }
    const anniversaries = await prisma.anniversary.findMany({
      orderBy: { date: "asc" },
      include: { author: { select: { displayName: true, username: true } } },
    });
    return NextResponse.json({ anniversaries });
  } catch (error) {
    console.error("[GET /api/anniversaries]", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

// 기념일 생성
export async function POST(req: NextRequest) {
  try {
    if (!isSameOriginRequest(req)) {
      return NextResponse.json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
    }
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch (error) {
      console.warn("[POST /api/anniversaries] Request body 파싱 실패:", error);
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }

    const parsed = anniversaryCreateSchema.safeParse(body);
    if (!parsed.success) {
      console.warn("[POST /api/anniversaries] 입력 검증 실패:", parsed.error.issues);
      return NextResponse.json(
        { error: "입력값이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const authorId = Number(session.sub);
    if (!Number.isInteger(authorId)) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const { title, date, endDate, yearly } = parsed.data;
    const anniversary = await prisma.anniversary.create({
      data: {
        title,
        date: new Date(`${date}T00:00:00Z`),
        endDate: endDate ? new Date(`${endDate}T00:00:00Z`) : null,
        yearly,
        authorId, // 로그인 사용자를 작성자로 기록
      },
      include: { author: { select: { displayName: true, username: true } } },
    });

    // 상대방에게 새 일정 알림(베스트 에포트) — 응답을 보낸 뒤 백그라운드로 발송해
    // 등록 응답을 푸시 게이트웨이 왕복만큼 지연시키지 않는다. 발송 실패는 격리.
    // 표시명·제목은 사용자 편집값이라 페이로드 비대화 방지로 길이를 제한한다.
    const authorName = (
      anniversary.author?.displayName ||
      anniversary.author?.username ||
      "상대방"
    ).slice(0, 40);
    after(async () => {
      try {
        await sendPushToOthers(authorId, {
          title: "Record",
          body: `${authorName}님이 새 일정을 등록했어요 — ${title.slice(0, 40)}`,
          url: "/", // 메인 캘린더
          tag: `anniv-${anniversary.id}`,
        });
      } catch (error) {
        console.warn("[POST /api/anniversaries] 푸시 발송 실패:", error);
      }
    });

    return NextResponse.json({ anniversary }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/anniversaries]", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
