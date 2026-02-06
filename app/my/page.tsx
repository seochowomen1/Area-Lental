import MyClient from "./MyClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function MyPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  return <MyClient token={searchParams.token ?? ""} />;
}
