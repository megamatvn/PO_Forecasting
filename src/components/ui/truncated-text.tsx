"use client";

import { useId, useState, type ReactNode } from "react";

interface TruncatedTextProps {
  children: ReactNode;
  className?: string;
}

export function TruncatedText({ children, className }: TruncatedTextProps) {
  const tooltipId = useId();
  const [open, setOpen] = useState(false);

  return (
    <span
      className={`truncated-text${className ? ` ${className}` : ""}`}
      tabIndex={0}
      aria-describedby={open ? tooltipId : undefined}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span className="truncated-text__value">{children}</span>
      {open ? (
        <span id={tooltipId} role="tooltip" className="truncated-text__tooltip">
          {children}
        </span>
      ) : null}
    </span>
  );
}
