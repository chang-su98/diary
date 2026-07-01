import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

// 고정 윈도우(fixed-window) rate limit — 서버리스라 인스턴스별 인메모리 카운터를
// 쓸 수 없어 DB에 카운트를 둔다. 로그인 브루트포스 방어용.
// 원자성: 활성 윈도우가 있으면 조건부 updateMany로 증가하고, 없으면 create로 선점
// (NotifyThrottle의 create-on-conflict 선점 패턴과 동일). 소규모 동시성 가정의
// best-effort — 드문 동시 리셋 경합은 카운트를 소폭 낮게 볼 수 있으나 허용 범위.

export type RateLimitResult = { limited: boolean; retryAfterSec: number };

// key 카디널리티는 공격자의 IP 로테이션으로 무한 증가할 수 있어, 새 윈도우 시작 시
// 만료된 다른 행을 정리해 login_rate_limits 테이블 성장을 활성 윈도우 폭으로 제한한다.
export async function hitRateLimit(
  key: string,
  windowMs: number,
  max: number
): Promise<RateLimitResult> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowMs);
  const fullWindowSec = Math.ceil(windowMs / 1000);

  // 활성 윈도우가 있으면 카운트 증가(원자적).
  const bumped = await prisma.loginRateLimit.updateMany({
    where: { key, windowStart: { gte: windowStart } },
    data: { count: { increment: 1 } },
  });

  if (bumped.count === 0) {
    // 활성 윈도우 없음 → 새 윈도우 시작. 최초면 create로 선점, 만료 행이 있으면 리셋.
    try {
      await prisma.loginRateLimit.create({
        data: { key, count: 1, windowStart: now },
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        // 만료된 기존 행만 리셋(그 사이 다른 호출이 활성 윈도우를 만들었으면 no-op).
        await prisma.loginRateLimit.updateMany({
          where: { key, windowStart: { lt: windowStart } },
          data: { count: 1, windowStart: now },
        });
      } else {
        throw error;
      }
    }
    // 만료 행 정리(베스트 에포트) — 테이블 무한 성장 방지.
    await prisma.loginRateLimit
      .deleteMany({ where: { windowStart: { lt: windowStart } } })
      .catch(() => {});
    // 방금 시작한 윈도우의 count=1 → max<1이 아닌 한 통과.
    return { limited: max < 1, retryAfterSec: fullWindowSec };
  }

  // 증가 후 현재 카운트/남은 시간 확인.
  const row = await prisma.loginRateLimit.findUnique({
    where: { key },
    select: { count: true, windowStart: true },
  });
  const count = row?.count ?? 1;
  const elapsed = row ? now.getTime() - row.windowStart.getTime() : 0;
  const retryAfterSec = Math.max(1, Math.ceil((windowMs - elapsed) / 1000));
  return { limited: count > max, retryAfterSec };
}
