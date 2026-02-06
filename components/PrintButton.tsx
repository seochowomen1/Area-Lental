"use client";

type Props = {
  className?: string;
  label?: string;
};

/**
 * Server Component에서 window.print() 같은 브라우저 API를 직접 호출하면
 * Next.js(App Router) 런타임에서 오류가 발생할 수 있어 Client Component로 분리합니다.
 */
export default function PrintButton({ className = "", label = "출력" }: Props) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={className}
    >
      {label}
    </button>
  );
}
