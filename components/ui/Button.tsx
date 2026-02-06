"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { BUTTON_BASE, BUTTON_VARIANT, type ButtonVariant } from "@/components/ui/presets";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const Button = React.forwardRef<HTMLButtonElement, Props>(
  ({ className, variant = "primary", type, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type ?? "button"}
        className={cn(BUTTON_BASE, BUTTON_VARIANT[variant], className)}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";

export default Button;
