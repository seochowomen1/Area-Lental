import { NextResponse } from "next/server";
import { assertAdminApiAuth } from "@/lib/adminApiAuth";
import { loadUnifiedTemplates, saveTemplates, type TemplateStatus } from "@/lib/emailTemplates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 통합 템플릿 조회 */
export async function GET() {
  const auth = assertAdminApiAuth();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const templates = await loadUnifiedTemplates();
  return NextResponse.json({ ok: true, templates });
}

/** 상태별 템플릿 저장 (카테고리 구분 없이 통합) */
export async function PUT(req: Request) {
  const auth = assertAdminApiAuth();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      status?: string;
      subject?: string;
      body?: string;
    };

    const status = body.status as TemplateStatus;
    const subject = String(body.subject ?? "").trim();
    const templateBody = String(body.body ?? "").trim();

    if (!["접수", "승인", "반려", "취소"].includes(status)) {
      return NextResponse.json({ ok: false, message: "잘못된 상태입니다." }, { status: 400 });
    }
    if (!subject || !templateBody) {
      return NextResponse.json({ ok: false, message: "제목과 본문을 입력해주세요." }, { status: 400 });
    }

    await saveTemplates("common", status, subject, templateBody);

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "템플릿 저장 중 오류가 발생했습니다.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
