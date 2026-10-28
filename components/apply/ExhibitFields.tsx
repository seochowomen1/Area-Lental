"use client";

/**
 * 전시 정보(갤러리) — 전시 이름 · 철수 시간 · 장르·전시 내용(선택) · 접힘 `더 적을 내용 (선택)` (02_ui_apply §3 · §6-6)
 * 저장 필드·purpose 합치기 형식은 그대로(lib/apply/form composeGalleryPurpose).
 */
import { cn } from "@/lib/cn";
import { GALLERY_RULES } from "@/lib/constants";
import { formatKoDate, isYmd } from "@/lib/rules/ymd";
import { removalTimeOptions, teardownDeadline } from "@/lib/apply/gallery";
import type { ApplyErrors, ApplyFormValues } from "@/lib/apply/form";
import { A_INPUT, A_INPUT_ERROR, A_SECTION_TITLE, AField, fieldAria } from "@/components/apply/ui";
import { ORG_HELP } from "@/components/apply/UsageFields";

export const AWARENESS_OPTIONS = ["서초센터 홈페이지", "센터 내 홍보 리플릿", "서초구청 홈페이지", "지인 소개", "기타"] as const;

export default function ExhibitFields({
  values,
  errors,
  onChange,
  endDate,
}: {
  values: ApplyFormValues;
  errors: ApplyErrors;
  onChange: (patch: Partial<ApplyFormValues>) => void;
  endDate: string;
}) {
  const options = removalTimeOptions(endDate);
  const deadline = isYmd(endDate) ? teardownDeadline(endDate) : GALLERY_RULES.TEARDOWN_DEADLINE.WEEKDAY;
  const moreFilled = Boolean(values.exhibitionPurpose || values.awarenessPath || values.specialNotes);
  return (
    <section aria-labelledby="sec-exhibit" className="space-y-5">
      <h2 id="sec-exhibit" className={A_SECTION_TITLE}>
        전시 정보
      </h2>
      <AField id="exhibitionTitle" label="전시 이름" error={errors.exhibitionTitle}>
        <input
          id="exhibitionTitle"
          type="text"
          maxLength={80}
          value={values.exhibitionTitle}
          onChange={(e) => onChange({ exhibitionTitle: e.target.value })}
          className={cn(A_INPUT, errors.exhibitionTitle && A_INPUT_ERROR)}
          {...fieldAria("exhibitionTitle", errors.exhibitionTitle)}
        />
      </AField>
      <AField
        id="galleryRemovalTime"
        label="철수 시간"
        help={`마지막 날 ${deadline}까지 작품을 모두 철수해야 합니다.`}
        error={errors.galleryRemovalTime}
      >
        <select
          id="galleryRemovalTime"
          value={values.galleryRemovalTime}
          onChange={(e) => onChange({ galleryRemovalTime: e.target.value })}
          className={cn(A_INPUT, "sm:max-w-[320px]", errors.galleryRemovalTime && A_INPUT_ERROR)}
          {...fieldAria("galleryRemovalTime", errors.galleryRemovalTime, true)}
        >
          <option value="">골라 주세요</option>
          {options.map((t) => (
            <option key={t} value={t}>
              {formatKoDate(endDate)} {t}
            </option>
          ))}
        </select>
      </AField>
      <AField id="orgName" label="단체 이름" help={ORG_HELP} error={errors.orgName}>
        <input
          id="orgName"
          type="text"
          maxLength={80}
          autoComplete="organization"
          value={values.orgName}
          onChange={(e) => onChange({ orgName: e.target.value })}
          className={cn(A_INPUT, errors.orgName && A_INPUT_ERROR)}
          {...fieldAria("orgName", errors.orgName, true)}
        />
      </AField>
      <AField id="genreContent" label="장르·전시 내용" optional>
        <textarea
          id="genreContent"
          rows={3}
          maxLength={1000}
          placeholder="예: 수채화 20점, 동네 풍경"
          value={values.genreContent}
          onChange={(e) => onChange({ genreContent: e.target.value })}
          className={cn(A_INPUT, "min-h-[96px] resize-y")}
        />
      </AField>
      <details className="rounded-xl border border-line bg-white" open={moreFilled || undefined}>
        <summary className="min-h-[52px] cursor-pointer px-4 py-3 text-[17px] font-bold leading-7 text-ink">
          더 적을 내용 <span className="ml-1 font-medium text-ink-3">(선택) — 전시 목적 · 알게 된 경로 · 특이사항</span>
        </summary>
        <div className="space-y-5 border-t border-line px-4 pb-4 pt-4">
          <AField id="exhibitionPurpose" label="전시 목적" optional>
            <textarea
              id="exhibitionPurpose"
              rows={3}
              maxLength={1000}
              value={values.exhibitionPurpose}
              onChange={(e) => onChange({ exhibitionPurpose: e.target.value })}
              className={cn(A_INPUT, "min-h-[96px] resize-y")}
            />
          </AField>
          <AField id="awarenessPath" label="알게 된 경로" optional>
            <select
              id="awarenessPath"
              value={values.awarenessPath}
              onChange={(e) => onChange({ awarenessPath: e.target.value })}
              className={cn(A_INPUT, "sm:max-w-[320px]")}
            >
              <option value="">골라 주세요</option>
              {AWARENESS_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </AField>
          <AField id="specialNotes" label="특이사항" optional>
            <textarea
              id="specialNotes"
              rows={3}
              maxLength={1000}
              value={values.specialNotes}
              onChange={(e) => onChange({ specialNotes: e.target.value })}
              className={cn(A_INPUT, "min-h-[96px] resize-y")}
            />
          </AField>
        </div>
      </details>
    </section>
  );
}
