import Image from "next/image";
import WorksheetCreator from "./components/WorksheetCreator";
import Reveal from "./components/Reveal";

const contactEmail =
  process.env.NEXT_PUBLIC_CONTACT_EMAIL || "hello@paperstride.org";

const steps = [
  {
    n: "1",
    title: "Describe the learner",
    body: "Grade, age, and the things they love — space, soccer, dinosaurs, anything. Flag any tricky areas.",
  },
  {
    n: "2",
    title: "Tune the expert plan",
    body: "An expert panel drafts the worksheet. Drag sliders to add questions, change the reading length, or swap sections.",
  },
  {
    n: "3",
    title: "Print and go",
    body: "Generate a clean printable workbook with a full answer key. No screens, no accounts, no sign-up.",
  },
];

export default function Home() {
  return (
    <main className="site-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="PaperStride home">
          <span className="brand-mark" aria-hidden="true">P</span>
          <span>PaperStride</span>
        </a>
        <nav className="nav-links" aria-label="Primary navigation">
          <a href="#how">How it works</a>
          <a href="#privacy">Privacy</a>
          <a className="nav-cta" href="#worksheet-creator">Build a worksheet</a>
        </nav>
      </header>

      {/* Compact hero — flows straight into the studio below */}
      <section className="hero2" id="top">
        <div className="hero2-inner">
          <Reveal className="hero2-text">
            <p className="eyebrow">Screen-free · expert-designed</p>
            <h1>
              Worksheets they
              <br />
              <span className="hero2-accent">actually want</span> to do.
            </h1>
            <p className="hero2-copy">
              Tell us the grade and what they love. An expert panel designs a
              personalised worksheet — you fine-tune it with sliders and print.
              About a minute. No accounts, no screens.
            </p>
            <div className="hero2-actions">
              <a className="button primary" href="#worksheet-creator">
                Build a worksheet →
              </a>
              <a className="button ghost" href="#how">
                See how it works
              </a>
            </div>
            <ul className="hero2-trust">
              <li>No student accounts</li>
              <li>Pre-K → Grade 12</li>
              <li>Print at home</li>
            </ul>
          </Reveal>

          <Reveal className="hero2-visual" delay={120}>
            <div className="hero2-frame">
              <Image
                className="hero2-img"
                src="/paperstride-hero.webp"
                alt="A printed PaperStride worksheet on a desk"
                width={640}
                height={480}
                priority
              />
            </div>
          </Reveal>
        </div>
      </section>

      {/* The studio is the centerpiece — right under the hero */}
      <WorksheetCreator />

      {/* Condensed how-it-works */}
      <section className="band" id="how">
        <Reveal className="band-head">
          <p className="eyebrow">How it works</p>
          <h2>From “what do they like?” to a printed worksheet in three steps.</h2>
        </Reveal>
        <div className="steps3">
          {steps.map((s, i) => (
            <Reveal key={s.n} className="step3" delay={i * 110}>
              <span className="step3-num">{s.n}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Slim footer — privacy + contact merged */}
      <footer className="footer" id="privacy">
        <Reveal className="footer-inner">
          <div className="footer-privacy">
            <p className="eyebrow">Privacy by default</p>
            <h2>Only the minimum needed for a worksheet.</h2>
            <p>
              No student emails, accounts, or full names. The plan uses grade,
              age, and interest theme; the nickname only appears on the printable
              workbook.
            </p>
          </div>
          <a
            className="button primary"
            href={`mailto:${contactEmail}?subject=PaperStride%20early%20access`}
          >
            Contact for early access
          </a>
        </Reveal>
        <p className="footer-base">
          © 2026 PaperStride · Screen-free learning practice
        </p>
      </footer>
    </main>
  );
}
