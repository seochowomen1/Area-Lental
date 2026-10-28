"use client";

/**
 * 개인정보 수집·이용 동의 팝업 (02_ui_apply §0-5 (1))
 * 문구는 원문 그대로. 휴대폰(<640)은 3열 표 대신 항목 묶음 카드, PC는 표(셀 15).
 * 체크는 [동의합니다]로만, [닫기]는 체크 상태를 바꾸지 않는다.
 */
import ConsentDialog from "@/components/apply/ConsentDialog";

type PrivacyModalProps = {
  open: boolean;
  onClose: () => void;
  onAgree: () => void;
  onDisagree: () => void;
  /** rental: 강의실·E-스튜디오 대관(기본) / gallery: 우리동네 갤러리 전시 신청 */
  variant?: "rental" | "gallery";
};

export default function PrivacyModal({ open, onClose, onAgree, onDisagree, variant = "rental" }: PrivacyModalProps) {
  const isGallery = variant === "gallery";
  const period = `수집일로부터 3년 및 ${isGallery ? "전시 목적" : "대관목적"} 달성 시 지체없이 해당정보 파기`;
  const rows = [
    {
      purpose: `${isGallery ? "갤러리 전시 신청업무 처리 및" : "시설 대관 신청업무 처리 및"} 의사소통 경로 확보`,
      items: isGallery
        ? "성명(대표자 성명), 연락처, E-mail, 주소, 단체명, 인원 수, 사용 목적, 전시명, 전시 목적, 장르·내용, 서약자 성명"
        : "성명(대표자 성명), 연락처, E-mail, 주소, 단체명, 인원 수, 사용 목적, 서약자 성명",
      period,
    },
    { purpose: "신청자 확인 및 미성년자 보호자 동의 확인", items: "생년월일", period },
  ];

  return (
    <ConsentDialog
      open={open}
      title="개인정보 수집·이용 동의"
      bodyTitle="개인정보 수집 · 이용에 관한 안내 (* 필수항목)"
      onClose={onClose}
      onAgree={onAgree}
      onDisagree={onDisagree}
    >
      {/* 휴대폰: 항목 묶음 카드 */}
      <div className="mt-3 space-y-3 sm:hidden">
        {rows.map((r) => (
          <dl key={r.items} className="rounded-xl border border-line bg-slate-50 p-3.5">
            <dt className="text-[15px] font-bold leading-6 text-ink-2">수집·이용 목적</dt>
            <dd className="text-[17px] leading-7">{r.purpose}</dd>
            <dt className="mt-2 text-[15px] font-bold leading-6 text-ink-2">수집 항목</dt>
            <dd className="text-[17px] leading-7">{r.items}</dd>
            <dt className="mt-2 text-[15px] font-bold leading-6 text-ink-2">보유·이용 기간</dt>
            <dd className="text-[17px] leading-7">{r.period}</dd>
          </dl>
        ))}
      </div>

      {/* PC: 표 */}
      <table className="mt-3 hidden w-full border-collapse text-[15px] leading-6 sm:table">
        <caption className="sr-only">개인정보 수집·이용 항목 안내</caption>
        <thead>
          <tr>
            <th scope="col" className="border border-slate-300 bg-slate-50 px-3 py-2 text-center font-bold">개인정보 수집 · 이용 목적</th>
            <th scope="col" className="border border-slate-300 bg-slate-50 px-3 py-2 text-center font-bold">수집하려는 개인정보 항목</th>
            <th scope="col" className="border border-slate-300 bg-slate-50 px-3 py-2 text-center font-bold">개인정보의 보유 및 이용 기간</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.items}>
              <td className="border border-slate-300 px-3 py-2 text-center">{r.purpose}</td>
              <td className="border border-slate-300 px-3 py-2 text-center">{r.items}</td>
              <td className="border border-slate-300 px-3 py-2 text-center">{r.period}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-3">※ 생년월일은 신청 내역 조회 인증에 쓰지 않습니다.</p>
      <p className="mt-2">
        ※ 개인정보 수집이용에 대한 동의를 거부할 권리가 있으며, 거부 시 {isGallery ? "전시 신청·진행" : "대관 신청·진행"}에 일부 제한이 있습니다.
      </p>
      <div className="mt-3 rounded-xl border border-line bg-slate-50 p-3">
        {isGallery ? "본 동의는 전시 신청을 위한 필수 사항입니다." : "본 동의는 시설물 대관신청을 위한 필수 사항입니다."}
      </div>
    </ConsentDialog>
  );
}
