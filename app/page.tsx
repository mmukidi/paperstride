import Image from "next/image";
import WorksheetCreator from "./components/WorksheetCreator";

const contactEmail =
  process.env.NEXT_PUBLIC_CONTACT_EMAIL || "hello@paperstride.org";

const focusAreas = [
  {
    title: "Pre-K to Grade 8",
    body: "Practice can start with tracing, counting, and phonics, then grow into fractions, comprehension, and multi-step problem solving."
  },
  {
    title: "Math and reading first",
    body: "The first product focus is reliable printable practice for the two subjects families and teachers ask for most often."
  },
  {
    title: "Personalized without pressure",
    body: "Worksheets will adapt by grade, level, interest theme, and challenge style while keeping the learning moment offline."
  }
];

const steps = [
  "Choose a grade, skill, and level.",
  "Pick a theme that feels interesting.",
  "Print the worksheet and answer key."
];

export default function Home() {
  return (
    <main className="site-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="PaperStride home">
          <span className="brand-mark" aria-hidden="true">
            P
          </span>
          <span>PaperStride</span>
        </a>
        <nav className="nav-links" aria-label="Primary navigation">
          <a href="#worksheet-creator">Create</a>
          <a href="#focus">Focus</a>
          <a href="#privacy">Privacy</a>
          <a href="#early-access">Early access</a>
        </nav>
      </header>

      <section className="hero" id="top" aria-labelledby="hero-title">
        <Image
          className="hero-image"
          src="/paperstride-hero.png"
          alt=""
          fill
          priority
          sizes="100vw"
        />
        <div className="hero-tint" aria-hidden="true" />
        <div className="hero-content">
          <p className="eyebrow">Screen-free learning practice</p>
          <h1 id="hero-title">PaperStride</h1>
          <p className="hero-copy">
            Printable practice that helps students learn away from screens.
          </p>
          <div className="hero-actions" aria-label="Primary actions">
            <a className="button primary" href="#early-access">
              Follow the beta
            </a>
            <a className="button secondary" href="#worksheet-creator">
              Make a worksheet
            </a>
          </div>
        </div>
      </section>

      <section className="intro-band" aria-label="Product snapshot">
        <div className="intro-grid">
          <p>Pre-K to Grade 8 printable worksheets</p>
          <p>Math and reading first</p>
          <p>AI-assisted printable PDFs</p>
        </div>
      </section>

      <WorksheetCreator />

      <section className="section" id="focus" aria-labelledby="focus-title">
        <div className="section-heading">
          <p className="eyebrow">Built for focus</p>
          <h2 id="focus-title">Practice that belongs on paper.</h2>
        </div>
        <div className="feature-grid">
          {focusAreas.map((area) => (
            <article className="feature-card" key={area.title}>
              <h3>{area.title}</h3>
              <p>{area.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="process-band" aria-labelledby="process-title">
        <div className="process-copy">
          <p className="eyebrow">How it will work</p>
          <h2 id="process-title">A short path from need to worksheet.</h2>
          <p>
            PaperStride will start simple: no student accounts, no long online
            lessons, and no open-ended chat. The goal is a printable worksheet
            and an answer key that match the learner's next useful challenge.
          </p>
        </div>
        <ol className="step-list">
          {steps.map((step, index) => (
            <li key={step}>
              <span aria-hidden="true">{index + 1}</span>
              <p>{step}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="section privacy" id="privacy" aria-labelledby="privacy-title">
        <div className="privacy-panel">
          <p className="eyebrow">Privacy by default</p>
          <h2 id="privacy-title">Only the minimum needed for a worksheet.</h2>
          <p>
            The worksheet creator does not ask for student emails, accounts, or
            full names. The AI prompt uses learning level, age, and interest
            theme; the nickname is only used on the printable PDF.
          </p>
        </div>
      </section>

      <section
        className="early-access"
        id="early-access"
        aria-labelledby="early-access-title"
      >
        <div>
          <p className="eyebrow">Free beta</p>
          <h2 id="early-access-title">Try the first worksheet creator.</h2>
          <p>
            PaperStride now has a starter PDF flow. The next updates can add
            subject choices, grade-specific skills, worksheet styles, and saved
            sample packs.
          </p>
        </div>
        <a
          className="button primary"
          href={`mailto:${contactEmail}?subject=PaperStride%20early%20access`}
        >
          Contact for early access
        </a>
      </section>
    </main>
  );
}
