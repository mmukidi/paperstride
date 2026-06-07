import { NextRequest } from "next/server";

export const runtime = "nodejs";

type WorksheetInput = {
  childName: string;
  grade: string;
  age: number;
  interests: string;
  // New fields — all optional with safe defaults so old calls still work
  strugglingWith: string[];
  subjectFocus: string;
  goal: string;
  timeAvailable: number;
};

type WorksheetSection = {
  subject: string;
  questionCount: number;
  skills: string[];
  focus: string;
  isWeakArea?: boolean;
  interestConnection?: string;
};

type LearningBlueprint = {
  curriculumPath: string;
  gradeExpectations: string;
  pageTarget: string;
  questionCount: number;
  sections: WorksheetSection[];
  subjectMix: string[];
  cognitiveSkills: string[];
  motivationStrategy: string;
  challengeLevel: string;
  visualPlan: string[];
  questionFormats: string[];
  answerExpectations: string;
  vocabularyPlan: string;
  testReadinessPlan: string;
  // New fields
  estimatedMinutes?: number;
  themeThread?: string;
  parentNote?: string;
};

// Canonical subjects the fallback can generate. The blueprint may request any of
// these; unknown subjects degrade to an open-response "Critical Thinking" bank.
const KNOWN_SUBJECTS = [
  "Reading Comprehension",
  "Vocabulary in Context",
  "Grammar and Writing",
  "Math Reasoning",
  "Science Investigation",
  "Social Studies and History",
  "Logic and Patterns",
  "Critical Thinking"
] as const;

const MIN_TOTAL_QUESTIONS = 8;
const MAX_TOTAL_QUESTIONS = 28;

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

function isHighSchoolOrAdult(input: WorksheetInput): boolean {
  return input.age >= 15 || ["Grade 9", "Grade 10", "Grade 11", "Grade 12", "College", "Master's"].includes(input.grade);
}

function isHistoryTheme(theme: string): boolean {
  return /\b(history|historical|social studies|civics|civilization|ancient|medieval|modern|war|revolution|empire|archive|museum)\b/i.test(theme);
}

// Ollama-only backend — no external API dependency, no rate limits.
// All inference runs on the local Oracle Cloud server.
// We use Ollama's NATIVE /api/chat (not the OpenAI-compat /v1) so we can pin keep_alive,
// num_ctx, and num_thread per request — the levers that matter most for CPU latency.
const LLM_BASE_URL = (process.env.LLM_BASE_URL || "http://localhost:11434/v1").replace(/\/+$/, "");
const OLLAMA_HOST = LLM_BASE_URL.replace(/\/v1$/, ""); // -> http://localhost:11434
const ollamaEndpoint = `${OLLAMA_HOST}/api/chat`;

// Quality model: reading passage (needs reasoning/prose depth).
const QUALITY_MODEL = process.env.LLM_MODEL || "qwen2.5:7b-instruct";
// Fast model: blueprint + all question sections (structured JSON, ~3x faster on CPU).
const FAST_MODEL = process.env.LLM_FAST_MODEL || "llama3.2:3b";
// Passage model defaults to the quality model. Set LLM_PASSAGE_MODEL=llama3.2:3b to run
// the ENTIRE pipeline on the fast model (the "single-model" speed experiment — no 7B,
// no model swaps, lowest possible latency; trade some passage prose quality).
const PASSAGE_MODEL = process.env.LLM_PASSAGE_MODEL || QUALITY_MODEL;

// Performance knobs (baked into every request so they apply without server config):
//  - keep_alive: -1 keeps models resident in RAM so swapping 7B<->3B never reloads from disk.
//  - num_thread: pin to physical cores (Oracle A1 = 4) — all cores on one request.
const OLLAMA_NUM_THREAD = Number(process.env.OLLAMA_NUM_THREAD || 4);
const OLLAMA_KEEP_ALIVE: number | string = process.env.OLLAMA_KEEP_ALIVE || -1;
const DEFAULT_NUM_CTX = Number(process.env.OLLAMA_NUM_CTX || 4096);

// Timeouts. Blueprint now runs on the fast model so it no longer needs minutes, but we
// keep a generous ceiling for the very first (cold) call after a deploy.
const LLM_BLUEPRINT_TIMEOUT_MS = Number(process.env.LLM_BLUEPRINT_TIMEOUT_MS || 180000);
const LLM_TIMEOUT_MS           = Number(process.env.LLM_TIMEOUT_MS           ||  90000);
const LLM_PASSAGE_TIMEOUT_MS    = Number(process.env.LLM_PASSAGE_TIMEOUT_MS   || 300000); // 7B passage
// Ollama is always the backend; llmConfigured is always true when the server is running.
const llmConfigured = true;

export async function POST(request: NextRequest) {
  let input: WorksheetInput;
  let prebuiltBlueprint: LearningBlueprint | null;

  try {
    ({ input, prebuiltBlueprint } = await parseInput(request));
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Please check the worksheet details.",
      400
    );
  }

  try {
    let html: string;
    try {
      html = await createHtmlWorksheetWithOllama(input, prebuiltBlueprint);
    } catch (error) {
      console.warn("AI worksheet generation failed; using quality fallback", error);
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

const VALID_STRUGGLES = new Set(["Reading","Fractions","Word Problems","Vocabulary","Grammar","Writing","Science","Logic"]);
const VALID_FOCUSES   = new Set(["balanced","more-math","more-reading","math-only","reading-only"]);
const VALID_GOALS     = new Set(["general","test-prep","catching-up","getting-ahead"]);
const VALID_TIMES     = new Set([20, 40, 60]);

async function parseInput(request: NextRequest): Promise<{ input: WorksheetInput; prebuiltBlueprint: LearningBlueprint | null }> {
  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    throw new Error("Please enter the worksheet details.");
  }

  const childName = cleanText(String(body.childName || ""), 40);
  const grade     = cleanText(String(body.grade || ""), 24);
  const interests = cleanText(String(body.interests || ""), 200);
  const age       = Number(body.age);

  if (!childName)               throw new Error("Please add a nickname.");
  if (!allowedGrades.has(grade)) throw new Error("Please choose a grade or level from the list.");
  if (!Number.isInteger(age) || age < 3 || age > 26) throw new Error("Please choose an age between 3 and 26.");
  if (!interests)               throw new Error("Please add at least one interest.");

  const strugglingWith = Array.isArray(body.strugglingWith)
    ? body.strugglingWith.map(String).filter((s: string) => VALID_STRUGGLES.has(s))
    : [];
  const subjectFocus = VALID_FOCUSES.has(body.subjectFocus) ? String(body.subjectFocus) : "balanced";
  const goal         = VALID_GOALS.has(body.goal)           ? String(body.goal)         : "general";
  const timeAvailable = VALID_TIMES.has(Number(body.timeAvailable)) ? Number(body.timeAvailable) : 40;

  // If the frontend already computed the blueprint (after showing the plan preview),
  // pass it through so we skip the blueprint LLM call entirely.
  const prebuiltBlueprint: LearningBlueprint | null =
    body.blueprint && typeof body.blueprint === "object" ? (body.blueprint as LearningBlueprint) : null;

  return {
    input: { childName, grade, age, interests, strugglingWith, subjectFocus, goal, timeAvailable },
    prebuiltBlueprint,
  };
}

// One AI-authored question, returned as structured JSON so we render it into our own
// safe template (no raw AI HTML is ever injected).
type GeneratedQuestion = {
  prompt: string;
  choices: string[];
  correctAnswer: string;
  explanation: string;
};

// Optional AI-authored pieces injected into the deterministic assembler. Anything
// absent is filled from the deterministic banks, so the worksheet is always complete.
type WorksheetContent = {
  passageHtml?: string;
  vocab?: string[][];
  readingQuestions?: GeneratedQuestion[];
  sectionQuestions?: Record<string, GeneratedQuestion[]>;
};

const PASSAGE_BUNDLE_SUBJECTS = new Set(["Reading Comprehension", "Vocabulary in Context"]);

async function createHtmlWorksheetWithOllama(
  input: WorksheetInput,
  prebuiltBlueprint: LearningBlueprint | null
): Promise<string> {
  // Skip blueprint LLM call if the frontend already computed it (plan preview flow).
  const blueprint = prebuiltBlueprint ?? await createLearningBlueprint(input);

  try {
    const html = await createStagedWorksheetHtml(input, blueprint);
    return injectNickname(html, input.childName);
  } catch (error) {
    console.warn("Staged worksheet generation failed; using quality fallback", error);
    return createFallbackHtmlWorksheet(input, blueprint);
  }
}

// Phase 3: generate the worksheet in small, well-scoped pieces instead of one giant
// call. Each piece is attempted independently and degrades to the deterministic bank on
// failure, so a thin or rate-limited response only affects that one section.
async function createStagedWorksheetHtml(
  input: WorksheetInput,
  blueprint: LearningBlueprint
): Promise<string> {
  const content: WorksheetContent = { sectionQuestions: {} };

  const wantsReading = blueprint.sections.some((section) => section.subject === "Reading Comprehension");
  const vocabSection = blueprint.sections.find((section) => section.subject === "Vocabulary in Context");

  // One call produces the reading passage, its questions, and vocabulary together so
  // the passage and the questions about it always stay consistent.
  if (wantsReading || vocabSection) {
    try {
      const bundle = await generatePassageBundle(input, blueprint);
      content.passageHtml = bundle.passageHtml;
      content.vocab = bundle.vocab.length ? bundle.vocab : undefined;
      content.readingQuestions = bundle.readingQuestions.length ? bundle.readingQuestions : undefined;
    } catch (error) {
      console.warn("Passage bundle failed; using bank passage and vocabulary", error);
    }
  }

  // Keep the passage and its questions consistent: if the AI passage arrived without
  // matching reading questions, drop it so the bank passage and bank questions pair up.
  if (wantsReading && !content.readingQuestions) {
    content.passageHtml = undefined;
  }

  // Generate every non-reading section in ONE batched call on the fast model. Batching
  // pays the shared context prefill once instead of N times (the redundant-prefill win),
  // and avoids per-call scheduling overhead. Per-section resilience is preserved below:
  // any subject the batch doesn't fill is retried individually, then bank-filled.
  const sectionsToGenerate = blueprint.sections.filter(
    (section) => !PASSAGE_BUNDLE_SUBJECTS.has(section.subject)
  );

  if (sectionsToGenerate.length) {
    try {
      const batched = await generateAllSections(input, blueprint, sectionsToGenerate);
      for (const section of sectionsToGenerate) {
        const questions = batched[section.subject];
        if (questions?.length) content.sectionQuestions![section.subject] = questions;
      }
    } catch (error) {
      console.warn("Batched section generation failed; retrying per-section", error);
    }

    // Fill any section the batch missed, one at a time, before the deterministic bank.
    for (const section of sectionsToGenerate) {
      if (content.sectionQuestions![section.subject]?.length) continue;
      try {
        const questions = await generateSectionQuestions(input, blueprint, section);
        if (questions.length) content.sectionQuestions![section.subject] = questions;
      } catch (error) {
        console.warn(`Section "${section.subject}" generation failed; using bank questions`, error);
      }
    }
  }

  return assembleWorksheet(input, blueprint, content);
}

async function generatePassageBundle(
  input: WorksheetInput,
  blueprint: LearningBlueprint
): Promise<{ passageHtml: string; vocab: string[][]; readingQuestions: GeneratedQuestion[] }> {
  const profile = qualityProfileFor(input);
  const readingCount = blueprint.sections.find((s) => s.subject === "Reading Comprehension")?.questionCount ?? 4;
  const vocabCount = Math.max(
    profile.minVocabularyCards,
    blueprint.sections.find((s) => s.subject === "Vocabulary in Context")?.questionCount ?? profile.minVocabularyCards
  );

  const content = await groqChat({
    model: PASSAGE_MODEL,                 // 7B by default for prose quality
    temperature: 0.5,
    maxTokens: 1700,
    timeoutMs: LLM_PASSAGE_TIMEOUT_MS,
    responseFormat: "json_object",
    messages: [
      {
        role: "system",
        content:
          "You write original, grade-appropriate reading passages and the comprehension questions about them. Return only valid JSON. Never include the learner's name or any private data."
      },
      {
        role: "user",
        content: `Write an ORIGINAL reading passage for this learner and the questions about it.

Learner:
- Grade or level: ${input.grade}
- Age: ${input.age}
- Interest themes: ${input.interests}

Requirements:
- The passage must be original, engaging, and tied to the interests, at least ${profile.minReadingWords} words, at this exact reading level.
- Follow this blueprint exactly; it is the curriculum plan for the worksheet:
  - Curriculum path: ${blueprint.curriculumPath}
  - Grade expectations: ${blueprint.gradeExpectations}
  - Motivation strategy: ${blueprint.motivationStrategy}
  - Challenge level: ${blueprint.challengeLevel}
  - Question formats: ${blueprint.questionFormats.join(", ")}
  - Vocabulary plan: ${blueprint.vocabularyPlan}
- Use the learner's interests as meaningful context, not just decoration. If there are multiple interests, weave at least two in naturally.
- Keep tone age-appropriate: playful and concrete for elementary learners, more strategic for older learners.
- Write ${readingCount} comprehension questions about the passage (main idea, evidence, vocabulary in context, inference as age allows). Where a multiple-choice question fits, give 3-4 options with exactly one correct option that appears in "choices"; otherwise use an empty "choices" array for a written response.
- Pull ${vocabCount} useful words FROM the passage with a simple definition, an example sentence, and a memory hint.
- Do not label the passage "Original passage:".

Return JSON exactly:
{
  "passageParagraphs": ["paragraph 1", "paragraph 2"],
  "vocab": [ { "word": "", "definition": "", "example": "", "hint": "" } ],
  "questions": [ { "prompt": "", "choices": ["",""], "correctAnswer": "", "explanation": "" } ]
}`
      }
    ]
  });

  const parsed = parseJsonContent(content) as Record<string, unknown>;
  const paragraphs = Array.isArray(parsed.passageParagraphs)
    ? parsed.passageParagraphs.map((p) => cleanGeneratedParagraph(String(p))).filter(Boolean)
    : [];
  const wordCount = paragraphs.join(" ").split(/\s+/).filter(Boolean).length;
  if (!paragraphs.length || wordCount < profile.minReadingWords) {
    throw new Error("Passage bundle had too little complete passage text.");
  }

  const passageHtml = paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n    ");
  const vocab = normalizeGeneratedVocab(parsed.vocab);
  const readingQuestions = normalizeGeneratedQuestions(parsed.questions, readingCount);

  return { passageHtml, vocab, readingQuestions };
}

// Generate questions for ALL non-reading sections in a single call. Returns a map of
// subject -> questions; subjects the model omits or botches simply don't appear, so the
// caller can retry them individually or bank-fill.
async function generateAllSections(
  input: WorksheetInput,
  blueprint: LearningBlueprint,
  sections: WorksheetSection[]
): Promise<Record<string, GeneratedQuestion[]>> {
  const totalQuestions = sections.reduce((sum, s) => sum + s.questionCount, 0);
  const hasMathOrLogic = sections.some((s) => /math|logic|pattern/i.test(s.subject));

  const sectionSpecs = sections
    .map((s, i) => {
      const weak = s.isWeakArea
        ? " — WEAK AREA: start with a confidence-builder and add a scaffolding hint to harder ones"
        : "";
      const conn = s.interestConnection ? ` Interest connection: ${s.interestConnection}.` : "";
      return `${i + 1}. "${s.subject}" — write EXACTLY ${s.questionCount} question(s). Skills: ${s.skills.join(", ") || "core skills"}. Focus: ${s.focus}.${weak}${conn}`;
    })
    .join("\n");

  const shape = sections
    .map((s) => `  "${s.subject}": [ { "prompt": "", "choices": ["",""], "correctAnswer": "", "explanation": "" } ]`)
    .join(",\n");

  const content = await ollamaChat({
    model: FAST_MODEL,
    temperature: hasMathOrLogic ? 0.2 : 0.35,
    maxTokens: Math.min(2400, 250 + totalQuestions * 130),
    timeoutMs: LLM_TIMEOUT_MS,
    responseFormat: "json_object",
    messages: [
      {
        role: "system",
        content:
          "You write rigorous, grade-appropriate practice questions across several worksheet sections at once, each with a correct answer and a short explanation. For any question involving numbers, solve it step by step and make sure the explanation's steps reach EXACTLY the stated correctAnswer — never contradict yourself. The correct option must be unambiguously correct and must appear in \"choices\". Return only valid JSON. Never include the learner's name or any private data."
      },
      {
        role: "user",
        content: `Learner: Grade ${input.grade}, Age ${input.age}, Interests: ${input.interests}
${input.strugglingWith?.length ? `Struggling with: ${input.strugglingWith.join(", ")} — scaffold those areas appropriately.` : ""}
Theme thread: ${blueprint.themeThread ?? input.interests}

Write questions for EACH section below. Weave the interests into scenarios so they feel
specific and motivating. Within each section, make the first question accessible and the
last the most challenging. Prefer multiple choice (3-4 options, exactly one correct answer
that appears in "choices"); use an empty "choices" array for writing/explanation prompts.
For numeric questions, double-check the arithmetic so the explanation matches the answer.

SECTIONS:
${sectionSpecs}

Return JSON exactly, with one key per section title:
{
${shape}
}`
      }
    ]
  });

  const parsed = parseJsonContent(content) as Record<string, unknown>;
  const out: Record<string, GeneratedQuestion[]> = {};
  for (const section of sections) {
    const questions = normalizeGeneratedQuestions(parsed[section.subject], section.questionCount);
    if (questions.length) out[section.subject] = questions;
  }
  return out;
}

async function generateSectionQuestions(
  input: WorksheetInput,
  blueprint: LearningBlueprint,
  section: WorksheetSection
): Promise<GeneratedQuestion[]> {
  const isMath = section.subject === "Math Reasoning" || /math|logic|pattern/i.test(section.subject);
  const content = await ollamaChat({
    model: FAST_MODEL,   // llama3.2:3b — faster for focused structured calls
    temperature: isMath ? 0.15 : 0.35,  // lower temp for math/logic → fewer arithmetic slips
    maxTokens: 600,
    responseFormat: "json_object",
    messages: [
      {
        role: "system",
        content:
          "You write rigorous, grade-appropriate practice questions for one subject, with a correct answer and explanation for each. For any question involving numbers, solve it yourself step by step and make sure the explanation's steps lead to EXACTLY the stated correctAnswer — never contradict yourself. The correct option must be unambiguously correct and must appear in \"choices\". Return only valid JSON. Never include the learner's name or any private data."
      },
      {
        role: "user",
        content: `Write practice questions for ONE worksheet section.

Learner: Grade ${input.grade}, Age ${input.age}, Interests: ${input.interests}
${input.strugglingWith?.length ? `Struggling with: ${input.strugglingWith.join(", ")} — scaffold questions in this section appropriately.` : ""}

Section: ${section.subject}
Skills: ${section.skills.join(", ") || "core skills for this subject"}
Focus: ${section.focus}
${section.isWeakArea ? "⚑ This is a WEAK AREA. Start with one confidence-builder question, then build up. Add a scaffolding hint to harder questions." : ""}
${section.interestConnection ? `Interest connection: ${section.interestConnection}` : ""}
Theme thread: ${blueprint.themeThread ?? input.interests}

Write EXACTLY ${section.questionCount} questions.
- Q1 should be accessible (confidence-builder). Final Q should be the most challenging.
- Use the interest connection to make scenarios specific and motivating.
- Prefer multiple choice (3-4 options, exactly one correct answer in "choices").
- Open response for writing/explanation prompts — use empty "choices" array.
- Every question needs a correct answer and a short explanation.
- For numeric questions: work the arithmetic carefully and double-check it. The explanation
  must show the steps that arrive at exactly the correctAnswer. Do not state one number in
  the steps and a different number as the answer.

Return JSON exactly:
{ "questions": [ { "prompt": "", "choices": ["",""], "correctAnswer": "", "explanation": "" } ] }`
      }
    ]
  });

  const parsed = parseJsonContent(content) as Record<string, unknown>;
  return normalizeGeneratedQuestions(parsed.questions, section.questionCount);
}

function normalizeGeneratedQuestions(value: unknown, limit: number): GeneratedQuestion[] {
  if (!Array.isArray(value)) return [];

  const questions: GeneratedQuestion[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const candidate = raw as Record<string, unknown>;
    const prompt = cleanProse(safeString(candidate.prompt));
    const correctAnswer = cleanProse(safeString(candidate.correctAnswer));
    const explanation = cleanProse(safeString(candidate.explanation));
    if (!prompt || !correctAnswer) continue;

    // Clean the choices: drop empty/junk (e.g. "[]", "N/A") and de-duplicate.
    const seen = new Set<string>();
    let choices = (Array.isArray(candidate.choices) ? candidate.choices : [])
      .map((c) => cleanProse(safeString(c)))
      .filter((c) => c && !/^(\[\s*\]|n\/?a|none|tbd|\.+)$/i.test(c))
      .filter((c) => {
        const key = c.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 5);

    // If it's meant to be multiple choice, the correct answer MUST be one of the
    // options. A small model sometimes invents an answer that isn't listed (or leaves
    // only one valid option) — drop those so the section bank-fills a valid question
    // instead of shipping a broken or "closest answer" item.
    if (choices.length > 0) {
      if (choices.length < 2) {
        choices = []; // too few real options → treat as written response
      } else if (!multipleChoiceAnswerIsValid(correctAnswer, choices)) {
        continue;
      }
    }

    questions.push({ prompt, choices, correctAnswer, explanation: explanation || "Check the answer against the question." });
    if (questions.length >= limit) break;
  }
  return questions;
}

// True if the correct answer corresponds to one of the choices: either a letter
// (A/B/C/D) within range, or a text match against an option.
function multipleChoiceAnswerIsValid(correctAnswer: string, choices: string[]): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").replace(/[.)]+$/, "").trim();
  const ans = norm(correctAnswer);

  const letter = ans.match(/^([a-d])$/);
  if (letter) {
    const idx = letter[1].charCodeAt(0) - 97;
    return idx < choices.length;
  }
  return choices.some((c) => {
    const co = norm(c);
    return co === ans || co.includes(ans) || ans.includes(co);
  });
}

function normalizeGeneratedVocab(value: unknown): string[][] {
  if (!Array.isArray(value)) return [];

  const vocab: string[][] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const candidate = raw as Record<string, unknown>;
    const word = cleanProse(String(candidate.word ?? ""));
    const definition = cleanProse(String(candidate.definition ?? ""));
    if (!word || !definition) continue;
    const example = cleanProse(String(candidate.example ?? "")) || `A clear sentence using ${word}.`;
    const hint = cleanProse(String(candidate.hint ?? "")) || `Connect ${word} to something you know.`;
    vocab.push([word, definition, example, hint]);
  }
  return vocab;
}

