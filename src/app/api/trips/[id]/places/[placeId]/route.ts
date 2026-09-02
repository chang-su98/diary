import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { isSameOriginRequest } from "@/lib/security";
import { tripPlaceUpdateSchema } from "@/lib/schemas/trip";
import { tripDayCount } from "@/lib/trip-date";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// 장소 수정 — where에 tripId를 함께 걸어 다른 여행의 장소가 수정되지 않게 한다.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; placeId: string }> }
) {
  try {
    if (!isSameOriginRequest(req)) {
      return NextResponse.json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
    }
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const { id: rawTripId, placeId: rawPlaceId } = await params;
    const tripId = parseId(rawTripId);
    const placeId = parseId(rawPlaceId);
    if (tripId === null || placeId === null) {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch (error) {
      console.warn("[PATCH /api/trips/:id/places/:placeId] Request body 파싱 실패:", error);
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }

    const parsed = tripPlaceUpdateSchema.safeParse(body);
    if (!parsed.success) {
      console.warn(
        "[PATCH /api/trips/:id/places/:placeId] 입력 검증 실패:",
        parsed.error.issues
      );
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const p = parsed.data;
    const data: { day?: number; name?: string; url?: string | null } = {};
    if (p.name !== undefined) data.name = p.name;
    if (p.url !== undefined) data.url = p.url ?? null;
    if (p.day !== undefined) {
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
      if (p.day > days) {
        return NextResponse.json({ error: "여행 기간에 없는 일차입니다." }, { status: 400 });
      }
      data.day = p.day;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "수정할 항목이 없습니다." }, { status: 400 });
    }

    // updateMany + tripId 조건 — 여행에 속하지 않은 장소 id는 0건으로 404 처리.
    const { count } = await prisma.tripPlace.updateMany({
      where: { id: placeId, tripId },
      data,
    });
    if (count === 0) {
      return NextResponse.json({ error: "장소를 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[PATCH /api/trips/:id/places/:placeId]", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

// 장소 삭제
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; placeId: string }> }
) {
  try {
    if (!isSameOriginRequest(req)) {
      return NextResponse.json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
    }
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const { id: rawTripId, placeId: rawPlaceId } = await params;
    const tripId = parseId(rawTripId);
    const placeId = parseId(rawPlaceId);
    if (tripId === null || placeId === null) {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }

    const { count } = await prisma.tripPlace.deleteMany({
      where: { id: placeId, tripId },
    });
    if (count === 0) {
      return NextResponse.json({ error: "장소를 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[DELETE /api/trips/:id/places/:placeId]", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
