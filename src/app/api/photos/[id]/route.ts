import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// 사진 원본(상세 모달용) 조회 — 그리드는 썸네일만 받으므로 열 때만 원본을 가져온다.
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

    const photo = await prisma.photo.findUnique({
      where: { id },
      select: { data: true },
    });
    if (!photo) {
      return NextResponse.json(
        { error: "사진을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: photo.data });
  } catch (error) {
    console.error("[GET /api/photos/[id]]", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
