"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { BlueprintPreview, BlueprintSection } from "../api/blueprint/route";

// ─── Constants ────────────────────────────────────────────────────────────────

const GRADE_OPTIONS = [
  "Pre-K","Kindergarten","Grade 1","Grade 2","Grade 3","Grade 4","Grade 5",
  "Grade 6","Grade 7","Grade 8","Grade 9","Grade 10","Grade 11","Grade 12",
  "College","Master's",
];

const AGE_OPTIONS = Array.from({ length: 24 }, (_, i) => i + 3);

const INTEREST_CHIPS = [
  { label: "Space",      emoji: "🚀" },
  { label: "Soccer",     emoji: "⚽" },
  { label: "Minecraft",  emoji: "⛏️" },
  { label: "Animals",    emoji: "🐾" },
  { label: "Music",      emoji: "🎵" },
  { label: "Art",        emoji: "🎨" },
  { label: "Cooking",    emoji: "🍳" },
  { label: "Science",    emoji: "🔬" },
  { label: "History",    emoji: "📜" },
  { label: "Books",      emoji: "📚" },
  { label: "Sports",     emoji: "🏆" },
  { label: "Gaming",     emoji: "🎮" },
  { label: "Technology", emoji: "💻" },
  { label: "Nature",     emoji: "🌿" },
  { label: "Math",       emoji: "🔢" },
  { label: "LEGO",       emoji: "🧱" },
  { label: "Swimming",   emoji: "🏊" },
  { label: "Movies",     emoji: "🎬" },
];

type Chip = { label: string; emoji: string };

// Tricky-area chips are GRADE-SPECIFIC — e.g. fractions only appear for Grade 3+.
const STRUGGLE_BANDS: { test: (grade: string, age: number) => boolean; chips: Chip[] }[] = [
  {
    // Pre-K / Kindergarten
    test: (g, a) => g === "Pre-K" || g === "Kindergarten" || a <= 5,
    chips: [
      { label: "Letters",        emoji: "🔤" },
      { label: "Counting",       emoji: "🔢" },
      { label: "Shapes & Colors",emoji: "🟦" },
      { label: "Listening",      emoji: "👂" },
      { label: "Rhyming",        emoji: "🎵" },
      { label: "Holding a Pencil",emoji: "✏️" },
    ],
  },
  {
    // Grades 1–2
    test: (g, a) => g === "Grade 1" || g === "Grade 2" || a <= 7,
    chips: [
      { label: "Reading",     emoji: "📖" },
      { label: "Sight Words", emoji: "👁️" },
      { label: "Addition",    emoji: "➕" },
      { label: "Subtraction", emoji: "➖" },
      { label: "Spelling",    emoji: "🔡" },
      { label: "Handwriting", emoji: "✍️" },
    ],
  },
  {
    // Grades 3–5
    test: (g, a) => g === "Grade 3" || g === "Grade 4" || g === "Grade 5" || a <= 10,
    chips: [
      { label: "Reading",        emoji: "📖" },
      { label: "Fractions",      emoji: "½" },
      { label: "Word Problems",  emoji: "📝" },
      { label: "Multiplication", emoji: "✖️" },
      { label: "Vocabulary",     emoji: "💬" },
      { label: "Writing",        emoji: "🖊️" },
      { label: "Science",        emoji: "🔬" },
    ],
  },
  {
    // Grades 6–8
    test: (g, a) => g === "Grade 6" || g === "Grade 7" || g === "Grade 8" || a <= 13,
    chips: [
      { label: "Reading",       emoji: "📖" },
      { label: "Fractions",     emoji: "½" },
      { label: "Word Problems", emoji: "📝" },
      { label: "Pre-Algebra",   emoji: "🔢" },
      { label: "Vocabulary",    emoji: "💬" },
      { label: "Grammar",       emoji: "✏️" },
      { label: "Essays",        emoji: "📄" },
      { label: "Science",       emoji: "🔬" },
    ],
  },
  {
    // Grades 9–12
    test: (g, a) => ["Grade 9","Grade 10","Grade 11","Grade 12"].includes(g) || a <= 18,
    chips: [
      { label: "Reading",       emoji: "📖" },
      { label: "Algebra",       emoji: "📐" },
      { label: "Geometry",      emoji: "📏" },
      { label: "Essay Writing", emoji: "📄" },
      { label: "Vocabulary",    emoji: "💬" },
      { label: "Science",       emoji: "🔬" },
      { label: "Word Problems", emoji: "🧮" },
      { label: "Test Anxiety",  emoji: "😮‍💨" },
    ],
  },
];

