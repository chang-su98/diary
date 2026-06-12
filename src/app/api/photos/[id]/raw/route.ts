import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { dataUrlToBuffer, getStorage } from "@/lib/storage";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// 서빙 시 콘텐츠타입 화이트리스트 — 스토리지가 오염돼도 임의 타입을 그대로
// 내보내지 않는다(허용 외 값은 octet-stream으로 강제, XSS 벡터 차단).
const SERVABLE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
function safeContentType(t: string): string {
  return SERVABLE_TYPES.has(t) ? t : "application/octet-stream";
}

// 사진 원본 이미지 바이트 서빙.
// 스토리지 key(dataKey)가 있으면 스토리지에서, 없으면 레거시 base64(data)에서 디코드.
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
      select: { dataKey: true, data: true },
    });
    if (!photo) {
      return NextResponse.json(
        { error: "사진을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    let bytes: Buffer;
    let contentType: string;
    if (photo.dataKey) {
      const obj = await getStorage().get(photo.dataKey);
      if (!obj) {
        return NextResponse.json(
          { error: "사진을 찾을 수 없습니다." },
          { status: 404 }
        );
      }
      bytes = obj.bytes;
      contentType = obj.contentType;
    } else if (photo.data) {
      const decoded = dataUrlToBuffer(photo.data);
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
        "Content-Type": safeContentType(contentType),
        // 인증 게이트 뒤 콘텐츠 — 장기 immutable 캐시는 로그아웃 후 디스크
        // 캐시 노출 위험이 있어 매 요청 재검증(인증 변화에 민감하게).
        "Cache-Control": "private, no-cache, must-revalidate",
        // 콘텐츠 스니핑 차단(업로드 바이너리 서빙)
        "X-Content-Type-Options": "nosniff",
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
