import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { dataUrlToBuffer, getStorage } from "@/lib/storage";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// 사진 이미지 바이트 서빙 — ?v=thumb(기본) | full.
// 스토리지 key가 있으면 스토리지에서, 없으면 레거시 base64(data/thumb)에서 디코드.
export async function GET(
  req: NextRequest,
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

    const variant =
      new URL(req.url).searchParams.get("v") === "full" ? "full" : "thumb";

    const photo = await prisma.photo.findUnique({
      where: { id },
      select: { dataKey: true, thumbKey: true, data: true, thumb: true },
    });
    if (!photo) {
      return NextResponse.json(
        { error: "사진을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const key = variant === "full" ? photo.dataKey : photo.thumbKey;
    const legacy = variant === "full" ? photo.data : photo.thumb;

    let bytes: Buffer;
    let contentType: string;
    if (key) {
      const obj = await getStorage().get(key);
      if (!obj) {
        return NextResponse.json(
          { error: "사진을 찾을 수 없습니다." },
          { status: 404 }
        );
      }
      bytes = obj.bytes;
      contentType = obj.contentType;
    } else if (legacy) {
      const decoded = dataUrlToBuffer(legacy);
      if (!decoded) {
        return NextResponse.json(
          { error: "사진을 찾을 수 없습니다." },
          { status: 404 }
        );
      }
      bytes = decoded.buffer;
      contentType = decoded.contentType;
    } else {
      return NextResponse.json(
        { error: "사진을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": contentType,
        // 같은 id/variant는 내용 불변 → 브라우저 장기 캐시(사설)
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("[GET /api/photos/[id]/raw]", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
