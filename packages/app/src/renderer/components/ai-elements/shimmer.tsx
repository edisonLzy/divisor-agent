"use client";

import { cn } from "@renderer/lib/utils";
import { motion } from "motion/react";
import type { CSSProperties, ElementType, JSX } from "react";
import { memo, useMemo } from "react";

// Cache motion components at module level to avoid creating during render
const motionComponentCache = new Map<
  keyof JSX.IntrinsicElements,
  React.ComponentType<Record<string, unknown>>
>();

const getMotionComponent = (element: keyof JSX.IntrinsicElements) => {
  let component = motionComponentCache.get(element);
  if (!component) {
    // motion.create() returns a union of 120+ component types — cast to a generic
    // component type since we control the props we pass at the call site.
    component = motion.create(element) as React.ComponentType<Record<string, unknown>>;
    motionComponentCache.set(element, component);
  }
  return component;
};

export interface TextShimmerProps {
  children: string;
  as?: ElementType;
  className?: string;
  duration?: number;
  spread?: number;
  animate?: boolean;
}

const ShimmerComponent = ({
  children,
  as: Component = "p",
  className,
  duration = 2,
  spread = 2,
  animate: enableAnimation = true,
}: TextShimmerProps) => {
  const MotionComponent = getMotionComponent(Component as keyof JSX.IntrinsicElements);

  const dynamicSpread = useMemo(() => (children?.length ?? 0) * spread, [children, spread]);

  if (!enableAnimation) {
    return <Component className={cn("text-muted-foreground", className)}>{children}</Component>;
  }

  return (
    <MotionComponent
      animate={{ backgroundPosition: "0% center" }}
      className={cn(
        "relative inline-block bg-[length:250%_100%,auto] bg-clip-text text-transparent",
        "[--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--color-background),#0000_calc(50%+var(--spread)))] [background-repeat:no-repeat,padding-box]",
        className,
      )}
      initial={{ backgroundPosition: "100% center" }}
      style={
        {
          "--spread": `${dynamicSpread}px`,
          backgroundImage:
            "var(--bg), linear-gradient(var(--color-muted-foreground), var(--color-muted-foreground))",
        } as CSSProperties
      }
      transition={{
        duration,
        ease: "linear",
        repeat: Number.POSITIVE_INFINITY,
      }}
    >
      {children}
    </MotionComponent>
  );
};

export const Shimmer = memo(ShimmerComponent);
