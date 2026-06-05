import { NextRequest } from "next/server";

export const runtime = "nodejs";

type WorksheetInput = {
  childName: string;
  grade: string;
  age: number;
  interests: string;
};

type WorksheetItem = {
  question: string;
  answer: string;
};

type WorksheetSection = {
  heading: string;
  instructions: string;
  items: WorksheetItem[];
};

type Worksheet = {
  title: string;
  intro: string;
  sections: WorksheetSection[];
  encouragement: string;
};

const allowedGrades = new Set([
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
]);

const groqEndpoint = "https://api.groq.com/openai/v1/chat/completions";

export async function POST(request: NextRequest) {
  let input: WorksheetInput;

  try {
    input = await parseInput(request);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Please check the worksheet details.",
      400
    );
  }

  try {
    const worksheet = process.env.GROQ_API_KEY
      ? await createWorksheetWithGroq(input)
      : createSampleWorksheet(input);

    const pdf = createPdf(worksheet, input);

    return new Response(pdf, {
      headers: {
        "Content-Disposition": `attachment; filename="${filenameFor(input)}"`,
        "Content-Type": "application/pdf",
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    console.error("Worksheet generation failed", error);
    return jsonError(
      "The worksheet creator is busy right now. Please try again in a little bit.",
      503
    );
  }
}

async function parseInput(request: NextRequest): Promise<WorksheetInput> {
  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    throw new Error("Please enter the worksheet details.");
  }

  const childName = cleanText(String(body.childName || ""), 40);
  const grade = cleanText(String(body.grade || ""), 24);
  const interests = cleanText(String(body.interests || ""), 180);
  const age = Number(body.age);

  if (!childName) {
    throw new Error("Please add a first name or nickname.");
  }

  if (!allowedGrades.has(grade)) {
    throw new Error("Please choose a grade or level from the list.");
  }

  if (!Number.isInteger(age) || age < 3 || age > 26) {
    throw new Error("Please choose an age between 3 and 26.");
  }

  if (!interests) {
    throw new Error("Please add at least one interest.");
  }

  return {
    childName,
    grade,
    age,
    interests
  };
}

async function createWorksheetWithGroq(input: WorksheetInput): Promise<Worksheet> {
  const response = await fetch(groqEndpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
      temperature: 0.6,
      max_tokens: 1800,
      response_format: {
        type: "json_object"
      },
      messages: [
        {
          role: "system",
          content:
            "You create printable, age-appropriate worksheets. Return only valid JSON. Do not ask for or include private personal data. Use original text only, not copyrighted passages."
        },
        {
          role: "user",
          content: `Create a printable mixed practice worksheet for this learner profile:
Grade or level: ${input.grade}
Age: ${input.age}
Interest theme: ${input.interests}

Return JSON with this exact shape:
{
  "title": "short worksheet title",
  "intro": "one encouraging sentence",
  "sections": [
    {
      "heading": "section heading",
      "instructions": "short student-facing instructions",
      "items": [
        { "question": "printable question text", "answer": "answer key text" }
      ]
    }
  ],
  "encouragement": "one closing sentence"
}

Rules:
- Make 2 sections with 4 questions each.
- Include a blend of math, vocabulary, reading, reasoning, or writing that fits the level.
- Keep questions concise enough to print cleanly.
- Do not include the learner's name.
- Do not include online tasks, links, accounts, or screen activities.`
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Groq returned ${response.status}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;

  if (typeof content !== "string") {
    throw new Error("Groq response did not include worksheet content.");
  }

  return normalizeWorksheet(parseJsonContent(content));
}

function normalizeWorksheet(value: unknown): Worksheet {
  if (!value || typeof value !== "object") {
    throw new Error("Worksheet content was not valid.");
  }

  const candidate = value as Partial<Worksheet>;
  const sections = Array.isArray(candidate.sections) ? candidate.sections : [];

  const worksheet: Worksheet = {
    title: cleanText(String(candidate.title || "PaperStride Practice"), 90),
    intro: cleanText(String(candidate.intro || "Take your time and show your thinking."), 220),
    sections: sections.slice(0, 4).map((section) => ({
      heading: cleanText(String(section.heading || "Practice"), 70),
      instructions: cleanText(
        String(section.instructions || "Read each question and write your answer."),
        180
      ),
      items: Array.isArray(section.items)
        ? section.items.slice(0, 8).map((item) => ({
            question: cleanText(String(item.question || ""), 260),
            answer: cleanText(String(item.answer || ""), 220)
          }))
        : []
    })),
    encouragement: cleanText(
      String(candidate.encouragement || "Great practice starts with one steady step."),
      180
    )
  };

  worksheet.sections = worksheet.sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => item.question && item.answer)
    }))
    .filter((section) => section.heading && section.items.length > 0);

  if (worksheet.sections.length === 0) {
    throw new Error("Worksheet content did not include usable questions.");
  }

  return worksheet;
}

