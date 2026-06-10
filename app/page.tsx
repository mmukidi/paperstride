import NavBar from "./components/NavBar";
import Reveal from "./components/Reveal";
import WorksheetCreator from "./components/WorksheetCreator";
import { AuroraCanvas, CountUp, Parallax, TiltCard } from "./components/fx/Effects";
import ScrollScenes from "./components/fx/ScrollScenes";

const contactEmail =
  process.env.NEXT_PUBLIC_CONTACT_EMAIL || "hello@paperstride.org";

const MARQUEE_ITEMS = [
  "🚀 Space", "⚽ Soccer", "🦖 Dinosaurs", "⛏️ Minecraft", "🌊 Ocean Life",
  "🤖 Robots", "🩰 Ballet", "🚂 Trains", "🧁 Baking", "🦸 Superheroes",
  "♟️ Chess", "🌋 Volcanoes", "💻 Coding", "🐾 Animals", "🎵 Music",
  "🏀 Basketball", "🎮 Gaming", "🔭 Astronomy", "🏰 History", "🎨 Art",
];

const PILLARS = [
  {
    icon: "◈",
    title: "Personal",
    body: "Every worksheet is designed around one learner — their grade, their pace, and the interests that make them lean in.",
  },
  {
    icon: "◎",
    title: "Rigorous",
    body: "Expert-panel pedagogy in every section: evidence-based reading, real math reasoning, and logic that stretches.",
  },
  {
    icon: "❖",
    title: "Tangible",
    body: "Paper, pencil, and uninterrupted thinking. The most advanced learning technology is still deep focus.",
  },
];

