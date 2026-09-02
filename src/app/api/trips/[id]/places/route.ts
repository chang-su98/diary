import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { isSameOriginRequest } from "@/lib/security";
import { tripPlaceCreateSchema } from "@/lib/schemas/trip";
import { tripDayCount } from "@/lib/trip-date";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// 여행 일차에 장소 추가
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!isSameOriginRequest(req)) {
      return NextResponse.json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
    }
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const tripId = parseId((await params).id);
    if (tripId === null) {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch (error) {
      console.warn("[POST /api/trips/:id/places] Request body 파싱 실패:", error);
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }

    const parsed = tripPlaceCreateSchema.safeParse(body);
    if (!parsed.success) {
      console.warn("[POST /api/trips/:id/places] 입력 검증 실패:", parsed.error.issues);
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    // 일차는 여행 기간에서 파생되므로 실제 기간 안의 값인지 확인해야 한다.
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      select: { startDate: true, endDate: true },
    });
    if (!trip) {
      return NextResponse.json({ error: "여행 계획을 찾을 수 없습니다." }, { status: 404 });
    }
    const days = tripDayCount(
      trip.startDate.toISOString(),
      trip.endDate.toISOString()
    );
    const { day, name, url } = parsed.data;
    if (day > days) {
      return NextResponse.json(
        { error: "여행 기간에 없는 일차입니다." },
        { status: 400 }
      );
    }

    const place = await prisma.tripPlace.create({
      data: { tripId, day, name, url: url ?? null },
      select: { id: true },
    });
    return NextResponse.json({ place }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/trips/:id/places]", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
