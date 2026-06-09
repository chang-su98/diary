import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { ProfileForm } from "./profile-form";

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect("/login"); // proxy로도 보호되지만 방어적

  const user = await prisma.user.findUnique({
    where: { id: Number(session.sub) },
    select: {
      username: true,
      displayName: true,
      birthday: true,
      bio: true,
      avatar: true,
    },
  });
  if (!user) redirect("/login");

  return (
    <ProfileForm
      initial={{
        username: user.username,
        displayName: user.displayName,
        birthday: user.birthday ? user.birthday.toISOString() : null,
        bio: user.bio,
        avatar: user.avatar,
      }}
    />
  );
}