// Tidy a model-authored string: collapse whitespace and cap length. Returned text is
// still escaped at render time, so this is about cleanliness, not safety.
function cleanProse(value: string, maxLength = 600): string {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanGeneratedParagraph(value: string): string {
  const cleaned = cleanProse(value, 1400);
  if (cleaned.length < 1400 || /[.!?]"?$/.test(cleaned)) {
    return cleaned;
  }

  const sentenceEnd = Math.max(
    cleaned.lastIndexOf("."),
    cleaned.lastIndexOf("!"),
    cleaned.lastIndexOf("?")
  );

  if (sentenceEnd < 220) {
    return "";
  }

  return cleaned.slice(0, sentenceEnd + 1).trim();
}

async function createLearningBlueprint(input: WorksheetInput): Promise<LearningBlueprint> {
  const bounds = questionCountBounds(input);
  const content = await groqChat({
    temperature: 0.35,
    maxTokens: 1300,
    timeoutMs: LLM_BLUEPRINT_TIMEOUT_MS,
    responseFormat: "json_object",
    messages: [
      {
        role: "system",
        content:
          "You are a panel of expert educators: a veteran classroom teacher, a child development psychologist, a curriculum standards planner, and a test-readiness coach. Together you design the plan for ONE complete printable worksheet that represents a full, engaging day of practice for a specific learner. You decide everything: how many questions are developmentally right (enough to be substantial, never so many it overwhelms the child), which subjects to include, how many questions each subject gets, which skills each tests, and how hard it should be. Ground every choice in real pedagogy and the learner's age. Return only valid JSON. Never include the learner's name or any private data."
      },
      {
        role: "user",
        content: `Design the worksheet plan for this learner.

Learner details:
- Grade or level: ${input.grade}
- Age: ${input.age}
- Interest themes: ${input.interests}

Think like the expert panel. First decide the TOTAL number of questions that is right
for a complete but age-appropriate day of practice at this exact age and grade
(between ${bounds.min} and ${bounds.max}; younger and earlier grades
toward the lower end, older grades toward the higher end). Then break that total into
subject sections that together exercise the full range of skills this learner should
practice. Choose the subjects yourself from this menu, using only those that fit the
age and grade, and set each section's question count so the section counts sum to the
total:
${KNOWN_SUBJECTS.map((subject) => `  - ${subject}`).join("\n")}

Shape the plan as a DEEP CORE plus SHORT ENRICHMENT:
- The CORE is Reading Comprehension, Grammar and Writing, and Math Reasoning. Give these
  the most questions and real depth — this is where the learner does the substantial work,
  matched to what they would face in school at this grade.
- Add 1 to 3 SHORT ENRICHMENT sections (such as Science Investigation, Logic and Patterns,
  Social Studies, or Critical Thinking) with just 1-2 questions each, to stretch thinking
  in other directions without diluting the core.
- Include Vocabulary in Context whenever there is a reading passage.
Avoid spreading the questions thinly across many tiny sections; depth in the core beats
breadth.

Weave the interest themes (${input.interests}) into the framing to make the work
exciting and personally motivating, while keeping the academic rigor real.

Return JSON with this exact shape:
{
  "curriculumPath": "short inferred curriculum direction for this learner",
  "gradeExpectations": "what a learner at this age/grade should be practicing now",
  "pageTarget": "recommended page target, such as 3-5 A4 pages",
  "questionCount": 16,
  "sections": [
    { "subject": "Reading Comprehension", "questionCount": 4, "skills": ["main idea", "evidence", "inference"], "focus": "one short sentence on what this section does and how it ties to the interests" }
  ],
  "subjectMix": ["the subject names you chose"],
  "cognitiveSkills": ["analytical thinking", "pattern recognition"],
  "motivationStrategy": "how to make THIS learner excited, challenged, and confident using their interests",
  "challengeLevel": "gentle | balanced | stretch | advanced",
  "visualPlan": ["small SVG line-art", "puzzle grid"],
  "questionFormats": ["mission cards", "evidence hunt"],
  "answerExpectations": "what the answer sheet must include for every question",
  "vocabularyPlan": "how hard words, definitions, examples, and memory hints should work",
  "testReadinessPlan": "age-appropriate future-test or SAT-style skill plan"
}

Pedagogical principles to honor:
- Developmental fit first: match attention span, reading load, and abstraction to the age.
- Pre-K/K: short, playful, concrete, picture-supported; few subjects, more visuals.
- Grades 1-5: build reading, vocabulary, number sense, writing mechanics, science curiosity, and logic with growing independence.
- Grades 6-8: add multi-step reasoning, evidence, quantitative reasoning, and clear written explanation across more subjects.
- Grades 9-12: include SAT-style reading evidence, vocabulary in context, algebraic and data reasoning, argument writing, and trap-answer elimination.
- "questionCount" MUST equal the sum of the section "questionCount" values.
- Every section must list the specific skills it tests.
- Do not include the learner nickname or any private data.`
      }
    ]
  });

  return normalizeBlueprint(parseJsonContent(content), input);
}

// ollamaChat — single call to the local Ollama server via the native /api/chat API.
// keep_alive/num_thread/num_ctx are set on every request so the performance tuning
// travels with the code and needs no server-side configuration.
async function ollamaChat(options: {
  messages: Array<{ role: "system" | "user"; content: string }>;
  maxTokens: number;
  temperature: number;
  responseFormat?: "json_object";
  model?: string;
  timeoutMs?: number;  // override per call-type
  numCtx?: number;     // override context window per call-type
}): Promise<string> {
  const model = options.model ?? FAST_MODEL;
  const timeout = options.timeoutMs ?? LLM_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  let response: Response;
  try {
    response = await fetch(ollamaEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: options.messages,
        stream: false,
        keep_alive: OLLAMA_KEEP_ALIVE,
        ...(options.responseFormat === "json_object" ? { format: "json" } : {}),
        options: {
          temperature: options.temperature,
          num_predict: options.maxTokens,
          num_ctx: options.numCtx ?? DEFAULT_NUM_CTX,
          num_thread: OLLAMA_NUM_THREAD
        }
      })
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Ollama returned ${response.status}: ${body.slice(0, 240)}`);
  }

  const data = await response.json();
  const content = data?.message?.content;

  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Ollama response did not include worksheet content.");
  }

  return content;
}

// Keep groqChat as an alias so existing call sites don't need updating yet.
const groqChat = ollamaChat;

function createFallbackHtmlWorksheet(input: WorksheetInput, blueprint: LearningBlueprint): string {
  return injectNickname(createSampleHtmlWorksheet(input, blueprint), input.childName);
}

function normalizeBlueprint(value: unknown, input: WorksheetInput): LearningBlueprint {
  const fallback = defaultBlueprint(input);

  if (!value || typeof value !== "object") {
    return fallback;
  }

  const candidate = value as Partial<LearningBlueprint>;
  const sections = normalizeSections(candidate.sections, fallback.sections, input);
  const questionCount = sections.reduce((sum, section) => sum + section.questionCount, 0);

  return {
    curriculumPath: cleanText(String(candidate.curriculumPath || fallback.curriculumPath), 220),
    gradeExpectations: cleanText(
      String(candidate.gradeExpectations || fallback.gradeExpectations),
      420
    ),
    pageTarget: cleanText(String(candidate.pageTarget || fallback.pageTarget), 80),
    questionCount,
    sections,
    subjectMix: normalizeStringList(
      candidate.subjectMix,
      sections.map((section) => section.subject),
      10
    ),
    cognitiveSkills: normalizeStringList(candidate.cognitiveSkills, fallback.cognitiveSkills, 12),
    motivationStrategy: cleanText(
      String(candidate.motivationStrategy || fallback.motivationStrategy),
      360
    ),
    challengeLevel: cleanText(String(candidate.challengeLevel || fallback.challengeLevel), 40),
    visualPlan: normalizeStringList(candidate.visualPlan, fallback.visualPlan, 10),
    questionFormats: normalizeStringList(candidate.questionFormats, fallback.questionFormats, 10),
    answerExpectations: cleanText(
      safeString(candidate.answerExpectations) || fallback.answerExpectations,
      360
    ),
    vocabularyPlan: cleanText(
      safeString(candidate.vocabularyPlan) || fallback.vocabularyPlan,
      360
    ),
    testReadinessPlan: cleanText(
      safeString(candidate.testReadinessPlan) || fallback.testReadinessPlan,
      360
    )
  };
}

function defaultBlueprint(input: WorksheetInput): LearningBlueprint {
  const early = input.age <= 6;
  const elementary = input.age >= 7 && input.age <= 10;
  const middle = input.age >= 11 && input.age <= 14;
  const high = isHighSchoolOrAdult(input);
  const theme = input.interests.split(",")[0]?.trim() || "learning";
  const history = isHistoryTheme(theme);
  const sections = defaultSectionPlan(input);

  return {
    curriculumPath: history ? "History and evidence-centered mixed practice" : "General standards-aligned mixed practice",
    gradeExpectations: early
      ? "Practice concrete early literacy, counting, observation, patterns, fine-motor writing, and confidence."
      : elementary
        ? history
          ? "Practice grade-level reading, timelines, source clues, vocabulary, number sense, writing, and cause-and-effect."
          : "Practice reading comprehension, vocabulary, number sense, evidence, writing, and logic."
        : middle
          ? history
            ? "Practice source reasoning, chronology, cause-and-effect, vocabulary in context, quantitative reasoning, and clear explanations."
            : "Practice multi-step reasoning, evidence, vocabulary in context, quantitative reasoning, and clear explanations."
          : history
            ? "Practice advanced historical interpretation, source corroboration, causation, vocabulary in context, and argument writing."
            : "Practice SAT-ready reading evidence, vocabulary in context, algebraic reasoning, quantitative interpretation, and argument writing.",
    pageTarget: early ? "1-2 A4 pages" : high ? "6-9 A4 pages" : middle ? "5-7 A4 pages" : "3-5 A4 pages",
    questionCount: sections.reduce((sum, section) => sum + section.questionCount, 0),
    sections,
    subjectMix: sections.map((section) => section.subject),
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

// Expert-derived default section plan, used only when the blueprint AI is unavailable
// or too thin to parse. Proportions follow common curriculum guidance per age band so
// the fallback still covers the right subjects with sensible counts.
function defaultSectionPlan(input: WorksheetInput): WorksheetSection[] {
  const early = input.age <= 6 || input.grade === "Pre-K" || input.grade === "Kindergarten";
  const elementary = !early && input.age <= 10;
  const middle = !early && !elementary && input.age <= 14;
  const theme = input.interests.split(",")[0]?.trim() || "learning";
  const history = isHistoryTheme(theme);

  if (early) {
    return [
      { subject: "Reading Comprehension", questionCount: 2, skills: ["listening for the main idea", "picture clues"], focus: "A very short, picture-supported story tied to the interests." },
      { subject: "Vocabulary in Context", questionCount: 2, skills: ["new words", "matching words to pictures"], focus: "Friendly theme words with simple meanings." },
      { subject: "Math Reasoning", questionCount: 3, skills: ["counting", "comparing", "simple addition"], focus: "Concrete counting and number sense with objects." },
      { subject: "Logic and Patterns", questionCount: 1, skills: ["patterns", "sorting"], focus: "A playful pattern or odd-one-out." }
    ];
  }

  // Shape: a deep CORE (reading, writing, math) carries most of the work, then 1-2
  // SHORT enrichment sections add variety without diluting the core.
  if (elementary) {
    if (history) {
      return [
        { subject: "Reading Comprehension", questionCount: 4, skills: ["main idea", "details", "sequence", "source clues"], focus: "A grade-level history passage with evidence questions." },
        { subject: "Vocabulary in Context", questionCount: 3, skills: ["history words", "context clues", "using words"], focus: "Timeline and source vocabulary from the passage." },
        { subject: "Social Studies and History", questionCount: 3, skills: ["timeline", "past and present", "cause and effect"], focus: "History questions about sources, order, and change over time." },
        { subject: "Grammar and Writing", questionCount: 3, skills: ["sentence structure", "punctuation", "clear writing"], focus: "Write clear sentences about historical evidence." },
        { subject: "Math Reasoning", questionCount: 2, skills: ["elapsed time", "word problems"], focus: "Simple timeline and museum-count problems." },
        { subject: "Logic and Patterns", questionCount: 1, skills: ["sequence", "reasoning"], focus: "A timeline or evidence-order puzzle." }
      ];
    }
    return [
      // Core
      { subject: "Reading Comprehension", questionCount: 4, skills: ["main idea", "supporting detail", "sequence", "vocabulary in context"], focus: "An original theme passage with evidence questions." },
      { subject: "Vocabulary in Context", questionCount: 3, skills: ["definitions", "context clues", "using words"], focus: "Words pulled from the passage with memory hints." },
      { subject: "Grammar and Writing", questionCount: 3, skills: ["sentence structure", "punctuation", "clear writing"], focus: "Fix-and-write practice in the learner's voice." },
      { subject: "Math Reasoning", questionCount: 4, skills: ["multi-step problems", "number patterns", "word problems"], focus: "Story problems that show the setup." },
      // Short enrichment
      { subject: "Science Investigation", questionCount: 1, skills: ["observation", "cause and effect"], focus: "A small investigation linked to the interests." },
      { subject: "Logic and Patterns", questionCount: 1, skills: ["pattern recognition", "reasoning"], focus: "A pattern or logic puzzle." }
    ];
  }

  if (middle) {
    if (history) {
      return [
        { subject: "Reading Comprehension", questionCount: 5, skills: ["main idea", "evidence", "inference", "source perspective"], focus: "A substantial history passage with source-based inference." },
        { subject: "Vocabulary in Context", questionCount: 3, skills: ["academic history vocabulary", "context clues"], focus: "Terms historians use to explain evidence." },
        { subject: "Social Studies and History", questionCount: 4, skills: ["chronology", "cause and effect", "source reasoning"], focus: "Analyze sources, timelines, and historical claims." },
        { subject: "Grammar and Writing", questionCount: 3, skills: ["revision", "explanation writing", "claim evidence reasoning"], focus: "Revise and explain a historical claim." },
        { subject: "Math Reasoning", questionCount: 3, skills: ["timeline math", "ratios", "quantitative reasoning"], focus: "Use dates and counts to reason about historical change." },
        { subject: "Critical Thinking", questionCount: 1, skills: ["synthesis", "argument"], focus: "Weigh two explanations for an event." }
      ];
    }
    return [
      // Core
      { subject: "Reading Comprehension", questionCount: 5, skills: ["main idea", "evidence", "inference", "tone", "author's purpose"], focus: "A substantial original passage with evidence and inference." },
      { subject: "Vocabulary in Context", questionCount: 3, skills: ["context clues", "shades of meaning"], focus: "Stronger words from the passage with examples." },
      { subject: "Grammar and Writing", questionCount: 3, skills: ["revision", "combining sentences", "explanation writing"], focus: "Revise and explain in clear writing." },
      { subject: "Math Reasoning", questionCount: 5, skills: ["multi-step reasoning", "ratios", "quantitative reasoning"], focus: "Multi-step problems and real-world reasoning." },
      // Short enrichment
      { subject: "Science Investigation", questionCount: 2, skills: ["hypothesis", "variables", "evidence"], focus: "Interpret a short experiment." },
      { subject: "Logic and Patterns", questionCount: 1, skills: ["sequences", "logical reasoning"], focus: "A number or logic puzzle." },
      { subject: "Social Studies and History", questionCount: 1, skills: ["cause and effect", "source reasoning"], focus: "A decision-point or source question." }
    ];
  }

  if (history) {
    return [
      // Core
      { subject: "Reading Comprehension", questionCount: 6, skills: ["central claim", "source evidence", "inference", "tone", "structure", "comparing interpretations"], focus: "An advanced history passage with source and interpretation questions." },
      { subject: "Vocabulary in Context", questionCount: 4, skills: ["historiography vocabulary", "precise meaning"], focus: "Academic history words tested in context." },
      { subject: "Social Studies and History", questionCount: 5, skills: ["primary source analysis", "corroboration", "causation", "continuity and change"], focus: "Evaluate historical evidence and competing explanations." },
      { subject: "Grammar and Writing", questionCount: 3, skills: ["concision", "claim evidence reasoning", "argument"], focus: "Revision and a short historical argument." },
      { subject: "Math Reasoning", questionCount: 2, skills: ["timeline reasoning", "percentages", "quantitative interpretation"], focus: "Use dates and figures to test a historical claim." },
      { subject: "Critical Thinking", questionCount: 2, skills: ["synthesis", "argument"], focus: "Connect evidence, interpretation, and uncertainty." }
    ];
  }

  return [
    // Core
    { subject: "Reading Comprehension", questionCount: 6, skills: ["central claim", "evidence", "inference", "tone", "structure", "comparing texts"], focus: "A substantial SAT-style original passage." },
    { subject: "Vocabulary in Context", questionCount: 3, skills: ["vocabulary in context", "precise meaning"], focus: "Academic words tested in context." },
    { subject: "Grammar and Writing", questionCount: 3, skills: ["concision", "evidence-based writing", "argument"], focus: "Revision and a short argument." },
    { subject: "Math Reasoning", questionCount: 5, skills: ["algebraic reasoning", "percentages", "quantitative interpretation"], focus: "Multi-step quantitative problems with real choices." },
    // Short enrichment
    { subject: "Science Investigation", questionCount: 2, skills: ["data analysis", "controls", "inference"], focus: "Analyze experimental data." },
    { subject: "Logic and Patterns", questionCount: 1, skills: ["sequences", "abstract reasoning"], focus: "Decode a rule or pattern." },
    { subject: "Critical Thinking", questionCount: 1, skills: ["synthesis", "argument"], focus: "Connect interest to academic persistence." }
  ];
}

// Match a free-text subject from the blueprint AI to one of the canonical subjects the
// fallback knows how to generate.
function canonicalSubject(name: string): string | null {
  const lower = name.toLowerCase();
  if (/read|comprehension|passage/.test(lower)) return "Reading Comprehension";
  if (/vocab|word/.test(lower)) return "Vocabulary in Context";
  if (/grammar|writing|write|language|essay/.test(lower)) return "Grammar and Writing";
  if (/math|number|algebra|arithmetic|geometry|quantitative/.test(lower)) return "Math Reasoning";
  if (/science|biology|physics|chemistry|experiment|investigat/.test(lower)) return "Science Investigation";
  if (/social|history|geograph|civics|economic/.test(lower)) return "Social Studies and History";
  if (/logic|pattern|puzzle|sequence|reasoning/.test(lower)) return "Logic and Patterns";
  if (/critical|think|synthesis|argument/.test(lower)) return "Critical Thinking";
  return null;
}

function questionCountBounds(input: WorksheetInput): { min: number; max: number } {
  const early = input.age <= 6 || input.grade === "Pre-K" || input.grade === "Kindergarten";
  const elementary = !early && input.age <= 10;
  const middle = !early && !elementary && input.age <= 14;

  if (early) return { min: MIN_TOTAL_QUESTIONS, max: 10 };
  if (elementary) return { min: 10, max: 16 };
  if (middle) return { min: 12, max: 22 };
  return { min: 16, max: MAX_TOTAL_QUESTIONS };
}

function normalizeSections(value: unknown, fallback: WorksheetSection[], input: WorksheetInput): WorksheetSection[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const bySubject = new Map<string, WorksheetSection>();

  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const candidate = raw as Partial<WorksheetSection>;
    const subject = canonicalSubject(cleanText(String(candidate.subject || ""), 60));
    if (!subject) continue;

    const count = Number(candidate.questionCount);
    if (!Number.isInteger(count) || count < 1) continue;
    const clamped = Math.min(12, count);

    const skills = normalizeStringList(candidate.skills, [], 6);
    const focus = cleanText(String(candidate.focus || ""), 200);

    // Merge duplicate subjects by summing their counts.
    const existing = bySubject.get(subject);
    if (existing) {
      existing.questionCount = Math.min(12, existing.questionCount + clamped);
    } else {
      bySubject.set(subject, { subject, questionCount: clamped, skills, focus });
    }
  }

  const sections = Array.from(bySubject.values());

  // Require at least two subjects and a sensible total; otherwise trust the default.
  const bounds = questionCountBounds(input);
  let total = sections.reduce((sum, section) => sum + section.questionCount, 0);
  if (sections.length < 2 || total < bounds.min) {
    return fallback;
  }

  // Trim the largest sections until the total fits the upper bound.
  while (total > bounds.max) {
    const largest = sections.reduce((a, b) => (b.questionCount > a.questionCount ? b : a));
    if (largest.questionCount <= 1) break;
    largest.questionCount -= 1;
    total -= 1;
  }

  return sections;
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
      minReadingWords: input.age <= 8 ? 170 : 280,
      minVocabularyCards: input.age <= 8 ? 4 : 5,
      requiredTerms: ["reading comprehension", "vocabulary", "math reasoning", "answer sheet"]
    };
  }

  if (input.age <= 14) {
    return {
      minHtmlCharacters: 13000,
      minStudentWords: 950,
      minQuestions: 16,
      minReadingWords: 460,
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
    minReadingWords: 650,
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

function createSampleHtmlWorksheet(input: WorksheetInput, blueprint: LearningBlueprint): string {
  return assembleWorksheet(input, blueprint, {});
}

type RenderQuestion = {
  section: string;
  number: number;
  promptHtml: string;
  choices: string[];
  answerHtml: string;
  explanationHtml: string;
  hint: string;
};

// Build the worksheet from the blueprint section plan. Any AI-authored pieces present
// in `content` are used; everything else is filled from the deterministic banks, so the
// worksheet is always complete and on-plan whether or not the AI calls succeeded.
function assembleWorksheet(
  input: WorksheetInput,
  blueprint: LearningBlueprint,
  content: WorksheetContent
): string {
  const theme = escapeHtml(input.interests.split(",")[0]?.trim() || "learning");
  const allInterests = escapeHtml(input.interests);
  const grade = escapeHtml(input.grade);
  const high = isHighSchoolOrAdult(input);
  const middle = !high && input.age >= 11;
  const isSpaceTheme = !high && !middle && theme.toLowerCase().includes("space");
  const answerContext = { high, isSpace: isSpaceTheme };
  const plannedSections = blueprint.sections.length ? blueprint.sections : defaultSectionPlan(input);
  const strategyBlock = strategyBlockFor(input, blueprint);
  const passage = content.passageHtml
    ? content.passageHtml
    : high
      ? highSchoolFallbackPassage(theme)
      : middle
        ? middleSchoolFallbackPassage(theme, allInterests)
        : elementaryFallbackPassage(theme, allInterests);
  const rawTheme = input.interests.split(",")[0]?.trim() || "your topic";
  const history = isHistoryTheme(rawTheme);
  const bankVocab = bankVocabFor(high, middle, rawTheme);
  // Use AI vocabulary when present, but top up from the bank so there are always enough
  // cards (a thin AI vocab list otherwise leaves the worksheet with too few words).
  const minVocab = qualityProfileFor(input).minVocabularyCards;
  const vocabWords = content.vocab?.length ? [...content.vocab] : [...bankVocab];
  for (const bankWord of bankVocab) {
    if (vocabWords.length >= minVocab) break;
    if (!vocabWords.some((v) => v[0].toLowerCase() === bankWord[0].toLowerCase())) {
      vocabWords.push(bankWord);
    }
  }

  // Theme-aware question banks, one per canonical subject.
  const banks = fallbackQuestionBanks({ high, middle, history, theme, vocabWords });

  // Vocabulary questions are templated from the vocabulary words (AI or bank).
  const vocabQuestions: GeneratedQuestion[] = vocabWords.map(([word]) => ({
    prompt: `Use ${word} in a precise sentence connected to ${theme}, then explain which clue helped you understand it.`,
    choices: [],
    correctAnswer: "A complete sentence that uses the vocabulary word correctly and connects it to the mission theme.",
    explanation: "The sentence should prove the learner understands the word, not just copy it. A good sentence gives context clues."
  }));

  const aiQuestionsFor = (subject: string): GeneratedQuestion[] | undefined => {
    if (subject === "Reading Comprehension") return content.readingQuestions;
    if (subject === "Vocabulary in Context") return vocabQuestions;
    return content.sectionQuestions?.[subject];
  };

  let runningNumber = 0;
  const fromBank = (subject: string, index: number): RenderQuestion => {
    const bank = banks[subject]?.length ? banks[subject] : banks["Critical Thinking"];
    const fq: FallbackQuestion = {
      section: subject,
      text: bank[index % bank.length],
      number: runningNumber,
      indexInSection: index
    };
    return {
      section: subject,
      number: runningNumber,
      promptHtml: escapeHtml(fq.text),
      choices: (mathChoicesFor(fq) ?? []).map(escapeHtml),
      answerHtml: fallbackAnswerFor(fq, theme, answerContext),
      explanationHtml: fallbackExplanationFor(fq, theme, answerContext),
      hint: questionHintFor(fq)
    };
  };
  const fromAi = (subject: string, q: GeneratedQuestion): RenderQuestion => ({
    section: subject,
    number: runningNumber,
    promptHtml: escapeHtml(q.prompt),
    choices: q.choices.map(escapeHtml),
    answerHtml: escapeHtml(q.correctAnswer),
    explanationHtml: escapeHtml(q.explanation),
    hint: questionHintFor({ section: subject })
  });

  // Build questions strictly from the blueprint section plan: each section gets exactly
  // its planned count, AI-authored where available and bank-filled otherwise.
  const builtSections = plannedSections.map((section) => {
    const ai = aiQuestionsFor(section.subject);

    // Reading is atomic: its questions and answers must match the passage that is shown,
    // so we never mix AI reading questions with bank ones (which describe a different
    // passage). The staged pipeline guarantees the AI passage and questions arrive together.
    if (section.subject === "Reading Comprehension" && ai && ai.length) {
      const questions = ai.map((aiQuestion) => {
        runningNumber += 1;
        return fromAi(section.subject, aiQuestion);
      });
      return { subject: section.subject, questions };
    }

    const questions = Array.from({ length: section.questionCount }, (_unused, index) => {
      runningNumber += 1;
      const aiQuestion = ai && ai[index];
      return aiQuestion ? fromAi(section.subject, aiQuestion) : fromBank(section.subject, index);
    });
    return { subject: section.subject, questions };
  });
  const allQuestions = builtSections.flatMap((section) => section.questions);

  const renderQuestionCard = (q: RenderQuestion) => `<article class="card question" data-question="true">
        <p class="label">Q${q.number} | ${escapeHtml(q.section)}</p>
        <h3>${q.promptHtml}</h3>
        ${q.choices.length ? `<p class="choice-line">${q.choices.map((opt, i) => `${String.fromCharCode(65 + i)}. ${opt}`).join(" &nbsp; ")}</p>` : ""}
        <div class="write"></div>
        <p class="hint">${escapeHtml(q.hint)}</p>
      </article>`;
  const questionSectionsHtml = builtSections
    .map(
      (section) => `<h3 class="section-head">${escapeHtml(section.subject)}</h3>
    <section class="grid">
      ${section.questions.map(renderQuestionCard).join("")}
    </section>`
    )
    .join("\n");
  const funZone = funZoneBlock(input, theme);
  const answerCards = allQuestions
    .map(
      (q) => `<article class="answer" data-answer="true">
        <h3>Q${q.number}. ${escapeHtml(q.section)}</h3>
        <p><strong>Correct answer:</strong> ${q.answerHtml}</p>
        <p><strong>Why it is right:</strong> ${q.explanationHtml}</p>
        <p><strong>Watch out for:</strong> ${escapeHtml(watchOutFor(q.section, high))}</p>
        <p><strong>Skill being practiced:</strong> ${escapeHtml(q.section)}. <strong>Next time:</strong> ${escapeHtml(nextTimeTipFor(q.section, high))}</p>
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
  .label { color:var(--accent); font-size:12px; font-weight:700; text-transform:uppercase; }
  .section-head { margin:14px 0 6px; padding:4px 8px; background:var(--soft); border-left:3px solid var(--accent); font-size:15px; }
  .write { min-height:44px; border-bottom:1px solid var(--ink); margin-top:8px; }
  .choice-line { font-size:13px; color:#303836; }
  .fun-card { background:var(--cool); }
  .puzzle-row { display:flex; flex-wrap:wrap; align-items:center; gap:6px; margin:6px 0; }
  .puzzle-shape svg { width:26px; height:26px; }
  .puzzle-blank { display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px; border:1px dashed var(--accent); border-radius:4px; font-weight:700; color:var(--accent); }
  .puzzle-svg { width:100%; max-width:200px; height:auto; margin-top:4px; }
  .puzzle-pair { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
  .puzzle-cap { font-size:12px; color:var(--muted); margin:0 0 2px; }
  .puzzle-code { font-family:monospace; font-size:16px; letter-spacing:1px; margin:6px 0; }
  .puzzle-word { display:inline-block; border:1px solid var(--line); border-radius:4px; padding:1px 6px; margin:2px; font-size:12px; }
  .ws-grid { border-collapse:collapse; margin-top:6px; }
  .ws-grid td { border:1px solid var(--line); width:21px; height:21px; text-align:center; font-family:monospace; font-size:12px; }
  .magic-square { margin-top:6px; }
  .magic-square td { border:1px solid var(--ink); width:34px; height:34px; text-align:center; font-size:16px; font-weight:700; }
  .logic-grid { border-collapse:collapse; margin-top:6px; }
  .logic-grid th, .logic-grid td { border:1px solid var(--line); padding:4px 8px; text-align:center; font-size:13px; }
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
      <p>${escapeHtml(learnerFriendlyMissionCopy(input, blueprint))}</p>
    </div>
    <svg viewBox="0 0 120 90" role="img" aria-label="Low ink learning icon">
      <rect x="18" y="16" width="70" height="48" rx="5"></rect>
      <path d="M28 30h50M28 42h38M28 54h46"></path>
      <circle cx="92" cy="24" r="10"></circle>
      <path d="M88 67l12 10 6-24"></path>
    </svg>
  </section>

  <h2>Reading Comprehension</h2>
  <article class="passage" data-reading-passage="true">
    ${passage}
  </article>

  <h2>Vocabulary in Context</h2>
  <section class="vocab-grid">
    ${vocabCards}
  </section>
  <h2>Question Missions</h2>
  ${questionSectionsHtml}

  ${funZone.html}

  <h2>Answer Sheet</h2>
  <section class="grid">
    ${answerCards}
    ${funZone.answersHtml}
  </section>

  <h2>${escapeHtml(strategyBlock.title)}</h2>
  <article class="card">
    <p>${strategyBlock.html}</p>
  </article>
</main>
</body>
</html>`;
}

// Grade-tiered fallback vocabulary used only when the AI vocab is missing or thin.
// The AI normally pulls words from the passage; this keeps the words age-appropriate
// (not the old easy/meta set) and frames each example with the learner's topic.
function bankVocabFor(high: boolean, middle: boolean, theme: string): string[][] {
  if (isHistoryTheme(theme) && high) {
    return [
      ["historiography", "the study of how history is written and interpreted", "Historiography asks why two scholars may explain the same revolution differently.", "Historiography = history about history-writing."],
      ["corroborate", "to confirm a claim by checking it against another source", "A historian corroborates a diary entry with tax records and newspaper reports.", "Corroborate = confirm with another source."],
      ["causation", "the relationship between causes and effects", "Causation is hard to prove when economic, political, and cultural changes overlap.", "Causation = why something happened."],
      ["continuity", "something that stays mostly the same over time", "The law changed, but some patterns of land ownership showed continuity.", "Continuity = what keeps going."],
      ["primary source", "a source created during the time being studied", "A court record from 1892 is a primary source for that case.", "Primary = from the period itself."],
      ["revisionism", "a new interpretation that challenges an older historical explanation", "Revisionism can be valuable when new evidence changes the picture.", "Revision = looking again."],
      ["contextualize", "to place evidence within its time, place, and conditions", "To contextualize the speech, examine who heard it and what crisis came before it.", "Context = the world around the source."],
      ["archival", "related to records preserved for research", "Archival evidence can reveal ordinary lives missing from official histories.", "Archive = stored records."]
    ];
  }
  if (isHistoryTheme(theme) && middle) {
    return [
      ["chronology", "the order in which events happen", "A chronology helps explain which event came before the reform.", "Chronology = time order."],
      ["artifact", "an object made or used by people in the past", "A cracked bowl can be an artifact that shows how people cooked.", "Artifact = object evidence."],
      ["primary source", "a source from the time being studied", "A soldier's letter is a primary source about the war.", "Primary = from the time."],
      ["perspective", "a point of view shaped by experience", "Two witnesses may describe the same march from different perspectives.", "Perspective = viewpoint."],
      ["migration", "movement from one place to another", "Migration changed the size and culture of the city.", "Migration = people moving."],
      ["cause", "something that helps make an event happen", "A drought can be one cause of migration.", "Cause = why it happened."],
      ["evidence", "facts or details used to support a claim", "A historian needs evidence before making a claim.", "Evidence = proof you can point to."],
      ["bias", "a preference that can make a source less balanced", "A campaign poster may show bias because it wants voters to agree.", "Bias = one-sided lean."]
    ];
  }
  if (isHistoryTheme(theme)) {
    return [
      ["timeline", "a line that shows events in order", "The class made a timeline of the town's first school.", "Timeline = events in order."],
      ["source", "something that gives information", "An old photo can be a source about the past.", "Source = where information comes from."],
      ["artifact", "an object from the past", "The museum kept an artifact from the first train station.", "Artifact = a past object."],
      ["event", "something important that happened", "The bridge opening was a big event for the town.", "Event = something that happened."],
      ["community", "a group of people who live or work together", "A community can change when a new library opens.", "Community = people together."],
      ["evidence", "a clue or fact that helps prove an idea", "The date on the letter is evidence.", "Evidence = proof clue."]
    ];
  }
  if (high) {
    return [
      ["nuance", "a small but important difference in meaning", `A strong essay captures the nuance in a debate about ${theme}.`, "Nuance = a subtle shade of meaning."],
      ["substantiate", "to support a claim with evidence", `Substantiate your point about ${theme} with a fact, not a feeling.`, "Substantiate shares a root with substance."],
      ["inference", "a conclusion drawn from clues, not stated outright", `She made an inference about ${theme} from the data.`, "Infer = figure out from evidence."],
      ["plausible", "believable at first, but still needing proof", "A plausible answer can still be wrong if the evidence doesn't support it.", "Pause at plausible choices and check evidence."],
      ["synthesis", "combining ideas into a stronger whole", `His report used synthesis to connect history and ${theme}.`, "Synthesis = ideas stitched together."],
      ["bias", "a preference that can make judgment less fair", "A chart can reveal bias in how data was collected.", "Bias bends judgment one way."],
      ["paradox", "a statement that seems contradictory yet may be true", `Studying ${theme} has a paradox: slowing down can speed up progress.`, "Paradox = a 'both/and' puzzle."],
      ["empirical", "based on observation or experiment, not just theory", `Empirical evidence about ${theme} comes from real measurements.`, "Empirical = you can observe it."]
    ];
  }
  if (middle) {
    return [
      ["analyze", "to break something down to understand how it works", `We analyze how the ${theme} problem was solved, step by step.`, "Analyze = take apart to understand."],
      ["evidence", "facts or details that support a conclusion", `Give evidence from the text to back your idea about ${theme}.`, "Evidence = the proof."],
      ["infer", "to figure out something using clues", `Infer what the ${theme} author means, even when it isn't stated.`, "Infer = read between the lines."],
      ["perspective", "a particular point of view", `Two fans can see the same ${theme} moment from a different perspective.`, "Perspective = the angle you see from."],
      ["significant", "important or large enough to matter", `A significant change in the ${theme} results is worth explaining.`, "Significant = it makes a real difference."],
      ["contrast", "to show how two things are different", `Contrast the two ${theme} strategies and pick the stronger one.`, "Contrast = spot the differences."],
      ["summarize", "to retell the main points briefly", `Summarize the ${theme} passage in one or two sentences.`, "Summarize = the short version."],
      ["conclude", "to decide something after thinking it through", `What can you conclude about ${theme} from the evidence?`, "Conclude = reach the end of your reasoning."]
    ];
  }
  return [
    ["describe", "to tell what something is like", `Describe one thing you notice about ${theme}.`, "Describe = paint a word picture."],
    ["compare", "to tell how things are alike and different", `Compare two ${theme} ideas side by side.`, "Compare = check side by side."],
    ["predict", "to make a smart guess using clues", `Predict what happens next in the ${theme} story.`, "Predict = think ahead."],
    ["observe", "to look or watch carefully", `Observe the ${theme} picture before you answer.`, "Observe = look closely."],
    ["explain", "to make something clear by giving reasons", `Explain why your ${theme} answer makes sense.`, "Explain = tell the why."],
    ["pattern", "something that repeats in a regular way", `Find the pattern in the ${theme} puzzle.`, "Pattern = it repeats."]
  ];
}

function highSchoolFallbackPassage(theme: string): string {
  if (isHistoryTheme(theme)) {
    return `<p><strong>Passage A:</strong> Advanced history work begins with a deceptively simple question: what would count as convincing evidence? A chronicle may name a ruler as the cause of a reform, while tax records, migration tables, and court petitions suggest that pressure had been building for decades. The strongest historical argument does not merely collect impressive details. It explains how each source was produced, whose interests it served, what it leaves out, and how it changes when placed beside other evidence. That process is called corroboration, and it is one reason historical interpretation is more demanding than memorizing dates.</p>
  <p>Consider a city that expanded its public schools between 1880 and 1910. One interpretation might credit a mayor who promised modern classrooms. A second might emphasize factory owners who wanted literate workers. A third might point to immigrant families who organized petitions after their children were turned away from crowded schools. Each interpretation may contain truth, but none is complete until the historian tests it against the record. Election speeches reveal ambition. Budgets reveal priorities. Attendance ledgers show who was actually served. Petitions preserve voices that official reports sometimes ignore. The historian's task is to decide how these fragments fit together without pretending the evidence is cleaner than it is.</p>
  <p><strong>Passage B:</strong> Chronology also matters. If the petitions appeared before the mayor's speech, they may have shaped the promise instead of merely responding to it. If school spending rose only after a new tax law, fiscal policy becomes part of the explanation. If factories had already begun requiring reading tests for apprentices, economic pressure may have reinforced public demand. Causation in history is rarely a single arrow. It is usually a network of conditions, choices, constraints, and unintended consequences. Strong historians identify the most important causes while admitting what the evidence cannot prove.</p>
  <p>This is why historical thinking remains useful beyond a classroom. It trains a reader to resist simple stories, especially when those stories flatter one group or erase another. It also makes uncertainty productive. An unanswered question is not a failure; it is a research path. A careful scholar can write, "The evidence strongly suggests," "This source complicates," or "This explanation is plausible but incomplete." Those phrases are not weak. They are honest. They show that the writer understands both the power and the limits of the archive.</p>
  <p>For a learner interested in ${theme}, the goal is not to sound impressive by using difficult words. The goal is to use those words to think more precisely. Historiography asks how explanations change over time. Contextualization asks what else was happening when a source was created. Continuity and change ask what transformed and what endured. When a student connects these habits to a clear claim, the worksheet becomes more than practice. It becomes training in how to build an argument that can stand up to evidence.</p>`;
  }

  return `<p><strong>Passage A:</strong> Coaches, inventors, and historians often disagree about what makes a person improve. One group praises natural talent, another praises technology, and a third points to discipline. The most useful answer is less dramatic: improvement usually comes from feedback that is specific enough to change the next attempt. A basketball player who only hears "shoot better" receives criticism, but not instruction. A player who learns that the elbow is drifting outward, that the release is late, and that fatigue changes foot placement receives information that can be tested. The difference matters because feedback becomes powerful only when it can guide action.</p>
  <p>Modern technology can make feedback faster. A camera can freeze a shooting motion, a spreadsheet can reveal which practice days were most efficient, and a robot can repeat the same movement without boredom. Yet tools do not replace judgment. A device may show that a student answered vocabulary questions quickly, but it cannot always tell whether the student understood the passage or merely recognized familiar words. A chart can show that accuracy improved from 68 percent to 83 percent, but the learner still has to ask what changed: more time, better notes, easier questions, or a stronger strategy. Data begins the conversation; thinking finishes it.</p>
  <p>That is why disciplined learners treat mistakes as evidence, not as proof of failure. When they miss a reading question, they do not simply memorize the correct letter. They ask whether the wrong answer was too broad, too extreme, unsupported, or tempting because it repeated a phrase from the passage. When they miss a math question, they ask whether the error came from the setup, the calculation, the units, or the final interpretation. This habit is especially useful on SAT-style tests because many wrong choices are plausible. They are designed to attract students who read quickly but not carefully.</p>
  <p><strong>Passage B:</strong> History offers a similar lesson. Cities that adopted new tools, from printing presses to transit systems, did not automatically become wiser or more fair. The tools created possibilities, but people still had to decide how to use them. A map can help a city plan safer roads, but a biased map may ignore neighborhoods with less political power. A timeline can show when inventions appeared, but it cannot by itself explain who benefited and who was left out. The strongest thinkers combine curiosity with skepticism. They welcome useful tools, but they also evaluate the assumptions behind the tools.</p>
  <p>Consider a student comparing two explanations for an event. One explanation may be exciting because it names a single hero, invention, or lucky moment. Another may be less simple because it includes economics, geography, public choices, and unintended consequences. The second explanation is harder to remember, but it may be more accurate. Strong readers learn to prefer the answer that the evidence can actually support. Strong mathematicians do the same thing with numbers: they do not accept a result merely because it feels close. They check whether the units, operations, and assumptions fit the situation.</p>
  <p>The same approach can guide a student who cares about ${theme}. Interest creates energy, but strategy turns energy into progress. A learner might begin with excitement, then calibrate the challenge: not so easy that practice becomes automatic, not so hard that effort becomes random. The best practice sits in the stretch zone, where a mistake gives information and a correct answer can be explained. In that zone, reading comprehension, mathematical reasoning, and creative problem solving become connected. The student is not just finishing a worksheet; the student is learning how to think under pressure and how to defend a choice with clear evidence.</p>`;
}

function middleSchoolFallbackPassage(theme: string, interests: string): string {
  if (isHistoryTheme(theme)) {
    return `<p>A historian is a detective of the past, but the clues are not always simple. One source might be a letter, another might be a map, and another might be a broken tool found near an old road. Each source can teach something, but each source also has limits. A letter tells one person's perspective. A map may show roads and rivers, but not the people who could not afford to travel. An artifact shows what people made or used, but it may not explain what they believed.</p>
  <p>Imagine a class studying why a town grew quickly after a railroad arrived. The easiest answer is, "The railroad caused the growth." A stronger answer looks for evidence. Did stores open before or after the railroad station? Did more families move into town? Did farmers ship crops farther away? Did some people lose land when the tracks were built? A timeline helps the class put events in order, but the students still need to explain cause and effect.</p>
  <p>The class also compares perspectives. A shop owner might remember the railroad as a success because more customers arrived. A farmer might remember it as expensive because land prices changed. A worker might remember dangerous jobs building the tracks. These memories do not all cancel each other out. Together, they help students see that history is bigger than one person's story.</p>
  <p>Because the learner also mentioned ${interests}, the worksheet connects history to real interests and real choices. Good historical thinking asks students to read carefully, use dates accurately, notice bias, and explain claims in their own words. The goal is not to memorize every detail. The goal is to use evidence to make a fair explanation of what changed, what stayed the same, and why it mattered.</p>`;
  }

  return `<p>Few subjects reward curiosity like ${theme}. What looks simple from a distance usually turns out to be full of moving parts, careful choices, and surprising connections. People who study ${theme} closely notice details that a casual observer walks right past: a small change in conditions, a pattern that repeats, or a number that does not quite fit. Those details are where the real questions begin, and where ${theme} stops being just a hobby and starts becoming an investigation.</p>
  <p>Consider how someone exploring ${theme} actually works. They begin by observing carefully and writing down what they see, separating what is certain from what is only a guess. Then they look for relationships: when one thing increases, does another rise or fall? Does a result repeat, or was it luck? Because this learner is also interested in ${interests}, they start to notice that ideas from one field can explain another — how forces move objects, how stories shape memory, and how numbers reveal what the eye alone would miss. Connections like these make ${theme} far richer than any single fact about it.</p>
  <p>Progress in ${theme} rarely comes from getting everything right the first time. It comes from testing an idea, watching it fall short in some small way, and asking exactly what went wrong. A measurement might be off, a step might be skipped, or a hidden assumption might be wrong. Each correction is a clue, and clues add up. Over weeks and months, a beginner who keeps asking precise questions can come to understand ${theme} more deeply than someone who only memorized facts about it.</p>
  <p>That is why ${theme} is such good training for the mind. To explain a result, a person has to read carefully, reason with numbers, and put their thinking into clear words. To defend a conclusion, they have to point to real evidence instead of a feeling. The very habits that make someone good at ${theme} — patience, attention, and honesty about mistakes — are the same habits that make someone a strong reader, a careful thinker, and a confident problem solver in every subject they meet.</p>`;
}

function elementaryFallbackPassage(theme: string, interests: string): string {
  if (isHistoryTheme(theme)) {
    return `<p>Maya's class visits a small history room at the library. On the first table, the students see an old photograph, a train ticket, and a handwritten letter. Their teacher says, "These are sources. A source gives us information about the past." Maya looks closely at the photo. It shows a street with horses, a tiny grocery store, and children standing near a wooden schoolhouse.</p>
  <p>The class makes a timeline. First, the schoolhouse opened in 1908. Next, the train station opened in 1912. Then a new bridge opened in 1916. Maya notices that each event helped the community in a different way. The school helped children learn. The train helped people and goods move. The bridge helped neighbors visit each other more safely.</p>
  <p>Maya also learns that one source does not tell the whole story. The photograph shows the schoolhouse, but it does not say how the children felt. The letter says one family was excited about the train, but another family may have felt worried about changes in the town. Good historians ask questions, compare sources, and use evidence before they decide what happened.</p>
  <p>At the end of the visit, Maya writes one clear sentence: "Our community changed when schools, trains, and bridges helped people connect." She underlines the word evidence because every good history answer needs proof. Then she adds one question she still has: "Who built the bridge, and what tools did they use?" A new question means the learning can keep going.</p>`;
  }

  if (theme.toLowerCase().includes("space")) {
    const hasSoccer = interests.toLowerCase().includes("soccer");
    const designParagraph = hasSoccer
      ? "Next, the team studies a soccer ball rolling on grass and on sand. The ball moves farther on the smooth grass because less dust slows it down. That gives the team a new idea: maybe the rover wheels need ridges, like cleats, so they can grip the dusty ground. The team builds a prototype, which is an early model built to test an idea. The first prototype has smooth wheels, so it slides in the dust tray. The second prototype has ridges on the wheels, and it moves farther before getting stuck."
      : "Next, the team studies familiar objects that move over different surfaces. A toy car rolls farther on a smooth floor than on a rug, and shoes with more grip can help someone stop without sliding. These examples give the team a new idea: maybe the rover wheels need ridges so they can grip the dusty ground. The team builds a prototype, which is an early model built to test an idea. The first prototype has smooth wheels, so it slides in the dust tray. The second prototype has ridges on the wheels, and it moves farther before getting stuck.";
    const conclusionDetail = hasSoccer ? "soccer observations" : "real-world observations";
    return `<p>A student research team is preparing a small rover for a pretend mission on a dusty moon. The rover is only a model, but the thinking is real. First, the team reads a short science article about moon dust. The article explains that tiny grains can stick to wheels, block tools, and make moving parts harder to turn. The team writes those facts in a notebook because good readers do not depend on memory alone; they collect evidence before they choose an answer.</p>
    <p>${designParagraph}</p>
    <p>The team also uses math. In Trial 1, the rover travels 18 centimeters. In Trial 2, it travels 27 centimeters. In Trial 3, after the wheel ridges are made deeper, it travels 36 centimeters. The pattern shows improvement, but the team still has to be careful. Maybe the deeper ridges helped. Maybe the tray was flatter. Maybe the rover was pushed more gently. A strong scientist asks what changed, checks the evidence, and tests again.</p>
    <p>At the end of the mission, the learner writes a short conclusion: reading gave the team facts, ${conclusionDetail} gave the team design ideas, and math helped the team compare results. The rover did not work perfectly, but each test taught the team what to try next. That is why a mistake can be useful. It points the learner toward the next smart step.</p>`;
  }

  return `<p>A learner who enjoys ${theme} can turn that interest into a research mission. The first job is to read carefully. The learner looks for facts, marks important words, and writes down evidence instead of guessing. Because the learner also mentioned ${interests}, the mission can connect several subjects at once: reading, science, math, art, movement, and real-world problem solving.</p>
  <p>The team builds a small prototype, which means an early model used to test an idea. The first design does not work perfectly. That is useful information. The learner asks what changed, what stayed the same, and which detail from the notes explains the result. Then the learner improves the design and tests again. This is how readers, scientists, and inventors grow stronger.</p>
  <p>Math helps the team compare results. If one test lasts 12 minutes and the next lasts 18 minutes, the learner can measure the difference. If a pattern changes by the same amount each time, the learner can predict what may come next. The final conclusion should use evidence from the passage, numbers from the test, and one clear explanation. The goal is not to be perfect right away. The goal is to notice clues, explain thinking, and choose the next smart step.</p>`;
}

type AnswerContext = { high: boolean; isSpace: boolean };
type FallbackQuestion = { section: string; text: string; number: number; indexInSection: number };

function fallbackAnswerFor(question: FallbackQuestion, theme: string, ctx: AnswerContext): string {
  if (question.section === "Reading Comprehension") {
    return escapeHtml(readingAnswerFor(question.indexInSection, theme, ctx));
  }

  if (question.section === "Math Reasoning") {
    const answer = mathAnswerFor(question.text);
    if (answer) return escapeHtml(answer);
  }

  if (question.section === "Vocabulary in Context") {
    return "A complete sentence that uses the vocabulary word correctly and connects it to the mission theme.";
  }

  if (question.section === "Logic and Patterns") {
    const answer = logicAnswerFor(question.text);
    if (answer) return escapeHtml(answer);
  }

  if (question.section === "Grammar and Writing") {
    return escapeHtml(grammarAnswerFor(question.text));
  }

  if (question.section === "Science Investigation") {
    return escapeHtml(scienceAnswerFor(question.text));
  }

  if (question.section === "Social Studies and History") {
    return escapeHtml(socialAnswerFor(question.text));
  }

  return "Open response. A strong answer states a claim, gives a reason, and supports it with evidence or numbers.";
}

function fallbackExplanationFor(question: FallbackQuestion, theme: string, ctx: AnswerContext): string {
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

  if (question.section === "Logic and Patterns") {
    const explanation = logicExplanationFor(question.text);
    if (explanation) return escapeHtml(explanation);
  }

  if (question.section === "Grammar and Writing") {
    return "Strong writing is correct and clear: check punctuation, agreement, and word choice, then read it aloud.";
  }

  if (question.section === "Science Investigation") {
    return "Good science changes one variable, keeps the rest the same, and trusts evidence over a single result.";
  }

  if (question.section === "Social Studies and History") {
    return "Strong social-studies answers weigh sources and consequences instead of crediting a single simple cause.";
  }

  return "A strong answer uses a detail, number, pattern, or passage clue and explains why that evidence supports the conclusion.";
}

function readingAnswerFor(index: number, theme: string, ctx: AnswerContext): string {
  if (ctx.high) {
    const answers = [
      "The central claim is that improvement comes from feedback specific enough to change the next attempt; tools can speed feedback but cannot replace human judgment.",
      "The strongest evidence is the point that a device can show a student answered quickly but cannot tell whether the student truly understood the passage.",
      "As used here, disciplined most nearly means self-controlled and steady, treating mistakes as useful evidence rather than as failure.",
      "The basketball example shows that vague feedback like shoot better gives no guidance, while specific feedback that can be tested actually helps.",
      "A trap answer credits a single hero, talent, or invention as the only cause; it sounds reasonable but the passage argues against single-cause explanations.",
      "The final paragraph refines the argument by applying it to the reader's own interest: interest supplies energy, but strategy in the stretch zone turns it into progress."
    ];
    return answers[index] || "Answer from the passage and point to the sentence that proves it.";
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
  return answers[index] || "Use evidence from the passage and explain the answer in your own words.";
}

function mathAnswerFor(text: string): string | null {
  if (/1880 and .*1895/i.test(text)) return "15 years.";
  if (/\$40,000 to \$58,000/i.test(text)) return "$18,000 increase; more evidence is needed because spending alone does not prove outcomes improved.";
  if (/120 letters.*35 percent/i.test(text)) return "42 letters.";
  if (/petitions in 1888/i.test(text)) return "The petitions came first; that timing could mean public demand shaped later speeches and budgets.";
  if (/4 shelves with 6 artifacts/i.test(text)) return "24 artifacts.";
  if (/1908 and .*1912/i.test(text)) return "4 years later.";
  if (/1908, 1912, 1916/i.test(text)) return "1920. The pattern adds 4 years.";
  if (/12 source cards/i.test(text)) return "27 source cards.";
  if (/Mission Data table/i.test(text)) return "Full strategy had the best accuracy at 83 percent.";
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
  if (/1880 and .*1895/i.test(text)) return "Subtract the earlier year from the later year: 1895 - 1880 = 15.";
  if (/\$40,000 to \$58,000/i.test(text)) return "Subtract 40,000 from 58,000. A historian still checks whether the extra money changed attendance, access, or outcomes.";
  if (/120 letters.*35 percent/i.test(text)) return "35 percent of 120 is 0.35 x 120 = 42.";
  if (/petitions in 1888/i.test(text)) return "Chronology matters because an earlier petition could have influenced a later speech or budget decision.";
  if (/4 shelves with 6 artifacts/i.test(text)) return "There are 4 equal groups with 6 in each group, so 4 x 6 = 24.";
  if (/1908 and .*1912/i.test(text)) return "Subtract 1908 from 1912 to find 4 years.";
  if (/1908, 1912, 1916/i.test(text)) return "Each date is 4 years later, so 1916 + 4 = 1920.";
  if (/12 source cards/i.test(text)) return "Add the two days: 12 + 15 = 27.";
  if (/Mission Data table/i.test(text)) return "Compare the Accuracy column: 68 percent, 77 percent, and 83 percent. The largest number is 83 percent.";
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

function mathChoicesFor(question: { section: string; text: string }): string[] | null {
  if (question.section !== "Math Reasoning") return null;
  const text = question.text;
  if (/1880 and .*1895/i.test(text)) return ["5 years", "15 years", "25 years", "95 years"];
  if (/\$40,000 to \$58,000/i.test(text)) return ["$8,000", "$18,000", "$22,000", "$98,000"];
  if (/120 letters.*35 percent/i.test(text)) return ["24", "35", "42", "85"];
  if (/petitions in 1888/i.test(text)) return ["The petition", "The speech", "The budget growth", "They happened together"];
  if (/4 shelves with 6 artifacts/i.test(text)) return ["10", "20", "24", "30"];
  if (/1908 and .*1912/i.test(text)) return ["2", "4", "8", "12"];
  if (/1908, 1912, 1916/i.test(text)) return ["1918", "1920", "1922", "1924"];
  if (/12 source cards/i.test(text)) return ["17", "25", "27", "30"];
  if (/Mission Data table/i.test(text)) return ["Quick review", "Evidence notes", "Full strategy", "They were all the same"];
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
  if (question.section === "Grammar and Writing") return "Write the corrected sentence neatly and read it back aloud.";
  if (question.section === "Science Investigation") return "Name your evidence and what you changed versus what stayed the same.";
  if (question.section === "Social Studies and History") return "Give a reason and one piece of evidence for your view.";
  return "Explain your thinking in one or two clear sentences.";
}

function grammarAnswerFor(text: string): string {
  if (/trained hard/i.test(text)) return "Two sentences or a semicolon: \"The team trained hard. They were ready.\"";
  if (/plan was simple/i.test(text)) return "Sample: \"The simple plan worked.\"";
  if (/Due to the fact that/i.test(text)) return "Sample: \"Because they practiced, they improved.\"";
  if (/strong adjective and adverb/i.test(text)) return "Sample: \"The focused learner quickly solved the tricky problem.\"";
  if (/comma correctly/i.test(text)) return "Sample: \"After practice, the team reviewed the game.\"";
  if (/Their . There . They're|Their \/ There \/ They're/i.test(text)) return "They're (they are): \"They're going to practice today.\"";
  return "Sample: a complete, correctly punctuated sentence with clear word choice.";
}

function scienceAnswerFor(text: string): string {
  if (/observe first/i.test(text)) return "Sample: observe what changes and what stays the same, because evidence beats guessing.";
  if (/NOT proof the change caused it/i.test(text)) return "Sample: the test may have been easier, or measured differently. Those are other possible causes.";
  if (/fair test/i.test(text)) return "Sample: change only one thing and keep everything else the same.";
  if (/guess and a hypothesis/i.test(text)) return "A hypothesis is a testable, reasoned prediction; a guess has no reasoning behind it.";
  if (/results go up each trial/i.test(text)) return "Repeat the test, change only one variable, and rule out other causes before deciding.";
  if (/cause-and-effect/i.test(text)) return "Sample: more focused practice (cause) leads to higher accuracy (effect).";
  return "Sample: name the evidence, the one thing you changed, and what you kept the same.";
}

function socialAnswerFor(text: string): string {
  if (/change life in a town/i.test(text)) return "Sample: it could create jobs, learning, or fun, which helps families and students.";
  if (/which mattered more/i.test(text)) return "Compare records and outcomes before and after each, then weigh the evidence.";
  if (/remember the same .* event differently/i.test(text)) return "People have different viewpoints, information, and feelings about the same event.";
  if (/rule or fair choice/i.test(text)) return "Sample: take fair turns, because it keeps the group welcoming and orderly.";
  return "Sample: give a reason and one piece of evidence for who is affected and why.";
}

// Theme-aware question banks, one per canonical subject. Each bank holds enough
// distinct items to cover the planned section counts without repeating.
function fallbackQuestionBanks(args: {
  high: boolean;
  middle: boolean;
  history: boolean;
  theme: string;
  vocabWords: string[][];
}): Record<string, string[]> {
  const { high, middle, history, theme, vocabWords } = args;

  const reading = history && high
    ? [
        "Which statement best captures the central claim of the passage about historical evidence?",
        "Which source from the passage would best corroborate the claim that families helped shape school expansion?",
        "In Passage B, why does chronology change the strength of a historical explanation?",
        "Which interpretation is plausible but incomplete unless tested against additional evidence?",
        "How does the author's discussion of uncertainty refine the argument about historical scholarship?",
        "Which sentence best shows that historical causation can involve several overlapping forces?"
      ]
    : history && middle
      ? [
          "What is the main idea of the passage about how historians use sources?",
          "Which detail best explains why one source may not tell the whole story?",
          "How does the railroad example show cause and effect?",
          "Why do different people remember the same event differently?",
          "What should a student do before deciding that one event caused another?",
          "Write one question a historian could ask after reading this passage."
        ]
      : history
        ? [
            "What is the main idea of Maya's library visit? Point to one sentence that proves it.",
            "Which object in the passage is a source: the photograph, the bridge, or the classroom wall?",
            "Put these events in order: bridge opens, schoolhouse opens, train station opens.",
            "Why does Maya need more than one source to understand the past?",
            "What question does Maya still have at the end of the passage?",
            "Write one sentence explaining how the community changed."
          ]
        : high
    ? [
        "Which statement best captures the central claim of the passage?",
        "Which sentence from the passage gives the strongest evidence that technology can support judgment without replacing it?",
        "In paragraph 3, the word disciplined most nearly means which of the following?",
        "The author mentions basketball primarily to illustrate which idea about strategy?",
        "Which answer choice is a trap answer because it is true in general but not supported by the passage?",
        "How does the final paragraph refine the argument made earlier in the passage?"
      ]
    : [
        `What is the main idea of the passage about ${theme}? Point to the sentence that proves it.`,
        "Find one detail in the passage that supports the main idea, and copy it exactly.",
        "Choose one word from the passage you did not know before. What does it mean from the way it is used?",
        `What does the author want you to understand about ${theme}? Explain using evidence from the text.`,
        `In your own words, retell what happens first, next, and last in the passage about ${theme}.`,
        `Write one question you still have after reading about ${theme}.`
      ];

  const vocabulary = vocabWords.map(
    (word) => `Use ${word[0]} in a precise sentence connected to ${theme}, then explain which clue helped you understand it.`
  );

  const grammar = [
    `Rewrite as two correct sentences: "the ${theme} team trained hard they were ready".`,
    `Combine into one clear sentence: "The plan was simple. The plan worked."`,
    `Rewrite so it is clearer: "Due to the fact that practice happened, improvement occurred."`,
    `Add a strong adjective and adverb: "The learner solved the problem."`,
    `Write one sentence about ${theme} that uses a comma correctly.`,
    `Choose and explain: "Their / There / They're going to practice ${theme} today."`
  ];

  const math = history && high
    ? [
        "A reform began in 1880 and a major funding law passed in 1895. How many years separated the two events?",
        "A city budget rose from $40,000 to $58,000. What was the dollar increase, and why might a historian still need more evidence before claiming schools improved?",
        "A source collection has 120 letters. If 35 percent mention crowded classrooms, how many letters mention that problem?",
        "A timeline shows petitions in 1888, a mayor's speech in 1890, and budget growth in 1892. Which event came first, and how could that affect causation?"
      ]
    : history
      ? [
          "A museum has 4 shelves with 6 artifacts on each shelf. How many artifacts are there in all?",
          "The schoolhouse opened in 1908 and the train station opened in 1912. How many years later did the train station open?",
          "A timeline goes 1908, 1912, 1916, ___. What year comes next if the pattern continues?",
          "A class reads 12 source cards on Monday and 15 on Tuesday. How many source cards did they read in all?",
          "There are 30 minutes for 5 history stations. How many minutes can each station take?"
        ]
      : high
    ? [
        "A training app shows that a player made 42 of 60 shots in week one and improved the success rate by 15 percentage points in week two. What was the week two success rate?",
        "A robotics club has a fixed budget of $360. Sensors cost $18 each and practice field panels cost $24 each. If the club buys 8 sensors, how many panels can it buy with the remaining budget?",
        "The function f(x) = 3x + 7 models points earned after x completed missions. If f(x) = 52, what is x?",
        "A data table shows study time rising from 20 to 50 minutes while accuracy rises from 68 percent to 83 percent. What is the average accuracy gain per 10 minutes?"
      ]
    : [
        `A ${theme} team scores 4 points in each of 6 rounds. How many points in all? Show your setup.`,
        "A pattern goes 3, 6, 12, 24, ___, ___. What are the next two numbers, and what is the rule?",
        `A ${theme} trip is 240 km. If you travel 60 km each hour, how many hours will it take? Show your work.`,
        "A ticket costs $8. How much do 7 tickets cost? Then find the change you get back from $60.",
        "There are 30 minutes for 5 equal activities. How many minutes can each one take?"
      ];

  const science = [
    `Name one thing you would observe first when testing an idea about ${theme}, and why.`,
    "A test works better the second time. Give two reasons that are NOT proof the change caused it.",
    `Design a simple fair test for a ${theme} question. What stays the same and what changes?`,
    `What is the difference between a guess and a hypothesis in a ${theme} experiment?`,
    "If results go up each trial, what evidence would make you sure the change caused it?",
    `Describe one cause-and-effect you might see while exploring ${theme}.`
  ];

  const social = history && high
    ? [
        "Choose two source types from the passage and explain how they would corroborate or challenge each other.",
        "Explain why a single-hero explanation of a reform may be persuasive but historically weak.",
        "Write a claim about school expansion that includes one cause and one limitation of the evidence.",
        "How would contextualizing a mayor's speech change the way a historian interprets it?",
        "Identify one continuity and one change in the passage's school-expansion example."
      ]
    : history && middle
      ? [
          "Explain why a timeline helps but does not fully prove cause and effect.",
          "Compare the shop owner and worker perspectives. What does each person notice?",
          "Choose one artifact or source from the passage and explain what it can and cannot prove.",
          "Write a claim about why the town grew, then name one piece of evidence you would need."
        ]
      : history
        ? [
            "What is one source Maya sees in the history room?",
            "How did the train station help the community?",
            "Why might two families feel differently about the same town change?",
            "Draw or write a three-event timeline from the passage."
          ]
        : [
            `Name one way ${theme} (or an interest like it) could change life in a town, and who it helps.`,
            "A leader and an invention both change a city. What evidence shows which mattered more?",
            `Why might two people remember the same ${theme} event differently?`,
            `Describe one fair rule a ${theme} club should make, and why.`
          ];

  const logic = high
    ? [
        "A chart shows two study plans. Plan A has higher average scores, but Plan B has steadier scores. Which plan would you recommend before a high-stakes test, and why?",
        "A historian argues that one invention changed a city more than any leader did. What evidence would make that claim stronger?",
        "Decode the rule: 2, 5, 11, 23, 47. What comes next, and what is the rule?",
        `Write a two-sentence argument explaining how an interest in ${theme} can build academic persistence.`
      ]
    : [
        "Continue the pattern and say the rule in words: 5, 8, 11, 14, ___, ___.",
        `Three friends finish a ${theme} race. Ana is faster than Beto. Beto is faster than Cy. Who finishes last? Explain how you know.`,
        "Find the odd one out and say why: 2, 4, 7, 8, 10.",
        "Sort these into two groups and name the rule you used: circle, ball, square, box, triangle, kite."
      ];

  const critical = history && high
    ? [
        "Compare two explanations for a historical change and explain which one the available evidence supports more strongly.",
        "Write a brief research plan for testing whether a political speech caused a policy change.",
        "Explain why uncertainty can make a historical argument stronger rather than weaker.",
        "Name one missing source that would make the passage's school-expansion case more complete.",
        "Write a two-sentence thesis that uses causation, evidence, and limitation."
      ]
    : [
    `Explain one way ${theme} can build careful reading and evidence habits.`,
    `Write a short plan to get better at ${theme} using practice and feedback.`,
    `Compare two strategies a ${theme} learner could use, and say which is stronger and why.`,
    `Describe one mistake a ${theme} learner might make, and how to fix it using evidence.`,
    `Set one measurable ${theme} goal and explain how you would check progress with numbers.`
  ];

  return {
    "Reading Comprehension": reading,
    "Vocabulary in Context": vocabulary,
    "Grammar and Writing": grammar,
    "Math Reasoning": math,
    "Science Investigation": science,
    "Social Studies and History": social,
    "Logic and Patterns": logic,
    "Critical Thinking": critical
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

    throw new Error("Worksheet blueprint was not valid JSON.");
  }
}

// Return the value as a string only if it is actually a non-empty string.
// Returns "" for objects, arrays, null, undefined — callers fall back to the default.
function safeString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  return "";
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

function learnerFriendlyMissionCopy(input: WorksheetInput, blueprint: LearningBlueprint): string {
  const interests = cleanText(input.interests, 120);
  const elementary = input.age <= 10;
  const middle = input.age > 10 && input.age <= 14;

  if (elementary) {
    return `This mission uses ${interests} to practice reading clues, solving step by step, and feeling proud of careful thinking. Try your best, show your work, and enjoy the challenge.`;
  }

  if (middle) {
    return `This mission uses ${interests} to build stronger reading, reasoning, and explanation habits. The goal is steady focus: use evidence, show the setup, and learn from each check.`;
  }

  return `This mission uses ${interests} as context for rigorous practice: evidence-based reading, precise vocabulary, quantitative reasoning, and clear explanations under test-like pressure. ${blueprint.motivationStrategy}`;
}

function strategyBlockFor(input: WorksheetInput, blueprint: LearningBlueprint): { title: string; html: string } {
  const high = input.age >= 15 || ["Grade 9", "Grade 10", "Grade 11", "Grade 12", "College", "Master's"].includes(input.grade);
  const middle = !high && input.age >= 11;

  if (high) {
    return {
      title: "Test Strategy Notes",
      html: "<strong>Annotate passages:</strong> Mark the claim, shift word, and proof sentence. <strong>Eliminate carefully:</strong> Cross out choices that are extreme, reversed, unsupported, or only half true. <strong>Check math:</strong> List known numbers, write the equation, solve, and check units. <strong>Stay steady:</strong> Do the clearer questions first and return to the hardest one."
    };
  }

  if (middle) {
    return {
      title: "Focus Moves",
      html: "<strong>Read with proof:</strong> Underline the sentence that helps you answer. <strong>Show your setup:</strong> Write the numbers, rule, or diagram before solving. <strong>Explain one reason:</strong> A strong answer says why. <strong>Reset calmly:</strong> If a question feels tricky, breathe once and take the next small step."
    };
  }

  const motivation = escapeHtml(blueprint.motivationStrategy || "Try one careful step at a time.");
  return {
    title: "Mission Moves",
    html: `<strong>Start with clues:</strong> Underline one helpful word or number. <strong>Show your thinking:</strong> Draw, write, or circle before answering. <strong>Check one thing:</strong> Reread the question or redo the math. <strong>Keep going:</strong> ${motivation}`
  };
}


function watchOutFor(section: string, high: boolean): string {
  if (section === "Reading Comprehension") return high ? "Answers that sound smart but are not proven by the text." : "Guessing from memory instead of pointing to a sentence.";
  if (section === "Vocabulary in Context") return "Using the word without showing what it means.";
  if (section === "Grammar and Writing") return "Fixing one part of the sentence while leaving another part unclear.";
  if (section === "Math Reasoning") return "Doing the calculation before writing what the problem is asking.";
  if (section === "Science Investigation") return "Calling one better result proof before checking what else changed.";
  if (section === "Social Studies and History") return "Choosing the simplest cause without checking evidence from more than one side.";
  return "Stopping at the answer without explaining the rule or reason.";
}

function nextTimeTipFor(section: string, high: boolean): string {
  if (section === "Reading Comprehension") return "Underline the proof sentence before writing your answer.";
  if (section === "Vocabulary in Context") return "Try replacing the word with a simpler word and see if the sentence still works.";
  if (section === "Grammar and Writing") return "Read the sentence aloud after you fix it.";
  if (section === "Math Reasoning") return "Write the setup first, then solve and check the units.";
  if (section === "Science Investigation") return "Name what changed, what stayed the same, and what evidence you saw.";
  if (section === "Social Studies and History") return "Give one reason and one piece of evidence.";
  return high ? "State the rule, then test it against the evidence." : "Say the rule in your own words.";
}

// ---------------------------------------------------------------------------
// Fun Zone: deterministic, age-scaled brain-break activities. These are generated
// in code (not by the LLM) so they are always correct and printable.
// ---------------------------------------------------------------------------

function seededRng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

type FunActivity = { html: string; answer: string };

const SHAPE_SVG: Record<string, string> = {
  circle: '<circle cx="14" cy="14" r="9"></circle>',
  square: '<rect x="5" y="5" width="18" height="18" rx="2"></rect>',
  triangle: '<path d="M14 4 L25 24 L3 24 Z"></path>',
  star: '<path d="M14 3 L17 11 L25 11 L18 16 L21 24 L14 19 L7 24 L10 16 L3 11 L11 11 Z"></path>'
};

function shapeBox(shape: string): string {
  return `<span class="puzzle-shape"><svg viewBox="0 0 28 28" aria-hidden="true">${SHAPE_SVG[shape] || SHAPE_SVG.circle}</svg></span>`;
}

function patternPuzzle(young: boolean, rng: () => number): FunActivity {
  if (young) {
    const units = [
      ["circle", "square"],
      ["circle", "triangle"],
      ["star", "circle"],
      ["square", "triangle"]
    ];
    const unit = units[Math.floor(rng() * units.length)];
    const seq = Array.from({ length: 6 }, (_u, i) => unit[i % unit.length]);
    const next = [unit[6 % unit.length], unit[7 % unit.length]];
    const boxes = seq.map(shapeBox).join("") + '<span class="puzzle-blank">?</span><span class="puzzle-blank">?</span>';
    return {
      html: `<p><strong>Pattern Power.</strong> What two shapes come next?</p><p class="puzzle-row">${boxes}</p>`,
      answer: `Pattern Power: ${next.join(" then ")}.`
    };
  }
  const rules = [
    { seq: [2, 4, 8, 16], next: [32, 64], why: "double each time" },
    { seq: [3, 6, 9, 12], next: [15, 18], why: "add 3 each time" },
    { seq: [1, 4, 9, 16], next: [25, 36], why: "square numbers (1², 2², 3²…)" },
    { seq: [2, 5, 11, 23], next: [47, 95], why: "double and add 1" }
  ];
  const r = rules[Math.floor(rng() * rules.length)];
  return {
    html: `<p><strong>Pattern Power.</strong> Find the next two numbers: <strong>${r.seq.join(", ")}, __, __</strong></p>`,
    answer: `Pattern Power: ${r.next.join(" and ")} (${r.why}).`
  };
}

function spotTheDifference(): FunActivity {
  const sceneA = `<svg viewBox="0 0 200 120" class="puzzle-svg" aria-label="Picture A">
      <circle cx="32" cy="28" r="14"></circle>
      <path d="M70 100 L82 70 L94 100 Z"></path>
      <path d="M104 100 L116 70 L128 100 Z"></path>
      <rect x="140" y="64" width="40" height="40"></rect>
      <rect x="152" y="74" width="14" height="14"></rect>
      <line x1="10" y1="104" x2="190" y2="104"></line>
    </svg>`;
  const sceneB = `<svg viewBox="0 0 200 120" class="puzzle-svg" aria-label="Picture B">
      <circle cx="32" cy="28" r="9"></circle>
      <path d="M70 100 L82 70 L94 100 Z"></path>
      <rect x="140" y="64" width="40" height="40"></rect>
      <path d="M30 56 q6 -6 12 0"></path>
      <line x1="10" y1="104" x2="190" y2="104"></line>
    </svg>`;
  return {
    html: `<p><strong>Spot the Difference.</strong> Find <strong>4</strong> things that changed in Picture B.</p>
      <div class="puzzle-pair"><div><p class="puzzle-cap">Picture A</p>${sceneA}</div><div><p class="puzzle-cap">Picture B</p>${sceneB}</div></div>`,
    answer: "Spot the Difference: (1) the sun is smaller, (2) one tree is missing, (3) the house window is gone, (4) a bird appears in the sky."
  };
}

function connectTheDots(): FunActivity {
  const pts = [
    [100, 12], [118, 40], [150, 42], [126, 64], [136, 96],
    [100, 78], [64, 96], [74, 64], [50, 42], [82, 40]
  ];
  const dots = pts
    .map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="2.5"></circle><text x="${x + 4}" y="${y - 4}" font-size="9" fill="#126163">${i + 1}</text>`)
    .join("");
  return {
    html: `<p><strong>Connect the Dots.</strong> Draw a line from 1 to 2 to 3 … all the way to 10. What shape did you make?</p>
      <svg viewBox="0 0 200 110" class="puzzle-svg" aria-label="Connect the dots">${dots}</svg>`,
    answer: "Connect the Dots: it makes a star."
  };
}

function wordSearch(words: string[], size: number, rng: () => number): FunActivity {
  const grid: string[][] = Array.from({ length: size }, () => Array(size).fill(""));
  const placed: string[] = [];
  for (const raw of words) {
    const w = raw.toUpperCase().replace(/[^A-Z]/g, "");
    if (w.length < 3 || w.length > size) continue;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const horizontal = rng() < 0.5;
      const r = Math.floor(rng() * size);
      const c = Math.floor(rng() * size);
      const er = horizontal ? r : r + w.length - 1;
      const ec = horizontal ? c + w.length - 1 : c;
      if (er >= size || ec >= size) continue;
      let fits = true;
      for (let k = 0; k < w.length; k += 1) {
        const cell = grid[horizontal ? r : r + k][horizontal ? c + k : c];
        if (cell && cell !== w[k]) { fits = false; break; }
      }
      if (!fits) continue;
      for (let k = 0; k < w.length; k += 1) grid[horizontal ? r : r + k][horizontal ? c + k : c] = w[k];
      placed.push(w);
      break;
    }
  }
  const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (!grid[r][c]) grid[r][c] = alpha[Math.floor(rng() * 26)];
    }
  }
  const rows = grid.map((row) => `<tr>${row.map((ch) => `<td>${ch}</td>`).join("")}</tr>`).join("");
  const list = placed.map((w) => `<span class="puzzle-word">${escapeHtml(w)}</span>`).join("");
  return {
    html: `<p><strong>Word Search.</strong> Find these words (across or down): ${list}</p><table class="ws-grid">${rows}</table>`,
    answer: `Word Search words: ${placed.join(", ")}.`
  };
}

function crackTheCode(word: string): FunActivity {
  const clean = word.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 10) || "STAR";
  const code = clean.split("").map((ch) => ch.charCodeAt(0) - 64).join(" - ");
  return {
    html: `<p><strong>Crack the Code.</strong> Key: <em>A=1, B=2, C=3 … Z=26</em>. What word is this?</p>
      <p class="puzzle-code">${escapeHtml(code)}</p><div class="write"></div>`,
    answer: `Crack the Code: ${clean}.`
  };
}

// Harder number-sequence puzzle for older learners (age 11+).
function patternPuzzleHard(rng: () => number): FunActivity {
  const rules = [
    { seq: [1, 1, 2, 3, 5, 8], next: [13, 21], why: "Fibonacci — add the two numbers before it" },
    { seq: [2, 3, 5, 7, 11], next: [13, 17], why: "prime numbers in order" },
    { seq: [1, 3, 6, 10, 15], next: [21, 28], why: "triangular numbers — add 2, then 3, then 4 …" },
    { seq: [2, 6, 12, 20, 30], next: [42, 56], why: "the gaps grow: +4, +6, +8, +10, +12" },
    { seq: [1, 2, 6, 24, 120], next: [720, 5040], why: "factorials — ×2, ×3, ×4, ×5, ×6" },
    { seq: [1, 4, 9, 16, 25], next: [36, 49], why: "perfect squares (1², 2², 3² …)" }
  ];
  const r = rules[Math.floor(rng() * rules.length)];
  return {
    html: `<p><strong>Pattern Power.</strong> Find the next two numbers and name the rule: <strong>${r.seq.join(", ")}, __, __</strong></p><div class="write"></div>`,
    answer: `Pattern Power: ${r.next.join(" and ")} (${r.why}).`
  };
}

// 3×3 magic square with the four corners blanked — has a unique solution (every row,
// column, and diagonal sums to 15). A random symmetry keeps it fresh per learner.
function magicSquare(rng: () => number): FunActivity {
  let grid = [
    [2, 7, 6],
    [9, 5, 1],
    [4, 3, 8]
  ];
  const t = Math.floor(rng() * 4);
  if (t === 1) grid = grid.map((row) => [...row].reverse());
  else if (t === 2) grid = [...grid].reverse();
  else if (t === 3) grid = [0, 1, 2].map((c) => [0, 1, 2].map((r) => grid[r][c])); // transpose

  const blanks = new Set(["0,0", "0,2", "2,0", "2,2"]);
  const rows = grid
    .map(
      (row, r) =>
        `<tr>${row
          .map((n, c) => `<td>${blanks.has(`${r},${c}`) ? "" : n}</td>`)
          .join("")}</tr>`
    )
    .join("");
  const solution = grid.map((row) => row.join(" ")).join(" / ");
  return {
    html: `<p><strong>Magic Square.</strong> Fill the blank corners with numbers 1–9 (each used once) so every row, column, and diagonal adds up to <strong>15</strong>.</p><table class="ws-grid magic-square">${rows}</table>`,
    answer: `Magic Square: ${solution} — every row, column, and diagonal sums to 15.`
  };
}

// Caesar-shift cipher decode — more challenging than the A=1..26 code.
function caesarCipher(word: string, rng: () => number): FunActivity {
  const clean = (word.toUpperCase().replace(/[^A-Z]/g, "") || "PUZZLE").slice(0, 10);
  const shift = 1 + Math.floor(rng() * 4); // 1–4
  const coded = clean
    .split("")
    .map((ch) => String.fromCharCode(((ch.charCodeAt(0) - 65 + shift) % 26) + 65))
    .join(" ");
  return {
    html: `<p><strong>Secret Cipher.</strong> Every letter was shifted <strong>${shift}</strong> place${shift === 1 ? "" : "s"} forward in the alphabet (Z wraps back to A). Shift each letter back to read the word:</p><p class="puzzle-code">${escapeHtml(coded)}</p><div class="write"></div>`,
    answer: `Secret Cipher: ${clean} (shift back by ${shift}).`
  };
}

// Small deductive-logic puzzle with a unique answer, themed to the learner's interest.
function logicDeduction(theme: string, rng: () => number): FunActivity {
  const pool = ["Maya", "Omar", "Leah", "Ben", "Ava", "Cy", "Nina", "Theo"];
  const start = Math.floor(rng() * (pool.length - 2));
  const [a, b, c] = [pool[start], pool[start + 1], pool[start + 2]];

  if (rng() < 0.5) {
    // Ordering puzzle: a is not first; c finishes right after b.
    return {
      html: `<p><strong>Logic Puzzle.</strong> ${a}, ${b}, and ${c} finished a ${escapeHtml(theme)} challenge in 1st, 2nd, and 3rd place.</p>
      <p class="hint">Clues: ${a} did not finish first. ${c} finished immediately after ${b}.</p>
      <p>Who finished in each place?</p><div class="write"></div>`,
      answer: `Logic Puzzle: ${b} = 1st, ${c} = 2nd, ${a} = 3rd. (${c} right after ${b} forces them into 1st–2nd, so ${a} is 3rd.)`
    };
  }
  // Matching puzzle: each likes a different color; b likes blue; a is not red.
  return {
    html: `<p><strong>Logic Puzzle.</strong> ${a}, ${b}, and ${c} each like a different ${escapeHtml(theme)} color: red, blue, or green.</p>
      <p class="hint">Clues: ${b} likes blue. ${a} does not like red.</p>
      <p>What color does each person like?</p><div class="write"></div>`,
    answer: `Logic Puzzle: ${b} = blue, ${a} = green, ${c} = red. (${b} has blue, so ${a}, who isn't red, must be green, leaving red for ${c}.)`
  };
}

function funZoneBlock(input: WorksheetInput, theme: string): { html: string; answersHtml: string } {
  const generationSeed = `${Date.now()}|${Math.random().toString(36).slice(2)}`;
  const rng = seededRng(`${input.childName}|${input.interests}|${input.grade}|${generationSeed}`);
  const young = input.age <= 6 || input.grade === "Pre-K" || input.grade === "Kindergarten";
  const elementary = !young && input.age <= 10;
  const high = isHighSchoolOrAdult(input);

  if (high) {
    const history = isHistoryTheme(theme);
    const challenges: FunActivity[] = history
      ? [
          {
            html: `<p><strong>Source Triangulation.</strong> A speech praises a school reform, a budget ledger shows funding rose two years later, and a petition asked for classrooms before both events.</p><p>Rank the sources by how useful they are for proving causation, then defend your ranking.</p><div class="write"></div>`,
            answer: "A strong answer ranks the petition and budget ledger highly because they help test timing and action; the speech is useful but may be self-promotional."
          },
          {
            html: `<p><strong>Historiography Move.</strong> Write one sentence that challenges this simple claim: \"The mayor caused the entire reform.\"</p><p class="hint">Use one of these words: corroborate, context, causation, or continuity.</p><div class="write"></div>`,
            answer: "Sample: To establish causation, a historian would need to corroborate the mayor's speech with petitions, budgets, and records showing what changed after the speech."
          },
          {
            html: `<p><strong>Archive Gap.</strong> Name one missing source that could change the interpretation of the event, and explain why it matters.</p><div class="write"></div>`,
            answer: "Sample: Student attendance records could show whether the reform reached the children it claimed to help."
          }
        ]
      : [
          patternPuzzleHard(rng),
          logicDeduction(theme, rng),
          {
            html: `<p><strong>Scholar Challenge.</strong> Write a two-sentence claim about ${escapeHtml(theme)}. Sentence 1 must make a claim; sentence 2 must name evidence that would test it.</p><div class="write"></div>`,
            answer: "Strong answers make a specific claim and identify checkable evidence rather than opinion."
          }
        ];
    const cards = challenges.map((a) => `<article class="card fun-card">${a.html}</article>`).join("");
    const answers = challenges.map((a) => `<p>${escapeHtml(a.answer)}</p>`).join("");

    return {
      html: `<h2>Extension Challenge</h2>
  <p class="meta">A short stretch task for advanced reasoning, tied to ${escapeHtml(theme)}.</p>
  <section class="grid">${cards}</section>`,
      answersHtml: `<article class="answer" data-funzone="true"><h3>Extension Challenge — Sample Answers</h3>${answers}</article>`
    };
  }

  // Build a small word list from the learner's interests plus friendly fillers.
  const interestWords = input.interests
    .split(/[,\s]+/)
    .map((w) => w.toUpperCase().replace(/[^A-Z]/g, ""))
    .filter((w) => w.length >= 3 && w.length <= 9);
  const words = Array.from(new Set([...interestWords, "LEARN", "BRAIN", "SOLVE", "FOCUS"])).slice(0, 6);
  const firstInterest = input.interests.split(",")[0]?.trim() || "star";

  // Older learners (11+) get genuine brain-teasers instead of the picture puzzles:
  // harder sequences, a magic square, a cipher to crack, and a deduction puzzle.
  const activities: FunActivity[] = young
    ? [patternPuzzle(true, rng), spotTheDifference(), connectTheDots()]
    : elementary
      ? [patternPuzzle(false, rng), spotTheDifference(), wordSearch(words, 9, rng), crackTheCode(firstInterest)]
      : [patternPuzzleHard(rng), magicSquare(rng), caesarCipher(firstInterest, rng), logicDeduction(theme, rng)];

  const cards = activities
    .map((a) => `<article class="card fun-card">${a.html}</article>`)
    .join("");
  const answers = activities
    .map((a) => `<p>${escapeHtml(a.answer)}</p>`)
    .join("");

  return {
    html: `<h2>Brain Break: Fun Zone</h2>
  <p class="meta">Stretch your thinking with puzzles tied to ${escapeHtml(theme)}. Have fun!</p>
  <section class="grid">${cards}</section>`,
    answersHtml: `<article class="answer" data-funzone="true"><h3>Fun Zone — Answers</h3>${answers}</article>`
  };
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
