"use client";

import { FormEvent, useState } from "react";
import type { BlueprintPreview } from "../api/blueprint/route";

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

const STRUGGLE_CHIPS = [
  { label: "Reading",       emoji: "📖" },
  { label: "Fractions",     emoji: "½" },
  { label: "Word Problems", emoji: "📝" },
  { label: "Vocabulary",    emoji: "💬" },
  { label: "Grammar",       emoji: "✏️" },
  { label: "Writing",       emoji: "🖊️" },
  { label: "Science",       emoji: "🔬" },
  { label: "Logic",         emoji: "🧩" },
];

const GOAL_OPTIONS = [
  { value: "general",       emoji: "🎯", label: "General Practice",  desc: "Balanced skill practice across all subjects" },
  { value: "test-prep",     emoji: "📊", label: "Test Prep",         desc: "Build exam skills and smart test strategies" },
  { value: "catching-up",   emoji: "🆙", label: "Catching Up",       desc: "Extra support and confidence-building" },
  { value: "getting-ahead", emoji: "🚀", label: "Getting Ahead",     desc: "Above-grade challenge and stretch questions" },
];

const TIME_OPTIONS = [
  { value: 20, emoji: "⚡", label: "Quick",        desc: "~20 min · 8–10 questions" },
  { value: 40, emoji: "📝", label: "Standard",     desc: "~40 min · 12–16 questions" },
  { value: 60, emoji: "🏆", label: "Deep Session", desc: "60+ min · up to 24 questions" },
];

const SUBJECT_ICONS: Record<string, string> = {
  "Reading Comprehension":    "📖",
  "Vocabulary in Context":    "💬",
  "Grammar and Writing":      "✏️",
  "Math Reasoning":           "🔢",
  "Science Investigation":    "🔬",
  "Social Studies and History":"🌍",
  "Logic and Patterns":       "🧩",
  "Critical Thinking":        "💡",
};

// ─── Types ────────────────────────────────────────────────────────────────────

type Status = "idle" | "planning" | "plan-ready" | "generating" | "done" | "error";

type ProgressStep = { label: string; done: boolean; active: boolean };

// ─── Component ────────────────────────────────────────────────────────────────

