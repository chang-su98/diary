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
// 사진은 id마다 콘텐츠 불변(수정 없음, 삭제만) → 장기 immutable 캐시 + 강한 ETag.
// private: 인증 게이트 콘텐츠라 공유/CDN 캐시엔 저장 안 하고 사용자 브라우저만 캐시.
// (로그아웃 후 브라우저 디스크 캐시 잔존은 2인 사적 앱 특성상 허용 — 속도 우선.)
const IMAGE_CACHE_CONTROL = "private, max-age=31536000, immutable";

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

    // 콘텐츠가 id마다 불변이므로 id로 강한 ETag를 만든다.
    const etag = `"photo-${id}"`;
    // 조건부 요청 매치 시 DB·스토리지 조회 없이 304로 즉시 종료(immutable이라
    // 평소엔 재검증조차 안 하고, 캐시 만료/제거 시에만 이 경로에 도달).
    if (req.headers.get("if-none-match") === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: { ETag: etag, "Cache-Control": IMAGE_CACHE_CONTROL },
      });
    }

    // 인가 모델: 폐쇄형 2인 공유 앱(schema.prisma 참조) — 로그인한 두 사용자(커플)는
    // 모든 사진을 열람할 수 있다(의도). 따라서 authorId 등 소유권으로 접근을 제한하지
    // 않는다(authorId는 등록자 표시용). 위 ETag 304 단축경로도 같은 전제(전원 열람 가능)
    // 위에서 동작하므로 존재 추론 채널이 권한 경계를 넘지 않는다.
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
        ETag: etag,
        "Cache-Control": IMAGE_CACHE_CONTROL,
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
