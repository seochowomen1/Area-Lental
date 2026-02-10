import * as React from "react";
import { HOME_ICON_SVG, HOME_ICON_WRAP } from "@/components/ui/presets";

// Home 아이콘은 레퍼런스처럼 '다양색 일러스트' 느낌을 내기 위해
// 이 파일 안에서만 팔레트/두께/그림자를 조정합니다.

const C = {
  outline: "#0f172a", // slate-900
  blue: "#1e5a8e", // brand
  sky: "#7fc3ff",
  blueSoft: "#e9f3ff",
  mint: "#78d6c6",
  mintSoft: "#dbf6f1",
  orange: "#f59e0b",
  orangeSoft: "#ffefd1",
  wood: "#c58a4a",
  woodSoft: "#f1d8bb",
  gray: "#64748b",
  graySoft: "#e2e8f0",
  green: "#5fbf6c",
};

const SW = 3;
const OUT = { stroke: C.outline, strokeWidth: SW, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, strokeOpacity: 0.85 };

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <div className={`mx-auto ${HOME_ICON_WRAP}`}>
      {children}
    </div>
  );
}

export function IconLecture() {
  return (
    <Wrap>
      <svg
        viewBox="0 0 140 140"
        className={HOME_ICON_SVG}
        aria-hidden="true"
      >
        {/* board */}
        <rect x="18" y="20" width="104" height="58" rx="10" fill={C.blueSoft} {...OUT} />
        <rect x="26" y="28" width="88" height="42" rx="8" fill="#ffffff" />
        {/* chalk lines */}
        <path d="M36 40 H78" stroke={C.sky} strokeWidth={SW} strokeLinecap="round" opacity={0.9} />
        <path d="M36 52 H96" stroke={C.mint} strokeWidth={SW} strokeLinecap="round" opacity={0.9} />
        <path d="M36 64 H70" stroke={C.orange} strokeWidth={SW} strokeLinecap="round" opacity={0.85} />
        {/* board shelf */}
        <rect x="24" y="78" width="92" height="6" rx="3" fill={C.graySoft} />

        {/* desk */}
        <rect x="28" y="92" width="84" height="10" rx="6" fill={C.wood} />
        <rect x="34" y="102" width="10" height="20" rx="4" fill={C.woodSoft} />
        <rect x="96" y="102" width="10" height="20" rx="4" fill={C.woodSoft} />

        {/* chairs */}
        <rect x="42" y="86" width="18" height="16" rx="5" fill={C.blue} opacity={0.95} />
        <rect x="80" y="86" width="18" height="16" rx="5" fill={C.blue} opacity={0.95} />
        <rect x="44" y="102" width="14" height="20" rx="5" fill={C.sky} opacity={0.85} />
        <rect x="82" y="102" width="14" height="20" rx="5" fill={C.sky} opacity={0.85} />

        {/* gentle outline accent */}
        <path d="M22 24 H118" {...OUT} opacity={0.55} />
      </svg>
    </Wrap>
  );
}

export function IconStudio() {
  return (
    <Wrap>
      <svg viewBox="0 0 140 140" className={HOME_ICON_SVG} aria-hidden="true">
        {/* monitor */}
        <rect x="54" y="18" width="68" height="52" rx="10" fill={C.blueSoft} {...OUT} />
        <rect x="62" y="26" width="52" height="36" rx="8" fill={C.sky} />
        {/* play icon */}
        <path d="M80 35 L98 44 L80 53 Z" fill="#ffffff" opacity={0.9} />
        <rect x="78" y="70" width="20" height="10" rx="5" fill={C.graySoft} />
        <rect x="70" y="80" width="36" height="10" rx="5" fill={C.graySoft} />

        {/* mic */}
        <rect x="18" y="44" width="22" height="38" rx="11" fill={C.orangeSoft} {...OUT} />
        <path d="M29 82 v10" {...OUT} />
        <path d="M18 92 h22" {...OUT} />
        <path d="M22 54 h14" stroke={C.orange} strokeWidth={SW} strokeLinecap="round" opacity={0.9} />
        <path d="M22 62 h14" stroke={C.orange} strokeWidth={SW} strokeLinecap="round" opacity={0.9} />

        {/* camera */}
        <rect x="42" y="94" width="56" height="30" rx="10" fill={C.mintSoft} {...OUT} />
        <circle cx="70" cy="109" r="10" fill="#ffffff" {...OUT} />
        <circle cx="70" cy="109" r="4" fill={C.blue} />
        <rect x="92" y="98" width="14" height="10" rx="4" fill={C.orange} />
      </svg>
    </Wrap>
  );
}

