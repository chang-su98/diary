import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { isSameOriginRequest } from "@/lib/security";
import { Prisma } from "@/generated/prisma/client";
import { tripUpdateSchema } from "@/lib/schemas/trip";
import { TRIP_MAX_DAYS, tripDayCount } from "@/lib/trip-date";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

// 여행 상세 조회 — 일차별 장소 포함
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }
    const id = parseId((await params).id);
    if (id === null) {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }

    const trip = await prisma.trip.findUnique({
      where: { id },
      include: {
        author: { select: { displayName: true, username: true } },
        // 같은 일차 안에서는 추가한 순서대로
        places: { orderBy: [{ day: "asc" }, { createdAt: "asc" }] },
      },
    });
    if (!trip) {
      return NextResponse.json({ error: "여행 계획을 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json({ trip });
  } catch (error) {
    console.error("[GET /api/trips/:id]", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

// 여행 수정
export async function PATCH(
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

    const id = parseId((await params).id);
    if (id === null) {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch (error) {
      console.warn("[PATCH /api/trips/:id] Request body 파싱 실패:", error);
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }

    const parsed = tripUpdateSchema.safeParse(body);
    if (!parsed.success) {
      console.warn("[PATCH /api/trips/:id] 입력 검증 실패:", parsed.error.issues);
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const p = parsed.data;
    const data: { title?: string; startDate?: Date; endDate?: Date } = {};
    if (p.title !== undefined) data.title = p.title;

    // 기간이 바뀌면 기존 값과 병합해 재검증(부분 수정으로 cross-field 검증 우회 방지) +
    // 이미 등록된 장소의 일차가 새 기간 밖으로 밀려나지 않는지 확인.
    if (p.startDate !== undefined || p.endDate !== undefined) {
      const cur = await prisma.trip.findUnique({
        where: { id },
        select: { startDate: true, endDate: true },
      });
      if (!cur) {
        return NextResponse.json({ error: "여행 계획을 찾을 수 없습니다." }, { status: 404 });
      }
      const start = p.startDate ?? ymd(cur.startDate);
      const end = p.endDate ?? ymd(cur.endDate);
      const days = tripDayCount(start, end);
      if (days === 0) {
        return NextResponse.json(
          { error: "종료일은 시작일보다 빠를 수 없습니다." },
          { status: 400 }
        );
      }
      // 병합 재검증은 스키마의 cross-field 규칙을 "전부" 다시 봐야 한다.
      // (refineTripRange는 한쪽 날짜만 온 PATCH에서 통째로 건너뛴다)
      if (days > TRIP_MAX_DAYS) {
        return NextResponse.json(
          { error: `여행 기간은 최대 ${TRIP_MAX_DAYS}일까지입니다.` },
          { status: 400 }
        );
      }
      // 기간을 줄이면 마지막 일차의 장소가 갈 곳을 잃는다 → 조용히 지우지 않고 거절.
      const deepest = await prisma.tripPlace.aggregate({
        where: { tripId: id },
        _max: { day: true },
      });
      const maxDay = deepest._max.day ?? 0;
      if (maxDay > days) {
        return NextResponse.json(
          { error: `${maxDay}일차에 등록된 장소가 있어 기간을 줄일 수 없습니다.` },
          { status: 400 }
        );
      }
      data.startDate = new Date(`${start}T00:00:00Z`);
      data.endDate = new Date(`${end}T00:00:00Z`);
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "수정할 항목이 없습니다." }, { status: 400 });
    }

    await prisma.trip.update({ where: { id }, data, select: { id: true } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "여행 계획을 찾을 수 없습니다." }, { status: 404 });
    }
    console.error("[PATCH /api/trips/:id]", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

// 여행 삭제 — 장소는 Cascade로 함께 삭제
export async function DELETE(
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

    const id = parseId((await params).id);
    if (id === null) {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }

    await prisma.trip.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "여행 계획을 찾을 수 없습니다." }, { status: 404 });
    }
    console.error("[DELETE /api/trips/:id]", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
