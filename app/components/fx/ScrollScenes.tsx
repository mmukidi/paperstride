"use client";

import { useEffect, useRef, useState } from "react";

const STEPS = [
  {
    n: "01",
    title: "Describe the learner",
    body: "Grade, age, and the things they love — space, soccer, dinosaurs, anything. Flag the tricky areas and the goal.",
  },
  {
    n: "02",
    title: "Tune the expert plan",
    body: "An expert panel drafts the worksheet live. Drag sliders to add questions, stretch the reading, or swap whole sections.",
  },
  {
    n: "03",
    title: "Print and go",
    body: "A clean, beautiful workbook with a full answer key. No screens, no accounts — just paper, pencil, and deep focus.",
  },
];

// Pinned scroll scene: the section is ~3 viewports tall; a sticky stage stays put
// while scroll progress activates each step and morphs the visual panel.
// Below 960px the CSS unpins the stage and stacks everything — this component
// only computes progress, all layout lives in globals.css.
export default function ScrollScenes() {
  const ref = useRef<HTMLElement>(null);
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let raf = 0;
    const update = () => {
      const rect = el.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      const p = total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 0;
      setProgress(p);
      setStep(Math.min(STEPS.length - 1, Math.floor(p * STEPS.length)));
      raf = 0;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section className="scenes" data-step={step} id="how" ref={ref}>
      <div className="scenes-sticky">
        <div className="scenes-head">
          <p className="eyebrow eyebrow-glow">How it works</p>
          <h2>
            Three moves. <span className="grad-text">One brilliant worksheet.</span>
          </h2>
        </div>

        <div className="scenes-grid">
          <ol className="scenes-steps">
            {STEPS.map((s, i) => (
              <li
                className={`scene-step ${i === step ? "is-active" : ""} ${i < step ? "is-done" : ""}`}
                key={s.n}
              >
                <span className="scene-step-num">{s.n}</span>
                <div>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </div>
              </li>
            ))}
            <div aria-hidden="true" className="scenes-progress">
              <span style={{ height: `${Math.round(progress * 100)}%` }} />
            </div>
          </ol>

          <div aria-hidden="true" className="scenes-stage">
            {/* Scene 1 — describe the learner */}
            <div className="scene-panel scene-panel--form">
              <div className="mockup mock-form">
                <p className="mock-label">About the learner</p>
                <div className="mock-fields">
                  <span className="mock-field">Ava</span>
                  <span className="mock-field">Grade 3</span>
                  <span className="mock-field">Age 8</span>
                </div>
                <p className="mock-label">What lights them up?</p>
                <div className="mock-chips">
                  <span className="mock-chip is-on">🚀 Space</span>
                  <span className="mock-chip">⚽ Soccer</span>
                  <span className="mock-chip is-on">🦖 Dinosaurs</span>
                  <span className="mock-chip">🎨 Art</span>
                </div>
                <div className="mock-cta">Get the expert plan →</div>
              </div>
            </div>

            {/* Scene 2 — tune the plan */}
            <div className="scene-panel scene-panel--plan">
              <div className="mockup mock-plan">
                <div className="mock-plan-head">
                  <p>Expert panel plan</p>
                  <span>✎ editable</span>
                </div>
                <div className="mock-rows">
                  <div className="mock-row">
                    <span>📖 Reading</span>
                    <i className="mock-bar"><b style={{ width: "72%" }} /></i>
                    <em>4Q</em>
                  </div>
                  <div className="mock-row">
                    <span>🔢 Math</span>
                    <i className="mock-bar"><b style={{ width: "56%" }} /></i>
                    <em>3Q</em>
                  </div>
                  <div className="mock-row">
                    <span>🧩 Logic</span>
                    <i className="mock-bar"><b style={{ width: "88%" }} /></i>
                    <em>5Q</em>
                  </div>
                </div>
                <div className="mock-slider">
                  <span className="mock-slider-dot" />
                </div>
                <p className="mock-foot">Reading length · 320 words</p>
              </div>
            </div>

            {/* Scene 3 — print */}
            <div className="scene-panel scene-panel--print">
              <div className="mockup mock-sheet">
                <div className="mock-sheet-head">
                  <strong>Ava&apos;s Space Mission</strong>
                  <span>Grade 3</span>
                </div>
                <div className="mock-lines">
                  <span style={{ width: "92%" }} />
                  <span style={{ width: "84%" }} />
                  <span style={{ width: "88%" }} />
                  <span style={{ width: "62%" }} />
                </div>
                <div className="mock-boxes">
                  <span>7×6</span>
                  <span>54÷9</span>
                  <span>🪐</span>
                  <span>8+15</span>
                </div>
                <div className="mock-badges">
                  <span className="mock-badge">✓ Answer key included</span>
                  <span className="mock-badge mock-badge--print">🖨 Print</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
