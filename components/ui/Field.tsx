import * as React from "react";
import { cn } from "@/lib/cn";
import { FIELD_CONTROL_BASE, FIELD_HELP, FIELD_LABEL } from "@/components/ui/presets";

export function FieldLabel({ children, className, htmlFor }: { children: React.ReactNode; className?: string; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn(FIELD_LABEL, className)}>
      {children}
    </label>
  );
}

export function FieldHelp({ children, className }: { children: React.ReactNode; className?: string }) {
  const isError = typeof className === "string" && className.includes("text-red");
  const base = isError
    ? "mt-1 text-xs leading-4 font-semibold"
    : FIELD_HELP;
  return <p className={cn(base, className)}>{children}</p>;
}

type ControlProps<T> = T & { className?: string };

export const Input = React.forwardRef<HTMLInputElement, ControlProps<React.InputHTMLAttributes<HTMLInputElement>>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(FIELD_CONTROL_BASE, className)} {...props} />;
  }
);

export const Textarea = React.forwardRef<HTMLTextAreaElement, ControlProps<React.TextareaHTMLAttributes<HTMLTextAreaElement>>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(FIELD_CONTROL_BASE, "min-h-[96px] resize-y", className)} {...props} />;
  }
);

export const Select = React.forwardRef<HTMLSelectElement, ControlProps<React.SelectHTMLAttributes<HTMLSelectElement>>>(
  function Select({ className, ...props }, ref) {
    return <select ref={ref} className={cn(FIELD_CONTROL_BASE, className)} {...props} />;
  }
);