export function IconMyReservation() {
  return (
    <Wrap>
      <svg viewBox="0 0 140 140" className={HOME_ICON_SVG} aria-hidden="true">
        {/* clipboard body */}
        <rect x="32" y="28" width="76" height="96" rx="12" fill={C.blueSoft} {...OUT} />
        {/* clipboard clip */}
        <rect x="52" y="18" width="36" height="18" rx="9" fill={C.gray} {...OUT} />
        <rect x="60" y="22" width="20" height="10" rx="5" fill="#ffffff" />
        {/* paper area */}
        <rect x="42" y="48" width="56" height="68" rx="8" fill="#ffffff" />
        {/* check lines */}
        <circle cx="54" cy="62" r="5" fill={C.green} opacity={0.9} />
        <path d="M51 62 L53 64.5 L57.5 59" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <path d="M64 62 H88" stroke={C.graySoft} strokeWidth={SW} strokeLinecap="round" />
        <circle cx="54" cy="80" r="5" fill={C.green} opacity={0.9} />
        <path d="M51 80 L53 82.5 L57.5 77" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <path d="M64 80 H82" stroke={C.graySoft} strokeWidth={SW} strokeLinecap="round" />
        <circle cx="54" cy="98" r="5" fill={C.orange} opacity={0.85} />
        <path d="M52 96 L56 100" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" />
        <path d="M56 96 L52 100" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" />
        <path d="M64 98 H90" stroke={C.graySoft} strokeWidth={SW} strokeLinecap="round" />
        {/* magnifier */}
        <circle cx="106" cy="108" r="14" fill={C.mintSoft} {...OUT} />
        <circle cx="106" cy="108" r="7" fill="#ffffff" {...OUT} />
        <path d="M116 118 L126 128" stroke={C.outline} strokeWidth={4} strokeLinecap="round" opacity={0.8} />
      </svg>
    </Wrap>
  );
}

export function IconGallery() {
  return (
    <Wrap>
      <svg viewBox="0 0 140 140" className={HOME_ICON_SVG} aria-hidden="true">
        {/* track lights */}
        <rect x="20" y="18" width="100" height="8" rx="4" fill={C.outline} opacity={0.85} />
        {[38, 70, 102].map((x) => (
          <g key={x}>
            <rect x={x - 6} y="26" width="12" height="14" rx="4" fill={C.gray} opacity={0.9} />
            <path d={`M${x - 14} 44 L${x} 66 L${x + 14} 44`} fill={C.orangeSoft} opacity={0.65} />
          </g>
        ))}

        {/* frame */}
        <rect x="30" y="52" width="76" height="54" rx="12" fill={C.woodSoft} {...OUT} />
        <rect x="38" y="60" width="60" height="38" rx="10" fill={C.blueSoft} />
        <path d="M42 96 L56 78 L70 92 L82 80 L96 96" fill={C.green} opacity={0.95} />
        <circle cx="54" cy="72" r="6" fill="#ffffff" opacity={0.92} />
        {/* little mat */}
        <rect x="44" y="64" width="48" height="30" rx="8" fill="#ffffff" opacity={0.6} />

        {/* pedestal + vase */}
        <rect x="110" y="70" width="14" height="46" rx="7" fill={C.graySoft} {...OUT} />
        <path d="M117 54 C109 60 109 66 117 70 C125 66 125 60 117 54Z" fill={C.orange} {...OUT} />
      </svg>
    </Wrap>
  );
}