function createSampleWorksheet(input: WorksheetInput): Worksheet {
  const theme = input.interests.split(",")[0]?.trim() || "favorite topics";

  return {
    title: `${themeTitle(theme)} Practice Sampler`,
    intro: `A short printable practice sheet for ${input.grade}.`,
    sections: [
      {
        heading: "Number Thinking",
        instructions: "Solve each problem. Show your work when it helps.",
        items: [
          {
            question: `If ${theme} stickers come in 4 packs with 6 stickers each, how many stickers are there altogether?`,
            answer: "24 stickers"
          },
          {
            question: "Write the next three numbers: 8, 12, 16, __, __, __.",
            answer: "20, 24, 28"
          },
          {
            question: "Round 347 to the nearest ten.",
            answer: "350"
          },
          {
            question: "A worksheet has 18 questions. If 9 are done, how many are left?",
            answer: "9 questions"
          }
        ]
      },
      {
        heading: "Words and Ideas",
        instructions: "Read each prompt and write a complete answer.",
        items: [
          {
            question: `Write one sentence that uses the word "${theme}" and an adjective.`,
            answer: "Answers will vary; the sentence should include the theme and one describing word."
          },
          {
            question: "Circle the word that means almost the same as brave: quick, calm, courageous, tiny.",
            answer: "courageous"
          },
          {
            question: `Name two details you might include in a short story about ${theme}.`,
            answer: "Answers will vary; any two relevant details are acceptable."
          },
          {
            question: "Write a question you would ask to learn more about this topic.",
            answer: "Answers will vary; it should be written as a question."
          }
        ]
      }
    ],
    encouragement: "Nice work. Check your answers, then choose one question to explain out loud."
  };
}

function parseJsonContent(content: string): unknown {
  const trimmed = content.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");

    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }

    throw new Error("Worksheet content was not valid JSON.");
  }
}

function createPdf(worksheet: Worksheet, input: WorksheetInput): Buffer {
  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 54;
  const footerY = 34;
  const pages: string[][] = [[]];
  let pageNumber = 1;
  let y = pageHeight - margin;

  function addPage() {
    pageNumber += 1;
    pages.push([]);
    y = pageHeight - margin;
  }

  function ensureSpace(requiredHeight: number) {
    if (y - requiredHeight < margin) {
      addFooter();
      addPage();
    }
  }

  function addFooter() {
    addTextOperation(
      pages[pages.length - 1],
      `PaperStride printable worksheet | Page ${pageNumber}`,
      margin,
      footerY,
      9,
      false
    );
  }

  function writeText(text: string, size = 11, bold = false, gap = 6, indent = 0) {
    const width = pageWidth - margin * 2 - indent;
    const lines = wrapText(text, Math.max(22, Math.floor(width / (size * 0.5))));
    const lineHeight = size * 1.38;
    ensureSpace(lines.length * lineHeight + gap);

    for (const line of lines) {
      addTextOperation(pages[pages.length - 1], line, margin + indent, y, size, bold);
      y -= lineHeight;
    }

    y -= gap;
  }

  writeText(worksheet.title, 20, true, 10);
  writeText(`Prepared for ${input.childName} | ${input.grade} | Age ${input.age}`, 10, false, 12);
  writeText(worksheet.intro, 11, false, 14);

  worksheet.sections.forEach((section, sectionIndex) => {
    writeText(`${sectionIndex + 1}. ${section.heading}`, 15, true, 5);
    writeText(section.instructions, 10, false, 8);

    section.items.forEach((item, itemIndex) => {
      writeText(`${itemIndex + 1}. ${item.question}`, 11, false, 8);
      writeText("Answer: ________________________________________________", 10, false, 12, 16);
    });
  });

  writeText(worksheet.encouragement, 11, true, 16);
  writeText("Answer Key", 16, true, 8);

  worksheet.sections.forEach((section, sectionIndex) => {
    writeText(`${sectionIndex + 1}. ${section.heading}`, 12, true, 4);
    section.items.forEach((item, itemIndex) => {
      writeText(`${itemIndex + 1}. ${item.answer}`, 10, false, 4, 14);
    });
  });

  addFooter();

  return buildPdfDocument(pages, pageWidth, pageHeight);
}

function buildPdfDocument(pages: string[][], pageWidth: number, pageHeight: number): Buffer {
  const objects: string[] = [];
  const pageObjectIds: number[] = [];

  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("PAGES_PLACEHOLDER");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

  pages.forEach((operations) => {
    const content = `${operations.join("\n")}\n`;
    const contentObjectId = objects.length + 1;
    objects.push(`<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}endstream`);

    const pageObjectId = objects.length + 1;
    pageObjectIds.push(pageObjectId);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjectId} 0 R >>`);
  });

  objects[1] =
    `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageObjectIds.length} >>`;

  const chunks = ["%PDF-1.4\n"];
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets[index + 1] = Buffer.byteLength(chunks.join(""), "utf8");
    chunks.push(`${index + 1} 0 obj\n${object}\nendobj\n`);
  });

  const xrefOffset = Buffer.byteLength(chunks.join(""), "utf8");
  chunks.push(`xref\n0 ${objects.length + 1}\n`);
  chunks.push("0000000000 65535 f \n");

  for (let index = 1; index <= objects.length; index += 1) {
    chunks.push(`${offsets[index].toString().padStart(10, "0")} 00000 n \n`);
  }

  chunks.push(
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  );

  return Buffer.from(chunks.join(""), "utf8");
}

function addTextOperation(
  operations: string[],
  text: string,
  x: number,
  y: number,
  size: number,
  bold: boolean
) {
  operations.push(
    `BT /${bold ? "F2" : "F1"} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${escapePdf(text)}) Tj ET`
  );
}

function wrapText(text: string, maxCharacters: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (word.length > maxCharacters) {
      if (current) {
        lines.push(current);
        current = "";
      }
      lines.push(word.slice(0, maxCharacters));
      continue;
    }

    const next = current ? `${current} ${word}` : word;
    if (next.length > maxCharacters && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.length ? lines : [""];
}

function cleanText(value: string, maxLength: number): string {
  return value
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function escapePdf(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function filenameFor(input: WorksheetInput): string {
  const name = input.childName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `paperstride-${name || "worksheet"}.pdf`;
}

function themeTitle(theme: string): string {
  return theme
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function jsonError(message: string, status: number) {
  return Response.json(
    {
      message
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
