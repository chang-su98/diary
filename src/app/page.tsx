import { getSession } from "@/lib/session";
import { LogoutButton } from "./logout-button";

export default async function Home() {
  const session = await getSession();

  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-3xl font-bold">기록</h1>
      <p className="text-text-muted">
        {session?.username ?? "게스트"}님, 환영해요 👋
      </p>
      <LogoutButton />
    </main>
  );
}
