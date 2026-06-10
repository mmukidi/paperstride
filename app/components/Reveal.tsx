"use client";

import { CSSProperties, ReactNode, useEffect, useRef, useState } from "react";

// Fades + lifts its children into view the first time they scroll onscreen.
// Respects prefers-reduced-motion (handled in CSS — the class just no-ops there).
export default function Reveal({
  children,
  className = "",
  delay = 0,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "section" | "li";
}) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const style: CSSProperties = { transitionDelay: `${delay}ms` };
  const cls = `reveal ${shown ? "reveal-in" : ""} ${className}`.trim();

  return (
    // @ts-expect-error — ref type narrows fine across the allowed tag union
    <Tag ref={ref} className={cls} style={style}>
      {children}
    </Tag>
  );
}
