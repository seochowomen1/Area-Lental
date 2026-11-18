"use client";

import { useEffect } from "react";

/**
 * 신청서·서약서를 각각 A4 한 쪽에 맞춘다 (2026-11-18 · 서약서가 2쪽으로 넘어가던 문제)
 *
 * 1) 인쇄용 규칙(@media print)을 화면에도 적용해 미리보기와 인쇄물의 배치를 같게 만든다.
 *    (.no-print 숨김과 @page는 뺀다 — 화면의 단추는 그대로 보여야 한다)
 * 2) 쪽(.page-section)마다 높이를 재서 A4 인쇄 영역(277mm)을 넘으면 그 쪽만 zoom으로 줄인다.
 *    회차가 많거나 문구가 길어져도 한 쪽을 넘지 않는다.
 */
const PAGE_HEIGHT_MM = 277; // A4 297mm - 위아래 여백 10mm씩
const SAFETY = 0.985; // 프린터·글꼴 차이 여유

export default function PrintFit() {
  useEffect(() => {
    // 1) 인쇄 규칙을 화면에도
    let css = "";
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const rule of Array.from(rules)) {
        if (!(rule instanceof CSSMediaRule) || !/\bprint\b/.test(rule.conditionText)) continue;
        for (const inner of Array.from(rule.cssRules)) {
          if (!(inner instanceof CSSStyleRule)) continue;
          if (inner.selectorText.includes(".no-print")) continue;
          css += inner.cssText + "\n";
        }
      }
    }
    const style = document.createElement("style");
    style.setAttribute("data-print-fit", "");
    style.textContent = css;
    document.head.appendChild(style);

    // 2) 쪽마다 맞춤
    const probe = document.createElement("div");
    probe.style.cssText = `position:absolute;visibility:hidden;height:${PAGE_HEIGHT_MM}mm;width:1px`;
    document.body.appendChild(probe);
    const limit = probe.getBoundingClientRect().height * SAFETY;
    probe.remove();

    const sections = Array.from(document.querySelectorAll<HTMLElement>(".page-section"));
    const fit = () => {
      for (const sec of sections) {
        sec.style.setProperty("zoom", "1");
        // 화면에만 보이는 구분선(.no-print)은 인쇄되지 않으므로 높이에서 뺀다
        let h = sec.getBoundingClientRect().height;
        sec.querySelectorAll<HTMLElement>(".no-print").forEach((el) => {
          const cs = getComputedStyle(el);
          h -= el.getBoundingClientRect().height + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom);
        });
        const z = h > limit ? limit / h : 1;
        sec.style.setProperty("zoom", String(Math.floor(z * 1000) / 1000));
        sec.dataset.fit = z < 1 ? "shrunk" : "ok";
      }
    };
    fit();
    document.fonts?.ready.then(fit).catch(() => {});
    window.addEventListener("beforeprint", fit);
    return () => {
      window.removeEventListener("beforeprint", fit);
      style.remove();
    };
  }, []);
  return null;
}