// College / Master's / adult — the default when no band matched.
const STRUGGLE_ADULT: Chip[] = [
  { label: "Critical Reading", emoji: "📖" },
  { label: "Essay Writing",    emoji: "📄" },
  { label: "Research",         emoji: "🔎" },
  { label: "Statistics",       emoji: "📊" },
  { label: "Note-Taking",      emoji: "🗒️" },
  { label: "Time Management",  emoji: "⏱️" },
];

function struggleChipsFor(grade: string, age: number): Chip[] {
  for (const band of STRUGGLE_BANDS) {
    if (band.test(grade, age)) return band.chips;
  }
  return STRUGGLE_ADULT;
}

const GOAL_OPTIONS = [
  { value: "general",       emoji: "🎯", label: "General Practice",  desc: "Balanced practice across subjects" },
  { value: "test-prep",     emoji: "📊", label: "Test Prep",         desc: "Exam skills & test strategies" },
  { value: "catching-up",   emoji: "🆙", label: "Catching Up",       desc: "Extra support & confidence" },
  { value: "getting-ahead", emoji: "🚀", label: "Getting Ahead",     desc: "Above-grade challenge" },
];

const TIME_OPTIONS = [
  { value: 20, emoji: "⚡", label: "Quick",    desc: "~20 min" },
  { value: 40, emoji: "📝", label: "Standard", desc: "~40 min" },
  { value: 60, emoji: "🏆", label: "Deep",     desc: "60+ min" },
];

const CHALLENGE_LEVELS = [
  { value: "gentle",   label: "Gentle"   },
  { value: "balanced", label: "Balanced" },
  { value: "stretch",  label: "Stretch"  },
  { value: "advanced", label: "Advanced" },
];

const ADDABLE_SUBJECTS = [
  "Reading Comprehension",
  "Vocabulary in Context",
  "Grammar and Writing",
  "Math Reasoning",
  "Science Investigation",
  "Social Studies and History",
  "Logic and Patterns",
  "Critical Thinking",
];

const SUBJECT_ICONS: Record<string, string> = {
  "Reading Comprehension":     "📖",
  "Vocabulary in Context":     "💬",
  "Grammar and Writing":       "✏️",
  "Math Reasoning":            "🔢",
  "Science Investigation":     "🔬",
  "Social Studies and History":"🌍",
  "Logic and Patterns":        "🧩",
  "Critical Thinking":         "💡",
};

// ─── Types ────────────────────────────────────────────────────────────────────

