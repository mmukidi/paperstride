"use client";

import { FormEvent, useRef, useState } from "react";

const gradeOptions = [
  "Pre-K",
  "Kindergarten",
  "Grade 1",
  "Grade 2",
  "Grade 3",
  "Grade 4",
  "Grade 5",
  "Grade 6",
  "Grade 7",
  "Grade 8",
  "Grade 9",
  "Grade 10",
  "Grade 11",
  "Grade 12",
  "College",
  "Master's"
];

const ageOptions = Array.from({ length: 24 }, (_, index) => index + 3);

type CreatorStatus = "idle" | "loading" | "success" | "error";

export default function WorksheetCreator() {
  const [nickname, setNickname] = useState("");
  const [grade, setGrade] = useState("Grade 2");
  const [age, setAge] = useState("7");
  const [interests, setInterests] = useState("");
  const [status, setStatus] = useState<CreatorStatus>("idle");
  const [message, setMessage] = useState("");
  const [worksheetHtml, setWorksheetHtml] = useState("");
  const previewRef = useRef<HTMLIFrameElement>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setMessage("Designing a printable workbook...");
    setWorksheetHtml("");

    try {
      const response = await fetch("/api/worksheets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          childName: nickname,
          grade,
          age,
          interests
        })
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(
          errorBody?.message ||
            "The worksheet could not be created right now. Please try again."
        );
      }

      const html = await response.text();
      setWorksheetHtml(html);

      setStatus("success");
      setMessage("Your worksheet preview is ready.");
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "The worksheet could not be created right now. Please try again."
      );
    }
  }

  function createWorksheetUrl() {
    if (!worksheetHtml) {
      return "";
    }

    return URL.createObjectURL(
      new Blob([worksheetHtml], {
        type: "text/html;charset=utf-8"
      })
    );
  }

  function openPrintablePage() {
    const url = createWorksheetUrl();

    if (!url) {
      return;
    }

    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function printWorksheet() {
    const url = createWorksheetUrl();

    if (!url) {
      return;
    }

    const printWindow = window.open(url, "_blank");
    window.setTimeout(() => {
      printWindow?.print();
      URL.revokeObjectURL(url);
    }, 800);
  }

  function downloadWorksheet() {
    const url = createWorksheetUrl();

    if (!url) {
      return;
    }

    const link = document.createElement("a");
    link.href = url;
    link.download = `paperstride-${nickname.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") || "worksheet"}.html`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <section
      className="creator-section"
      id="worksheet-creator"
      aria-labelledby="creator-title"
    >
      <div className="creator-copy">
        <p className="eyebrow">Worksheet creator</p>
        <h2 id="creator-title">Make a printable practice sheet.</h2>
        <p>
          Add a learner nickname, level, age, and a few interests. PaperStride
          creates a printable HTML workbook and answer key for offline practice.
        </p>
      </div>

      <form className="creator-form" onSubmit={handleSubmit}>
        <label>
          <span>Learner nickname</span>
          <input
            autoComplete="off"
            maxLength={40}
            name="childName"
            onChange={(event) => setNickname(event.target.value)}
            placeholder="Ava"
            required
            value={nickname}
          />
        </label>

        <div className="creator-row">
          <label>
            <span>Grade or level</span>
            <select
              name="grade"
              onChange={(event) => setGrade(event.target.value)}
              value={grade}
            >
              {gradeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Age</span>
            <select
              name="age"
              onChange={(event) => setAge(event.target.value)}
              value={age}
            >
              {ageOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label>
          <span>Interests</span>
          <textarea
            maxLength={180}
            name="interests"
            onChange={(event) => setInterests(event.target.value)}
            placeholder="space, soccer, dinosaurs, cooking, music"
            required
            rows={4}
            value={interests}
          />
        </label>

        <button className="button primary creator-submit" disabled={status === "loading"}>
          {status === "loading" ? "Creating..." : "Create workbook preview"}
        </button>

        <p className={`creator-message ${status}`} role="status">
          {message || "No student account or child email is required."}
        </p>
      </form>

      {worksheetHtml ? (
        <section className="worksheet-preview" aria-label="Generated worksheet preview">
          <div className="preview-toolbar">
            <div>
              <p className="eyebrow">Printable preview</p>
              <h3>Generated workbook</h3>
            </div>
            <div className="preview-actions">
              <button className="button secondary" type="button" onClick={openPrintablePage}>
                Open
              </button>
              <button className="button secondary" type="button" onClick={printWorksheet}>
                Print
              </button>
              <button className="button primary" type="button" onClick={downloadWorksheet}>
                Download HTML
              </button>
            </div>
          </div>
          <iframe
            ref={previewRef}
            className="preview-frame"
            sandbox=""
            srcDoc={worksheetHtml}
            title="Generated PaperStride worksheet"
          />
        </section>
      ) : null}
    </section>
  );
}
