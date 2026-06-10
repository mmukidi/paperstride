"use client";

import { useEffect, useState } from "react";

// Fixed glass nav: transparent over the dark hero, frosted-light once the page
// scrolls into the light studio content.
export default function NavBar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > window.innerHeight * 0.62);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`nav3 ${scrolled ? "is-scrolled" : ""}`}>
      <a aria-label="PaperStride home" className="nav3-brand" href="#top">
        <span aria-hidden="true" className="nav3-mark">P</span>
        <span>PaperStride</span>
      </a>
      <nav aria-label="Primary navigation" className="nav3-links">
        <a href="#worksheet-creator">Studio</a>
        <a href="#how">How it works</a>
        <a href="#vision">Vision</a>
        <a className="nav3-cta" href="#worksheet-creator">
          Build a worksheet
        </a>
      </nav>
    </header>
  );
}