type Status = "idle" | "planning" | "plan-ready" | "generating" | "done" | "error";
type ProgressStep = { label: string; done: boolean; active: boolean };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function liveTotals(plan: BlueprintPreview) {
  const questions = plan.sections.reduce((n, s) => n + s.questionCount, 0);
  const readMinutes = plan.reading.wordCount / 120;
  const minutes = Math.max(10, Math.round(questions * 1.4 + readMinutes + 4));
  return { questions, minutes };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function WorksheetCreator() {
  // Learner
  const [nickname, setNickname] = useState("");
  const [grade,    setGrade]    = useState("Grade 4");
  const [age,      setAge]      = useState("9");

  // Interests
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [customInterest,    setCustomInterest]    = useState("");

  // Needs
  const [strugglingWith, setStrugglingWith] = useState<string[]>([]);
  const [goal,           setGoal]           = useState("general");
  const [timeAvailable,  setTimeAvailable]  = useState(40);

  // Status / plan / output
  const [status,        setStatus]        = useState<Status>("idle");
  const [message,       setMessage]       = useState("");
  const [basePlan,      setBasePlan]      = useState<BlueprintPreview | null>(null); // AI original (for reset)
  const [plan,          setPlan]          = useState<BlueprintPreview | null>(null); // editable working copy
  const [worksheetHtml, setWorksheetHtml] = useState("");
  const [progressSteps, setProgressSteps] = useState<ProgressStep[]>([]);
  const [addOpen,       setAddOpen]       = useState(false);

  // Derived
  const allInterests = [
    ...selectedInterests,
    ...(customInterest.trim() ? [customInterest.trim()] : []),
  ].join(", ");

  const struggleChips = useMemo(() => struggleChipsFor(grade, Number(age)), [grade, age]);
  const totals = plan ? liveTotals(plan) : null;
  const planEdited = !!(plan && basePlan && JSON.stringify(plan) !== JSON.stringify(basePlan));
  const availableToAdd = plan
    ? ADDABLE_SUBJECTS.filter((s) => !plan.sections.some((sec) => sec.subject === s))
    : [];

  // Drop any selected tricky-areas that don't belong to the new grade band.
  useEffect(() => {
    const allowed = new Set(struggleChips.map((c) => c.label));
    setStrugglingWith((prev) => prev.filter((s) => allowed.has(s)));
  }, [struggleChips]);

  // ── Chip toggles ─────────────────────────────────────────────────────────────
  function toggleInterest(label: string) {
    setSelectedInterests((prev) =>
      prev.includes(label) ? prev.filter((i) => i !== label) : [...prev, label]
    );
  }
  function toggleStruggle(label: string) {
    setStrugglingWith((prev) =>
      prev.includes(label) ? prev.filter((s) => s !== label) : [...prev, label]
    );
  }

  // ── Plan editing ─────────────────────────────────────────────────────────────
  function patchPlan(patch: Partial<BlueprintPreview>) {
    setPlan((p) => (p ? { ...p, ...patch } : p));
  }
  function setSectionCount(subject: string, count: number) {
    setPlan((p) =>
      p ? { ...p, sections: p.sections.map((s) => (s.subject === subject ? { ...s, questionCount: count } : s)) } : p
    );
  }
  function removeSection(subject: string) {
    setPlan((p) => (p ? { ...p, sections: p.sections.filter((s) => s.subject !== subject) } : p));
  }
  function addSection(subject: string) {
    setPlan((p) => {
      if (!p || p.sections.some((s) => s.subject === subject)) return p;
      const section: BlueprintSection = {
        subject,
        questionCount: 3,
        skills: ["core skills"],
        focus: "Added to the plan by you.",
        isWeakArea: false,
        interestConnection: "",
      };
      return { ...p, sections: [...p.sections, section] };
    });
    setAddOpen(false);
  }
  function setReadingWords(words: number) {
    setPlan((p) => (p ? { ...p, reading: { ...p.reading, wordCount: words } } : p));
  }
  function resetPlan() {
    if (basePlan) setPlan(structuredClone(basePlan));
  }

  // ── Validation ───────────────────────────────────────────────────────────────
  function validate(): string | null {
    if (!nickname.trim())     return "Please add a nickname.";
    if (!allInterests.trim()) return "Please pick at least one interest.";
    return null;
  }

  // ── Get expert plan ──────────────────────────────────────────────────────────
  async function handleGetPlan(e?: FormEvent) {
    e?.preventDefault();
    const err = validate();
    if (err) { setStatus("error"); setMessage(err); return; }

    setStatus("planning");
    setBasePlan(null);
    setPlan(null);
    setWorksheetHtml("");
    setMessage("Our expert panel is reviewing the learner profile…");

    try {
      const res = await fetch("/api/blueprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          childName: nickname, grade, age: Number(age), interests: allInterests,
          strugglingWith, subjectFocus: "balanced", goal, timeAvailable,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || "Could not generate the expert plan.");
      }
      const data: BlueprintPreview = await res.json();
      setBasePlan(data);
      setPlan(structuredClone(data));
      setStatus("plan-ready");
      setMessage("");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  // ── Generate worksheet (with the edited plan, or without a plan as a fallback) ──
  async function handleGenerate(usePlan = true) {
    const err = validate();
    if (err) { setStatus("error"); setMessage(err); return; }

    setStatus("generating");
    setWorksheetHtml("");
    const steps: ProgressStep[] = [
      { label: "Worksheet plan ready",       done: true,  active: false },
      { label: "Writing reading passage…",    done: false, active: true  },
      { label: "Building subject questions…", done: false, active: false },
      { label: "Assembling worksheet…",       done: false, active: false },
    ];
    setProgressSteps(steps);
    const tick = (index: number) =>
      setProgressSteps((prev) => prev.map((s, i) => ({ ...s, done: i < index, active: i === index })));
    const passageTimer  = setTimeout(() => tick(2), 18000);
    const assembleTimer = setTimeout(() => tick(3), 42000);

    try {
      const res = await fetch("/api/worksheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          childName: nickname, grade, age: Number(age), interests: allInterests,
          strugglingWith, subjectFocus: "balanced", goal, timeAvailable,
          blueprint: usePlan ? plan : null,
        }),
      });
      clearTimeout(passageTimer);
      clearTimeout(assembleTimer);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || "Could not create the worksheet.");
      }
      const html = await res.text();
      setWorksheetHtml(html);
      setProgressSteps((prev) => prev.map((s) => ({ ...s, done: true, active: false })));
      setStatus("done");
      setMessage("Your worksheet is ready!");
    } catch (err) {
      clearTimeout(passageTimer);
      clearTimeout(assembleTimer);
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Could not create the worksheet. Please try again.");
    }
  }

  // ── Print / download helpers ──────────────────────────────────────────────────
  function makeUrl() {
    return worksheetHtml
      ? URL.createObjectURL(new Blob([worksheetHtml], { type: "text/html;charset=utf-8" }))
      : "";
  }
  function openWorksheet() {
    const url = makeUrl(); if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function printWorksheet() {
    const url = makeUrl(); if (!url) return;
    const w = window.open(url, "_blank");
    setTimeout(() => { w?.print(); URL.revokeObjectURL(url); }, 800);
  }
  function downloadWorksheet() {
    const url = makeUrl(); if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `paperstride-${nickname.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") || "worksheet"}.html`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <section className="creator-section" id="worksheet-creator" aria-labelledby="creator-title">
      <div className="creator-header">
        <p className="eyebrow">Worksheet studio</p>
        <h2 id="creator-title">Design a worksheet your learner will love.</h2>
        <p className="creator-subtext">
          Tell us about the learner on the left. Our expert panel drafts a plan on the
          right — then you fine-tune it with sliders before printing.
        </p>
      </div>

      <div className="studio">
        {/* ════ LEFT: inputs ════ */}
        <form className="studio-inputs" onSubmit={handleGetPlan}>
          {/* Learner */}
          <div className="form-section">
            <p className="form-section-label">① About the learner</p>
            <div className="learner-row">
              <label className="learner-field">
                <span>Nickname</span>
                <input autoComplete="off" maxLength={40} onChange={(e) => setNickname(e.target.value)}
                  placeholder="e.g. Ava" required value={nickname} />
              </label>
              <label className="learner-field">
                <span>Grade</span>
                <select onChange={(e) => setGrade(e.target.value)} value={grade}>
                  {GRADE_OPTIONS.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </label>
              <label className="learner-field">
                <span>Age</span>
                <select onChange={(e) => setAge(e.target.value)} value={age}>
                  {AGE_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </label>
            </div>
          </div>

          {/* Interests */}
          <div className="form-section">
            <p className="form-section-label">② What lights {nickname || "them"} up?</p>
            <p className="form-section-hint">Pick any — the worksheet is themed around these.</p>
            <div className="chips-grid">
              {INTEREST_CHIPS.map(({ label, emoji }) => (
                <button key={label} type="button"
                  className={`chip ${selectedInterests.includes(label) ? "selected" : ""}`}
                  onClick={() => toggleInterest(label)} aria-pressed={selectedInterests.includes(label)}>
                  <span className="chip-emoji">{emoji}</span> {label}
                </button>
              ))}
            </div>
            <input className="custom-interest-input" maxLength={80}
              onChange={(e) => setCustomInterest(e.target.value)}
              placeholder="+ Add your own interest…" value={customInterest} />
          </div>

          {/* Needs */}
          <div className="form-section">
            <p className="form-section-label">③ What do they need today?</p>

            <p className="form-section-sublabel">
              Anything tricky for them? <span className="optional">(grade-specific · optional)</span>
            </p>
            <div className="chips-grid">
              {struggleChips.map(({ label, emoji }) => (
                <button key={label} type="button"
                  className={`chip struggle-chip ${strugglingWith.includes(label) ? "selected" : ""}`}
                  onClick={() => toggleStruggle(label)} aria-pressed={strugglingWith.includes(label)}>
                  <span className="chip-emoji">{emoji}</span> {label}
                </button>
              ))}
            </div>

            <p className="form-section-sublabel" style={{ marginTop: "1.3rem" }}>Today&apos;s goal</p>
            <div className="goal-grid">
              {GOAL_OPTIONS.map((opt) => (
                <button key={opt.value} type="button"
                  className={`goal-card ${goal === opt.value ? "selected" : ""}`}
                  onClick={() => setGoal(opt.value)} aria-pressed={goal === opt.value}>
                  <span className="goal-emoji">{opt.emoji}</span>
                  <strong>{opt.label}</strong>
                  <span className="goal-desc">{opt.desc}</span>
                </button>
              ))}
            </div>

            <p className="form-section-sublabel" style={{ marginTop: "1.3rem" }}>How long do you have?</p>
            <div className="time-options">
              {TIME_OPTIONS.map((opt) => (
                <button key={opt.value} type="button"
                  className={`time-btn ${timeAvailable === opt.value ? "selected" : ""}`}
                  onClick={() => setTimeAvailable(opt.value)} aria-pressed={timeAvailable === opt.value}>
                  <span className="time-emoji">{opt.emoji}</span>
                  <strong>{opt.label}</strong>
                  <span className="time-desc">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="studio-inputs-foot">
            <button className="button primary studio-cta" type="submit"
              disabled={status === "planning" || status === "generating"}>
              {status === "planning" ? "Expert panel working…"
                : plan ? "↻ Re-draft plan" : "✦ See Expert Plan"}
            </button>
            {status === "error" && !plan && (
              <p className="creator-message error" role="alert">{message}</p>
            )}
          </div>
        </form>

        {/* ════ RIGHT: editable plan / output ════ */}
        <div className="studio-plan" aria-live="polite">
          {/* Empty state */}
          {status === "idle" && !plan && (
            <div className="plan-empty">
              <PlanEmptyGraphic />
              <h3>Your expert plan appears here</h3>
              <p>Fill in the learner details, then tap <strong>See Expert Plan</strong>. You&apos;ll
                be able to drag sliders to add questions, change the reading length, and more.</p>
            </div>
          )}

          {/* Planning skeleton */}
          {status === "planning" && (
            <div className="plan-loading">
              <div className="plan-spinner" aria-hidden="true" />
              <h3>The expert panel is designing…</h3>
              <p className="loading">{message}</p>
              <div className="skeleton-rows">
                {[0,1,2,3].map((i) => <div key={i} className="skeleton-row" style={{ animationDelay: `${i * 0.12}s` }} />)}
              </div>
            </div>
          )}

          {/* Error with graceful fallback */}
          {status === "error" && plan === null && message && (
            <div className="plan-error">
              <p className="plan-error-icon" aria-hidden="true">⚠️</p>
              <h3>The expert plan didn&apos;t load</h3>
              <p>{message}</p>
              <div className="plan-error-actions">
                <button className="button secondary" type="button" onClick={() => handleGetPlan()}>↻ Try again</button>
                <button className="button primary" type="button" onClick={() => handleGenerate(false)}>
                  Build worksheet anyway →
                </button>
              </div>
            </div>
          )}

          {/* Editable plan */}
          {plan && (status === "plan-ready" || status === "generating" || status === "done" || status === "error") && (
            <div className="plan-card">
              <div className="plan-card-head">
                <p className="eyebrow">Expert panel plan · editable</p>
                <h3 className="plan-theme">{plan.themeThread}</h3>
                <div className="plan-stats">
                  <span className="plan-stat"><strong>{totals?.questions}</strong> questions</span>
                  <span className="plan-stat"><strong>~{totals?.minutes}</strong> min</span>
                  <span className="plan-stat plan-stat--soft">{plan.sections.length} sections</span>
                  {planEdited && <span className="plan-edited-badge">✎ edited</span>}
                </div>
              </div>

              <div className="plan-scroll">
                {/* Challenge */}
                <div className="plan-block">
                  <p className="plan-block-label">Challenge level</p>
                  <div className="seg" role="group" aria-label="Challenge level">
                    {CHALLENGE_LEVELS.map((c) => (
                      <button key={c.value} type="button"
                        className={`seg-btn ${plan.challengeLevel === c.value ? "active" : ""}`}
                        onClick={() => patchPlan({ challengeLevel: c.value })}
                        aria-pressed={plan.challengeLevel === c.value}>
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Reading length */}
                <div className="plan-block">
                  <div className="range-head">
                    <p className="plan-block-label">📖 Reading passage</p>
                    <span className="range-value">{plan.reading.wordCount} words</span>
                  </div>
                  <p className="plan-block-sub">{plan.reading.topic} · {plan.reading.lexileTarget}</p>
                  <input className="slider" type="range" min={60} max={800} step={20}
                    value={plan.reading.wordCount}
                    onChange={(e) => setReadingWords(Number(e.target.value))}
                    aria-label="Reading passage length in words" />
                  <div className="range-scale"><span>Short</span><span>Long</span></div>
                </div>

                {/* Sections with sliders */}
                <div className="plan-block">
                  <p className="plan-block-label">📝 Sections &amp; questions</p>
                  <div className="sec-list">
                    {plan.sections.map((sec) => (
                      <div key={sec.subject} className="sec-row">
                        <div className="sec-row-top">
                          <span className="sec-icon">{SUBJECT_ICONS[sec.subject] ?? "📝"}</span>
                          <span className="sec-name">{sec.subject}</span>
                          {sec.isWeakArea && <span className="sec-focus" title="Extra focus area">⚑</span>}
                          <span className="sec-count">{sec.questionCount}Q</span>
                          <button type="button" className="sec-remove" aria-label={`Remove ${sec.subject}`}
                            onClick={() => removeSection(sec.subject)}>×</button>
                        </div>
                        <input className="slider slider--sec" type="range" min={1} max={10} step={1}
                          value={sec.questionCount}
                          onChange={(e) => setSectionCount(sec.subject, Number(e.target.value))}
                          aria-label={`${sec.subject} question count`} />
                      </div>
                    ))}
                  </div>

                  {/* Add section */}
                  {availableToAdd.length > 0 && (
                    <div className="add-section">
                      {addOpen ? (
                        <select className="add-select" autoFocus defaultValue=""
                          onChange={(e) => e.target.value && addSection(e.target.value)}
                          onBlur={() => setAddOpen(false)}>
                          <option value="" disabled>Choose a section…</option>
                          {availableToAdd.map((s) => <option key={s} value={s}>{SUBJECT_ICONS[s]} {s}</option>)}
                        </select>
                      ) : (
                        <button type="button" className="add-btn" onClick={() => setAddOpen(true)}>+ Add a section</button>
                      )}
                    </div>
                  )}
                </div>

                {/* Fun zone + note */}
                {plan.funZone?.activities?.length > 0 && (
                  <div className="plan-block">
                    <p className="plan-block-label">🎮 Fun zone</p>
                    <p className="plan-block-value">{plan.funZone.activities.join(" · ")}</p>
                  </div>
                )}
                {plan.parentNote && (
                  <div className="plan-block plan-block--note">
                    <p className="plan-block-label">👩‍👧 Parent &amp; teacher note</p>
                    <p className="plan-block-value">{plan.parentNote}</p>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="plan-actions">
                <button className="button ghost" type="button" onClick={resetPlan} disabled={!planEdited}>
                  ↺ Reset
                </button>
                <button className="button primary plan-generate" type="button"
                  onClick={() => handleGenerate(true)} disabled={status === "generating"}>
                  {status === "generating" ? "Building…" : "🚀 Generate Worksheet"}
                </button>
              </div>

              {/* Progress */}
              {status === "generating" && progressSteps.length > 0 && (
                <div className="progress-steps" role="status" aria-live="polite">
                  {progressSteps.map((step, i) => (
                    <div key={i} className={`progress-step ${step.done ? "done" : step.active ? "active" : ""}`}>
                      <span className="progress-step-icon">{step.done ? "✓" : step.active ? "●" : "○"}</span>
                      {step.label}
                    </div>
                  ))}
                </div>
              )}
              {status === "done" && <p className="creator-message success" role="status">✓ {message}</p>}
              {status === "error" && message && <p className="creator-message error" role="alert">{message}</p>}
            </div>
          )}
        </div>
      </div>

      {/* ════ Worksheet preview (full width) ════ */}
      {worksheetHtml && (
        <section className="worksheet-preview" aria-label="Generated worksheet preview">
          <div className="preview-toolbar">
            <div>
              <p className="eyebrow">Printable preview</p>
              <h3>Generated workbook</h3>
            </div>
            <div className="preview-actions">
              <button className="button secondary" type="button" onClick={openWorksheet}>Open</button>
              <button className="button secondary" type="button" onClick={printWorksheet}>Print</button>
              <button className="button primary"   type="button" onClick={downloadWorksheet}>Download HTML</button>
            </div>
          </div>
          <iframe className="preview-frame" sandbox="" srcDoc={worksheetHtml}
            title="Generated PaperStride worksheet" />
        </section>
      )}
    </section>
  );
}

// Friendly empty-state illustration for the right pane.
function PlanEmptyGraphic() {
  return (
    <svg className="plan-empty-graphic" viewBox="0 0 200 150" role="img" aria-label="Expert plan placeholder">
      <rect x="44" y="26" width="112" height="100" rx="10" fill="#ffffff" stroke="#b8dede" strokeWidth="2" />
      <rect x="78" y="18" width="44" height="16" rx="6" fill="#e6f4f3" stroke="#116466" strokeWidth="2" />
      <line x1="60" y1="54" x2="140" y2="54" stroke="#116466" strokeWidth="3" strokeLinecap="round" />
      <line x1="60" y1="72" x2="120" y2="72" stroke="#cfe6e4" strokeWidth="3" strokeLinecap="round" />
      <line x1="60" y1="88" x2="132" y2="88" stroke="#cfe6e4" strokeWidth="3" strokeLinecap="round" />
      <line x1="60" y1="104" x2="104" y2="104" stroke="#cfe6e4" strokeWidth="3" strokeLinecap="round" />
      <circle cx="150" cy="104" r="20" fill="#d8a637" opacity="0.18" />
      <path d="M150 94 l3 7 7 0 -5.5 5 2 7 -6.5 -4 -6.5 4 2 -7 -5.5 -5 7 0 z" fill="#d8a637" />
    </svg>
  );
}
