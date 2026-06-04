import { cn } from "@renderer/lib/utils";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

interface IconNodeProps extends ComponentPropsWithoutRef<"span"> {
  icon: ReactNode;
  children: ReactNode;
  className?: string;
}

export function IconNode({ icon, children, className, ...props }: IconNodeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-sm font-medium",
        className,
      )}
      {...props}
    >
      <span className="shrink-0 [&_svg]:size-3.5">{icon}</span>
      <span>{children}</span>
    </span>
  );
}
