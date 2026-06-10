import { getSession } from "@/lib/session";

export default async function Home() {
  const session = await getSession();

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-8 text-center">
      <h1 className="pl-[0.45em] text-3xl font-light tracking-[0.45em]">RECORD</h1>
      <p className="text-sm tracking-wide text-text-muted">
        {session?.username ?? "게스트"}
      </p>
    </main>
  );
}
