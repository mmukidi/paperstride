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
    let html: string;

    if (process.env.GROQ_API_KEY) {
      try {
        html = await createHtmlWorksheetWithGroq(input);
      } catch (error) {
        console.warn("AI worksheet generation failed; using quality fallback", error);
        html = createFallbackHtmlWorksheet(input, defaultBlueprint(input));
      }
    } else {
      html = createFallbackHtmlWorksheet(input, defaultBlueprint(input));
    }

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

  // Hard safety gate first. Unsafe or malformed HTML must never reach the learner.
  const safety = validateStaticHtml(rawHtml);

  if (safety.ok) {
    const quality = validateHtmlQuality(safety.html, input, blueprint);

    if (quality.ok) {
      return injectNickname(safety.html, input.childName);
    }

    // The AI produced a safe, on-theme worksheet that is merely shorter than our
    // ideal target. A real personalized worksheet beats a generic template, so we
    // keep it as long as it is structurally complete (passage, questions, answers,
    // vocabulary). Discarding it for length is what produced the generic fallback.
    if (aiOutputIsKeepable(safety.html, input, blueprint)) {
      console.warn("AI worksheet below ideal target but structurally complete; keeping it", quality.reason);
      return injectNickname(safety.html, input.childName);
    }

    console.warn("AI worksheet too thin to keep; attempting one repair", quality.reason);
  } else {
    console.warn("AI worksheet failed safety/structure validation; attempting one repair", safety.reason);
  }

  const reason = safety.ok ? "Workbook was structurally incomplete or far too thin." : safety.reason;

  let repairedHtml: string;

  try {
    repairedHtml = await repairWorksheetHtml(input, blueprint, rawHtml, reason);
  } catch (error) {
    console.warn("Worksheet repair failed; using quality fallback", error);
    return createFallbackHtmlWorksheet(input, blueprint);
  }

  const repairedSafety = validateStaticHtml(repairedHtml);

  if (repairedSafety.ok && aiOutputIsKeepable(repairedSafety.html, input, blueprint)) {
    return injectNickname(repairedSafety.html, input.childName);
  }

  console.warn("Repaired worksheet still unusable; using quality fallback");
  return createFallbackHtmlWorksheet(input, blueprint);
}

// A worksheet is "keepable" when it is structurally complete, even if it is shorter
// than the aspirational quality target. We require the core sections to exist at
// roughly 60% of the ideal thresholds, with sensible absolute floors.
function aiOutputIsKeepable(
  html: string,
  input: WorksheetInput,
  blueprint: LearningBlueprint
): boolean {
  const profile = qualityProfileFor(input);
  const targetQuestionCount = Math.min(
    24,
    Math.max(profile.minQuestions, Math.floor(blueprint.questionCount || 0))
  );
  const keepRatio = 0.6;
  const studentText = stripHtml(html).split(/answer sheet/i)[0] || "";

  return (
    html.length >= Math.max(6000, Math.floor(profile.minHtmlCharacters * keepRatio)) &&
    wordCount(studentText) >= Math.floor(profile.minStudentWords * keepRatio) &&
    countRequiredMarker(html, "data-question") >= Math.max(6, Math.floor(targetQuestionCount * keepRatio)) &&
    countRequiredMarker(html, "data-answer") >= Math.max(5, Math.floor(targetQuestionCount * keepRatio)) &&
    countRequiredMarker(html, "data-vocab") >= Math.max(3, Math.floor(profile.minVocabularyCards * keepRatio)) &&
    wordCount(extractMarkedText(html, "data-reading-passage")) >= Math.floor(profile.minReadingWords * keepRatio)
  );
}

