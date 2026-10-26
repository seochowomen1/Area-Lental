import { NextResponse } from "next/server";
import { assertAdminApiAuth } from "@/lib/adminApiAuth";
import { getDatabase } from "@/lib/database";
import { handleApiError, jsonError } from "@/lib/apiResponse";
import { ensureHolidaysLoaded } from "@/lib/holidays";
import { buildWelfareCopy } from "@/lib/welfareCopy";
import { loadBundle, MSG } from "@/lib/paymentApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/admin/requests/{id}/welfare-copy
 * 복지종합시스템PLUS·홈페이지 등록용 복사 텍스트 + 필드 (03_api §1)
 * - 승인 0건이어도 200 (전체 회차 기준 · text 첫 줄 주석)
 * - fields에 개인정보(전화·이메일·주소·생년월일) 없음 · 개인 이름은 가운데 마스킹
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const auth = assertAdminApiAuth(req);
  if (!auth.ok) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: auth.status ?? 401 });

  try {
    const db = getDatabase();
    const loaded = await loadBundle(db, params.id);
    if (!loaded) return jsonError(MSG.notFound, 404, "NOT_FOUND");

    // 갤러리 요일 계산용 공휴일 사전 로딩 (이용 기간이 걸친 월)
    const first = loaded.sessions[0];
    const months = new Set<string>();
    if (first.roomId === "gallery" && first.startDate && first.endDate) {
      let cur = first.startDate.slice(0, 7);
      const end = first.endDate.slice(0, 7);
      let guard = 0;
      while (cur <= end && guard++ < 24) {
        months.add(cur);
        const [y, m] = cur.split("-").map((v) => parseInt(v, 10));
        const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
        cur = next;
      }
    } else {
      for (const s of loaded.sessions) if (s.date) months.add(s.date.slice(0, 7));
    }
    await Promise.all(
      Array.from(months).map((ym) => {
        const [y, m] = ym.split("-").map((v) => parseInt(v, 10));
        return ensureHolidaysLoaded(y, m);
      })
    );

    const copy = buildWelfareCopy(loaded.sessions, { todayYmd: loaded.today });
    return NextResponse.json({ ok: true, text: copy.text, fields: copy.fields });
  } catch (e: unknown) {
    return handleApiError(e, "복지종합시스템 등록용 복사");
  }
}
