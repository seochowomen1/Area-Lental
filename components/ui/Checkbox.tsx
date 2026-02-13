"use client";

import * as React from "react";
import { CHECKBOX_HELP, CHECKBOX_INPUT, CHECKBOX_TEXT, CHECKBOX_WRAP } from "@/components/ui/presets";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: React.ReactNode;
  help?: React.ReactNode;
  error?: React.ReactNode;
  containerClassName?: string;
};

/**
 * Field 톤 체크박스 (텍스트/간격/보더/hover 통일)
 */
const Checkbox = React.forwardRef<HTMLInputElement, Props>(
  ({ label, help, error, containerClassName, className, disabled, ...props }, ref) => {
    return (
      <label className={[CHECKBOX_WRAP, disabled ? "opacity-70" : "", containerClassName ?? ""].join(" ")}> 
        <input
          ref={ref}
          type="checkbox"
          disabled={disabled}
          className={[CHECKBOX_INPUT, className ?? ""].join(" ")}
          {...props}
        />
        <span className="min-w-0">
          <span className={CHECKBOX_TEXT}>{label}</span>
          {error ? <div className="mt-1 text-xs leading-4 font-semibold text-red-600">{error}</div> : null}
          {!error && help ? <div className={CHECKBOX_HELP}>{help}</div> : null}
        </span>
      </label>
    );
  }
);
Checkbox.displayName = "Checkbox";

export default Checkbox;
