import { NextResponse, after, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getSession } from "@/lib/session";
import { isSameOriginRequest } from "@/lib/security";
import { sendPushToUser } from "@/lib/push";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// 현재 사용자의 좋아요 여부 + 사진의 총 좋아요 수.
type LikeState = { liked: boolean; count: number };

async function readLikeState(photoId: number, userId: number): Promise<LikeState> {
  const [mine, count] = await Promise.all([
    prisma.photoLike.findUnique({
      where: { photoId_userId: { photoId, userId } },
      select: { id: true },
    }),
    prisma.photoLike.count({ where: { photoId } }),
  ]);
  return { liked: mine !== null, count };
}

// 작성자에게 좋아요 푸시 발송 — 발송 실패가 좋아요 처리에 영향 주지 않도록 격리.
async function notifyAuthorOfLike(
  authorId: number,
  likerId: number,
  photoId: number
): Promise<void> {
  try {
    const liker = await prisma.user.findUnique({
      where: { id: likerId },
      select: { displayName: true, username: true },
    });
    // 표시명은 사용자 편집값 — 페이로드 비대화/제어문자 방지로 길이 제한
    const name = (liker?.displayName || liker?.username || "상대방").slice(0, 40);
    await sendPushToUser(authorId, {
      title: "Record",
      body: `${name}님이 사진에 좋아요를 눌렀어요 ♥`,
      url: "/gallery",
      tag: `photo-like-${photoId}`, // 같은 사진 알림은 갱신
    });
  } catch (error) {
    console.warn("[POST /api/photos/[id]/like] 푸시 발송 실패:", error);
  }
}

// 좋아요 상태 조회 — 상세 모달 열릴 때 호출
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }
    const photoId = parseId((await params).id);
    const userId = Number(session.sub);
    if (photoId === null || !Number.isInteger(userId)) {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }

    return NextResponse.json(await readLikeState(photoId, userId));
  } catch (error) {
    console.error("[GET /api/photos/[id]/like]", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

// 좋아요 토글 — 누른 상태면 취소, 아니면 추가
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
    const photoId = parseId((await params).id);
    const userId = Number(session.sub);
    if (photoId === null || !Number.isInteger(userId)) {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }

    // 좋아요 추가는 FK 위반을 피하기 위해 사진 존재를 먼저 확인(삭제된 사진 토글 방어)
    const existing = await prisma.photoLike.findUnique({
      where: { photoId_userId: { photoId, userId } },
      select: { id: true },
    });
    if (existing) {
      // 취소는 알림 없음. deleteMany는 멱등 — 경합으로 이미 사라졌어도 안전(P2025 회피).
      await prisma.photoLike.deleteMany({ where: { photoId, userId } });
    } else {
      const photo = await prisma.photo.findUnique({
        where: { id: photoId },
        select: { id: true, authorId: true },
      });
      if (!photo) {
        return NextResponse.json({ error: "사진을 찾을 수 없습니다." }, { status: 404 });
      }

      try {
        await prisma.photoLike.create({ data: { photoId, userId } });
      } catch (error) {
        // 동시 좋아요 경합(더블탭 등) — findUnique~create 사이에 이미 생성됨(P2002).
        // 이미 좋아요 상태이므로 멱등 처리: 500 대신 현재 상태 반환(알림도 생략).
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          return NextResponse.json(await readLikeState(photoId, userId));
        }
        throw error;
      }

      // 좋아요 "추가"일 때만, 본인 사진이 아니면 작성자에게 푸시 알림(베스트 에포트).
      // after(): 응답을 보낸 뒤 백그라운드로 발송 → 좋아요 응답을 외부 게이트웨이 왕복만큼
      // 지연시키지 않는다. notifyAuthorOfLike는 내부에서 모든 예외를 삼킨다.
      const authorId = photo.authorId;
      if (authorId !== null && authorId !== userId) {
        after(() => notifyAuthorOfLike(authorId, userId, photoId));
      }
    }

    return NextResponse.json(await readLikeState(photoId, userId));
  } catch (error) {
    console.error("[POST /api/photos/[id]/like]", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
