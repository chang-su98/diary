import { notFound } from "next/navigation";
import { TripDetailView } from "./trip-detail";

// 여행 계획 상세 — 일차별 장소(네이버 지도 링크) 관리.
// 데이터는 클라이언트에서 TanStack Query로 가져온다(추가·수정 후 즉시 갱신 위해).
export default async function TripPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  return <TripDetailView id={id} />;
}
