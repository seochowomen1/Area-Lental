"use client";

/**
 * 서약서 팝업 (02_ui_apply §0-5 (1)) — 조항 원문(lib/pledge.ts) 그대로, 글자 17.
 * 버튼 라벨 `동의`·`비동의` → `동의합니다`·`동의하지 않습니다`.
 */
import ConsentDialog from "@/components/apply/ConsentDialog";
import {
  PLEDGE_FOOTER,
  PLEDGE_INTRO,
  PLEDGE_SECTIONS,
  PLEDGE_TITLE,
  GALLERY_PLEDGE_SECTIONS,
  GALLERY_PLEDGE_TITLE,
  GALLERY_PLEDGE_INTRO,
} from "@/lib/pledge";
import { operatingNoticeText } from "@/lib/operating";

type Props = {
  open: boolean;
  onClose: () => void;
  roomId?: string;
  onAgree: () => void;
  onDisagree: () => void;
};

export default function PledgeModal({ open, onClose, roomId, onAgree, onDisagree }: Props) {
  const isGallery = roomId === "gallery";
  const sections = isGallery ? GALLERY_PLEDGE_SECTIONS : PLEDGE_SECTIONS;
  const pledgeTitle = isGallery ? GALLERY_PLEDGE_TITLE : PLEDGE_TITLE;
  const pledgeIntro = isGallery ? GALLERY_PLEDGE_INTRO : PLEDGE_INTRO;

  return (
    <ConsentDialog open={open} title={pledgeTitle} onClose={onClose} onAgree={onAgree} onDisagree={onDisagree}>
      <p>{pledgeIntro}</p>
      <p className="mt-2">
        <b>운영시간:</b> {operatingNoticeText(roomId)}
      </p>
      <div className="mt-4 space-y-4">
        {sections.map((sec) => (
          <section key={sec.title} className="rounded-xl border border-line bg-slate-50 p-4">
            <h3 className="text-[17px] font-bold leading-7">{sec.title}</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              {sec.bullets.map((b, idx) => (
                <li key={idx}>{b}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="mt-4">{PLEDGE_FOOTER}</p>
    </ConsentDialog>
  );
}
