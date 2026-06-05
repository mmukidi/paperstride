"use client";

import { FormEvent, useState } from "react";

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setMessage("Preparing a printable worksheet...");

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

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "paperstride-worksheet.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setStatus("success");
      setMessage("Your worksheet PDF is ready.");
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "The worksheet could not be created right now. Please try again."
      );
    }
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
          creates a simple PDF worksheet and answer key for offline practice.
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
          {status === "loading" ? "Creating..." : "Create printable PDF"}
        </button>

        <p className={`creator-message ${status}`} role="status">
          {message || "No student account or child email is required."}
        </p>
      </form>
    </section>
  );
}
