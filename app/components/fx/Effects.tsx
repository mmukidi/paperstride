"use client";

import {
  ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   AuroraCanvas — drifting glow orbs + twinkling stars on a transparent canvas.
   Pure canvas 2D, DPR-aware, pauses offscreen, renders a single static frame
   when the user prefers reduced motion.
   ──────────────────────────────────────────────────────────────────────────── */
type Orb = { x: number; y: number; r: number; vx: number; vy: number; hue: string };
type Star = { x: number; y: number; r: number; phase: number; speed: number };

const ORB_HUES = [
  "26, 211, 197", // teal
  "124, 108, 255", // violet
  "255, 193, 77", // gold
  "26, 211, 197",
  "124, 108, 255",
];

export function AuroraCanvas({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let running = false;
    let w = 0;
    let h = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const reduced = prefersReducedMotion();

    const orbs: Orb[] = [];
    const stars: Star[] = [];

    const seed = () => {
      orbs.length = 0;
      stars.length = 0;
      for (let i = 0; i < 5; i++) {
        orbs.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: Math.min(w, h) * (0.22 + Math.random() * 0.2),
          vx: (Math.random() - 0.5) * 0.22,
          vy: (Math.random() - 0.5) * 0.16,
          hue: ORB_HUES[i % ORB_HUES.length],
        });
      }
      const starCount = Math.floor((w * h) / 16000);
      for (let i = 0; i < starCount; i++) {
        stars.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: 0.6 + Math.random() * 1.3,
          phase: Math.random() * Math.PI * 2,
          speed: 0.4 + Math.random() * 1.1,
        });
      }
    };

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      w = Math.max(1, Math.floor(rect?.width ?? window.innerWidth));
      h = Math.max(1, Math.floor(rect?.height ?? window.innerHeight));
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);

      ctx.globalCompositeOperation = "lighter";
      for (const orb of orbs) {
        const g = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, orb.r);
        g.addColorStop(0, `rgba(${orb.hue}, 0.16)`);
        g.addColorStop(0.55, `rgba(${orb.hue}, 0.05)`);
        g.addColorStop(1, `rgba(${orb.hue}, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, orb.r, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalCompositeOperation = "source-over";
      for (const star of stars) {
        const a = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(star.phase + t * 0.001 * star.speed));
        ctx.fillStyle = `rgba(214, 233, 248, ${a.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const step = (t: number) => {
      for (const orb of orbs) {
        orb.x += orb.vx;
        orb.y += orb.vy;
        if (orb.x < -orb.r * 0.4 || orb.x > w + orb.r * 0.4) orb.vx *= -1;
        if (orb.y < -orb.r * 0.4 || orb.y > h + orb.r * 0.4) orb.vy *= -1;
      }
      draw(t);
      if (running) raf = requestAnimationFrame(step);
    };

    resize();
    if (reduced) {
      draw(0); // single static frame
    }

    const io = new IntersectionObserver(([entry]) => {
      if (reduced) return;
      if (entry.isIntersecting && !running) {
        running = true;
        raf = requestAnimationFrame(step);
      } else if (!entry.isIntersecting && running) {
        running = false;
        cancelAnimationFrame(raf);
      }
    });
    io.observe(canvas);

    const ro = new ResizeObserver(() => {
      resize();
      if (reduced) draw(0);
    });
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
    };
  }, []);

  return <canvas aria-hidden="true" className={className} ref={ref} />;
}

/* ────────────────────────────────────────────────────────────────────────────
   TiltCard — pointer-tracked 3D tilt with a moving glare highlight.
   Sets --rx/--ry/--gx/--gy custom properties; CSS does the transform.
   ──────────────────────────────────────────────────────────────────────────── */
export function TiltCard({
  children,
  className = "",
  max = 9,
}: {
  children: ReactNode;
  className?: string;
  max?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || prefersReducedMotion()) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    el.style.setProperty("--rx", `${(-ny * max).toFixed(2)}deg`);
    el.style.setProperty("--ry", `${(nx * max).toFixed(2)}deg`);
    el.style.setProperty("--gx", `${(50 + nx * 38).toFixed(1)}%`);
    el.style.setProperty("--gy", `${(50 + ny * 38).toFixed(1)}%`);
  };

  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  };

  return (
    <div className={`tilt ${className}`.trim()} onPointerLeave={onLeave} onPointerMove={onMove} ref={ref}>
      <div className="tilt-inner">{children}</div>
      <span aria-hidden="true" className="tilt-glare" />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   CountUp — animates a number from 0 the first time it scrolls into view.
   ──────────────────────────────────────────────────────────────────────────── */
export function CountUp({
  to,
  duration = 1300,
  prefix = "",
  suffix = "",
}: {
  to: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      setValue(to);
      return;
    }
    let raf = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const p = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - p, 3);
          setValue(Math.round(to * eased));
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [to, duration]);

  return (
    <span ref={ref}>
      {prefix}
      {value}
      {suffix}
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Parallax — gently drifts children as they cross the viewport.
   ──────────────────────────────────────────────────────────────────────────── */
export function Parallax({
  children,
  className = "",
  speed = 0.1,
}: {
  children: ReactNode;
  className?: string;
  speed?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;

    let raf = 0;
    let visible = false;

    const update = () => {
      if (!visible) return;
      const rect = el.getBoundingClientRect();
      const offset = (rect.top + rect.height / 2 - window.innerHeight / 2) * speed;
      el.style.transform = `translate3d(0, ${offset.toFixed(1)}px, 0)`;
      raf = requestAnimationFrame(update);
    };

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible) raf = requestAnimationFrame(update);
    });
    io.observe(el);

    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [speed]);

  return (
    <div className={className} ref={ref}>
      {children}
    </div>
  );
}
