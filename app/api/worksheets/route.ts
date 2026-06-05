import { NextRequest } from "next/server";

export const runtime = "nodejs";

type WorksheetInput = {
  childName: string;
  grade: string;
  age: number;
  interests: string;
};

type LearningBlueprint = {
  curriculumPath: string;
  gradeExpectations: string;
  pageTarget: string;
  questionCount: number;
  subjectMix: string[];
  cognitiveSkills: string[];
  motivationStrategy: string;
  challengeLevel: string;
  visualPlan: string[];
  questionFormats: string[];
  answerExpectations: string;
  vocabularyPlan: string;
  testReadinessPlan: string;
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
    const html = process.env.GROQ_API_KEY
      ? await createHtmlWorksheetWithGroq(input)
      : createSampleHtmlWorksheet(input, defaultBlueprint(input));

    return new Response(html, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `inline; filename="${filenameFor(input)}"`,
        "Content-Type": "text/html; charset=utf-8"
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
    throw new Error("Please add a nickname.");
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

async function createHtmlWorksheetWithGroq(input: WorksheetInput): Promise<string> {
  const blueprint = await createLearningBlueprint(input);
  const rawHtml = await createWorksheetHtml(input, blueprint);
  const validated = validateStaticHtml(rawHtml);

  if (validated.ok) {
    return injectNickname(validated.html, input.childName);
  }

  const repairedHtml = await repairWorksheetHtml(input, blueprint, rawHtml, validated.reason);
  const repaired = validateStaticHtml(repairedHtml);

  if (!repaired.ok) {
    throw new Error(`Generated HTML failed validation: ${repaired.reason}`);
  }

  return injectNickname(repaired.html, input.childName);
}

async function createLearningBlueprint(input: WorksheetInput): Promise<LearningBlueprint> {
  const content = await groqChat({
    temperature: 0.35,
    maxTokens: 1800,
    responseFormat: "json_object",
    messages: [
      {
        role: "system",
        content:
          "You are an expert curriculum designer combining teacher practice, child development, learning psychology, test readiness, and printable worksheet design. Return only valid JSON. Do not request or include personal data."
      },
      {
        role: "user",
        content: `Create a learning blueprint for a mixed-subject printable workbook.

Learner details:
- Grade or level: ${input.grade}
- Age: ${input.age}
- Interest themes: ${input.interests}

Infer a sensible general curriculum path. Decide the workbook length, question count, subject mix, cognitive skills, motivation strategy, visual plan, and answer expectations.

Return JSON with this exact shape:
{
  "curriculumPath": "short inferred curriculum direction",
  "gradeExpectations": "what a learner at this age/grade should practice",
  "pageTarget": "recommended page target, such as 2-4 A4 pages",
  "questionCount": 10,
  "subjectMix": ["ELA reading comprehension", "Vocabulary", "Math reasoning"],
  "cognitiveSkills": ["analytical thinking", "pattern recognition"],
  "motivationStrategy": "how to make this learner excited, challenged, and confident",
  "challengeLevel": "gentle | balanced | stretch | advanced",
  "visualPlan": ["small SVG line-art", "puzzle grid"],
  "questionFormats": ["mission cards", "evidence hunt"],
  "answerExpectations": "what answer sheet details must include",
  "vocabularyPlan": "how hard words, definitions, examples, and memory hints should work",
  "testReadinessPlan": "age-appropriate SAT-ready or future test skill plan"
}

Rules:
- Pre-K/K should be short, playful, visual, and concrete.
- Grades 1-5 should build reading, vocabulary, number sense, logic, and confidence.
- Grades 6-8 should include evidence, strategy, multi-step reasoning, and clearer explanations.
- Grades 9-12 should include more direct SAT-style reading, math reasoning, evidence, traps, and elimination.
- The question count and page target must fit the grade and age.
- Do not include the learner nickname or any private data.`
      }
    ]
  });

  return normalizeBlueprint(parseJsonContent(content), input);
}

async function createWorksheetHtml(
  input: WorksheetInput,
  blueprint: LearningBlueprint
): Promise<string> {
  return groqChat({
    temperature: 0.48,
    maxTokens: 7800,
    messages: [
      {
        role: "system",
        content:
          "You create high-quality printable educational HTML workbooks. Return only one complete HTML document. No Markdown, no commentary, no code fences. Do not include scripts, external URLs, external assets, iframes, forms, or event handlers."
      },
      {
        role: "user",
        content: buildHtmlPrompt(input, blueprint)
      }
    ]
  });
}

async function repairWorksheetHtml(
  input: WorksheetInput,
  blueprint: LearningBlueprint,
  html: string,
  reason: string
): Promise<string> {
  return groqChat({
    temperature: 0.15,
    maxTokens: 7800,
    messages: [
      {
        role: "system",
        content:
          "Repair printable worksheet HTML. Return only one complete safe HTML document. No Markdown. No scripts, external URLs, external assets, iframes, forms, or event handlers."
      },
      {
        role: "user",
        content: `The generated workbook HTML failed validation for this reason:
${reason}

Learner profile:
- Grade or level: ${input.grade}
- Age: ${input.age}
- Interest themes: ${input.interests}

Learning blueprint:
${JSON.stringify(blueprint, null, 2)}

Repair the HTML so it is a complete static printable A4 worksheet. Keep the worksheet content, answer sheet, explanations, vocabulary, strategy section, embedded CSS, and lightweight inline SVG visuals.

Unsafe HTML to repair:
${html}`
      }
    ]
  });
}

async function groqChat(options: {
  messages: Array<{ role: "system" | "user"; content: string }>;
  maxTokens: number;
  temperature: number;
  responseFormat?: "json_object";
}): Promise<string> {
  const response = await fetch(groqEndpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      ...(options.responseFormat
        ? {
            response_format: {
              type: options.responseFormat
            }
          }
        : {}),
      messages: options.messages
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Groq returned ${response.status}: ${body.slice(0, 240)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;

  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Groq response did not include worksheet content.");
  }

  return content;
}

function buildHtmlPrompt(input: WorksheetInput, blueprint: LearningBlueprint): string {
  return `Create the final PaperStride worksheet as one complete HTML document.

Learner profile:
- Grade or level: ${input.grade}
- Age: ${input.age}
- Interest themes: ${input.interests}
- Learner nickname placeholder: {{LEARNER_NICKNAME}}

Learning blueprint:
${JSON.stringify(blueprint, null, 2)}

# HTML OUTPUT REQUIREMENTS

The final worksheet must be generated as a complete HTML document.

Output must include:
- Clean HTML
- Embedded CSS in a <style> tag
- No external dependencies
- Mobile-friendly and printable
- A4 print optimized
- High-contrast, hyper-clear text
- Large readable font
- Clear headings
- Compact layout
- Low-ink print mode
- Print-friendly CSS using @media print

Use:
- White background
- Dark readable text
- Thin borders
- Light accent colors only
- No heavy background fills
- No large dark blocks
- Inline SVG line-art illustrations where useful
- Small educational icons
- Compact image placement
- Two-column layouts when possible
- Full A4 space usage
- Minimal whitespace
- Clear answer areas

# VISUAL ENGAGEMENT REQUIREMENTS

The worksheet should feel like an interactive learning magazine. Include many lightweight visuals such as small SVG line-art pictures, icons, diagrams, mini maps, timeline strips, flowcharts, pattern blocks, puzzle grids, science sketches, space graphics, sports diagrams, logic boxes, and brain teaser cards.

Images must be low ink, simple, educational, relevant, printable, and mostly outline-style. Use inline SVG only.

# SUBJECT MIX REQUIREMENT

The worksheet should combine multiple subjects into one workbook based on the blueprint:
- ELA reading comprehension
- Vocabulary
- Grammar
- Writing
- Math reasoning
- Science
- Social studies/history
- Logic
- Pattern recognition
- Puzzle solving
- Critical thinking
- Real-world problem solving

# QUESTION STYLE REQUIREMENTS

Ask questions in fun and interesting ways. Use formats like detective challenge, mission cards, evidence hunt, choose the best answer, explain your thinking, spot the pattern, decode the message, solve the mystery, compare two ideas, find the hidden clue, build an argument, vocabulary power-up, math logic mission, science investigation, history decision point, and brain battle challenge.

# TEST READINESS REQUIREMENTS

Build age-appropriate test-ready skills:
- Reading evidence carefully
- Finding main idea
- Understanding tone
- Vocabulary in context
- Eliminating wrong answers
- Identifying trap answers
- Comparing claims
- Interpreting graphs and charts
- Solving multi-step word problems
- Pattern recognition
- Logical reasoning
- Writing clear explanations

For younger learners, frame this as "future test skill" thinking in kid-friendly language. For high school learners, use more direct SAT-style questions.

# READING AND VOCABULARY REQUIREMENTS

If reading comprehension is included:
- Use an original passage only
- Include comprehension questions
- Include hard words from the passage
- Define each hard word simply
- Give a child-friendly example sentence
- Add a memory hint or quick trick for remembering the word

# ANSWER SHEET REQUIREMENTS

At the end, include a full answer sheet. For every question include:
- Correct answer
- Explanation
- Why that answer is right
- Why common wrong answers are wrong when relevant
- Skill being tested
- Tip or trick to solve faster next time

# STRATEGY SECTION

Include a final section called "Smart Test Strategies & SAT Power Tips". Scale the language to the learner age and include:
- How to annotate passages
- How to find evidence
- How to eliminate wrong answers
- How to manage time
- How to solve vocabulary questions
- How to attack math word problems
- How to handle confusing answer choices
- How to use process of elimination
- How to check work
- How to stay calm during tests

# SAFETY AND STATIC HTML RULES

- Return only one complete HTML file.
- Include <!doctype html>, <html>, <head>, <meta charset>, <meta name="viewport">, <style>, and <body>.
- Do not use Markdown.
- Do not use scripts.
- Do not use JavaScript.
- Do not use external URLs.
- Do not use external images.
- Do not use links.
- Do not use iframes.
- Do not use forms.
- Do not use event-handler attributes.
- Do not include the learner's real name. Use {{LEARNER_NICKNAME}} exactly where the worksheet heading needs the nickname.
- Keep the HTML ready to open in a browser and print as PDF.`;
}

function normalizeBlueprint(value: unknown, input: WorksheetInput): LearningBlueprint {
  const fallback = defaultBlueprint(input);

  if (!value || typeof value !== "object") {
    return fallback;
  }

  const candidate = value as Partial<LearningBlueprint>;
  const questionCount = Number(candidate.questionCount);

  return {
    curriculumPath: cleanText(String(candidate.curriculumPath || fallback.curriculumPath), 220),
    gradeExpectations: cleanText(
      String(candidate.gradeExpectations || fallback.gradeExpectations),
      420
    ),
    pageTarget: cleanText(String(candidate.pageTarget || fallback.pageTarget), 80),
    questionCount:
      Number.isInteger(questionCount) && questionCount >= 4 && questionCount <= 24
        ? questionCount
        : fallback.questionCount,
    subjectMix: normalizeStringList(candidate.subjectMix, fallback.subjectMix, 10),
    cognitiveSkills: normalizeStringList(candidate.cognitiveSkills, fallback.cognitiveSkills, 12),
    motivationStrategy: cleanText(
      String(candidate.motivationStrategy || fallback.motivationStrategy),
      360
    ),
    challengeLevel: cleanText(String(candidate.challengeLevel || fallback.challengeLevel), 40),
    visualPlan: normalizeStringList(candidate.visualPlan, fallback.visualPlan, 10),
    questionFormats: normalizeStringList(candidate.questionFormats, fallback.questionFormats, 10),
    answerExpectations: cleanText(
      String(candidate.answerExpectations || fallback.answerExpectations),
      360
    ),
    vocabularyPlan: cleanText(String(candidate.vocabularyPlan || fallback.vocabularyPlan), 360),
    testReadinessPlan: cleanText(
      String(candidate.testReadinessPlan || fallback.testReadinessPlan),
      360
    )
  };
}

function defaultBlueprint(input: WorksheetInput): LearningBlueprint {
  const early = input.age <= 6;
  const elementary = input.age >= 7 && input.age <= 10;
  const middle = input.age >= 11 && input.age <= 14;
  const high = input.age >= 15;

  return {
    curriculumPath: "General standards-aligned mixed practice",
    gradeExpectations: early
      ? "Practice concrete early literacy, counting, observation, patterns, fine-motor writing, and confidence."
      : elementary
        ? "Practice reading comprehension, vocabulary, number sense, evidence, writing, and logic."
        : middle
          ? "Practice multi-step reasoning, evidence, vocabulary in context, data interpretation, and clear explanations."
          : "Practice SAT-ready reading evidence, vocabulary in context, algebraic reasoning, data interpretation, and argument writing.",
    pageTarget: early ? "1-2 A4 pages" : high ? "4-6 A4 pages" : "2-4 A4 pages",
    questionCount: early ? 8 : elementary ? 10 : middle ? 14 : 16,
    subjectMix: [
      "ELA reading comprehension",
      "Vocabulary",
      "Writing",
      "Math reasoning",
      "Science",
      "Logic"
    ],
    cognitiveSkills: [
      "analytical thinking",
      "mathematical reasoning",
      "reading evidence",
      "pattern recognition",
      "critical thinking"
    ],
    motivationStrategy:
      "Use the learner's interests as a mission theme, alternate quick wins with stretch questions, and include visible progress moments.",
    challengeLevel: high || middle ? "stretch" : "balanced",
    visualPlan: ["small SVG line-art", "mission cards", "logic boxes", "pattern grids"],
    questionFormats: ["mission cards", "evidence hunt", "choose the best answer", "explain your thinking"],
    answerExpectations:
      "Include correct answers, short explanations, tested skill, common trap notes where useful, and next-time solving tips.",
    vocabularyPlan:
      "Include hard words when reading is present, with simple definitions, examples, and memory hints.",
    testReadinessPlan: high
      ? "Use direct SAT-style reading, math reasoning, elimination, evidence, and trap-answer thinking."
      : "Use future test skill language with evidence, careful reading, logic, and checking work."
  };
}

function validateStaticHtml(content: string): { ok: true; html: string } | { ok: false; reason: string } {
  const html = extractHtmlDocument(content);
  const htmlForSafetyScan = html.replace(/\s+xmlns=["']http:\/\/www\.w3\.org\/2000\/svg["']/gi, "");
  const lower = html.toLowerCase();

  const forbiddenPatterns: Array<[RegExp, string]> = [
    [/<script[\s>]/i, "script tags are not allowed"],
    [/<iframe[\s>]/i, "iframes are not allowed"],
    [/<form[\s>]/i, "forms are not allowed"],
    [/<object[\s>]/i, "object tags are not allowed"],
    [/<embed[\s>]/i, "embed tags are not allowed"],
    [/<link[\s>]/i, "external stylesheets or link tags are not allowed"],
    [/<base[\s>]/i, "base tags are not allowed"],
    [/\son[a-z]+\s*=/i, "event handler attributes are not allowed"],
    [/\b(?:src|href|action)\s*=\s*["'][^"']+["']/i, "external src/href/action attributes are not allowed"],
    [/\b(?:https?:|data:|javascript:|\/\/)/i, "external URLs and data/javascript URLs are not allowed"],
    [/@import/i, "CSS imports are not allowed"],
    [/url\s*\(/i, "CSS url() assets are not allowed"]
  ];

  if (!/^<!doctype html>/i.test(html.trim()) && !/^<html[\s>]/i.test(html.trim())) {
    return { ok: false, reason: "HTML must start with <!doctype html> or <html>" };
  }

  if (!lower.includes("<html") || !lower.includes("<head") || !lower.includes("<style") || !lower.includes("<body")) {
    return { ok: false, reason: "HTML must include html, head, style, and body elements" };
  }

  if (!lower.includes("@media print")) {
    return { ok: false, reason: "HTML must include @media print CSS" };
  }

  if (!html.includes("{{LEARNER_NICKNAME}}")) {
    return { ok: false, reason: "HTML must include the {{LEARNER_NICKNAME}} placeholder" };
  }

  for (const [pattern, reason] of forbiddenPatterns) {
    if (pattern.test(htmlForSafetyScan)) {
      return { ok: false, reason };
    }
  }

  return {
    ok: true,
    html
  };
}

function extractHtmlDocument(content: string): string {
  const trimmed = content.trim();
  const withoutFence = trimmed
    .replace(/^```(?:html)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const doctypeIndex = withoutFence.toLowerCase().indexOf("<!doctype html");
  const htmlIndex = withoutFence.toLowerCase().indexOf("<html");
  const start = doctypeIndex >= 0 ? doctypeIndex : htmlIndex;

  if (start < 0) {
    return withoutFence;
  }

  const end = withoutFence.toLowerCase().lastIndexOf("</html>");
  return end >= 0 ? withoutFence.slice(start, end + 7).trim() : withoutFence.slice(start).trim();
}

function createSampleHtmlWorksheet(input: WorksheetInput, blueprint: LearningBlueprint): string {
  const theme = escapeHtml(input.interests.split(",")[0]?.trim() || "learning");
  const nickname = escapeHtml(input.childName);
  const questionCount = blueprint.questionCount;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PaperStride ${themeTitle(theme)} Workbook</title>
<style>
  :root { color-scheme: light; --ink:#152322; --muted:#5d6966; --line:#d8ddd4; --accent:#116466; --soft:#eef5f1; --warm:#fff8e8; }
  * { box-sizing: border-box; }
  body { margin:0; background:#f4f4ef; color:var(--ink); font-family: Arial, Helvetica, sans-serif; font-size:16px; line-height:1.45; }
  .page { background:#fff; max-width: 210mm; min-height: 297mm; margin: 16px auto; padding: 12mm; border:1px solid var(--line); }
  h1, h2, h3, p { margin-top:0; }
  h1 { font-size:30px; line-height:1.05; margin-bottom:6px; }
  h2 { font-size:20px; border-bottom:2px solid var(--line); padding-bottom:4px; margin:18px 0 10px; }
  h3 { font-size:16px; margin-bottom:6px; }
  .meta, .tip { color:var(--muted); font-size:13px; }
  .hero { display:grid; grid-template-columns: 1fr 120px; gap:16px; align-items:center; border:1px solid var(--line); padding:14px; background:var(--warm); }
  .grid { display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap:10px; }
  .card, .answer { border:1px solid var(--line); border-radius:6px; padding:10px; break-inside: avoid; }
  .card { background:#fff; }
  .answer { background:#fbfbf7; }
  .label { color:var(--accent); font-size:12px; font-weight:700; text-transform:uppercase; }
  .write { min-height:34px; border-bottom:1px solid var(--ink); margin-top:8px; }
  .vocab { display:grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap:8px; }
  svg { max-width:100%; height:auto; stroke:var(--accent); fill:none; stroke-width:2; }
  @media (max-width: 720px) { .page { margin:0; min-height:auto; padding:18px; } .hero, .grid, .vocab { grid-template-columns:1fr; } }
  @media print {
    body { background:#fff; font-size:12pt; }
    .page { margin:0; border:0; min-height:297mm; padding:10mm; box-shadow:none; }
    .card, .answer, .hero { border-color:#999; }
    svg { stroke:#333; }
  }
</style>
</head>
<body>
<main class="page">
  <section class="hero">
    <div>
      <p class="label">PaperStride mixed-skills workbook</p>
      <h1>${themeTitle(theme)} Learning Mission</h1>
      <p class="meta">Prepared for ${nickname} | ${escapeHtml(input.grade)} | Age ${input.age} | ${questionCount} question target</p>
      <p>Use your interests to practice reading, vocabulary, math reasoning, science thinking, logic, and smart test habits.</p>
    </div>
    <svg viewBox="0 0 120 90" role="img" aria-label="Low ink learning icon">
      <rect x="18" y="16" width="70" height="48" rx="5"></rect>
      <path d="M28 30h50M28 42h38M28 54h46"></path>
      <circle cx="92" cy="24" r="10"></circle>
      <path d="M88 67l12 10 6-24"></path>
    </svg>
  </section>

  <h2>Mission Cards</h2>
  <section class="grid">
    <article class="card"><p class="label">Reading evidence</p><h3>1. Evidence Hunt</h3><p>Read this claim: "${theme} can teach patience." Write one detail that could support the claim.</p><div class="write"></div></article>
    <article class="card"><p class="label">Vocabulary</p><h3>2. Word Power</h3><p>Use the word <strong>strategy</strong> in a sentence about ${theme}.</p><div class="write"></div></article>
    <article class="card"><p class="label">Math reasoning</p><h3>3. Logic Mission</h3><p>A team collects 4 sets of 6 practice cards. How many cards do they have?</p><div class="write"></div></article>
    <article class="card"><p class="label">Pattern recognition</p><h3>4. Spot the Pattern</h3><p>Continue the pattern: 3, 6, 12, 24, ___, ___.</p><div class="write"></div></article>
  </section>

  <h2>Reading Lab</h2>
  <article class="card">
    <p><strong>Original passage:</strong> A learner who enjoys ${theme} can use that interest as a training ground. Good learners observe, ask questions, test ideas, and explain their thinking. When a challenge feels difficult, they slow down, search for evidence, and try one clear step at a time.</p>
    <ol>
      <li>What is the main idea of the passage?</li>
      <li>Which sentence gives advice for handling a difficult challenge?</li>
      <li>What tone does the passage have: gloomy, encouraging, silly, or angry?</li>
    </ol>
  </article>

  <h2>Vocabulary Boost</h2>
  <section class="vocab">
    <article class="card"><h3>strategy</h3><p>A plan for solving a problem.</p><p><em>Example:</em> My strategy is to read the question first.</p></article>
    <article class="card"><h3>evidence</h3><p>Details that prove or support an idea.</p><p><em>Example:</em> I found evidence in the passage.</p></article>
    <article class="card"><h3>analyze</h3><p>To study something carefully.</p><p><em>Example:</em> I analyze the chart before answering.</p></article>
  </section>

  <h2>Answer Sheet</h2>
  <section class="grid">
    <article class="answer"><h3>1. Evidence Hunt</h3><p><strong>Answer:</strong> Answers vary. A good detail explains how practice, waiting, or careful thinking connects to ${theme}.</p><p><strong>Skill:</strong> Reading evidence. <strong>Tip:</strong> Match your detail to the claim.</p></article>
    <article class="answer"><h3>2. Word Power</h3><p><strong>Answer:</strong> Any complete sentence using strategy correctly.</p><p><strong>Skill:</strong> Vocabulary in context. <strong>Tip:</strong> Check that the word makes sense in the sentence.</p></article>
    <article class="answer"><h3>3. Logic Mission</h3><p><strong>Answer:</strong> 24 cards. <strong>Why:</strong> 4 x 6 = 24.</p><p><strong>Skill:</strong> Multiplication reasoning. <strong>Tip:</strong> Turn "sets of" into multiplication.</p></article>
    <article class="answer"><h3>4. Spot the Pattern</h3><p><strong>Answer:</strong> 48, 96. <strong>Why:</strong> Each number doubles.</p><p><strong>Skill:</strong> Pattern recognition. <strong>Tip:</strong> Compare each number to the one before it.</p></article>
  </section>

  <h2>Smart Test Strategies &amp; SAT Power Tips</h2>
  <article class="card">
    <p>Underline key words, find evidence before choosing, cross out answers that do not match, manage time by skipping and returning, solve vocabulary from context, draw math word problems, check work, and take one calm breath before hard questions.</p>
  </article>
</main>
</body>
</html>`;
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

    throw new Error("Worksheet blueprint was not valid JSON.");
  }
}

function normalizeStringList(value: unknown, fallback: string[], maxItems: number): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const items = value
    .map((item) => cleanText(String(item || ""), 120))
    .filter(Boolean)
    .slice(0, maxItems);

  return items.length ? items : fallback;
}

function injectNickname(html: string, nickname: string): string {
  return html.replaceAll("{{LEARNER_NICKNAME}}", escapeHtml(nickname));
}

function cleanText(value: string, maxLength: number): string {
  return value
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function filenameFor(input: WorksheetInput): string {
  const name = input.childName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `paperstride-${name || "worksheet"}.html`;
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
