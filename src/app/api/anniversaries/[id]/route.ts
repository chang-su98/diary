import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { isSameOriginRequest } from "@/lib/security";
import { Prisma } from "@/generated/prisma/client";
import { anniversaryUpdateSchema } from "@/lib/schemas/anniversary";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// 기념일 수정
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
      console.warn("[PATCH /api/anniversaries/:id] Request body 파싱 실패:", error);
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }

    const parsed = anniversaryUpdateSchema.safeParse(body);
    if (!parsed.success) {
      console.warn("[PATCH /api/anniversaries/:id] 입력 검증 실패:", parsed.error.issues);
      return NextResponse.json(
        { error: "입력값이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const p = parsed.data;
    const data: {
      title?: string;
      date?: Date;
      endDate?: Date | null;
      yearly?: boolean;
    } = {};
    if (p.title !== undefined) data.title = p.title;
    if (p.date !== undefined) data.date = new Date(`${p.date}T00:00:00Z`);
    if (p.endDate !== undefined)
      data.endDate = p.endDate ? new Date(`${p.endDate}T00:00:00Z`) : null;
    if (p.yearly !== undefined) data.yearly = p.yearly;

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "수정할 항목이 없습니다." },
        { status: 400 }
      );
    }

    await prisma.anniversary.update({ where: { id }, data, select: { id: true } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "기념일을 찾을 수 없습니다." }, { status: 404 });
    }
    console.error("[PATCH /api/anniversaries/:id]", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

// 기념일 삭제
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

    await prisma.anniversary.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "기념일을 찾을 수 없습니다." }, { status: 404 });
    }
    console.error("[DELETE /api/anniversaries/:id]", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