export default function Home() {
  return (
    <main className="site-shell" id="top">
      <NavBar />

      {/* ── Cinematic hero ─────────────────────────────────────────────── */}
      <section className="hero3">
        <AuroraCanvas className="hero3-canvas" />
        <div aria-hidden="true" className="hero3-gridlines" />
        <div className="hero3-inner">
          <Reveal className="hero3-text">
            <p className="hero3-eyebrow">
              <span aria-hidden="true" className="pulse-dot" />
              The future of screen-free learning
            </p>
            <h1>
              Turn what they <span className="grad-text">love</span>
              <br />
              into how they <span className="grad-text grad-text--warm">learn</span>.
            </h1>
            <p className="hero3-copy">
              An expert engine designs a personalized, printable workbook around
              your child&apos;s obsessions — tuned by you with sliders, printed in
              about a minute. No accounts. No screens. Just deep, joyful focus.
            </p>
            <div className="hero3-actions">
              <a className="button glow" href="#worksheet-creator">
                Build their worksheet →
              </a>
              <a className="button ghost-dark" href="#how">
                See how it works
              </a>
            </div>
            <ul className="hero3-stats">
              <li>
                <strong><CountUp to={13} /></strong>
                <span>grade levels</span>
              </li>
              <li>
                <strong>~<CountUp to={60} />s</strong>
                <span>to an expert plan</span>
              </li>
              <li>
                <strong>0</strong>
                <span>accounts needed</span>
              </li>
            </ul>
          </Reveal>

          <Parallax className="hero3-visual" speed={-0.05}>
            <TiltCard className="hm-tilt">
              <div className="hm-stack">
                <div aria-hidden="true" className="hm-sheet hm-sheet--back" />
                <div aria-hidden="true" className="hm-sheet hm-sheet--mid" />
                <div className="hm-sheet hm-sheet--front">
                  <div className="hm-head">
                    <strong>Ava&apos;s Space Mission</strong>
                    <span>Grade 3 · Age 8</span>
                  </div>
                  <div className="hm-lines">
                    <span style={{ width: "94%" }} />
                    <span style={{ width: "86%" }} />
                    <span style={{ width: "90%" }} />
                    <span style={{ width: "58%" }} />
                  </div>
                  <div className="hm-row">
                    <span className="hm-box">7×6</span>
                    <span className="hm-box">54÷9</span>
                    <span className="hm-box hm-box--accent">🪐</span>
                  </div>
                  <div className="hm-vocab">
                    <span>orbit</span>
                    <span>gravity</span>
                    <span>evidence</span>
                  </div>
                  <div className="hm-foot">
                    <span>✓ Answer key</span>
                    <span className="hm-print">🖨 Print-ready</span>
                  </div>
                </div>
              </div>
            </TiltCard>
            <span aria-hidden="true" className="hm-orb hm-orb--a">🚀</span>
            <span aria-hidden="true" className="hm-orb hm-orb--b">🦖</span>
            <span aria-hidden="true" className="hm-orb hm-orb--c">⚽</span>
            <span aria-hidden="true" className="hm-orb hm-orb--d">🎨</span>
          </Parallax>
        </div>

        <a aria-label="Scroll to the studio" className="scroll-cue" href="#worksheet-creator">
          <span />
        </a>
      </section>

      {/* ── Interests marquee ──────────────────────────────────────────── */}
      <div aria-hidden="true" className="marquee">
        <div className="marquee-track">
          {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, i) => (
            <span className="marquee-item" key={i}>{item}</span>
          ))}
        </div>
      </div>

      {/* ── The studio — the product itself ────────────────────────────── */}
      <WorksheetCreator />

      {/* ── Pinned scrollytelling: how it works ────────────────────────── */}
      <ScrollScenes />

      {/* ── Vision ─────────────────────────────────────────────────────── */}
      <section className="vision" id="vision">
        <Parallax className="vision-orb vision-orb--a" speed={0.12}>
          <i aria-hidden="true" />
        </Parallax>
        <Parallax className="vision-orb vision-orb--b" speed={-0.1}>
          <i aria-hidden="true" />
        </Parallax>

        <Reveal className="vision-head">
          <p className="eyebrow eyebrow-glow">Our vision</p>
          <h2>
            Deep focus is a superpower.
            <br />
            <span className="grad-text">We print it.</span>
          </h2>
          <p className="vision-copy">
            Screens fragment attention; paper concentrates it. PaperStride pairs
            the intelligence of modern AI with the oldest learning technology
            that works — so practice feels like a mission, not a chore.
          </p>
        </Reveal>

        <div className="vision-pillars">
          {PILLARS.map((p, i) => (
            <Reveal delay={i * 120} key={p.title}>
              <TiltCard className="pillar" max={6}>
                <span aria-hidden="true" className="pillar-icon">{p.icon}</span>
                <h3>{p.title}</h3>
                <p>{p.body}</p>
              </TiltCard>
            </Reveal>
          ))}
        </div>

        <Reveal className="vision-stats">
          <div>
            <strong><CountUp to={30} suffix="+" /></strong>
            <span>question missions per workbook</span>
          </div>
          <div>
            <strong><CountUp to={8} /></strong>
            <span>subjects woven together</span>
          </div>
          <div>
            <strong><CountUp to={100} suffix="%" /></strong>
            <span>printable, answer key included</span>
          </div>
        </Reveal>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="footer3" id="privacy">
        <div className="footer3-inner">
          <Reveal className="footer3-privacy">
            <p className="eyebrow eyebrow-glow">Privacy by default</p>
            <h2>Only the minimum needed for a worksheet.</h2>
            <p>
              No student emails, accounts, or full names. The plan uses grade,
              age, and an interest theme; the nickname only ever appears on the
              printed workbook.
            </p>
          </Reveal>
          <Reveal delay={120}>
            <a
              className="button glow"
              href={`mailto:${contactEmail}?subject=PaperStride%20early%20access`}
            >
              Contact for early access
            </a>
          </Reveal>
        </div>
        <p aria-hidden="true" className="footer3-watermark">PaperStride</p>
        <p className="footer3-base">
          © 2026 PaperStride · Screen-free learning practice
        </p>
      </footer>
    </main>
  );
}
