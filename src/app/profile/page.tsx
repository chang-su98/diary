import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { LogoutButton } from "@/app/logout-button";

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect("/login"); // proxy로도 보호되지만 방어적

  const user = await prisma.user.findUnique({
    where: { id: Number(session.sub) },
    select: {
      username: true,
      displayName: true,
      birthday: true,
      email: true,
      avatar: true,
    },
  });
  if (!user) redirect("/login");

  const items: { label: string; value: string | null }[] = [
    { label: "ID", value: user.username },
    { label: "이름", value: user.displayName },
    {
      label: "생일",
      // 저장 시 입력값(YYYY-MM-DD)을 UTC 자정으로 보관 → UTC 기준으로 되돌려 표시
      value: user.birthday ? user.birthday.toISOString().slice(0, 10) : null,
    },
    { label: "이메일", value: user.email },
  ];

  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col px-8 pb-28 pt-[calc(2rem+var(--safe-top))]">
      <Link
        href="/profile/edit"
        aria-label="프로필 수정"
        className="absolute right-6 top-[calc(2rem+var(--safe-top))] p-1 transition-opacity hover:opacity-60"
      >
        {/* SVG를 mask로 사용 → 테마색(bg-text)으로 채색, 다크모드 대응 */}
        <span
          aria-hidden
          className="block size-6 bg-text"
          style={{
            maskImage: "url(/asset/images/contents/edit.svg)",
            WebkitMaskImage: "url(/asset/images/contents/edit.svg)",
            maskRepeat: "no-repeat",
            WebkitMaskRepeat: "no-repeat",
            maskPosition: "center",
            WebkitMaskPosition: "center",
            maskSize: "contain",
            WebkitMaskSize: "contain",
          }}
        />
      </Link>

      <h1 className="mb-10 pl-[0.3em] text-center text-2xl font-light tracking-[0.3em]">
        PROFILE
      </h1>

      {/* 아바타 (읽기 전용) */}
      <div className="mb-10 flex justify-center">
        <div className="size-24 overflow-hidden rounded-full border border-line bg-bg">
          {user.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URL 이미지
            <img
              src={user.avatar}
              alt="프로필 사진"
              className="size-full object-cover"
            />
          ) : (
            <span className="flex size-full items-center justify-center text-2xl font-light text-text-muted">
              {(user.displayName || user.username).charAt(0).toUpperCase()}
            </span>
          )}
        </div>
      </div>

      {/* 정보 — th/td 테이블 */}
      <table className="w-full border-collapse">
        <tbody>
          {items.map((it) => (
            <tr key={it.label} className="border-b border-line">
              <th
                scope="row"
                className="w-28 py-5 pr-6 text-left align-baseline text-xs font-normal tracking-[0.15em] text-text-muted"
              >
                {it.label}
              </th>
              <td className="break-all py-5 text-sm">{it.value || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-12 flex justify-center">
        <LogoutButton />
      </div>
    </main>
  );
}