export default function WorksheetCreator() {
  // Learner
  const [nickname,  setNickname]  = useState("");
  const [grade,     setGrade]     = useState("Grade 4");
  const [age,       setAge]       = useState("9");

  // Interests
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [customInterest,    setCustomInterest]    = useState("");

  // Needs
  const [strugglingWith, setStrugglingWith] = useState<string[]>([]);
  const [goal,           setGoal]           = useState("general");
  const [timeAvailable,  setTimeAvailable]  = useState(40);

  // Status / output
  const [status,        setStatus]        = useState<Status>("idle");
  const [message,       setMessage]       = useState("");
  const [blueprint,     setBlueprint]     = useState<BlueprintPreview | null>(null);
  const [worksheetHtml, setWorksheetHtml] = useState("");
  const [progressSteps, setProgressSteps] = useState<ProgressStep[]>([]);

  // ── Derived ──────────────────────────────────────────────────────────────────
  const allInterests = [
    ...selectedInterests,
    ...(customInterest.trim() ? [customInterest.trim()] : []),
  ].join(", ");

  const maxSections = blueprint ? Math.max(...blueprint.sections.map(s => s.questionCount)) : 1;

  // ── Chip toggles ─────────────────────────────────────────────────────────────
  function toggleInterest(label: string) {
    setSelectedInterests(prev =>
      prev.includes(label) ? prev.filter(i => i !== label) : [...prev, label]
    );
  }

  function toggleStruggle(label: string) {
    setStrugglingWith(prev =>
      prev.includes(label) ? prev.filter(s => s !== label) : [...prev, label]
    );
  }

  // ── Validation ───────────────────────────────────────────────────────────────
  function validate(): string | null {
    if (!nickname.trim())    return "Please add a nickname.";
    if (!allInterests.trim()) return "Please pick at least one interest.";
    return null;
  }

  // ── Get expert plan ───────────────────────────────────────────────────────────
  async function handleGetPlan(e: FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) { setStatus("error"); setMessage(err); return; }

    setStatus("planning");
    setBlueprint(null);
    setWorksheetHtml("");
    setMessage("Our expert panel is reviewing the learner profile…");

    try {
      const res = await fetch("/api/blueprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          childName:    nickname,
          grade,
          age:          Number(age),
          interests:    allInterests,
          strugglingWith,
          subjectFocus: "balanced",
          goal,
          timeAvailable,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || "Could not generate the expert plan.");
      }

      const data: BlueprintPreview = await res.json();
      setBlueprint(data);
      setStatus("plan-ready");
      setMessage("");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  // ── Generate worksheet ────────────────────────────────────────────────────────
  async function handleGenerate() {
    setStatus("generating");
    setWorksheetHtml("");

    const steps: ProgressStep[] = [
      { label: "Worksheet plan ready",       done: true,  active: false },
      { label: "Writing reading passage…",    done: false, active: true  },
      { label: "Building subject questions…", done: false, active: false },
      { label: "Assembling worksheet…",       done: false, active: false },
    ];
    setProgressSteps(steps);

    const tick = (index: number) => {
      setProgressSteps(prev => prev.map((s, i) => ({
        ...s,
        done:   i < index,
        active: i === index,
      })));
    };

    const passageTimer = setTimeout(() => tick(2), 18000);
    const assembleTimer = setTimeout(() => tick(3), 42000);

    try {
      const res = await fetch("/api/worksheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          childName:    nickname,
          grade,
          age:          Number(age),
          interests:    allInterests,
          strugglingWith,
          subjectFocus: "balanced",
          goal,
          timeAvailable,
          blueprint,
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
      setProgressSteps(prev => prev.map(s => ({ ...s, done: true, active: false })));
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
    const url = makeUrl();
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function printWorksheet() {
    const url = makeUrl();
    if (!url) return;
    const w = window.open(url, "_blank");
    setTimeout(() => { w?.print(); URL.revokeObjectURL(url); }, 800);
  }

  function downloadWorksheet() {
    const url = makeUrl();
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `paperstride-${nickname.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") || "worksheet"}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <section className="creator-section" id="worksheet-creator" aria-labelledby="creator-title">

      {/* ── Header ── */}
      <div className="creator-header">
        <p className="eyebrow">Worksheet creator</p>
        <h2 id="creator-title">Make a personalised practice sheet.</h2>
        <p className="creator-subtext">
          Tell us about the learner. Our expert panel — a teacher, psychologist,
          motivational coach, test coach, and learning support specialist — will
          design the perfect worksheet together.
        </p>
      </div>

      <form className="creator-form" onSubmit={handleGetPlan}>

        {/* ── Section 1: About the learner ── */}
        <div className="form-section">
          <p className="form-section-label">① About the learner</p>
          <div className="learner-row">
            <label className="learner-field">
              <span>Nickname</span>
              <input
                autoComplete="off"
                maxLength={40}
                onChange={e => setNickname(e.target.value)}
                placeholder="e.g. Ava"
                required
                value={nickname}
              />
            </label>
            <label className="learner-field">
              <span>Grade or level</span>
              <select onChange={e => setGrade(e.target.value)} value={grade}>
                {GRADE_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </label>
            <label className="learner-field">
              <span>Age</span>
              <select onChange={e => setAge(e.target.value)} value={age}>
                {AGE_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
          </div>
        </div>

        {/* ── Section 2: Interests ── */}
        <div className="form-section">
          <p className="form-section-label">② What lights {nickname || "them"} up?</p>
          <p className="form-section-hint">Pick any that apply — the worksheet will be themed around these.</p>
          <div className="chips-grid">
            {INTEREST_CHIPS.map(({ label, emoji }) => (
              <button
                key={label}
                type="button"
                className={`chip ${selectedInterests.includes(label) ? "selected" : ""}`}
                onClick={() => toggleInterest(label)}
                aria-pressed={selectedInterests.includes(label)}
              >
                <span className="chip-emoji">{emoji}</span> {label}
              </button>
            ))}
          </div>
          <input
            className="custom-interest-input"
            maxLength={80}
            onChange={e => setCustomInterest(e.target.value)}
            placeholder="+ Add your own interest…"
            value={customInterest}
          />
        </div>

        {/* ── Section 3: Learning needs ── */}
        <div className="form-section">
          <p className="form-section-label">③ What do they need today?</p>

          <p className="form-section-sublabel">Any areas they're finding tricky? <span className="optional">(optional)</span></p>
          <div className="chips-grid">
            {STRUGGLE_CHIPS.map(({ label, emoji }) => (
              <button
                key={label}
                type="button"
                className={`chip struggle-chip ${strugglingWith.includes(label) ? "selected" : ""}`}
                onClick={() => toggleStruggle(label)}
                aria-pressed={strugglingWith.includes(label)}
              >
                <span className="chip-emoji">{emoji}</span> {label}
              </button>
            ))}
          </div>

          <p className="form-section-sublabel" style={{ marginTop: "1.4rem" }}>What's today's goal?</p>
          <div className="goal-grid">
            {GOAL_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                className={`goal-card ${goal === opt.value ? "selected" : ""}`}
                onClick={() => setGoal(opt.value)}
                aria-pressed={goal === opt.value}
              >
                <span className="goal-emoji">{opt.emoji}</span>
                <strong>{opt.label}</strong>
                <span className="goal-desc">{opt.desc}</span>
              </button>
            ))}
          </div>

          <p className="form-section-sublabel" style={{ marginTop: "1.4rem" }}>How long do you have?</p>
          <div className="time-options">
            {TIME_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                className={`time-btn ${timeAvailable === opt.value ? "selected" : ""}`}
                onClick={() => setTimeAvailable(opt.value)}
                aria-pressed={timeAvailable === opt.value}
              >
                <span className="time-emoji">{opt.emoji}</span>
                <strong>{opt.label}</strong>
                <span className="time-desc">{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Submit ── */}
        <button
          className="button primary creator-submit"
          disabled={status === "planning" || status === "generating"}
          type="submit"
        >
          {status === "planning" ? "Expert panel working…" : "✦ See Expert Plan"}
        </button>

        {status === "planning" && (
          <p className="creator-message loading" role="status">{message}</p>
        )}
        {status === "error" && (
          <p className="creator-message error" role="alert">{message}</p>
        )}
      </form>

      {/* ── Blueprint preview panel ── */}
      {blueprint && status !== "planning" && (
        <div className="blueprint-panel" aria-label="Expert panel recommendation">
          <div className="blueprint-header">
            <div className="blueprint-header-left">
              <p className="eyebrow">Expert panel recommendation</p>
              <h3 className="blueprint-title">{blueprint.themeThread}</h3>
              <div className="blueprint-meta-row">
                <span className="blueprint-meta-pill">📋 {blueprint.totalQuestions} questions</span>
                <span className="blueprint-meta-pill">⏱ ~{blueprint.estimatedMinutes} min</span>
                <span className="blueprint-meta-pill">📊 {blueprint.challengeProfile}</span>
              </div>
            </div>
          </div>

          <div className="blueprint-body">
            {/* Reading + Vocab */}
            <div className="blueprint-card">
              <p className="blueprint-card-label">📖 Reading Passage</p>
              <p className="blueprint-card-value">{blueprint.reading.topic}</p>
              <p className="blueprint-card-meta">
                {blueprint.reading.wordCount} words · {blueprint.reading.lexileTarget} ·{" "}
                {blueprint.vocabulary.wordCount} vocabulary words
              </p>
            </div>

            {/* Sections */}
            <div className="blueprint-card blueprint-card--sections">
              <p className="blueprint-card-label">📝 Worksheet Sections</p>
              {blueprint.sections.map(sec => (
                <div key={sec.subject} className="blueprint-section-row">
                  <span className="blueprint-subject-icon">
                    {SUBJECT_ICONS[sec.subject] ?? "📝"}
                  </span>
                  <span className="blueprint-subject-name">{sec.subject}</span>
                  <div className="blueprint-bar-wrap">
                    <div
                      className="blueprint-bar"
                      style={{ width: `${Math.round((sec.questionCount / maxSections) * 100)}%` }}
                    />
                  </div>
                  <span className="blueprint-q-count">{sec.questionCount}Q</span>
                  {sec.isWeakArea && (
                    <span className="blueprint-weak-badge" title="Extra focus on struggling area">⚑ focus</span>
                  )}
                </div>
              ))}
            </div>

            {/* Fun zone */}
            <div className="blueprint-card">
              <p className="blueprint-card-label">🎮 Fun Zone</p>
              <p className="blueprint-card-value">
                {blueprint.funZone.activities.join(" · ")}
              </p>
            </div>

            {/* Parent note */}
            {blueprint.parentNote && (
              <div className="blueprint-card blueprint-card--note">
                <p className="blueprint-card-label">👩‍👧 Parent &amp; Teacher Note</p>
                <p className="blueprint-card-value">{blueprint.parentNote}</p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="blueprint-actions">
            <button
              className="button secondary"
              type="button"
              onClick={() => { setBlueprint(null); setStatus("idle"); }}
            >
              ← Adjust inputs
            </button>
            <button
              className="button primary"
              type="button"
              disabled={status === "generating"}
              onClick={handleGenerate}
            >
              {status === "generating" ? "Building worksheet…" : "🚀 Generate This Worksheet"}
            </button>
          </div>

          {/* Progress steps */}
          {status === "generating" && progressSteps.length > 0 && (
            <div className="progress-steps" role="status" aria-live="polite">
              {progressSteps.map((step, i) => (
                <div
                  key={i}
                  className={`progress-step ${step.done ? "done" : step.active ? "active" : ""}`}
                >
                  <span className="progress-step-icon">
                    {step.done ? "✓" : step.active ? "●" : "○"}
                  </span>
                  {step.label}
                </div>
              ))}
            </div>
          )}

          {status === "done" && (
            <p className="creator-message success" role="status">✓ {message}</p>
          )}
          {status === "error" && (
            <p className="creator-message error" role="alert">{message}</p>
          )}
        </div>
      )}

      {/* ── Worksheet preview ── */}
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
          <iframe
            className="preview-frame"
            sandbox=""
            srcDoc={worksheetHtml}
            title="Generated PaperStride worksheet"
          />
        </section>
      )}
    </section>
  );
}
