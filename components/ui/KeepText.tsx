import { Fragment, cloneElement, isValidElement, type ReactNode } from "react";

/**
 * linebreak-fix: 의미 묶음이 줄 끝에서 쪼개지지 않게 하는 글자 래퍼.
 * 문구는 그대로 두고, 아래 덩어리만 whitespace-nowrap 스팬으로 감싼다.
 * - 시간 범위: 9:00 ~ 18:00 · 13:00-15:00
 * - 날짜: 2026. 10. 29.(목) · 2026-11-05 · 2026.10.27
 * - 전화번호: 070-7163-2953 · 1833-6972
 * - 금액: 20,000원 · 10,000원/일
 * - N시간 N분
 * - 짧은 괄호 묶음(14자 이하): (30분 단위) · (일요일·공휴일 휴관)
 * 감싼 영역 안의 하위 요소(<li>·<td>·<b> 등)까지 내려가 글자만 처리한다. 컴포넌트 내부 렌더 결과는 건드리지 않는다.
 */
const PATTERN = new RegExp(
  [
    String.raw`\d{1,2}:\d{2}\s*[~\-–]\s*\d{1,2}:\d{2}`, // 시간 범위
    String.raw`\d{4}\.\s?\d{1,2}\.\s?\d{1,2}\.?(?:\s?\([^()\s]{1,3}\))?`, // 2026. 10. 29.(목)
    String.raw`\d{4}-\d{2}-\d{2}`, // 2026-11-05
    String.raw`0\d{1,2}-\d{3,4}-\d{4}`, // 전화
    String.raw`\d{4}-\d{4}`, // 대표번호
    String.raw`\d+시간(?:\s\d+분)?`,
    String.raw`\d[\d,]*원(?:\/(?:시간|일))?`,
    String.raw`\([^()]{1,14}\)`, // 짧은 괄호
  ].join("|"),
  "g"
);

export function keepUnits(text: string): ReactNode {
  const out: ReactNode[] = [];
  let last = 0;
  let k = 0;
  for (const m of text.matchAll(PATTERN)) {
    const i = m.index ?? 0;
    if (i > last) out.push(text.slice(last, i));
    out.push(
      <span key={k++} className="whitespace-nowrap">
        {m[0]}
      </span>
    );
    last = i + m[0].length;
  }
  if (last === 0) return text;
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const SKIP = new Set(["option", "select", "textarea", "svg", "script", "style", "title"]);

function walk(node: ReactNode): ReactNode {
  if (typeof node === "string") return keepUnits(node);
  if (Array.isArray(node)) {
    return node.map((c, i) => <Fragment key={isValidElement(c) && c.key != null ? c.key : i}>{walk(c)}</Fragment>);
  }
  if (isValidElement(node)) {
    if (typeof node.type === "string" && SKIP.has(node.type)) return node;
    const props = node.props as { children?: ReactNode };
    if (props.children === undefined) return node;
    return cloneElement(node, undefined, walk(props.children));
  }
  return node;
}

/** 감싼 영역 안의 모든 글자(하위 <li>·<td>·<b> 포함)에 keepUnits를 적용한다. */
export default function KeepText({ children }: { children: ReactNode }) {
  return <>{walk(children)}</>;
}

/**
 * " · "로 이어진 값(예: "평일 10:00~17:00 · 화요일 10:00~20:00 · 토요일 …")은
 * 가운뎃점 사이에서만 줄이 바뀌도록 짧은 항목(20자 이하)을 한 덩어리로 묶는다. 긴 항목은 keepUnits만 적용.
 */
export function KeepSegments({ text }: { text: string }) {
  const parts = text.split(" · ");
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i > 0 ? " · " : null}
          {p.length <= 20 ? <span className="whitespace-nowrap">{p}</span> : keepUnits(p)}
        </Fragment>
      ))}
    </>
  );
}