async function createLearningBlueprint(input: WorksheetInput): Promise<LearningBlueprint> {
  const content = await groqChat({
    temperature: 0.35,
    maxTokens: 900,
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

Infer a sensible general curriculum path. Decide the workbook length, question count, subject mix, cognitive skills, motivation strategy, visual plan, reading depth, and answer expectations. This must be a substantial workbook, not a short quiz.

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
- Grades 9-12 should include direct SAT-style reading, math reasoning, evidence, traps, elimination, chart/data interpretation, and written explanation.
- Minimum question counts by band: Pre-K/K 8, Grades 1-2 10, Grades 3-5 12, Grades 6-8 16, Grades 9-12 18.
- Reading depth by band: Pre-K/K picture-supported mini passage, Grades 1-2 at least 150 words, Grades 3-5 at least 250 words, Grades 6-8 at least 400 words, Grades 9-12 at least 600 words across one or two original passages.
- The page target must fit the grade and age: 1-2 pages for early learners, 3-5 pages for elementary, 5-7 pages for middle school, 6-9 pages for high school.
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
    maxTokens: 5000,
    messages: [
      {
        role: "system",
        content:
          "You create rigorous, grade-appropriate printable educational HTML workbooks. Return only one complete HTML document. No Markdown, no commentary, no code fences. Do not include scripts, external URLs, external assets, iframes, forms, or event handlers. Never create a shallow quiz. Prioritize reading depth, grade-level challenge, answer explanations, and correct answer choices over decoration. Multiple-choice answers must include the correct answer exactly; never say the closest option is correct."
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
  _html: string,
  reason: string
): Promise<string> {
  return groqChat({
    temperature: 0.15,
    maxTokens: 5000,
    messages: [
      {
        role: "system",
        content:
          "Repair printable worksheet HTML by regenerating a full rigorous workbook from scratch. Return only one complete safe HTML document. No Markdown. No scripts, external URLs, external assets, iframes, forms, or event handlers. Include embedded CSS with @media print."
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

${qualityRequirementText(input, blueprint)}

# NON-NEGOTIABLE QUALITY FLOOR

This must be a substantial workbook, not a short sample quiz. Follow the blueprint question count, and never produce fewer than these minimums:
- Pre-K/Kindergarten: 8 questions, at least 3 sections, at least 3 vocabulary/picture-word items.
- Grades 1-2: 10 questions, at least 4 sections, at least 150 words of original reading passage text, at least 4 vocabulary words.
- Grades 3-5: 12 questions, at least 5 sections, at least 250 words of original reading passage text, at least 5 vocabulary words.
- Grades 6-8: 16 questions, at least 6 sections, at least 400 words of original reading passage text, at least 6 vocabulary words.
- Grades 9-12: 18 questions, at least 7 sections, at least 600 words of original reading passage text across one or two passages, at least 8 vocabulary words, direct SAT-style questions.

Required workbook sections:
- Cover/header with learner placeholder {{LEARNER_NICKNAME}}, grade, age, interests, and workbook mission.
- Reading comprehension with original passage text.
- Vocabulary in context with definitions, examples, and memory hooks.
- Grammar or writing.
- Math reasoning with multi-step problems.
- Science or social studies/history.
- Logic, pattern, chart, or data interpretation.
- Full answer sheet.
- Smart Test Strategies & SAT Power Tips.

Required HTML markers for validation:
- Add data-reading-passage="true" to each original reading passage container.
- Add data-question="true" to every question/activity container.
- Add data-answer="true" to every answer sheet item.
- Add data-vocab="true" to every vocabulary word card.

Generate a fresh replacement HTML workbook from scratch. It must be complete, rigorous, static, printable, and satisfy every minimum. Include the answer sheet, explanations, vocabulary, strategy section, embedded CSS, required data markers, and lightweight inline SVG visuals. Do not merely fix syntax; fix thin content, missing reading depth, missing answer details, and missing required markers.`
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
  let lastError = "";

  for (let attempt = 0; attempt < 2; attempt += 1) {
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

    if (response.status === 429 && attempt === 0) {
      lastError = await response.text().catch(() => "");
      const waitMs = retryDelayMs(lastError);
      console.warn(`Groq rate limited worksheet generation; retrying in ${waitMs}ms`);
      await sleep(waitMs);
      continue;
    }

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

  throw new Error(`Groq rate limit did not clear: ${lastError.slice(0, 240)}`);
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

${qualityRequirementText(input, blueprint)}

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
- Make the passage challenging for the grade, with enough length and complexity to support real comprehension questions
- Include questions about main idea, evidence, inference, vocabulary in context, author's purpose/tone, and comparing ideas when grade-appropriate
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

For every multiple-choice question:
- Provide exactly one correct option.
- The correct answer must appear as one of the visible answer choices.
- Wrong options should be plausible but clearly wrong after careful reasoning.
- Do not write "closest answer"; if no option is correct, rewrite the choices.

For high school learners:
- Include direct SAT-style evidence questions, vocabulary-in-context questions, trap-answer elimination notes, chart/data interpretation, and multi-step word problems.

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

function qualityRequirementText(input: WorksheetInput, blueprint: LearningBlueprint): string {
  const profile = qualityProfileFor(input);
  const targetQuestionCount = Math.min(
    24,
    Math.max(profile.minQuestions, Math.floor(blueprint.questionCount || 0))
  );

  return `# REQUIRED QUALITY TARGET FOR THIS LEARNER

- Minimum HTML size: ${profile.minHtmlCharacters} characters.
- Minimum student-facing words before the answer sheet: ${profile.minStudentWords}.
- Minimum reading passage words in data-reading-passage containers: ${profile.minReadingWords}.
- Minimum marked questions: ${targetQuestionCount}, each with data-question="true".
- Minimum marked answer explanations: ${targetQuestionCount}, each with data-answer="true".
- Minimum vocabulary cards: ${profile.minVocabularyCards}, each with data-vocab="true".
- Required rigor signals: ${profile.requiredTerms.join(", ")}.

Required structure:
1. Cover mission using {{LEARNER_NICKNAME}}.
2. Reading Comprehension with one or two substantial original passages marked data-reading-passage="true".
3. SAT or future-test evidence questions, inference questions, vocabulary-in-context questions, and trap-answer elimination practice scaled to age.
4. Vocabulary in Context cards with definition, example sentence, and memory hint.
5. Grammar or writing practice.
6. Math Reasoning with multi-step problems and exact answer choices.
7. Science, social studies/history, or chart/data interpretation.
8. Logic, pattern recognition, or strategy puzzle.
9. Full Answer Sheet with correct answer, explanation, why common wrong or trap answers are wrong, skill being tested, and a tip.
10. Smart Test Strategies & SAT Power Tips.

Do not stop after a small sample. If the response is getting long, reduce decoration first, but keep the full reading passage, all questions, all vocabulary cards, and the full answer sheet.`;
}

function createFallbackHtmlWorksheet(input: WorksheetInput, blueprint: LearningBlueprint): string {
  return injectNickname(createSampleHtmlWorksheet(input, blueprint), input.childName);
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
    pageTarget: early ? "1-2 A4 pages" : high ? "6-9 A4 pages" : middle ? "5-7 A4 pages" : "3-5 A4 pages",
    questionCount: early ? 8 : elementary ? 12 : middle ? 16 : 18,
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
  const htmlForSafetyScan = html.replace(
    /\s+xmlns(?::[a-z0-9_-]+)?=["']https?:\/\/www\.w3\.org\/[^"']+["']/gi,
    ""
  );
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

function validateHtmlQuality(
  html: string,
  input: WorksheetInput,
  blueprint: LearningBlueprint
): { ok: true } | { ok: false; reason: string } {
  const profile = qualityProfileFor(input);
  const plainText = stripHtml(html);
  const lower = plainText.toLowerCase();
  const normalizedLower = lower.replace(/[-–—]/g, " ");
  const studentText = plainText.split(/answer sheet/i)[0] || plainText;
  const readingText = extractMarkedText(html, "data-reading-passage");
  const questionCount = countRequiredMarker(html, "data-question");
  const answerCount = countRequiredMarker(html, "data-answer");
  const vocabCount = countRequiredMarker(html, "data-vocab");
  const targetQuestionCount = Math.min(
    24,
    Math.max(profile.minQuestions, Math.floor(blueprint.questionCount || 0))
  );

  if (html.length < profile.minHtmlCharacters) {
    return {
      ok: false,
      reason: `Workbook is too short (${html.length} HTML characters). Minimum for ${input.grade}/age ${input.age}: ${profile.minHtmlCharacters}. Expand sections, reading, questions, visuals, and answer explanations.`
    };
  }

  if (wordCount(studentText) < profile.minStudentWords) {
    return {
      ok: false,
      reason: `Student-facing workbook content is too thin (${wordCount(studentText)} words before answer sheet). Minimum: ${profile.minStudentWords}.`
    };
  }

  if (questionCount < targetQuestionCount) {
    return {
      ok: false,
      reason: `Too few marked questions (${questionCount}). Add data-question="true" to every question and include at least ${targetQuestionCount} grade-appropriate questions.`
    };
  }

  if (answerCount < targetQuestionCount) {
    return {
      ok: false,
      reason: `Too few marked answer explanations (${answerCount}). Add data-answer="true" to each answer-sheet item and include at least ${targetQuestionCount}.`
    };
  }

  if (vocabCount < profile.minVocabularyCards) {
    return {
      ok: false,
      reason: `Too few vocabulary cards (${vocabCount}). Add at least ${profile.minVocabularyCards} data-vocab="true" cards with definition, example, and memory hint.`
    };
  }

  if (wordCount(readingText) < profile.minReadingWords) {
    return {
      ok: false,
      reason: `Reading passage is too short (${wordCount(readingText)} words). Minimum: ${profile.minReadingWords} words in containers marked data-reading-passage="true".`
    };
  }

  for (const required of profile.requiredTerms) {
    if (!normalizedLower.includes(required)) {
      return {
        ok: false,
        reason: `Workbook is missing required rigor signal: "${required}". Add this content in a grade-appropriate way.`
      };
    }
  }

  if (!/common wrong|wrong answer|trap answer|why .* wrong/i.test(plainText)) {
    return {
      ok: false,
      reason:
        "Answer sheet must explain common wrong answers or trap answers, not only the correct answer."
    };
  }

  if (!/skill being tested|tested skill|skill:/i.test(plainText)) {
    return {
      ok: false,
      reason: "Answer sheet must label the skill being tested for each question."
    };
  }

  if (!/tip|trick|faster next time|next time/i.test(plainText)) {
    return {
      ok: false,
      reason: "Answer sheet must include a tip or trick for solving faster next time."
    };
  }

  return { ok: true };
}

function qualityProfileFor(input: WorksheetInput) {
  if (input.age <= 6 || input.grade === "Pre-K" || input.grade === "Kindergarten") {
    return {
      minHtmlCharacters: 7000,
      minStudentWords: 450,
      minQuestions: 8,
      minReadingWords: 60,
      minVocabularyCards: 3,
      requiredTerms: ["answer sheet", "smart test strategies"]
    };
  }

  if (input.age <= 10) {
    return {
      minHtmlCharacters: 10000,
      minStudentWords: 700,
      minQuestions: input.age <= 8 ? 10 : 12,
      minReadingWords: input.age <= 8 ? 130 : 200,
      minVocabularyCards: input.age <= 8 ? 4 : 5,
      requiredTerms: ["reading comprehension", "vocabulary", "math reasoning", "answer sheet"]
    };
  }

  if (input.age <= 14) {
    return {
      minHtmlCharacters: 13000,
      minStudentWords: 950,
      minQuestions: 16,
      minReadingWords: 320,
      minVocabularyCards: 6,
      requiredTerms: [
        "reading comprehension",
        "vocabulary",
        "math reasoning",
        "logic",
        "answer sheet",
        "smart test strategies"
      ]
    };
  }

  return {
    minHtmlCharacters: 17000,
    minStudentWords: 1300,
    minQuestions: 18,
    minReadingWords: 480,
    minVocabularyCards: 8,
    requiredTerms: [
      "sat",
      "reading comprehension",
      "vocabulary in context",
      "evidence",
      "trap answer",
      "math reasoning",
      "answer sheet",
      "smart test strategies"
    ]
  };
}

function countRequiredMarker(html: string, marker: string): number {
  return (html.match(new RegExp(`${marker}=["']true["']`, "gi")) || []).length;
}

function extractMarkedText(html: string, marker: string): string {
  const chunks: string[] = [];
  const pattern = new RegExp(
    `<([a-z0-9]+)[^>]*${marker}=["']true["'][^>]*>([\\s\\S]*?)<\\/\\1>`,
    "gi"
  );
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    chunks.push(stripHtml(match[2]));
  }

  return chunks.join(" ");
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter((word) => /[A-Za-z0-9]/.test(word)).length;
}

function retryDelayMs(errorText: string): number {
  const match = errorText.match(/try again in\s+([0-9.]+)\s*([sm]?)/i);

  if (!match) {
    return 7000;
  }

  const amount = Number(match[1]);
  const unit = match[2]?.toLowerCase();
  const milliseconds = unit === "m" ? amount * 60_000 : amount * 1000;

  if (!Number.isFinite(milliseconds)) {
    return 7000;
  }

  return Math.min(35_000, Math.max(2500, Math.ceil(milliseconds + 750)));
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
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
  const allInterests = escapeHtml(input.interests);
  const grade = escapeHtml(input.grade);
  const high = input.age >= 15 || ["Grade 9", "Grade 10", "Grade 11", "Grade 12", "College", "Master's"].includes(input.grade);
  const middle = !high && input.age >= 11;
  const profile = qualityProfileFor(input);
  const targetQuestionCount = Math.max(profile.minQuestions, blueprint.questionCount || profile.minQuestions);
  const isSpaceTheme = !high && !middle && theme.toLowerCase().includes("space");
  const answerContext = { high, isSpace: isSpaceTheme };
  const passage = high
    ? highSchoolFallbackPassage(theme)
    : middle
      ? middleSchoolFallbackPassage(theme, allInterests)
      : elementaryFallbackPassage(theme, allInterests);
  const readingQuestions = high
    ? [
        "Which statement best captures the central claim of the passage?",
        "Which sentence from the passage gives the strongest evidence that technology can support judgment without replacing it?",
        "In paragraph 3, the word disciplined most nearly means which of the following?",
        "The author mentions basketball primarily to illustrate which idea about strategy?",
        "Which answer choice is a trap answer because it is true in general but not supported by the passage?",
        "How does the final paragraph refine the argument made earlier in the passage?"
      ]
    : [
        `What is the main idea of the ${theme} research passage?`,
        "Which detail from the passage best shows that evidence matters?",
        "What does the word prototype mean as it is used in the passage?",
        `How do the learner's interests help the ${theme} mission?`,
        "What should the team do after a test does not work the first time?"
      ];
  const vocabWords = high
    ? [
        ["calibrate", "to adjust carefully so something works accurately", "Before the tournament, the team calibrates its shot tracker.", "Calibrate sounds like calculate and balance."],
        ["constraint", "a limit that shapes what choices are possible", "A time limit is a constraint during a test.", "A constraint constrains, or holds in, your options."],
        ["inference", "a conclusion based on clues, not a sentence copied directly", "She made an inference from the data table.", "Infer means figure out from evidence."],
        ["discipline", "steady control that helps someone keep improving", "Daily review builds discipline.", "Discipline is practice plus self-control."],
        ["plausible", "reasonable or believable at first", "A plausible answer can still be wrong if the evidence does not support it.", "Pause at plausible choices and check evidence."],
        ["synthesis", "combining ideas to form a stronger understanding", "The essay used synthesis by connecting history and technology.", "Synthesis means ideas are stitched together."],
        ["evaluate", "to judge the quality or value of something", "Evaluate each answer choice before picking.", "Evaluate means give it a value."],
        ["bias", "a preference that can make judgment less fair or accurate", "The graph may reveal bias in which data was collected.", "Bias bends judgment in one direction."]
      ]
    : [
        ["strategy", "a plan for solving a problem", "My strategy is to underline clues first.", "A strategy is your study plan."],
        ["evidence", "details that support an answer", "I found evidence in the passage.", "Evidence is the proof."],
        ["observe", "to look carefully", "Scientists observe before they explain.", "Observe means look closely."],
        ["compare", "to tell how things are alike and different", "Compare the two patterns.", "Compare means check side by side."],
        ["predict", "to make a smart guess using clues", "Predict the next number.", "Predict means think ahead."]
      ];
  const mathQuestions = high
    ? [
        "A training app shows that a player made 42 of 60 shots in week one and improved the success rate by 15 percentage points in week two. What was the week two success rate?",
        "A robotics club has a fixed budget of $360. Sensors cost $18 each and practice field panels cost $24 each. If the club buys 8 sensors, how many panels can it buy with the remaining budget?",
        "The function f(x) = 3x + 7 models points earned after x completed missions. If f(x) = 52, what is x?",
        "A data table shows study time rising from 20 to 50 minutes while accuracy rises from 68 percent to 83 percent. What is the average accuracy gain per 10 minutes?"
      ]
    : [
        "A club makes 4 sets of 6 cards. How many cards are there?",
        "A pattern goes 3, 6, 12, 24. What are the next two numbers?",
        "A learner reads 12 pages on Monday and 15 pages on Tuesday. How many pages is that in all?",
        "There are 30 minutes for 5 equal missions. How many minutes can each mission take?"
      ];
  const thinkingQuestions = high
    ? [
        "A chart shows two study plans. Plan A has higher average scores, but Plan B has steadier scores. Which plan would you recommend before a high-stakes test, and why?",
        "A historian argues that one invention changed a city more than any leader did. What evidence would make that claim stronger?",
        "Decode the rule: 2, 5, 11, 23, 47. What comes next, and what is the rule?",
        "Write a two-sentence argument explaining how an interest in " + theme + " can build academic persistence."
      ]
    : [
        "Look at this rule: add 3 each time. Continue 5, 8, 11, __, __.",
        "Choose the better evidence: a detail from the passage or a guess from memory. Explain why.",
        "Draw a tiny diagram that shows the problem before you solve it.",
        "Write one sentence about how " + theme + " can help someone practice."
      ];
  const allQuestions = [
    ...readingQuestions.map((text, index) => ({ section: "Reading Comprehension", text, number: index + 1 })),
    ...vocabWords.slice(0, Math.min(vocabWords.length, high ? 8 : 5)).map((word, index) => ({
      section: "Vocabulary in Context",
      text: `Use ${word[0]} in a precise sentence connected to ${theme}, then explain which clue helped you understand it.`,
      number: readingQuestions.length + index + 1
    })),
    ...mathQuestions.map((text, index) => ({
      section: "Math Reasoning",
      text,
      number: readingQuestions.length + vocabWords.length + index + 1
    })),
    ...thinkingQuestions.map((text, index) => ({
      section: "Logic and Real-World Thinking",
      text,
      number: readingQuestions.length + vocabWords.length + mathQuestions.length + index + 1
    }))
  ].slice(0, Math.max(targetQuestionCount, high ? 22 : middle ? 18 : 12));

  const stretchPrompts = [
    `Explain one way ${theme} can build careful reading and evidence habits.`,
    `Write a short plan to get better at ${theme} using practice and feedback.`,
    `Compare two strategies a ${theme} learner could use, and say which is stronger and why.`,
    `Describe one mistake a ${theme} learner might make, and how to fix it using evidence.`,
    `Set one measurable ${theme} goal and explain how you would check progress with numbers.`
  ];
  while (allQuestions.length < targetQuestionCount) {
    allQuestions.push({
      section: "Stretch Challenge",
      text: stretchPrompts[allQuestions.length % stretchPrompts.length],
      number: allQuestions.length + 1
    });
  }

  const studentQuestionCards = allQuestions
    .map(
      (question) => `<article class="card question" data-question="true">
        <p class="label">Q${question.number} | ${escapeHtml(question.section)}</p>
        <h3>${escapeHtml(question.text)}</h3>
        ${fallbackChoiceLine(question)}
        <div class="write"></div>
        <p class="hint">${escapeHtml(questionHintFor(question))}</p>
      </article>`
    )
    .join("");
  const answerCards = allQuestions
    .map(
      (question) => `<article class="answer" data-answer="true">
        <h3>Q${question.number}. ${escapeHtml(question.section)}</h3>
        <p><strong>Correct answer:</strong> ${fallbackAnswerFor(question, theme, answerContext)}</p>
        <p><strong>Why it is right:</strong> ${fallbackExplanationFor(question, theme, answerContext)}</p>
        <p><strong>Common wrong or trap answer:</strong> A plausible answer may sound reasonable but fail because it ignores a key word, skips evidence, or uses only part of the data.</p>
        <p><strong>Skill being tested:</strong> ${escapeHtml(question.section)}. <strong>Tip:</strong> Circle the command word, prove your answer, and check one possible wrong answer before moving on.</p>
      </article>`
    )
    .join("");
  const vocabCards = vocabWords
    .map(
      ([word, definition, example, hint]) => `<article class="vocab-card" data-vocab="true">
        <h3>${escapeHtml(word)}</h3>
        <p><strong>Definition:</strong> ${escapeHtml(definition)}</p>
        <p><strong>Example:</strong> ${escapeHtml(example)}</p>
        <p><strong>Memory hint:</strong> ${escapeHtml(hint)}</p>
      </article>`
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PaperStride ${themeTitle(theme)} Workbook</title>
<style>
  :root { color-scheme: light; --ink:#17211f; --muted:#5d6966; --line:#d7ddd4; --accent:#126163; --soft:#eef5f1; --warm:#fff8e8; --cool:#eef4ff; }
  * { box-sizing: border-box; }
  body { margin:0; background:#f4f4ef; color:var(--ink); font-family: Arial, Helvetica, sans-serif; font-size:15px; line-height:1.45; }
  .page { background:#fff; max-width: 210mm; min-height: 297mm; margin: 16px auto; padding: 11mm; border:1px solid var(--line); }
  h1, h2, h3, p { margin-top:0; }
  h1 { font-size:30px; line-height:1.05; margin-bottom:6px; }
  h2 { font-size:20px; border-bottom:2px solid var(--line); padding-bottom:4px; margin:18px 0 10px; }
  h3 { font-size:16px; margin-bottom:6px; }
  .meta, .tip { color:var(--muted); font-size:13px; }
  .hero { display:grid; grid-template-columns: 1fr 120px; gap:16px; align-items:center; border:1px solid var(--line); padding:14px; background:var(--warm); }
  .grid { display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap:10px; }
  .card, .answer, .vocab-card { border:1px solid var(--line); border-radius:6px; padding:10px; break-inside: avoid; }
  .card { background:#fff; }
  .answer { background:#fbfbf7; }
  .vocab-grid { display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap:8px; }
  .vocab-card { background:#fbfdfb; }
  .passage { columns: 2 260px; column-gap: 18px; border:1px solid var(--line); padding:12px; background:#fff; }
  .mini-table { width:100%; border-collapse: collapse; margin:8px 0; }
  .mini-table th, .mini-table td { border:1px solid var(--line); padding:6px; text-align:left; }
  .label { color:var(--accent); font-size:12px; font-weight:700; text-transform:uppercase; }
  .write { min-height:44px; border-bottom:1px solid var(--ink); margin-top:8px; }
  .choice-line { font-size:13px; color:#303836; }
  .hint { color:var(--muted); font-size:12px; margin-bottom:0; }
  svg { max-width:100%; height:auto; stroke:var(--accent); fill:none; stroke-width:2; }
  @media (max-width: 720px) { .page { margin:0; min-height:auto; padding:18px; } .hero, .grid, .vocab-grid { grid-template-columns:1fr; } .passage { columns:1; } }
  @media print {
    body { background:#fff; font-size:12pt; }
    .page { margin:0; border:0; min-height:297mm; padding:10mm; box-shadow:none; }
    .card, .answer, .hero, .vocab-card { border-color:#999; }
    svg { stroke:#333; }
    .passage { columns:2; }
  }
</style>
</head>
<body>
<main class="page">
  <section class="hero">
    <div>
      <p class="label">PaperStride mixed-skills workbook</p>
      <h1>${themeTitle(theme)} Learning Mission</h1>
      <p class="meta">Prepared for {{LEARNER_NICKNAME}} | ${grade} | Age ${input.age} | Interests: ${allInterests}</p>
      <p>This workbook uses ${theme} as a mission theme, but the real goal is bigger: read closely, notice evidence, solve with discipline, explain choices, and build calm test-ready habits.</p>
    </div>
    <svg viewBox="0 0 120 90" role="img" aria-label="Low ink learning icon">
      <rect x="18" y="16" width="70" height="48" rx="5"></rect>
      <path d="M28 30h50M28 42h38M28 54h46"></path>
      <circle cx="92" cy="24" r="10"></circle>
      <path d="M88 67l12 10 6-24"></path>
    </svg>
  </section>

  <h2>How To Use This Mission</h2>
  <section class="grid">
    <article class="card"><p class="label">Close reading</p><h3>Underline before answering</h3><p>For every reading question, mark the phrase that proves your answer. If you cannot point to a clue, the answer is probably a trap answer.</p></article>
    <article class="card"><p class="label">Math reasoning</p><h3>Show the setup</h3><p>Write the equation, table, or diagram before calculating. Strong test takers make invisible thinking visible.</p></article>
    <article class="card"><p class="label">Strategy</p><h3>Eliminate with purpose</h3><p>Cross out choices that are too extreme, unsupported, reversed, or only partly true. This builds SAT-style judgment even for future tests.</p></article>
    <article class="card"><p class="label">Reflection</p><h3>Finish with one improvement</h3><p>After checking the answer sheet, write one habit you will use next time: annotate, estimate, reread, check units, or slow down on tricky words.</p></article>
  </section>

  <h2>Reading Comprehension: Evidence Mission</h2>
  <article class="passage" data-reading-passage="true">
    ${passage}
  </article>

  <h2>Vocabulary in Context</h2>
  <section class="vocab-grid">
    ${vocabCards}
  </section>

  <h2>Data Snapshot</h2>
  <article class="card">
    <p class="label">Chart and data interpretation</p>
    <p>Use this small study log for the chart questions. Treat it like an SAT data question: read labels first, compare numbers second, then write the conclusion last.</p>
    <table class="mini-table">
      <thead><tr><th>Practice plan</th><th>Minutes</th><th>Accuracy</th><th>Notes</th></tr></thead>
      <tbody>
        <tr><td>Quick review</td><td>20</td><td>68 percent</td><td>Fast but many missed details</td></tr>
        <tr><td>Evidence notes</td><td>35</td><td>77 percent</td><td>Better reading proof</td></tr>
        <tr><td>Full strategy</td><td>50</td><td>83 percent</td><td>Best accuracy, slower pace</td></tr>
      </tbody>
    </table>
    <svg viewBox="0 0 260 70" role="img" aria-label="Low ink line chart">
      <path d="M22 58h220M22 58V12"></path>
      <path d="M40 44L125 33L210 24"></path>
      <circle cx="40" cy="44" r="3"></circle><circle cx="125" cy="33" r="3"></circle><circle cx="210" cy="24" r="3"></circle>
    </svg>
  </article>

  <h2>Question Missions</h2>
  <section class="grid">
    ${studentQuestionCards}
  </section>

  <h2>Answer Sheet</h2>
  <section class="grid">
    ${answerCards}
  </section>

  <h2>Smart Test Strategies &amp; SAT Power Tips</h2>
  <article class="card">
    <p><strong>Annotate passages:</strong> Mark the claim, the shift word, and the proof sentence. <strong>Find evidence:</strong> Answer from the text before looking at choices. <strong>Eliminate wrong answers:</strong> Cross out choices that are extreme, reversed, unsupported, or only half true. <strong>Manage time:</strong> Do the clearer questions first and return to the hardest one. <strong>Vocabulary:</strong> Replace the word with your own simple word, then test it in the sentence. <strong>Math word problems:</strong> List known numbers, write the equation, solve, and check units. <strong>Confusing choices:</strong> Ask which choice the passage proves, not which choice sounds smart. <strong>Check work:</strong> Recalculate, reread the exact question, and make sure the answer fits. <strong>Stay calm:</strong> Breathe once, slow your pencil, and take the next small step.</p>
  </article>
</main>
</body>
</html>`;
}

function highSchoolFallbackPassage(theme: string): string {
  return `<p><strong>Passage A:</strong> Coaches, inventors, and historians often disagree about what makes a person improve. One group praises natural talent, another praises technology, and a third points to discipline. The most useful answer is less dramatic: improvement usually comes from feedback that is specific enough to change the next attempt. A basketball player who only hears "shoot better" receives criticism, but not instruction. A player who learns that the elbow is drifting outward, that the release is late, and that fatigue changes foot placement receives information that can be tested. The difference matters because feedback becomes powerful only when it can guide action.</p>
  <p>Modern technology can make feedback faster. A camera can freeze a shooting motion, a spreadsheet can reveal which practice days were most efficient, and a robot can repeat the same movement without boredom. Yet tools do not replace judgment. A device may show that a student answered vocabulary questions quickly, but it cannot always tell whether the student understood the passage or merely recognized familiar words. A chart can show that accuracy improved from 68 percent to 83 percent, but the learner still has to ask what changed: more time, better notes, easier questions, or a stronger strategy. Data begins the conversation; thinking finishes it.</p>
  <p>That is why disciplined learners treat mistakes as evidence, not as proof of failure. When they miss a reading question, they do not simply memorize the correct letter. They ask whether the wrong answer was too broad, too extreme, unsupported, or tempting because it repeated a phrase from the passage. When they miss a math question, they ask whether the error came from the setup, the calculation, the units, or the final interpretation. This habit is especially useful on SAT-style tests because many wrong choices are plausible. They are designed to attract students who read quickly but not carefully.</p>
  <p><strong>Passage B:</strong> History offers a similar lesson. Cities that adopted new tools, from printing presses to transit systems, did not automatically become wiser or more fair. The tools created possibilities, but people still had to decide how to use them. A map can help a city plan safer roads, but a biased map may ignore neighborhoods with less political power. A timeline can show when inventions appeared, but it cannot by itself explain who benefited and who was left out. The strongest thinkers combine curiosity with skepticism. They welcome useful tools, but they also evaluate the assumptions behind the tools.</p>
  <p>Consider a student comparing two explanations for an event. One explanation may be exciting because it names a single hero, invention, or lucky moment. Another may be less simple because it includes economics, geography, public choices, and unintended consequences. The second explanation is harder to remember, but it may be more accurate. Strong readers learn to prefer the answer that the evidence can actually support. Strong mathematicians do the same thing with numbers: they do not accept a result merely because it feels close. They check whether the units, operations, and assumptions fit the situation.</p>
  <p>The same approach can guide a student who cares about ${theme}. Interest creates energy, but strategy turns energy into progress. A learner might begin with excitement, then calibrate the challenge: not so easy that practice becomes automatic, not so hard that effort becomes random. The best practice sits in the stretch zone, where a mistake gives information and a correct answer can be explained. In that zone, reading comprehension, mathematical reasoning, and creative problem solving become connected. The student is not just finishing a worksheet; the student is learning how to think under pressure and how to defend a choice with clear evidence.</p>`;
}

function middleSchoolFallbackPassage(theme: string, interests: string): string {
  return `<p><strong>Original passage:</strong> A learner who enjoys ${theme} can use that interest as a real investigation, not just a decoration on a worksheet. The research team begins by reading a short article, listing facts, and separating evidence from guesses. Because the learner also mentioned ${interests}, the team looks for connections across subjects: how living things move, how bodies use energy, how stories explain discoveries, and how numbers help compare results. To test ideas, the team builds a prototype, which is an early model used to try a plan before trusting it. This makes the mission feel personal while still building serious reading and reasoning skills.</p>
  <p>Good learners do not treat mistakes as the end of the mission. They treat mistakes as clues. If a reading answer is wrong, the learner can return to the passage and find the sentence that proves the right answer. If a math answer is wrong, the learner can check whether the error happened in the equation, the calculation, or the final label. If a pattern answer is wrong, the learner can compare each step instead of guessing. These habits build confidence because the learner knows what to do next.</p>
  <p>The strongest strategy is to slow down at the right moment. Fast work feels exciting, but careful work often wins. A student who underlines key words, circles numbers, and explains one reason will usually find more accurate answers. Over time, this kind of practice turns ${theme} from a fun interest into a training ground for reading comprehension, vocabulary, math reasoning, and logical thinking.</p>`;
}

function elementaryFallbackPassage(theme: string, interests: string): string {
  if (theme.toLowerCase().includes("space")) {
    return `<p><strong>Original passage:</strong> A student research team is preparing a small rover for a pretend mission on a dusty moon. The rover is only a model, but the thinking is real. First, the team reads a short science article about moon dust. The article explains that tiny grains can stick to wheels, block tools, and make moving parts harder to turn. The team writes those facts in a notebook because good readers do not depend on memory alone; they collect evidence before they choose an answer.</p>
    <p>Next, the team studies animals and anatomy for design ideas. A mountain goat can balance on narrow rocks, a lizard can grip rough surfaces, and a human knee bends so the leg can step over obstacles. These examples do not mean a rover is an animal. They help the team imagine a better prototype, which is an early model built to test an idea. The first prototype has smooth wheels, so it slides in the dust tray. The second prototype has ridges on the wheels, and it moves farther before getting stuck.</p>
    <p>The team also uses math. In Trial 1, the rover travels 18 centimeters. In Trial 2, it travels 27 centimeters. In Trial 3, after the wheel ridges are made deeper, it travels 36 centimeters. The pattern shows improvement, but the team still has to be careful. Maybe the deeper ridges helped. Maybe the tray was flatter. Maybe the rover was pushed more gently. A strong scientist asks what changed, checks the evidence, and tests again.</p>
    <p>At the end of the mission, the learner writes a short conclusion: reading gave the team facts, animal and anatomy observations gave the team design ideas, and math helped the team compare results. The rover did not work perfectly, but each test taught the team what to try next. That is why a mistake can be useful. It points the learner toward the next smart step.</p>`;
  }

  return `<p><strong>Original passage:</strong> A learner who enjoys ${theme} can turn that interest into a research mission. The first job is to read carefully. The learner looks for facts, marks important words, and writes down evidence instead of guessing. Because the learner also mentioned ${interests}, the mission can connect several subjects at once: reading, science, math, art, movement, and real-world problem solving.</p>
  <p>The team builds a small prototype, which means an early model used to test an idea. The first design does not work perfectly. That is useful information. The learner asks what changed, what stayed the same, and which detail from the notes explains the result. Then the learner improves the design and tests again. This is how readers, scientists, and inventors grow stronger.</p>
  <p>Math helps the team compare results. If one test lasts 12 minutes and the next lasts 18 minutes, the learner can measure the difference. If a pattern changes by the same amount each time, the learner can predict what may come next. The final conclusion should use evidence from the passage, numbers from the test, and one clear explanation. The goal is not to be perfect right away. The goal is to notice clues, explain thinking, and choose the next smart step.</p>`;
}

type AnswerContext = { high: boolean; isSpace: boolean };

function fallbackAnswerFor(
  question: { section: string; text: string; number: number },
  theme: string,
  ctx: AnswerContext
): string {
  if (question.section === "Reading Comprehension") {
    return escapeHtml(readingAnswerFor(question.number, theme, ctx));
  }

  if (question.section === "Math Reasoning") {
    const answer = mathAnswerFor(question.text);
    if (answer) return escapeHtml(answer);
  }

  if (question.section === "Vocabulary in Context") {
    return "A complete sentence that uses the vocabulary word correctly and connects it to the mission theme.";
  }

  if (question.section === "Logic and Real-World Thinking") {
    const answer = logicAnswerFor(question.text);
    if (answer) return escapeHtml(answer);
  }

  return "A strong response explains the claim, includes evidence, and shows the reasoning step by step.";
}

function fallbackExplanationFor(
  question: { section: string; text: string; number: number },
  theme: string,
  ctx: AnswerContext
): string {
  if (question.section === "Reading Comprehension") {
    return escapeHtml(
      ctx.high
        ? "The answer must come from the passages, not outside knowledge. Strong readers point to the exact sentence that proves the choice."
        : `The answer must come from the ${theme} passage, not a guess from outside knowledge. The passage connects facts, testing, evidence, and improvement.`
    );
  }

  if (question.section === "Math Reasoning") {
    const explanation = mathExplanationFor(question.text);
    if (explanation) return escapeHtml(explanation);
  }

  if (question.section === "Vocabulary in Context") {
    return "The sentence should prove the learner understands the word, not just copy it. A good sentence gives context clues.";
  }

  if (question.section === "Logic and Real-World Thinking") {
    const explanation = logicExplanationFor(question.text);
    if (explanation) return escapeHtml(explanation);
  }

  return "A strong answer uses a detail, number, pattern, or passage clue and explains why that evidence supports the conclusion.";
}

function readingAnswerFor(number: number, theme: string, ctx: AnswerContext): string {
  if (ctx.high) {
    const answers = [
      "The central claim is that improvement comes from feedback specific enough to change the next attempt; tools can speed feedback but cannot replace human judgment.",
      "The strongest evidence is the point that a device can show a student answered quickly but cannot tell whether the student truly understood the passage.",
      "As used here, disciplined most nearly means self-controlled and steady, treating mistakes as useful evidence rather than as failure.",
      "The basketball example shows that vague feedback like shoot better gives no guidance, while specific feedback that can be tested actually helps.",
      "A trap answer credits a single hero, talent, or invention as the only cause; it sounds reasonable but the passage argues against single-cause explanations.",
      "The final paragraph refines the argument by applying it to the reader's own interest: interest supplies energy, but strategy in the stretch zone turns it into progress."
    ];
    return answers[number - 1] || "Answer from the passage and point to the sentence that proves it.";
  }

  const spaceAnswers = [
    `The main idea is that a ${theme} mission improves by combining careful reading, evidence, design changes, and math instead of guessing.`,
    "A strong detail is that the team writes the moon-dust facts in a notebook before choosing an answer, and later compares the rover trial distances with numbers.",
    "Prototype means an early model built to test an idea.",
    `The interests help by giving the team design ideas from animals and anatomy, plus motivation for the ${theme} mission.`,
    "After a test fails, the team should ask what changed, check the evidence, improve the design, and test again."
  ];
  const genericAnswers = [
    `The main idea is that an interest like ${theme} can become a real research mission built on reading, evidence, testing, and math.`,
    "A strong detail is that the learner writes down evidence instead of guessing, and checks what changed between one test and the next.",
    "Prototype means an early model used to test an idea before trusting it.",
    `The interests help by connecting several subjects at once and giving the ${theme} mission a clear, motivating purpose.`,
    "After a test does not work, the learner should study what changed, use the evidence, improve the design, and try again."
  ];
  const answers = ctx.isSpace ? spaceAnswers : genericAnswers;
  return answers[number - 1] || "Use evidence from the passage and explain the answer in your own words.";
}

function mathAnswerFor(text: string): string | null {
  if (/4 sets of 6/i.test(text)) return "24 cards.";
  if (/3, 6, 12, 24/i.test(text)) return "48 and 96.";
  if (/12 pages/i.test(text)) return "27 pages.";
  if (/30 minutes/i.test(text)) return "6 minutes per mission.";
  if (/42 of 60/i.test(text)) return "85 percent.";
  if (/budget of \$360/i.test(text)) return "9 panels.";
  if (/f\(x\) = 3x \+ 7/i.test(text)) return "x = 15.";
  if (/study time rising from 20 to 50/i.test(text)) return "5 percentage points per 10 minutes.";
  return null;
}

function mathExplanationFor(text: string): string | null {
  if (/4 sets of 6/i.test(text)) return "There are 4 equal groups with 6 in each group, so 4 x 6 = 24.";
  if (/3, 6, 12, 24/i.test(text)) return "Each number doubles, so 24 doubles to 48 and 48 doubles to 96.";
  if (/12 pages/i.test(text)) return "Add the two reading amounts: 12 + 15 = 27.";
  if (/30 minutes/i.test(text)) return "Divide the total time by the number of missions: 30 / 5 = 6.";
  if (/42 of 60/i.test(text)) return "42 of 60 is 70 percent; adding 15 percentage points gives 85 percent.";
  if (/budget of \$360/i.test(text)) return "8 sensors cost 8 x 18 = 144; 360 - 144 = 216 left; 216 / 24 = 9 panels.";
  if (/f\(x\) = 3x \+ 7/i.test(text)) return "Set 3x + 7 = 52, so 3x = 45 and x = 15.";
  if (/study time rising from 20 to 50/i.test(text)) return "From 20 to 50 minutes is three 10-minute steps; accuracy rises 68 to 83, a 15-point gain, so 15 / 3 = 5 points per 10 minutes.";
  return null;
}

function logicAnswerFor(text: string): string | null {
  if (/5, 8, 11/.test(text)) return "14 and 17. The rule adds 3 each time.";
  if (/2, 5, 11, 23, 47/.test(text)) return "95. Each step doubles the number and adds 1 (n x 2 + 1).";
  if (/better evidence/i.test(text)) return "A detail from the passage, because it can be proven by pointing to the text; a memory guess cannot be checked.";
  if (/tiny diagram/i.test(text)) return "A simple labeled sketch that lays out the known numbers or steps before solving.";
  if (/can help someone practice/i.test(text)) return "Open response: any clear sentence linking the interest to focus, repetition, or strategy.";
  if (/which plan would you recommend/i.test(text)) return "Open response. A strong answer weighs higher average scores against steadier scores and justifies the choice with the data.";
  if (/historian argues/i.test(text)) return "Open response. Stronger evidence would include records, dates, economic data, or comparisons that rule out other causes.";
  if (/two-sentence argument/i.test(text)) return "Open response: two sentences linking the interest to persistence, with one reason and one example.";
  return null;
}

function logicExplanationFor(text: string): string | null {
  if (/5, 8, 11/.test(text)) return "Continue the add-3 pattern: 11 + 3 = 14, then 14 + 3 = 17.";
  if (/2, 5, 11, 23, 47/.test(text)) return "Check the rule: 2x2+1=5, 5x2+1=11, 11x2+1=23, 23x2+1=47, so 47x2+1=95.";
  if (/better evidence/i.test(text)) return "Evidence you can point to is checkable; memory can be mistaken, so a passage detail is stronger.";
  if (/tiny diagram/i.test(text)) return "Drawing the problem first makes the known and unknown parts visible before calculating.";
  return "A strong answer names the rule or the evidence and shows the reasoning step by step.";
}

function fallbackChoiceLine(question: { section: string; text: string }): string {
  const choices = mathChoicesFor(question);
  if (!choices) return "";
  const rendered = choices
    .map((option, index) => `${String.fromCharCode(65 + index)}. ${escapeHtml(option)}`)
    .join(" &nbsp; ");
  return `<p class="choice-line">${rendered}</p>`;
}

function mathChoicesFor(question: { section: string; text: string }): string[] | null {
  if (question.section !== "Math Reasoning") return null;
  const text = question.text;
  if (/4 sets of 6/i.test(text)) return ["18", "24", "10", "36"];
  if (/3, 6, 12, 24/i.test(text)) return ["36 and 48", "48 and 96", "30 and 36", "48 and 72"];
  if (/12 pages/i.test(text)) return ["25", "27", "3", "17"];
  if (/30 minutes/i.test(text)) return ["5", "6", "25", "35"];
  if (/42 of 60/i.test(text)) return ["80 percent", "85 percent", "70 percent", "57 percent"];
  if (/budget of \$360/i.test(text)) return ["7 panels", "9 panels", "12 panels", "15 panels"];
  if (/f\(x\) = 3x \+ 7/i.test(text)) return ["x = 12", "x = 15", "x = 18", "x = 20"];
  if (/study time rising from 20 to 50/i.test(text)) return ["3 points", "5 points", "7.5 points", "15 points"];
  return null;
}

function questionHintFor(question: { section: string }): string {
  if (question.section === "Math Reasoning") return "Show your setup, then circle the matching answer choice.";
  if (question.section === "Reading Comprehension") return "Point to the sentence in the passage that proves your answer.";
  if (question.section === "Vocabulary in Context") return "Use a context clue and write a full sentence.";
  return "Explain your thinking in one or two clear sentences.";
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
