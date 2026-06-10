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
  // Passed through from the editable plan preview so user edits take effect.
  reading?: { wordCount?: number; topic?: string; lexileTarget?: string };
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

function isBooksTheme(theme: string): boolean {
  return /\b(book|books|reading|reader|novel|novels|story|stories|literature|library|manga|comic|comics|poetry|poem)\b/i.test(theme);
}

function isMediaTheme(theme: string): boolean {
  return /\b(movie|movies|film|films|cinema|animation|animated|video|videos|screenplay|screenplays|director|directors|acting|actor|actors|theater|theatre|documentary|documentaries)\b/i.test(theme);
}

function isArtTheme(theme: string): boolean {
  return /\b(art|artist|artists|drawing|painting|paintings|sketch|sketching|illustration|design|sculpture|sculpting|photography|museum|gallery|mural|murals|digital art|visual arts?)\b/i.test(theme);
}

function isTechnologyTheme(theme: string): boolean {
  return /\b(technology|tech|coding|code|programming|computer|computers|robot|robots|robotics|gaming|game|games|minecraft|software|app|apps|engineering)\b/i.test(theme);
}

function isSportsTheme(theme: string): boolean {
  return /\b(sport|sports|soccer|football|basketball|baseball|tennis|swimming|swim|running|track|volleyball|hockey|cricket|athlete|athletics)\b/i.test(theme);
}

function isMusicTheme(theme: string): boolean {
  return /\b(music|musical|song|songs|singing|singer|piano|guitar|drums|violin|band|orchestra|hip hop|rap|jazz|classical|composer|production)\b/i.test(theme);
}

function isCookingTheme(theme: string): boolean {
  return /\b(cooking|cook|baking|bake|food|chef|kitchen|recipe|recipes|restaurant|cake|bread|pastry|nutrition)\b/i.test(theme);
}

function isNatureTheme(theme: string): boolean {
  return /\b(nature|animal|animals|wildlife|ocean|ocean life|forest|forests|plant|plants|garden|gardening|ecology|environment|climate|volcano|volcanoes|dinosaur|dinosaurs|astronomy|space)\b/i.test(theme);
}

type InterestLens = {
  kind: "design" | "collection" | "performance" | "systems" | "exploration" | "community";
  role: string;
  artifact: string;
  evidence: string;
  action: string;
  decision: string;
};

function interestLensFor(theme: string): InterestLens {
  const value = theme.toLowerCase();
  if (/\b(build|building|lego|craft|crafts|fashion|sewing|woodwork|model|models|architecture|design)\b/.test(value)) {
    return { kind: "design", role: "design team", artifact: "prototype", evidence: "measurements and test notes", action: "build and improve", decision: "which design best meets the constraints" };
  }
  if (/\b(collect|collection|cards|stamps|coins|rocks|shells|memorabilia|antiques)\b/.test(value)) {
    return { kind: "collection", role: "collection curator", artifact: "catalog", evidence: "labels, categories, and comparison records", action: "classify and explain", decision: "how the collection should be organized and interpreted" };
  }
  if (/\b(dance|dancing|ballet|theater|theatre|acting|magic|performance|performing)\b/.test(value)) {
    return { kind: "performance", role: "performance company", artifact: "rehearsal plan", evidence: "timing, audience response, and rehearsal observations", action: "rehearse and refine", decision: "which choices make the performance clear and engaging" };
  }
  if (/\b(train|trains|car|cars|vehicle|vehicles|transport|maps|map|weather|business|market|markets)\b/.test(value)) {
    return { kind: "systems", role: "systems team", artifact: "operating plan", evidence: "routes, patterns, costs, and performance records", action: "model and optimize", decision: "how the system should respond to competing needs" };
  }
  if (/\b(travel|adventure|explore|exploration|geography|countries|country|culture|cultures|language|languages)\b/.test(value)) {
    return { kind: "exploration", role: "expedition team", artifact: "field guide", evidence: "maps, observations, sources, and comparisons", action: "investigate and document", decision: "which route or explanation is best supported" };
  }
  return { kind: "community", role: "project team", artifact: "community proposal", evidence: "interviews, observations, costs, and outcome measures", action: "investigate and improve", decision: "which proposal creates the strongest benefit with fair trade-offs" };
}

function themePhrase(theme: string): string {
  return theme.trim().replace(/^(a|an|the)\s+/i, "") || "the topic";
}

type WorksheetRun = {
  seed: string;
  scenario: string;
  angle: string;
  detail: string;
};

function pickOne<T>(items: T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)] ?? items[0];
}

function createWorksheetRun(input: WorksheetInput): WorksheetRun {
  const seed = `${Date.now()}|${Math.random().toString(36).slice(2)}|${input.grade}|${input.age}|${input.interests}`;
  const rng = seededRng(seed);
  const theme = input.interests.split(",")[0]?.trim() || "learning";
  const high = isHighSchoolOrAdult(input);

  const scenarios = isMediaTheme(theme)
    ? high
      ? [
          "a film studies seminar comparing a trailer, a review, and a scene transcript",
          "a student festival jury deciding which short film deserves an award",
          "a media literacy group analyzing how editing changes an audience's interpretation",
          "a documentary team checking whether interviews, footage, and data support the same claim"
        ]
      : [
          "a classroom movie club comparing characters, scenes, and clues",
          "a storyboard team planning a short movie scene",
          "a young reviewer choosing evidence for a movie recommendation"
        ]
    : isBooksTheme(theme)
    ? high
      ? [
          "a student editorial board comparing print books, audiobooks, and screen reading",
          "a school library committee deciding which books belong in a themed display",
          "a literature circle tracking how annotations change interpretation",
          "a teen reviewer comparing a novel, a graphic adaptation, and a film version"
        ]
      : [
          "a class book club choosing clues from a favorite story",
          "a library scavenger hunt using covers, chapters, and character notes",
          "a young reader building a bookshelf recommendation chart"
        ]
    : isHistoryTheme(theme)
      ? [
          "an archive case with letters, maps, photographs, and conflicting memories",
          "a museum exhibit team deciding which evidence belongs in a timeline",
          "a local-history project comparing an interview, a newspaper clipping, and an artifact"
        ]
      : [
          `a project team turning ${theme} into a real investigation`,
          `a student group testing a new idea connected to ${theme}`,
          `a classroom challenge where ${theme} becomes the example for reading, math, and reasoning`
        ];

  const angles = high
    ? ["evaluate evidence before making a claim", "compare two plausible interpretations", "separate strong reasoning from attractive shortcuts", "show how a small detail changes the conclusion"]
    : ["find clues in order", "explain one clear reason", "notice what changed", "use evidence before guessing"];

  const details = isMediaTheme(theme)
    ? ["camera angles", "scene notes", "audience surveys", "dialogue lines", "editing choices", "sound cues", "storyboard panels"]
    : isBooksTheme(theme)
    ? ["margin notes", "chapter titles", "cover art", "reader reviews", "quotation cards", "library checkout records"]
    : isHistoryTheme(theme)
      ? ["dated letters", "artifact labels", "old maps", "oral histories", "newspaper clippings", "timeline cards"]
      : ["notebook evidence", "trial results", "comparison cards", "design sketches", "practice records"];

  return {
    seed,
    scenario: pickOne(scenarios, rng),
    angle: pickOne(angles, rng),
    detail: pickOne(details, rng)
  };
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
const WORKSHEET_AI_ENABLED = process.env.WORKSHEET_AI_ENABLED === "true";

function parseOllamaKeepAlive(value: string | undefined): number | string {
  if (!value || value.trim() === "") return -1;
  const trimmed = value.trim();
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

// Performance knobs (baked into every request so they apply without server config):
//  - keep_alive: -1 keeps models resident in RAM so swapping 7B<->3B never reloads from disk.
//  - num_thread: pin to physical cores (Oracle A1 = 4) — all cores on one request.
const OLLAMA_NUM_THREAD = Number(process.env.OLLAMA_NUM_THREAD || 4);
const OLLAMA_KEEP_ALIVE = parseOllamaKeepAlive(process.env.OLLAMA_KEEP_ALIVE);
const DEFAULT_NUM_CTX = Number(process.env.OLLAMA_NUM_CTX || 4096);

// Timeouts. Blueprint now runs on the fast model so it no longer needs minutes, but we
// keep a generous ceiling for the very first (cold) call after a deploy.
const LLM_BLUEPRINT_TIMEOUT_MS = Number(process.env.LLM_BLUEPRINT_TIMEOUT_MS || 180000);
const LLM_TIMEOUT_MS           = Number(process.env.LLM_TIMEOUT_MS           ||  90000);
const LLM_PASSAGE_TIMEOUT_MS    = Number(process.env.LLM_PASSAGE_TIMEOUT_MS   ||  70000); // bounded 7B passage attempt
const LLM_PASSAGE_REPAIR_TIMEOUT_MS = Number(process.env.LLM_PASSAGE_REPAIR_TIMEOUT_MS || 45000);
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
      // Preserve the user's edited expert plan when it exists; only fall back to the
      // default blueprint when there was no prebuilt plan to begin with.
      html = createFallbackHtmlWorksheet(
        input,
        prebuiltBlueprint ?? defaultBlueprint(input)
      );
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

  // Struggle areas are now dynamic (grade-specific topics from the UI), so accept any
  // sanitized short label rather than a fixed whitelist.
  const strugglingWith = Array.isArray(body.strugglingWith)
    ? body.strugglingWith.map((s: unknown) => cleanText(String(s), 40)).filter(Boolean).slice(0, 8)
    : [];
  const subjectFocus = VALID_FOCUSES.has(body.subjectFocus) ? String(body.subjectFocus) : "balanced";
  const goal         = VALID_GOALS.has(body.goal)           ? String(body.goal)         : "general";
  const timeAvailable = VALID_TIMES.has(Number(body.timeAvailable)) ? Number(body.timeAvailable) : 40;

  const input: WorksheetInput = { childName, grade, age, interests, strugglingWith, subjectFocus, goal, timeAvailable };

  // If the frontend already computed the blueprint (after showing the plan preview),
  // sanitize it and pass it through so we skip the blueprint LLM call entirely.
  // honorUserPlan keeps the user's edited section counts instead of re-imposing
  // grade-default bounds — the worksheet must match the plan they tuned.
  const prebuiltBlueprint: LearningBlueprint | null =
    body.blueprint && typeof body.blueprint === "object"
      ? normalizeBlueprint(body.blueprint, input, true)
      : null;

  return { input, prebuiltBlueprint };
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
  const run = createWorksheetRun(input);
  // Skip blueprint LLM call if the frontend already computed it (plan preview flow).
  const blueprint = prebuiltBlueprint ?? await createLearningBlueprint(input);

  if (!WORKSHEET_AI_ENABLED) {
    return createFallbackHtmlWorksheet(input, blueprint, run);
  }

  try {
    const html = await createStagedWorksheetHtml(input, blueprint, run);
    return injectNickname(html, input.childName);
  } catch (error) {
    console.warn("Staged worksheet generation failed; using quality fallback", error);
    return createFallbackHtmlWorksheet(input, blueprint, run);
  }
}

// Phase 3: generate the worksheet in small, well-scoped pieces instead of one giant
// call. Each piece is attempted independently and degrades to the deterministic bank on
// failure, so a thin or rate-limited response only affects that one section.
async function createStagedWorksheetHtml(
  input: WorksheetInput,
  blueprint: LearningBlueprint,
  run: WorksheetRun
): Promise<string> {
  const content: WorksheetContent = { sectionQuestions: {} };

  const wantsReading = blueprint.sections.some((section) => section.subject === "Reading Comprehension");
  const vocabSection = blueprint.sections.find((section) => section.subject === "Vocabulary in Context");

  // One call produces the reading passage, its questions, and vocabulary together so
  // the passage and the questions about it always stay consistent.
  if (wantsReading || vocabSection) {
    try {
      const bundle = await generatePassageBundle(input, blueprint, run);
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
      const batched = await generateAllSections(input, blueprint, sectionsToGenerate, run);
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
        const questions = await generateSectionQuestions(input, blueprint, section, run);
        if (questions.length) content.sectionQuestions![section.subject] = questions;
      } catch (error) {
        console.warn(`Section "${section.subject}" generation failed; using bank questions`, error);
      }
    }
  }

  return assembleWorksheet(input, blueprint, content, run);
}

async function generatePassageBundle(
  input: WorksheetInput,
  blueprint: LearningBlueprint,
  run: WorksheetRun
): Promise<{ passageHtml: string; vocab: string[][]; readingQuestions: GeneratedQuestion[] }> {
  const profile = qualityProfileFor(input);
  // Honor an edited reading length from the plan preview; otherwise use the grade floor.
  const targetReadingWords = Math.max(120, Math.min(900, Math.round(blueprint.reading?.wordCount ?? profile.minReadingWords)));
  const readingCount = blueprint.sections.find((s) => s.subject === "Reading Comprehension")?.questionCount ?? 4;
  const vocabCount = Math.max(
    profile.minVocabularyCards,
    blueprint.sections.find((s) => s.subject === "Vocabulary in Context")?.questionCount ?? profile.minVocabularyCards
  );

  const prompt = passageBundlePrompt(input, blueprint, run, targetReadingWords, readingCount, vocabCount);
  const attempts = [
    {
      label: "quality",
      model: PASSAGE_MODEL,
      temperature: 0.58,
      maxTokens: passageTokenBudgetFor(input, targetReadingWords),
      timeoutMs: LLM_PASSAGE_TIMEOUT_MS,
      prompt
    },
    {
      label: "repair",
      model: FAST_MODEL,
      temperature: 0.36,
      maxTokens: passageTokenBudgetFor(input, targetReadingWords),
      timeoutMs: LLM_PASSAGE_REPAIR_TIMEOUT_MS,
      prompt: `${prompt}

IMPORTANT REPAIR INSTRUCTION:
The previous passage attempt was too short or malformed. Return complete JSON only.
Write ${passageParagraphTargetFor(input)} complete paragraphs totaling at least ${targetReadingWords} words.
Do not summarize the task. Do not apologize. Do not stop early.`
    }
  ];

  let lastError: unknown = null;
  for (const attempt of attempts) {
    try {
      const started = Date.now();
      const content = await groqChat({
        model: attempt.model,
        temperature: attempt.temperature,
        maxTokens: attempt.maxTokens,
        timeoutMs: attempt.timeoutMs,
        responseFormat: "json_object",
        messages: [
          {
            role: "system",
            content:
              "You write original, grade-appropriate reading passages and the comprehension questions about them. Return only valid JSON. Never include the learner's name or any private data."
          },
          { role: "user", content: attempt.prompt }
        ]
      });
      const bundle = normalizePassageBundle(content, targetReadingWords, readingCount);
      console.info(`Passage bundle ${attempt.label} succeeded in ${Date.now() - started}ms`);
      return bundle;
    } catch (error) {
      lastError = error;
      console.warn(`Passage bundle ${attempt.label} attempt failed`, error);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Passage bundle failed.");
}

function passageBundlePrompt(
  input: WorksheetInput,
  blueprint: LearningBlueprint,
  run: WorksheetRun,
  minReadingWords: number,
  readingCount: number,
  vocabCount: number
): string {
  return `Write an ORIGINAL reading passage for this learner and the questions about it.

Learner:
- Grade or level: ${input.grade}
- Age: ${input.age}
- Interest themes: ${input.interests}
- Freshness key: ${run.seed.slice(0, 18)} (use only to vary the content; do not print it)
- Fresh scenario lens: ${run.scenario}
- Fresh reasoning angle: ${run.angle}
- Concrete detail to include naturally: ${run.detail}

Requirements:
- The passage must be original, engaging, and tied to the interests, at least ${minReadingWords} words, at this exact reading level.
- The setting, examples, people, and central problem must feel different on repeated generations for the same learner.
- Do not reuse PaperStride's older fallback examples about coaches, vague technology feedback, moon rovers, or a generic research mission unless the learner explicitly asks for that exact topic.
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
}`;
}

function normalizePassageBundle(
  content: string,
  minReadingWords: number,
  readingCount: number
): { passageHtml: string; vocab: string[][]; readingQuestions: GeneratedQuestion[] } {
  const parsed = parseJsonContent(content) as Record<string, unknown>;
  const paragraphs = Array.isArray(parsed.passageParagraphs)
    ? parsed.passageParagraphs.map((p) => cleanGeneratedParagraph(String(p))).filter(Boolean)
    : [];
  const wordCount = paragraphs.join(" ").split(/\s+/).filter(Boolean).length;
  if (!paragraphs.length || wordCount < minReadingWords) {
    throw new Error(`Passage bundle had too little complete passage text (${wordCount}/${minReadingWords} words).`);
  }

  const passageHtml = paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n    ");
  const vocab = normalizeGeneratedVocab(parsed.vocab);
  const readingQuestions = normalizeGeneratedQuestions(parsed.questions, readingCount);

  return { passageHtml, vocab, readingQuestions };
}

function passageParagraphTargetFor(input: WorksheetInput): number {
  if (input.age <= 6 || input.grade === "Pre-K" || input.grade === "Kindergarten") return 2;
  if (input.age <= 10) return 3;
  if (isHighSchoolOrAdult(input)) return 5;
  return 4;
}

function passageTokenBudgetFor(input: WorksheetInput, minReadingWords: number): number {
  const questionBudget = isHighSchoolOrAdult(input) ? 650 : 500;
  return Math.min(2600, Math.max(1400, Math.ceil(minReadingWords * 2.2) + questionBudget));
}

// Generate questions for ALL non-reading sections in a single call. Returns a map of
// subject -> questions; subjects the model omits or botches simply don't appear, so the
// caller can retry them individually or bank-fill.
async function generateAllSections(
  input: WorksheetInput,
  blueprint: LearningBlueprint,
  sections: WorksheetSection[],
  run: WorksheetRun
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
    temperature: hasMathOrLogic ? 0.26 : 0.45,
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
Freshness key: ${run.seed.slice(0, 18)} (do not print it)
Scenario lens: ${run.scenario}
Reasoning angle: ${run.angle}

Write questions for EACH section below. Weave the interests into scenarios so they feel
specific and motivating. Within each section, make the first question accessible and the
last the most challenging. Prefer multiple choice (3-4 options, exactly one correct answer
that appears in "choices"); use an empty "choices" array for writing/explanation prompts.
For numeric questions, double-check the arithmetic so the explanation matches the answer.
Avoid repeating generic questions from earlier worksheets; vary names, objects, numbers,
settings, and the kind of evidence being used.

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
  section: WorksheetSection,
  run: WorksheetRun
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
Freshness key: ${run.seed.slice(0, 18)} (do not print it)
Scenario lens: ${run.scenario}
Reasoning angle: ${run.angle}

Write EXACTLY ${section.questionCount} questions.
- Q1 should be accessible (confidence-builder). Final Q should be the most challenging.
- Use the interest connection to make scenarios specific and motivating.
- Prefer multiple choice (3-4 options, exactly one correct answer in "choices").
- Open response for writing/explanation prompts — use empty "choices" array.
- Every question needs a correct answer and a short explanation.
- Vary names, numbers, objects, source details, and settings from previous worksheets.
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

function createFallbackHtmlWorksheet(input: WorksheetInput, blueprint: LearningBlueprint, run = createWorksheetRun(input)): string {
  return injectNickname(createSampleHtmlWorksheet(input, blueprint, run), input.childName);
}

function normalizeBlueprint(value: unknown, input: WorksheetInput, honorUserPlan = false): LearningBlueprint {
  const fallback = defaultBlueprint(input);

  if (!value || typeof value !== "object") {
    return fallback;
  }

  const candidate = value as Partial<LearningBlueprint>;
  const sections = normalizeSections(candidate.sections, fallback.sections, input, honorUserPlan);
  const questionCount = sections.reduce((sum, section) => sum + section.questionCount, 0);

  // Preserve reading metadata (word count, topic, Lexile) so user edits from the
  // expert-panel plan preview are honoured in the passage and question generation.
  const rawReading = candidate.reading as Record<string, unknown> | undefined;
  const readingWordCount = Math.max(
    60,
    Math.min(900, Number(rawReading?.wordCount) || fallback.reading?.wordCount || 280)
  );

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
    ),
    reading: {
      wordCount: readingWordCount,
      topic: cleanText(String(rawReading?.topic || fallback.reading?.topic || ""), 160),
      lexileTarget: cleanText(String(rawReading?.lexileTarget || fallback.reading?.lexileTarget || ""), 40),
    },
    themeThread: candidate.themeThread
      ? cleanText(String(candidate.themeThread), 200)
      : undefined,
    parentNote: candidate.parentNote
      ? cleanText(String(candidate.parentNote), 400)
      : undefined,
  };
}

function defaultBlueprint(input: WorksheetInput): LearningBlueprint {
  const early = input.age <= 6;
  const elementary = input.age >= 7 && input.age <= 10;
  const high = isHighSchoolOrAdult(input);
  const middle = !high && input.age >= 11 && input.age <= 14;
  const theme = input.interests.split(",")[0]?.trim() || "learning";
  const history = isHistoryTheme(theme);
  const sections = personalizeSectionPlan(defaultSectionPlan(input), input);

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
    motivationStrategy: motivationStrategyFor(input),
    challengeLevel: input.goal === "catching-up"
      ? "gentle"
      : input.goal === "getting-ahead"
        ? "advanced"
        : high || middle
          ? "stretch"
          : "balanced",
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
  const high = isHighSchoolOrAdult(input);
  const elementary = !early && !high && input.age <= 10;
  const middle = !early && !elementary && !high && input.age <= 14;
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
    if (isBooksTheme(theme)) {
      return [
        { subject: "Reading Comprehension", questionCount: 5, skills: ["main idea", "story details", "sequence", "character clues"], focus: "A book-themed passage with evidence questions." },
        { subject: "Vocabulary in Context", questionCount: 3, skills: ["context clues", "story words", "using words"], focus: "Words readers use to discuss stories." },
        { subject: "Grammar and Writing", questionCount: 4, skills: ["sentence structure", "punctuation", "clear recommendation"], focus: "Write and revise sentences about books." },
        { subject: "Math Reasoning", questionCount: 2, skills: ["word problems", "counting groups"], focus: "Bookshelf and reading-time word problems." },
        { subject: "Logic and Patterns", questionCount: 2, skills: ["sequence", "reasoning"], focus: "Chapter-order and clue puzzles." }
      ];
    }
    if (isMediaTheme(theme)) {
      return [
        { subject: "Reading Comprehension", questionCount: 5, skills: ["main idea", "scene details", "sequence", "character clues"], focus: "A movie-themed passage with evidence questions." },
        { subject: "Vocabulary in Context", questionCount: 3, skills: ["context clues", "media words", "using words"], focus: "Words viewers use to discuss scenes." },
        { subject: "Grammar and Writing", questionCount: 4, skills: ["sentence structure", "punctuation", "clear review"], focus: "Write and revise sentences about movies." },
        { subject: "Math Reasoning", questionCount: 2, skills: ["word problems", "elapsed time"], focus: "Movie schedule and audience-count word problems." },
        { subject: "Logic and Patterns", questionCount: 2, skills: ["sequence", "reasoning"], focus: "Scene-order and clue puzzles." }
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
    if (isBooksTheme(theme)) {
      return [
        { subject: "Reading Comprehension", questionCount: 5, skills: ["main idea", "evidence", "inference", "character motivation"], focus: "A substantial book-themed passage with evidence questions." },
        { subject: "Vocabulary in Context", questionCount: 3, skills: ["context clues", "literary terms"], focus: "Terms readers use to discuss texts." },
        { subject: "Grammar and Writing", questionCount: 4, skills: ["revision", "sentence combining", "recommendation writing"], focus: "Revise and explain a book recommendation." },
        { subject: "Math Reasoning", questionCount: 3, skills: ["multi-step word problems", "ratios", "reading schedules"], focus: "Book-club and reading-log math." },
        { subject: "Critical Thinking", questionCount: 2, skills: ["claim evidence reasoning", "comparison"], focus: "Compare interpretations and defend a text-based claim." }
      ];
    }
    if (isMediaTheme(theme)) {
      return [
        { subject: "Reading Comprehension", questionCount: 5, skills: ["main idea", "evidence", "inference", "director's purpose"], focus: "A substantial media-themed passage with evidence questions." },
        { subject: "Vocabulary in Context", questionCount: 3, skills: ["context clues", "media terms"], focus: "Terms viewers use to analyze film." },
        { subject: "Grammar and Writing", questionCount: 4, skills: ["revision", "sentence combining", "review writing"], focus: "Revise and explain a movie review." },
        { subject: "Math Reasoning", questionCount: 3, skills: ["multi-step word problems", "percentages", "audience data"], focus: "Movie-club and audience-rating math." },
        { subject: "Critical Thinking", questionCount: 2, skills: ["claim evidence reasoning", "comparison"], focus: "Compare interpretations and defend a scene-based claim." }
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

  if (isBooksTheme(theme)) {
    return [
      { subject: "Reading Comprehension", questionCount: 6, skills: ["central claim", "text evidence", "inference", "tone", "structure", "interpretation"], focus: "An advanced passage about reading, books, and evidence." },
      { subject: "Vocabulary in Context", questionCount: 4, skills: ["literary vocabulary", "precise meaning"], focus: "Academic reading and literature words in context." },
      { subject: "Grammar and Writing", questionCount: 4, skills: ["concision", "claim evidence reasoning", "argument"], focus: "Revision and a short book-based argument." },
      { subject: "Math Reasoning", questionCount: 3, skills: ["percentages", "functions", "reading-log interpretation"], focus: "Quantitative reasoning through book-club and reading-log scenarios." },
      { subject: "Critical Thinking", questionCount: 3, skills: ["synthesis", "comparison", "argument"], focus: "Compare interpretations and defend a claim with textual evidence." }
    ];
  }

  if (isMediaTheme(theme)) {
    return [
      { subject: "Reading Comprehension", questionCount: 6, skills: ["central claim", "media evidence", "inference", "tone", "structure", "interpretation"], focus: "An advanced passage about film, media, and evidence." },
      { subject: "Vocabulary in Context", questionCount: 4, skills: ["media vocabulary", "precise meaning"], focus: "Academic film and media words in context." },
      { subject: "Grammar and Writing", questionCount: 4, skills: ["concision", "claim evidence reasoning", "argument"], focus: "Revision and a short media-analysis argument." },
      { subject: "Math Reasoning", questionCount: 3, skills: ["percentages", "functions", "audience-data interpretation"], focus: "Quantitative reasoning through ratings, run time, and audience data." },
      { subject: "Critical Thinking", questionCount: 3, skills: ["synthesis", "comparison", "argument"], focus: "Compare interpretations and defend a claim with media evidence." }
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

function subjectForStruggle(label: string): string | null {
  const value = label.toLowerCase();
  if (/read|sight word|vocabulary|critical reading/.test(value)) return "Reading Comprehension";
  if (/letter|spelling|handwriting|grammar|writing|essay|note-taking/.test(value)) return "Grammar and Writing";
  if (/count|addition|subtraction|fraction|multiplication|word problem|algebra|geometry|statistic|math/.test(value)) return "Math Reasoning";
  if (/science/.test(value)) return "Science Investigation";
  if (/logic/.test(value)) return "Logic and Patterns";
  return null;
}

function personalizeSectionPlan(sections: WorksheetSection[], input: WorksheetInput): WorksheetSection[] {
  const weakSubjects = new Set(
    input.strugglingWith.map(subjectForStruggle).filter((subject): subject is string => Boolean(subject))
  );
  const catchingUp = input.goal === "catching-up";
  const gettingAhead = input.goal === "getting-ahead";
  const quick = input.timeAvailable === 20;

  const focused = sections
    .filter((section) => {
      if (input.subjectFocus === "math-only") {
        return ["Reading Comprehension", "Math Reasoning", "Logic and Patterns"].includes(section.subject);
      }
      if (input.subjectFocus === "reading-only") {
        return ["Reading Comprehension", "Vocabulary in Context", "Grammar and Writing", "Critical Thinking"].includes(section.subject);
      }
      return true;
    })
    .map((section) => {
    const weak = weakSubjects.has(section.subject);
    let questionCount = section.questionCount;

    if (weak && !quick) questionCount += 1;
    if (input.subjectFocus === "more-math" && ["Math Reasoning", "Logic and Patterns"].includes(section.subject)) {
      questionCount += 2;
    }
    if (input.subjectFocus === "more-reading" && ["Reading Comprehension", "Vocabulary in Context", "Grammar and Writing"].includes(section.subject)) {
      questionCount += 1;
    }
    if (input.subjectFocus === "math-only") {
      questionCount = section.subject === "Math Reasoning"
        ? Math.max(questionCount, input.age >= 11 ? 8 : 6)
        : section.subject === "Logic and Patterns"
          ? Math.max(questionCount, 3)
          : Math.min(questionCount, 2);
    }
    if (input.subjectFocus === "reading-only") {
      questionCount = section.subject === "Reading Comprehension"
        ? Math.max(questionCount, input.age >= 11 ? 7 : 5)
        : Math.max(questionCount, 3);
    }
    if (gettingAhead && ["Reading Comprehension", "Math Reasoning", "Critical Thinking"].includes(section.subject)) {
      questionCount += 1;
    }
    if (quick && questionCount > 2) questionCount -= 1;

    const scaffolding = weak
      ? catchingUp
        ? " Begin with a confidence-building example, provide one concrete cue, and increase difficulty gradually."
        : " Begin with an accessible question, then target this reported weak area with guided practice."
      : "";

    return {
      ...section,
      questionCount: Math.max(1, Math.min(10, questionCount)),
      isWeakArea: weak,
      focus: `${section.focus}${scaffolding}`,
    };
  });

  if (input.subjectFocus === "more-math" && !focused.some((section) => section.subject === "Logic and Patterns")) {
    focused.push({
      subject: "Logic and Patterns",
      questionCount: input.age >= 11 ? 3 : 2,
      skills: ["logical reasoning", "patterns", "strategy"],
      focus: "Extra logic practice supporting the selected math emphasis.",
      isWeakArea: false,
    });
  }
  if (input.subjectFocus === "more-reading" && !focused.some((section) => section.subject === "Grammar and Writing")) {
    focused.push({
      subject: "Grammar and Writing",
      questionCount: 3,
      skills: ["clear sentences", "revision", "evidence-based writing"],
      focus: "Extra writing practice supporting the selected reading emphasis.",
      isWeakArea: false,
    });
  }

  return focused;
}

function motivationStrategyFor(input: WorksheetInput): string {
  const interest = cleanText(input.interests.split(",")[0]?.trim() || "their interests", 80);
  const needs = input.strugglingWith.length
    ? `Give visible progress in ${input.strugglingWith.slice(0, 2).join(" and ")} without labeling the learner by weakness.`
    : "Use early questions to create momentum before the deeper challenge.";

  if (input.age <= 6) {
    return `Turn ${interest} into a short story mission with choices, drawing, movement, and frequent success moments. Keep directions brief, praise effort and noticing, and change activity type before attention fades. ${needs}`;
  }
  if (input.age <= 10) {
    return `Use ${interest} as an active mission with a clear goal, quick wins, playful puzzles, and visible checkpoints. Let the learner explain, draw, sort, or calculate instead of only writing. ${needs}`;
  }
  if (input.age <= 14) {
    return `Frame ${interest} as a meaningful challenge with autonomy, real decisions, escalating difficulty, and a final product worth showing someone. Avoid childish language; use concise checkpoints and specific feedback. ${needs}`;
  }

  const goalMove = input.goal === "test-prep"
    ? "Include test-like decisions, time-aware strategy, and realistic distractors without making the whole workbook feel like an exam."
    : input.goal === "catching-up"
      ? "Protect confidence with an accessible opening, explicit scaffolds, and evidence of improvement before introducing stretch work."
      : input.goal === "getting-ahead"
        ? "Offer authentic disciplinary problems, ambiguity, trade-offs, and opportunities to defend an original position."
        : "Use authentic disciplinary problems, choice, and a clear reason each task matters beyond completing schoolwork.";

  return `Treat ${interest} as a serious domain, not decoration. ${goalMove} Give the learner autonomy, precise success criteria, and a culminating challenge that produces something meaningful. ${needs}`;
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
  const high = isHighSchoolOrAdult(input);
  const elementary = !early && !high && input.age <= 10;
  const middle = !early && !elementary && !high && input.age <= 14;

  if (early) return { min: MIN_TOTAL_QUESTIONS, max: 10 };
  if (elementary) return { min: 10, max: 16 };
  if (middle) return { min: 12, max: 22 };
  return { min: 16, max: MAX_TOTAL_QUESTIONS };
}

function normalizeSections(
  value: unknown,
  fallback: WorksheetSection[],
  input: WorksheetInput,
  honorUserPlan = false
): WorksheetSection[] {
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

  // A user-edited plan from the studio is honoured as-is (the editor already bounds
  // each section to sensible counts); only an empty/invalid plan falls back.
  if (honorUserPlan) {
    return sections.length ? sections : fallback;
  }

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
  const high = isHighSchoolOrAdult(input);

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

  if (high) {
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

function createSampleHtmlWorksheet(input: WorksheetInput, blueprint: LearningBlueprint, run = createWorksheetRun(input)): string {
  return assembleWorksheet(input, blueprint, {}, run);
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

function responseSpaceClass(section: string, prompt: string, choices: string[]): string {
  if (choices.length) return "write write--compact";
  if (section === "Grammar and Writing" || section === "Critical Thinking") return "write write--extended";
  if (/write|explain|design|recommend|compare|argument|paragraph|brief|label|plan/i.test(prompt)) return "write write--extended";
  return "write";
}

// Build the worksheet from the blueprint section plan. Any AI-authored pieces present
// in `content` are used; everything else is filled from the deterministic banks, so the
// worksheet is always complete and on-plan whether or not the AI calls succeeded.
function assembleWorksheet(
  input: WorksheetInput,
  blueprint: LearningBlueprint,
  content: WorksheetContent,
  run = createWorksheetRun(input)
): string {
  const theme = escapeHtml(input.interests.split(",")[0]?.trim() || "learning");
  const allInterests = escapeHtml(input.interests);
  const grade = escapeHtml(input.grade);
  const high = isHighSchoolOrAdult(input);
  const middle = !high && input.age >= 11;
  const isSpaceTheme = !high && !middle && theme.toLowerCase().includes("space");
  const answerContext = { high, isSpace: isSpaceTheme, run };
  const plannedSections = blueprint.sections.length ? blueprint.sections : defaultSectionPlan(input);
  const strategyBlock = strategyBlockFor(input, blueprint);
  // Honor the reading-length slider from the editable plan in the deterministic path
  // too, not just the AI path — otherwise the printed passage ignores the user's edit.
  const targetReadingWords = Math.max(
    60,
    Math.min(900, Math.round(blueprint.reading?.wordCount ?? qualityProfileFor(input).minReadingWords))
  );
  const passage = content.passageHtml
    ? content.passageHtml
    : fallbackPassageFor(input, theme, allInterests, run, targetReadingWords);
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
  const vocabQuestions: GeneratedQuestion[] = vocabWords.map(([word, definition, example]) => ({
    prompt: `Use ${word} in a precise sentence connected to ${theme}, then explain which clue helped you understand it.`,
    choices: [],
    correctAnswer: `Sample: ${example}`,
    explanation: `The sentence demonstrates that "${word}" means ${definition}. Other answers are valid when their context makes the same meaning clear.`
  }));

  const aiQuestionsFor = (subject: string): GeneratedQuestion[] | undefined => {
    if (subject === "Reading Comprehension") return content.readingQuestions;
    if (subject === "Vocabulary in Context") return vocabQuestions;
    return content.sectionQuestions?.[subject];
  };

  let runningNumber = 0;
  const fromBank = (subject: string, index: number): RenderQuestion => {
    const bank = banks[subject]?.length ? banks[subject] : banks["Critical Thinking"];
    // Past the end of the bank, generate a seeded procedural question instead of
    // repeating bank items verbatim — every question on the sheet stays unique.
    if (index >= bank.length) {
      const extra = overflowQuestionFor(subject, index - bank.length, theme, { high, middle, run });
      return {
        section: subject,
        number: runningNumber,
        promptHtml: escapeHtml(extra.text),
        choices: (extra.choices ?? []).map(escapeHtml),
        answerHtml: escapeHtml(extra.answer),
        explanationHtml: escapeHtml(extra.explanation),
        hint: questionHintFor({ section: subject })
      };
    }
    const fq: FallbackQuestion = {
      section: subject,
      text: bank[index],
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
        <div class="${responseSpaceClass(q.section, q.promptHtml, q.choices)}"></div>
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
  const funZone = funZoneBlock(input, theme, run);
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
  .write { min-height:58px; margin-top:8px; background:repeating-linear-gradient(to bottom, transparent 0, transparent 25px, #bdc7c3 26px); }
  .write--compact { min-height:34px; }
  .write--extended { min-height:104px; }
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
    .question { page-break-inside:avoid; }
    .write { background:repeating-linear-gradient(to bottom, transparent 0, transparent 25px, #aaa 26px); }
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
  if (isBooksTheme(theme) && high) {
    return [
      ["interpretation", "an explanation of what a text means", "Two readers can support different interpretations of the same chapter.", "Interpretation = meaning with evidence."],
      ["annotation", "a note written beside a text to track thinking", "Her annotation marked the sentence where the narrator changed tone.", "Annotation = margin thinking."],
      ["theme", "a big idea that runs through a text", "The theme of courage appears in both the novel and the poem.", "Theme = big idea."],
      ["narrator", "the voice that tells a story", "A narrator may be honest, limited, or biased.", "Narrator = storytelling voice."],
      ["subtext", "meaning that is suggested but not directly stated", "The subtext of the scene shows that the character is worried.", "Subtext = under-the-surface meaning."],
      ["claim", "a statement that can be supported with evidence", "A literary claim needs quotations or details from the text.", "Claim = point to prove."],
      ["synthesis", "combining ideas into a stronger whole", "The essay uses synthesis to connect the novel, the review, and the interview.", "Synthesis = ideas joined together."],
      ["perspective", "a point of view shaped by experience", "A reader's perspective can affect which character feels most convincing.", "Perspective = viewpoint."]
    ];
  }
  if (isMediaTheme(theme) && high) {
    return [
      ["cinematography", "the visual design of a film, including camera movement, framing, and light", "The cinematography makes the scene feel isolated before the dialogue confirms it.", "Cinema + graphy = film writing with images."],
      ["montage", "a sequence of edited shots that compresses time or builds an idea", "The montage shows months of practice in less than a minute.", "Montage = edited sequence."],
      ["subtext", "meaning suggested beneath the spoken words", "The subtext of the argument shows that the character is afraid, not angry.", "Subtext = under-the-surface meaning."],
      ["framing", "the choice of what appears inside the camera shot", "Tight framing makes the audience notice the character's hesitation.", "Frame = what the camera includes."],
      ["motif", "a repeated image, sound, or idea with meaning", "The repeated train sound becomes a motif for escape.", "Motif = meaningful repetition."],
      ["interpretation", "an evidence-based explanation of meaning", "A strong interpretation connects editing choices to the film's central claim.", "Interpretation = meaning with proof."],
      ["audience", "the viewers a film is made for or received by", "Audience data can show reaction, but not why a scene works.", "Audience = viewers."],
      ["claim", "a statement that can be supported with evidence", "A media claim needs scene evidence, not just personal taste.", "Claim = point to prove."]
    ];
  }
  if (isArtTheme(theme) && high) {
    return [
      ["composition", "the arrangement of visual elements within an artwork", "The diagonal composition directs the viewer's eye toward the central figure.", "Composition = how the parts are arranged."],
      ["contrast", "a strong difference between visual elements", "The artist uses contrast between light and shadow to create tension.", "Contrast = difference that stands out."],
      ["symbolism", "the use of an image or object to represent a larger idea", "The broken chain functions as symbolism for freedom.", "Symbolism = image carrying an idea."],
      ["provenance", "the documented history of an artwork's ownership and location", "The museum checked the painting's provenance before accepting the donation.", "Provenance = an artwork's paper trail."],
      ["conservation", "the careful protection and stabilization of an artwork", "Conservation slowed the mural's deterioration without repainting the artist's work.", "Conservation = protect what remains."],
      ["interpretation", "an evidence-based explanation of an artwork's meaning", "Her interpretation connected the empty chair to absence and memory.", "Interpretation = meaning supported by details."],
      ["patronage", "financial or institutional support given to artists", "Public patronage shaped which murals appeared in the civic center.", "Patronage = support that funds art."],
      ["contextualize", "to explain something using the conditions of its time and place", "To contextualize the poster, the class studied the protest movement that produced it.", "Context = the world around the work."]
    ];
  }
  if (isTechnologyTheme(theme) && high) {
    return [
      ["algorithm", "a defined sequence of steps for solving a problem", "The team revised the pathfinding algorithm after it trapped characters in a loop.", "Algorithm = ordered problem-solving steps."],
      ["iteration", "a repeated cycle of testing and improving", "Each iteration changed one feature and measured its effect on players.", "Iteration = test, learn, revise."],
      ["latency", "the delay between an action and the system's response", "High latency made the controls feel unresponsive even when the graphics looked smooth.", "Latency = response delay."],
      ["constraint", "a limit or requirement that shapes a solution", "Battery life was the most important constraint in the robot design.", "Constraint = a boundary the design must respect."],
      ["optimization", "improving a system for a chosen goal", "Optimization for speed reduced visual detail, so the team had to define what mattered most.", "Optimize = improve toward a target."],
      ["bias", "a systematic tendency that can produce unfair or distorted results", "The recommendation system showed bias because its training data excluded many users.", "Bias = a pattern that bends results."],
      ["prototype", "an early version built to test an idea", "The clickable prototype revealed navigation problems before the team wrote the full app.", "Prototype = test version."],
      ["trade-off", "a choice in which gaining one benefit requires giving up another", "Better graphics created a trade-off with battery life and loading speed.", "Trade-off = gain one thing, sacrifice another."]
    ];
  }
  if (isSportsTheme(theme) && high) {
    return [
      ["periodization", "planning training in phases with different goals and loads", "The coach used periodization to balance endurance, strength, and recovery before competition.", "Periodization = training in planned phases."],
      ["biomechanics", "the study of forces and movement in living bodies", "Biomechanics helped the swimmer change her start angle without increasing effort.", "Biomechanics = physics of movement."],
      ["variance", "a measure of how spread out results are", "The athlete with the lower average had less variance and performed more consistently.", "Variance = how scattered the results are."],
      ["recovery", "the process through which the body adapts after exertion", "Recovery improved when sleep and training load were monitored together.", "Recovery = rebuild after effort."],
      ["correlation", "a relationship in which two measures change together", "The correlation between practice time and accuracy did not prove that extra practice caused the gain.", "Correlation = move together, not necessarily cause."],
      ["strategy", "a coordinated plan for achieving a competitive goal", "The team changed strategy when the opponent began defending higher up the field.", "Strategy = overall plan."],
      ["efficiency", "useful output produced for the effort or resources used", "Running efficiency improved even though top speed stayed the same.", "Efficiency = result per effort."],
      ["sample size", "the number of observations included in a study", "A larger sample size would make the training conclusion more reliable.", "Sample size = how much evidence was measured."]
    ];
  }
  if (isMusicTheme(theme) && high) {
    return [
      ["syncopation", "rhythmic emphasis placed where a listener does not normally expect it", "Syncopation made the groove feel unsettled and energetic.", "Syncopation = emphasis off the expected beat."],
      ["timbre", "the sound quality that distinguishes instruments or voices", "Changing the timbre from strings to brass made the theme sound more forceful.", "Timbre = sound color."],
      ["motif", "a short musical idea that returns and develops", "The composer transformed the four-note motif throughout the movement.", "Motif = recurring musical idea."],
      ["dissonance", "tension created by notes that sound unstable together", "The unresolved dissonance delayed the feeling of arrival.", "Dissonance = musical tension."],
      ["arrangement", "the way musical material is organized for particular performers or sounds", "The new arrangement moved the melody from piano to voice.", "Arrangement = how the music is assigned and organized."],
      ["dynamics", "changes in loudness and intensity", "The sudden drop in dynamics made the final entrance more dramatic.", "Dynamics = loudness and intensity."],
      ["sampling", "reusing a recorded sound within a new musical work", "The producer documented the sampling source before releasing the track.", "Sampling = recorded sound reused creatively."],
      ["acoustics", "the science of how sound behaves in a space", "The hall's acoustics strengthened low frequencies but blurred fast passages.", "Acoustics = how a space shapes sound."]
    ];
  }
  if (isCookingTheme(theme) && high) {
    return [
      ["emulsion", "a stable mixture of liquids that normally separate", "The chef formed an emulsion by slowly whisking oil into the acidic base.", "Emulsion = liquids held together."],
      ["fermentation", "a process in which microorganisms transform sugars", "Fermentation produced gas that expanded the bread dough.", "Fermentation = microbes changing food."],
      ["denaturation", "a change in a protein's structure caused by heat, acid, or agitation", "Heat caused protein denaturation as the egg changed from clear to firm.", "Denaturation = protein structure changes."],
      ["caramelization", "browning caused when sugar breaks down under heat", "Caramelization added color and complex flavor to the onions.", "Caramelization = heated sugar browning."],
      ["ratio", "a comparison between quantities", "The baker preserved the flour-to-water ratio when scaling the recipe.", "Ratio = quantities compared."],
      ["yield", "the amount of food a recipe produces", "The revised recipe increased yield without changing portion size.", "Yield = total amount produced."],
      ["sensory", "related to taste, smell, texture, sight, or sound", "The sensory panel rated aroma and texture separately.", "Sensory = detected by the senses."],
      ["constraint", "a limit that shapes a possible solution", "Cost and allergy safety were both constraints in the menu design.", "Constraint = requirement or limit."]
    ];
  }
  if (isNatureTheme(theme) && high) {
    return [
      ["biodiversity", "the variety of living organisms in an area", "Greater biodiversity can make an ecosystem more resilient to disturbance.", "Biodiversity = variety of life."],
      ["indicator species", "a species whose condition reveals information about an ecosystem", "The stream insects served as indicator species for water quality.", "Indicator = living environmental signal."],
      ["carrying capacity", "the largest population an environment can sustain over time", "Food scarcity lowered the habitat's carrying capacity.", "Carrying capacity = sustainable population limit."],
      ["confounding variable", "an outside factor that may distort a tested relationship", "Rainfall was a confounding variable in the plant-growth comparison.", "Confounder = hidden alternative cause."],
      ["resilience", "the ability of a system to recover after disturbance", "Wetland diversity increased resilience after the storm.", "Resilience = recover and continue."],
      ["sampling", "selecting observations to represent a larger population", "Random sampling reduced the chance of studying only the easiest locations.", "Sampling = choose evidence from a larger whole."],
      ["trophic", "related to feeding levels in an ecosystem", "The predator's decline affected several trophic levels.", "Trophic = position in a food web."],
      ["anthropogenic", "caused by human activity", "The researchers separated anthropogenic pollution from natural sediment.", "Anthropogenic = human-caused."]
    ];
  }
  if (isBooksTheme(theme)) {
    return [
      ["chapter", "a section of a book", "The next chapter shows where the character travels.", "Chapter = book part."],
      ["character", "a person or figure in a story", "The main character learns from a mistake.", "Character = story person."],
      ["setting", "where and when a story happens", "The setting is a quiet library after school.", "Setting = place and time."],
      ["clue", "a detail that helps solve or understand something", "The cover picture gives a clue about the story.", "Clue = helpful detail."],
      ["summary", "a short retelling of the main ideas", "A summary tells the important parts without every detail.", "Summary = short version."],
      ["recommend", "to suggest something because it is a good choice", "The student recommends the book to a friend.", "Recommend = suggest."]
    ];
  }
  if (isMediaTheme(theme)) {
    return [
      ["scene", "one part of a movie that happens in one place or moment", "The scene shows the character making a choice.", "Scene = movie part."],
      ["character", "a person or figure in a story", "The main character learns from a mistake.", "Character = story person."],
      ["setting", "where and when a story happens", "The setting is a bright kitchen in the morning.", "Setting = place and time."],
      ["clue", "a detail that helps solve or understand something", "The music gives a clue that something surprising may happen.", "Clue = helpful detail."],
      ["review", "a written or spoken opinion that gives reasons", "A good review explains why a movie works.", "Review = opinion with reasons."],
      ["edit", "to choose and arrange movie parts", "The filmmaker edits the scene to make it clearer.", "Edit = choose and arrange."]
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

function fallbackPassageFor(
  input: WorksheetInput,
  theme: string,
  interests: string,
  run: WorksheetRun,
  targetWords?: number
): string {
  const high = isHighSchoolOrAdult(input);
  const middle = !high && input.age >= 11;

  const base = high
    ? highSchoolFallbackPassage(theme, run)
    : middle
      ? middleSchoolFallbackPassage(theme, interests, run)
      : elementaryFallbackPassage(theme, interests, run);

  if (!targetWords) return base;
  return fitPassageToWordTarget(base, targetWords, passageExtensionsFor(input, theme, interests, run));
}

function htmlWordCount(html: string): number {
  return html.replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length;
}

// Fit a bank passage to the reading-length slider. Extensions are inserted BEFORE the
// final paragraph so the original conclusion stays last ("final paragraph" questions in
// the reading bank remain true). Trimming removes middle paragraphs only — the opening
// two paragraphs (main idea) and the conclusion are always kept — and never drops the
// passage below the target.
function fitPassageToWordTarget(html: string, targetWords: number, extensions: string[]): string {
  const paragraphs = html.match(/<p[\s\S]*?<\/p>/g);
  if (!paragraphs || !paragraphs.length) return html;

  const body = [...paragraphs];
  let count = htmlWordCount(body.join(" "));

  if (count < targetWords * 0.94) {
    for (const extra of extensions) {
      if (count >= targetWords * 0.94) break;
      body.splice(body.length - 1, 0, `<p>${extra}</p>`);
      count += htmlWordCount(extra);
    }
    return body.join("\n  ");
  }

  for (let i = body.length - 2; i >= 2 && body.length > 3; i--) {
    const without = count - htmlWordCount(body[i]);
    if (without >= targetWords) {
      count = without;
      body.splice(i, 1);
    }
  }
  return body.join("\n  ");
}

// Band-appropriate continuation paragraphs used to honour a long reading-length target.
// They are written as generic mission continuations so they follow any base passage in
// the same band without contradicting it; numbers are seeded per worksheet so repeated
// generations stay fresh.
function passageExtensionsFor(
  input: WorksheetInput,
  theme: string,
  interests: string,
  run: WorksheetRun
): string[] {
  const high = isHighSchoolOrAdult(input);
  const middle = !high && input.age >= 11;
  const rng = seededRng(`${run.seed}|passage-extend`);
  const minutesA = 15 + Math.floor(rng() * 5) * 5; // 15..35
  const minutesB = minutesA + 10 + Math.floor(rng() * 3) * 5; // +10..+20
  const tallyA = 4 + Math.floor(rng() * 4);
  const tallyB = tallyA + 2 + Math.floor(rng() * 3);
  const tallyC = tallyB + 1 + Math.floor(rng() * 3);

  if (high) {
    return [
      `Method matters as much as motivation. Before collecting anything, the group writes down what would count as success and what would count as failure, so the standard cannot quietly shift after the results arrive. They agree on how each observation about ${theme} will be recorded, who will record it, and how disagreements will be settled. This may look like bureaucracy, but it is the opposite: it is the discipline that lets a small study say something trustworthy instead of something merely convenient.`,
      `The group also confronts the problem of selection. The examples that come to mind first are usually the most dramatic ones, and dramatic examples are rarely representative. If the team studies only the memorable cases of ${theme}, the conclusion will tilt toward whatever is vivid. So they sample deliberately: ordinary cases alongside striking ones, recent alongside older, successes alongside failures. The resulting picture is messier, but mess that reflects reality is worth more than clarity that reflects bias.`,
      `Quantitative claims get special scrutiny. When the log shows ${minutesA} minutes of focused work in one session and ${minutesB} in the next, the increase of ${minutesB - minutesA} minutes is a fact; what caused it is an interpretation. The team practices keeping those layers separate. A number can anchor an argument, but it cannot interpret itself. Someone still has to ask whether the measure captures what matters, whether the comparison is fair, and whether a different baseline would tell a different story.`,
      `Counterargument is treated as a tool, not a threat. After drafting a conclusion about ${theme}, each member writes the strongest objection they can imagine: a missing variable, an alternative cause, a source with reason to exaggerate. If the conclusion survives the objection, it is stated with more confidence. If it does not, the group revises before anyone outside the room has to point out the flaw. Arguments improve fastest when their authors attack them first.`,
      `Precision in language becomes a habit. The team learns to distinguish "the evidence suggests" from "the evidence shows," and "most cases" from "the cases we examined." These are not decorations; they are claims of different strengths, and a careful reader will hold the writer to exactly the strength claimed. Writing about ${theme} this way is slower, but it produces sentences that can be defended line by line.`,
      `The project also tests how well the thinking transfers. A claim about ${theme} is re-examined through the lens of another field — a historian's question about sources, a statistician's question about variance, a designer's question about constraints. Each lens exposes an assumption the team had not noticed. Interests like ${interests} stop being separate compartments and become a set of complementary instruments for examining the same problem.`,
      `Iteration closes the loop. The first version of the team's argument is treated as a draft of the understanding, not the understanding itself. Each revision tightens a definition, replaces an anecdote with a measurement, or concedes a limit honestly. The final write-up about ${theme} is shorter than the first draft and stronger for it, because everything that survived revision earned its place.`,
      `What remains, after the project ends, is a portable method: define the question, gather evidence on purpose, separate observation from interpretation, invite the counterargument, and state conclusions no more strongly than the evidence allows. Applied to ${theme} this week, it produces one good study. Applied as a habit, it produces a rigorous thinker.`
    ];
  }

  if (middle) {
    return [
      `The group also tracks its work with data. A practice log shows ${minutesA} minutes of focused work in the first session and ${minutesB} minutes in the second, an increase of ${minutesB - minutesA} minutes. But the team is careful with those numbers: more minutes do not automatically mean better thinking. They pair the log with one sentence about what actually improved, so quantity and quality get recorded together.`,
      `Annotation becomes a quiet superpower. While reading about ${theme}, the students underline claims in one color and evidence in another. A claim with no evidence nearby earns a question mark in the margin. By the end of the page, the margins hold a map of the argument, and that map makes it far easier to summarize accurately instead of repeating whichever sentence sounded most dramatic.`,
      `The team practices separating observation from interpretation. "The result improved on the third trial" is an observation; anyone can check it. "It improved because we changed the strategy" is an interpretation, and it needs support. Listing other possible causes — luck, practice, an easier task — keeps the group honest about what the evidence actually proves about ${theme}.`,
      `A small table helps the team see patterns words might hide. Day one shows ${tallyA} completed attempts, day two shows ${tallyB}, and day three shows ${tallyC}. Adding them gives ${tallyA + tallyB + tallyC} attempts in all, but the more interesting question is why the numbers climbed. The table does not answer that by itself; it tells the team exactly where to look.`,
      `Revision is treated as part of the work, not a punishment. The first explanation each student writes about ${theme} is usually too vague: "it got better" or "it makes sense." The second draft names the detail, quotes the line, or cites the number. Comparing the two drafts side by side teaches a lesson no lecture can: precise writing is just precise thinking made visible.`,
      `Vocabulary gets the same evidence treatment. When a new word appears, the group tests its meaning against the sentence around it before reaching for a definition. Then each student uses the word in a fresh sentence about ${theme} or about ${interests}. A word someone can redeploy in a new context is learned; a word someone can only recognize is still a stranger.`,
      `Midway through, the students notice the skills crossing subject lines. The estimate-then-check habit from math shows up in their reading predictions. The fair-test idea from science shapes how they compare two strategies. Even ${interests} starts to look different: less like entertainment, more like a system with rules, trade-offs, and patterns worth explaining.`,
      `By the end of the unit, the team has a checklist it actually uses: read the question twice, name the evidence, check the numbers against the claim, and write the reason in a complete sentence. The checklist works on ${theme}, and it works just as well on a history source, a science result, or a tricky word problem. That transfer is the real product of the unit.`
    ];
  }

  return [
    `The team also keeps a simple practice journal about ${theme}. After each session, one student writes the date, one fact, and one question. In the first week the journal shows ${minutesA} minutes of practice, and in the second week it shows ${minutesB} minutes. The students subtract to find a difference of ${minutesB - minutesA} minutes, and then they talk about why the extra time helped. The journal turns ordinary practice into evidence the whole team can check.`,
    `New words appear during every part of the project. When a student meets a word they do not know, they read the sentence before it and the sentence after it, hunting for clues. Then they try the word in their own sentence about ${theme}. If the sentence makes sense to a partner, the word goes up on the class word wall. Slowly the wall fills with words the team can really use, not just words they have seen once.`,
    `One afternoon, a test goes wrong in a surprising way. Instead of hiding the mistake, the team writes it down and reads it like a clue. They ask three questions: What did we expect? What actually happened? What will we change next time? The wrong answer turns out to be useful, because it points to a step nobody had checked carefully. Fixing that one step makes the next try much stronger.`,
    `Numbers help the team see what words alone might miss. The students build a small tally chart: ${tallyA} tries on the first day, ${tallyB} tries on the second day, and ${tallyC} tries on the third day. When they add the tallies, they find ${tallyA + tallyB + tallyC} tries in all. The chart also shows which day had the most practice, and that starts a new conversation about why that day went so well.`,
    `Everyone on the team has a job, and the jobs rotate. The reader finds and underlines the most useful sentence. The recorder writes the numbers in the notebook. The checker asks, "How do we know?" before any answer is accepted. Rotating jobs means each student practices every skill, and nobody has to be perfect at all of them on the first try.`,
    `The learning does not stop at school. At home, students notice ${theme} ideas in everyday moments: while sorting objects, planning a game, reading labels, or keeping score. One student teaches a family member what the team discovered, because explaining an idea out loud is one of the best ways to test whether you truly understand it.`,
    `Estimating becomes a favorite tool. Before measuring anything, each student writes a quick guess. Then the team measures carefully and compares the real number with the guesses. Nobody is in trouble for guessing too high or too low. The point is to notice how close the guess was, and which clue would make the next estimate better.`,
    `By the end of the week, the team agrees on a simple set of habits: read the question twice, underline the evidence, check the numbers, and explain the reason in a full sentence. These habits work for ${theme}, and they work for spelling tests, science projects, and story problems too. Strong thinking is a habit, and habits grow with practice.`
  ];
}

function variantFromRun(run: WorksheetRun, salt: string, variants: string[]): string {
  return pickOne(variants, seededRng(`${run.seed}|${salt}`));
}

function highSchoolFallbackPassage(theme: string, run: WorksheetRun): string {
  if (isHistoryTheme(theme)) {
    return variantFromRun(run, "history-high", [
      `<p><strong>Passage A:</strong> Advanced history work begins with a deceptively simple question: what would count as convincing evidence? A chronicle may name a ruler as the cause of a reform, while tax records, migration tables, and court petitions suggest that pressure had been building for decades. The strongest historical argument does not merely collect impressive details. It explains how each source was produced, whose interests it served, what it leaves out, and how it changes when placed beside other evidence. That process is called corroboration, and it is one reason historical interpretation is more demanding than memorizing dates.</p>
  <p>Consider a city that expanded its public schools between 1880 and 1910. One interpretation might credit a mayor who promised modern classrooms. A second might emphasize factory owners who wanted literate workers. A third might point to immigrant families who organized petitions after their children were turned away from crowded schools. Each interpretation may contain truth, but none is complete until the historian tests it against the record. Election speeches reveal ambition. Budgets reveal priorities. Attendance ledgers show who was actually served. Petitions preserve voices that official reports sometimes ignore. The historian's task is to decide how these fragments fit together without pretending the evidence is cleaner than it is.</p>
  <p><strong>Passage B:</strong> Chronology also matters. If the petitions appeared before the mayor's speech, they may have shaped the promise instead of merely responding to it. If school spending rose only after a new tax law, fiscal policy becomes part of the explanation. If factories had already begun requiring reading tests for apprentices, economic pressure may have reinforced public demand. Causation in history is rarely a single arrow. It is usually a network of conditions, choices, constraints, and unintended consequences. Strong historians identify the most important causes while admitting what the evidence cannot prove.</p>
  <p>This is why historical thinking remains useful beyond a classroom. It trains a reader to resist simple stories, especially when those stories flatter one group or erase another. It also makes uncertainty productive. An unanswered question is not a failure; it is a research path. A careful scholar can write, "The evidence strongly suggests," "This source complicates," or "This explanation is plausible but incomplete." Those phrases are not weak. They are honest. They show that the writer understands both the power and the limits of the archive.</p>
  <p>For a learner interested in ${theme}, the goal is not to sound impressive by using difficult words. The goal is to use those words to think more precisely. Historiography asks how explanations change over time. Contextualization asks what else was happening when a source was created. Continuity and change ask what transformed and what endured. When a student connects these habits to a clear claim, the worksheet becomes more than practice. It becomes training in how to build an argument that can stand up to evidence.</p>`,
      `<p><strong>Passage A:</strong> A museum team preparing an exhibit about ${theme} faces a problem: the most dramatic source is not always the most reliable one. One visitor interview is vivid, an old map is precise, and a damaged ledger contains numbers that do not fit the official story. The team has to decide how to arrange the evidence without making the past look simpler than it was.</p>
  <p>The strongest exhibit begins by asking what each source can and cannot prove. The interview preserves memory, but memory can compress events. The map shows location, but not motives. The ledger records payments, but not the arguments behind them. When the sources disagree, the disagreement becomes useful. It shows where the real historical question lives.</p>
  <p><strong>Passage B:</strong> A careful historian would contextualize each source before drawing a conclusion. Who created it? Who was expected to read it? What pressure shaped it? A public speech may hide uncertainty because the speaker wants support. A private letter may reveal doubt, but only from one person's point of view. Corroboration turns scattered details into a stronger argument.</p>
  <p>This kind of work matters because history is not just a list of events. It is a disciplined argument about change, continuity, causation, and evidence. A learner studying ${theme} practices the same habit needed in advanced reading: slow down, compare sources, name the limits, and make the claim only as strong as the proof allows.</p>
  <p>An advanced response would not simply announce that one source is true and another is false. It would ask how each source was made, what audience it served, and which missing source would change the interpretation. If the interview, map, and ledger point in different directions, the disagreement is not a weakness in the assignment. It is the material of historical thinking.</p>
  <p>The exhibit team finally chooses to show the conflict instead of hiding it. Visitors see the vivid memory beside the precise map and the stubborn ledger. The display teaches that a responsible claim is not the neatest story; it is the story that survives the hardest questions.</p>
  <p>A graduate-level historian would also ask about absence. Whose account is missing from the exhibit? Which record was never preserved? What institution decided that the ledger mattered more than an oral memory? These questions do not weaken the final interpretation. They make it more honest by showing the boundary between what the archive proves and what it only suggests.</p>
  <p>That boundary is where advanced historical writing becomes precise. The writer can argue that one explanation is strongest while still naming the evidence that would be needed to challenge it.</p>`
    ]);
  }

  if (isArtTheme(theme)) {
    return variantFromRun(run, "art-high", [
      `<p><strong>Passage A:</strong> A city museum has acquired a large mural painted on removable panels in 1978. The work shows factory workers, neighborhood families, and a river divided by a bright red line. For decades it hung in a transit station, where sunlight faded the blue pigment and water damaged one corner. The museum must now decide whether to conserve the mural as it is, restore its original colors, or commission a contemporary artist to reinterpret the damaged section.</p>
  <p>Each choice carries a different idea about authenticity. Conservation would stabilize the surface and preserve the visible marks of age. Restoration could make the original composition easier to read, but repainting may replace some of the artist's own brushwork. Reinterpretation could invite the present-day community into the work, yet it would also change an object with a specific history. The question is not simply which version looks best. It is which evidence and values should guide the decision.</p>
  <p><strong>Passage B:</strong> The curatorial team studies the mural's composition before voting. Repeated vertical shapes connect workers to apartment towers, while the red diagonal interrupts that order and leads the eye toward the river. Some viewers interpret the line as industrial danger; others see it as a boundary between neighborhoods. Neither interpretation is automatically correct. A strong visual claim must point to color, placement, scale, repetition, or historical context and explain how that evidence supports the meaning.</p>
  <p>The team also examines provenance and audience. Photographs show that the mural once faced a busy platform, so it was designed for viewers in motion rather than for silent museum study. Interviews reveal that older residents value the faded surface because it records the station's history. Younger artists argue that careful restoration would recover details their generation has never been able to see. Audience opinion matters, but popularity alone cannot settle a conservation question.</p>
  <p>The museum finally proposes a limited treatment: stabilize the damaged panels, clean a small test area, and display digital reconstructions of several restoration options. This approach does not erase disagreement. Instead, it makes the disagreement visible and gives visitors evidence for forming their own judgment. The strongest curatorial decision is not necessarily the boldest one; it is the decision that states its purpose, documents its trade-offs, and remains accountable to both the artwork and its public.</p>`,
      `<p><strong>Passage A:</strong> A student exhibition committee must choose one of three photographs for the entrance wall. Photograph A has dramatic lighting and immediately attracts attention. Photograph B uses a quieter composition in which empty space makes the single figure appear isolated. Photograph C documents a local protest and has the strongest historical significance, but its crowded frame is difficult to read from across the room.</p>
  <p>The committee first argues from preference: one member calls A beautiful, another calls B emotional, and another says C is important. Their discussion improves only when they convert reactions into visual claims. They identify contrast, framing, scale, focal point, and symbolism. Once the evidence is named, disagreement becomes productive because each interpretation can be tested against something visible in the image.</p>
  <p><strong>Passage B:</strong> Curating is also a form of argument. The entrance image tells visitors what kind of exhibition they are entering. Choosing A would emphasize spectacle. Choosing B would establish a reflective mood. Choosing C would frame the exhibition as civic testimony. None of those choices is neutral, and none can be justified by technical quality alone.</p>
  <p>The committee then considers audience and context. Visitor surveys predict that A will attract the most attention, but surveys cannot measure which image will remain meaningful after a longer look. The protest photograph may require a caption explaining the event and the photographer's position. The isolated figure may invite multiple interpretations, which is valuable only if the surrounding works help visitors explore them.</p>
  <p>In the final proposal, each student writes a curatorial statement that makes a claim, cites two visual details, acknowledges one limitation, and explains how the selected photograph supports the exhibition's purpose. This structure turns taste into analysis. Personal response still matters, but it becomes the beginning of inquiry rather than the end of the argument.</p>`
    ]);
  }

  if (isBooksTheme(theme)) {
    return variantFromRun(run, "books-high", [
      `<p><strong>Passage A:</strong> In ${escapeHtml(run.scenario)}, the hardest question is not which book is "best." The harder question is which kind of reading gives the strongest evidence for an interpretation. A print copy lets one student mark shifts in tone. An audiobook helps another hear irony in the narrator's voice. A graphic adaptation shows setting and gesture instantly, but it may leave out sentences that explain a character's motive. Each format changes what the reader notices.</p>
  <p>The group studies ${escapeHtml(run.detail)} and compares three responses to the same chapter. One response summarizes the plot accurately but never makes a claim. A second response makes a bold claim but gives no quotation. A third response chooses a short passage, explains the narrator's word choice, and connects it to the theme of loyalty. The third response is strongest because it can be tested against the text.</p>
  <p><strong>Passage B:</strong> Serious reading is not just finishing pages. It is the habit of slowing down when a detail seems small but important. A repeated image, a sudden silence, or a change in sentence length can signal that the author wants the reader to infer something. This is why annotations matter: they preserve the moment when the reader notices a pattern and turns it into a question.</p>
  <p>For an older learner interested in ${theme}, books become training for argument. The reader has to make a claim, choose evidence, explain the evidence, and admit when another interpretation is plausible. That work builds the same skills needed in advanced essays and test passages: precision, patience, and the confidence to say, "Here is the line that proves it."</p>`,
      `<p><strong>Passage A:</strong> A library committee is building a display around ${theme}, but the students disagree about what belongs on the front table. One student wants only popular novels because more classmates will stop and look. Another wants challenging classics because the display should stretch readers. A third argues for a mix: one familiar book, one surprising book, and one book that connects to another subject.</p>
  <p>The debate changes when the committee studies ${escapeHtml(run.detail)}. Checkout records show popularity, but not depth. Reader reviews show enthusiasm, but some reviews repeat opinions without evidence. Teacher notes explain literary value, but they may overlook what students actually want to read. The committee realizes that a good decision needs more than one kind of source.</p>
  <p><strong>Passage B:</strong> Books often look personal because each reader brings a private history to the page. Still, a school argument about books cannot rely only on preference. A strong claim names a pattern in the text, quotes or describes evidence, and explains why that evidence matters. "I liked it" may be honest, but "the shifting narrator makes the ending less certain" gives other readers something to test.</p>
  <p>That is the real value of reading practice. A student who learns to support an interpretation of ${theme} is also learning to reason in public: listen to competing views, weigh evidence, and revise a claim when the proof becomes stronger.</p>`
    ]);
  }

  if (isMediaTheme(theme)) {
    return variantFromRun(run, "media-high", [
      `<p><strong>Passage A:</strong> In ${escapeHtml(run.scenario)}, the central question is not whether the film is entertaining. The harder question is how a viewer can prove an interpretation. One student argues that a scene is about loyalty because the dialogue mentions friendship. Another argues that the same scene is really about control because the camera keeps one character higher in the frame while the other is partly hidden by a doorway. A third student pauses the scene and asks which evidence is strongest: the words, the framing, the music, or the edit.</p>
  <p>The class studies ${escapeHtml(run.detail)} and notices that film evidence works differently from a printed paragraph. A line of dialogue can state one thing while lighting suggests another. A fast cut can make a choice feel urgent, while a long silence can make the audience uncomfortable. Sound can guide attention before the viewer understands why. Because film combines image, sound, performance, and sequence, a strong media analysis has to name the specific technique and explain its effect.</p>
  <p><strong>Passage B:</strong> Audience reaction can help, but it is not enough by itself. If a survey says that 72 percent of viewers found a scene suspenseful, the number shows a pattern of response. It does not prove what caused the response. A careful analyst asks whether the suspense came from the music, the editing rhythm, the actor's expression, or information the audience had that the character did not. The strongest claim connects audience data to visible or audible evidence from the film.</p>
  <p>This is why movies can be serious academic material. They train the viewer to separate preference from interpretation. "I liked the ending" is a reaction; "the ending withholds closure by repeating the opening image in a darker setting" is a claim that can be tested. For a Master's-level learner interested in ${theme}, the task is to move beyond summary and opinion toward an argument: identify the technique, connect it to meaning, consider a competing interpretation, and decide what the evidence actually supports.</p>
  <p>That habit transfers beyond film. In reading, research, and public debate, strong thinkers ask the same questions: What is the claim? What evidence supports it? What else could explain the pattern? What detail would change the conclusion? A movie scene becomes more than entertainment when it becomes practice in disciplined interpretation.</p>`,
      `<p><strong>Passage A:</strong> A documentary team preparing a short film about ${theme} has hours of interviews, location footage, and audience notes. At first, the story seems obvious: one speaker gives an emotional quote that could become the opening line. But a second interview complicates the claim, and the raw footage shows a detail the first speaker never mentions. The editor has to decide whether to build a simple story or a more honest one.</p>
  <p>The team reviews ${escapeHtml(run.detail)} and creates an evidence chart. Interview clips show perspective. Archival footage shows what was visible at the time. Audience notes show which moments confused viewers. None of these sources is complete alone. A documentary can mislead even when every clip is real, because selection and sequence shape meaning. Leaving out a hesitation, moving a quote earlier, or adding music can change how viewers judge a person.</p>
  <p><strong>Passage B:</strong> Responsible media analysis therefore treats editing as argument. A cut is not only a technical move; it tells the audience what belongs together. A close-up can invite sympathy, but it can also narrow attention. A narrator can clarify context, but the narrator can also overstate certainty. The viewer's job is to ask how the film earns trust and where that trust should be limited.</p>
  <p>For a Master's-level learner, ${theme} can support sophisticated reasoning because film is built from evidence choices. The best response does not merely praise the documentary or attack it. It identifies the claim, names the techniques that support the claim, checks whether the evidence is sufficient, and acknowledges what a skeptical viewer might ask next.</p>
  <p>In that sense, watching carefully is close to reading carefully. Both require patience with detail, attention to structure, and a willingness to revise an interpretation when new evidence appears.</p>
  <p>The team's final edit includes the emotional quote, but it no longer lets the quote control the whole story. The editor places it beside a quieter interview, a contradictory shot, and a caption explaining what the audience cannot know from the footage alone. That choice makes the film less simple but more honest.</p>
  <p>A strong viewer should notice that honesty. The question is not whether the documentary feels persuasive, but how it builds persuasion and whether the evidence deserves the trust the film asks for. That final judgment requires both close attention to craft and skepticism about what remains outside the frame.</p>`
    ]);
  }

  if (isTechnologyTheme(theme)) {
    return variantFromRun(run, "technology-high", [
      `<p><strong>Passage A:</strong> A student development team is building an educational game that teaches players to manage a virtual city during extreme weather. Early testers enjoy the graphics but stop playing after ten minutes. The team could add more rewards, simplify the simulation, or redesign the first mission. Before changing anything, however, they must decide what problem they are actually solving: confusion, boredom, difficulty, or slow system response.</p>
  <p>The team studies session recordings and finds three patterns. Some players miss a small instruction near the edge of the screen. Others understand the goal but cannot tell why their city loses power. A third group makes correct decisions, yet high latency causes the game to respond after a noticeable delay. These failures look similar in the final score, but they require different solutions. Good debugging begins by separating symptoms from causes.</p>
  <p><strong>Passage B:</strong> The developers design an experiment instead of changing several features at once. Half of the testers receive a clearer visual tutorial; the other half use the original version. Both groups play the same mission on identical devices. The team measures completion rate, error type, time on task, and whether players can explain the energy system afterward. Enjoyment matters, but learning evidence matters too.</p>
  <p>The results introduce a trade-off. The visual tutorial raises completion from 58 percent to 81 percent, but it also makes the opening mission two minutes longer. Some developers want to optimize only for completion. Others argue that players should eventually make decisions without prompts. A responsible design choice therefore needs a defined goal: immediate accessibility, long-term mastery, replay value, or some balance among them.</p>
  <p>The final proposal uses progressive support. New players receive the tutorial, prompts fade after successful decisions, and an optional challenge mode removes most guidance. This design treats difficulty as something to shape rather than simply raise or lower. Strong technology is not the version with the most features. It is the version whose algorithms, interface, and feedback serve a clear human purpose and whose effects can be tested with evidence.</p>`,
      `<p><strong>Passage A:</strong> A robotics club is designing a small delivery robot for a school library. The robot must carry books, avoid people, fit through narrow aisles, and operate for an entire afternoon. The first prototype moves quickly but drains its battery in forty minutes. The second lasts longer but turns too slowly near shelves. Every improvement exposes a new constraint.</p>
  <p>The students map the system before rebuilding it. Sensors collect distance data, an algorithm chooses a path, motors execute the movement, and feedback corrects errors. If the robot stops unexpectedly, the cause might be a sensor blind spot, a faulty threshold in the code, wheel friction, or a route that requires too many turns. Replacing parts without isolating the cause would be expensive guessing.</p>
  <p><strong>Passage B:</strong> The team creates controlled trials with the same payload and route. It changes one variable at a time: speed, turning radius, or sensor range. The data reveal that reducing top speed by 12 percent increases operating time by 31 percent while adding only eighteen seconds to the route. Optimization now becomes a question of priorities rather than raw performance.</p>
  <p>The club also considers human factors. A technically efficient robot can still fail if students cannot predict its movement or stop it safely. The final design adds a visible route signal, a physical stop button, and slower movement in crowded zones. These features do not make the robot more autonomous; they make its autonomy more understandable and accountable.</p>
  <p>Engineering at this level is disciplined compromise. The team defines success, measures performance, documents trade-offs, and revises the prototype. A clever solution is useful only when it works under real constraints and when the people affected by it can understand and trust the result.</p>`
    ]);
  }

  if (isSportsTheme(theme)) {
    return variantFromRun(run, "sports-high", [
      `<p><strong>Passage A:</strong> A school soccer team reaches the final month of its season with a problem: players are improving in practice but fading late in matches. The coach could add conditioning, reduce tactical work, or rotate more players. Each option seems reasonable, yet the team has only three weeks before the tournament. Training harder without identifying the cause could make the problem worse.</p>
  <p>The performance staff compares several measures. Sprint speed remains stable, but high-intensity distance falls sharply after the seventieth minute. Players report heavier legs after weeks with two hard practices, and sleep logs show that recovery is lowest before away matches. Match results alone hide these patterns because a win can still include poor late-game movement.</p>
  <p><strong>Passage B:</strong> The staff proposes a small periodization experiment. One group keeps the current schedule. Another replaces part of the second hard practice with lower-intensity tactical work and structured recovery. Both groups complete the same sprint and decision tests. The staff also records perceived effort, sleep, and late-session accuracy.</p>
  <p>After two weeks, the adjusted group completes slightly less total training but maintains passing accuracy under fatigue and reports better recovery. The sample is small, so the result cannot prove the plan will work for every athlete. Still, the combined evidence is stronger than judging the program by effort alone. More work is not automatically better work.</p>
  <p>The final decision preserves one high-intensity session, reduces unnecessary volume, and adds individual recovery targets. This is not an easier program. It is a more precise one. High-level performance grows when training stress, adaptation, tactics, confidence, and health are treated as one connected system rather than as competing priorities.</p>`,
      `<p><strong>Passage A:</strong> Two swimmers have nearly identical average race times, but their coaches face different decisions. Swimmer A produces one exceptional race and several slower ones. Swimmer B rarely posts the fastest time but stays within a narrow range. For a relay final, should the coach choose the higher peak or the more reliable performance?</p>
  <p>The answer depends on context. If the team needs an unusually fast split to medal, the higher ceiling may matter. If a disqualification or large slowdown would ruin the relay, consistency may be more valuable. An average alone cannot show this difference; the coach must examine variance, starts, turns, fatigue, and how each athlete performs under pressure.</p>
  <p><strong>Passage B:</strong> Biomechanics data adds another layer. Swimmer A generates more force off the starting block but loses efficiency during the final lap. Swimmer B uses less force yet maintains stroke length. A coach who sees only the start might choose A. A coach who sees only the finish might choose B. Strong analysis connects each measurement to the actual demands of the race.</p>
  <p>The athletes also deserve a role in the decision. Confidence, recent recovery, and relay order can change performance. These factors are difficult to measure, but ignoring them does not make the decision objective. It only hides assumptions inside the selection process.</p>
  <p>A responsible recommendation therefore states the goal, compares multiple forms of evidence, and acknowledges uncertainty. Sport rewards action, but the best action is not guesswork. It is a decision whose reasoning remains clear even after the result is known.</p>`
    ]);
  }

  if (isMusicTheme(theme)) {
    return variantFromRun(run, "music-high", [
      `<p><strong>Passage A:</strong> A student producer is arranging the same song for two performances: a small acoustic room and a large school auditorium. The melody and lyrics will not change, but almost every other choice might. A dense arrangement that feels rich through headphones could become muddy in a reverberant hall. A sparse arrangement might sound clear but fail to create enough energy for a large audience.</p>
  <p>The producer begins with acoustics rather than taste. In the auditorium, low frequencies linger longer and fast rhythmic details blur near the back wall. The acoustic room absorbs more sound, making quiet changes in dynamics easier to hear. These conditions do not determine the arrangement, but they create constraints the musicians should understand.</p>
  <p><strong>Passage B:</strong> The group tests two versions. Version A layers guitar, piano, percussion, and backing vocals through most of the song. Version B saves several instruments for the final section and leaves more space around the vocal. Listeners in the auditorium rate Version B as clearer, even though some prefer the excitement of Version A. Preference and intelligibility are related, but they are not identical.</p>
  <p>The producer also develops a four-note motif that returns in different timbres. On piano it sounds reflective; on distorted guitar it becomes urgent. The notes remain the same, yet arrangement changes their meaning. This is why musical analysis must name what is heard: rhythm, dynamics, register, instrumentation, harmony, and form.</p>
  <p>The final performance uses the spacious arrangement in the auditorium and the denser version in the smaller room. The solution is not a compromise between good and bad music. It is evidence that creative decisions become stronger when artistic intention, performer ability, audience experience, and physical sound are considered together.</p>`,
      `<p><strong>Passage A:</strong> A school ensemble is preparing a new piece built around syncopated rhythm and a repeating motif. The first rehearsal is accurate but lifeless. Every note occurs at the correct time, yet the groove feels heavy and the motif disappears inside the accompaniment. The conductor must decide whether the problem comes from tempo, dynamics, articulation, balance, or the players' understanding of the phrase.</p>
  <p>The ensemble records three short trials. In the first, they increase tempo. Energy improves, but precision falls. In the second, they keep the original tempo and reduce the accompaniment's volume. The motif becomes clearer. In the third, players accent every written syncopation, producing so much emphasis that the rhythm loses direction.</p>
  <p><strong>Passage B:</strong> These trials show why correct execution is not the same as interpretation. Musical notation gives essential instructions, but performers still shape hierarchy: which note leads, where tension grows, and when a phrase releases. Dynamics and articulation guide attention in much the same way that composition guides the eye in visual art.</p>
  <p>The conductor asks each section to explain its role. The bass line stabilizes the pulse, percussion creates forward motion, and upper instruments pass the motif between contrasting timbres. Once the musicians understand those relationships, they no longer need to make every entrance equally strong.</p>
  <p>The final rehearsal is not louder or faster overall. It is more intentional. The motif remains audible, syncopation creates lift rather than confusion, and dissonance resolves with greater impact. Enthusiasm matters, but disciplined listening turns enthusiasm into a performance the audience can actually follow.</p>`
    ]);
  }

  if (isCookingTheme(theme)) {
    return variantFromRun(run, "cooking-high", [
      `<p><strong>Passage A:</strong> A student culinary team must redesign a popular muffin recipe for a school event. The original is moist and flavorful, but it contains a common allergen, costs too much per serving, and becomes dry after several hours. The team could replace ingredients one at a time, but substitutions affect chemistry as well as taste. Removing eggs changes protein structure and emulsification; reducing sugar changes sweetness, browning, and moisture retention.</p>
  <p>The team defines success before testing: no target allergen, cost below ninety cents per serving, acceptable texture after four hours, and a sensory rating close to the original. These criteria prevent the group from declaring success simply because one batch tastes good immediately after baking.</p>
  <p><strong>Passage B:</strong> Three prototypes isolate different changes. Batch A uses a seed gel as a binder. Batch B uses fruit puree. Batch C combines a smaller amount of both. All batches keep flour mass, oven temperature, mixing time, and portion size constant. Tasters rate tenderness, flavor, appearance, and aftertaste without knowing which version they receive.</p>
  <p>Batch B receives the highest flavor score but has a gummy center. Batch A has the best structure but dries quickly. Batch C scores slightly below B in flavor while maintaining texture and meeting the cost target. The best recipe is therefore not the highest score in one category. It is the version that satisfies the full design problem.</p>
  <p>The final recipe documents ingredient ratios by mass rather than only by cups, because mass scales more reliably. It also records uncertainty: a different fruit puree, flour protein level, or oven could change the result. Culinary creativity becomes more powerful when sensory judgment, food science, measurement, safety, and audience needs work together.</p>`,
      `<p><strong>Passage A:</strong> A neighborhood café wants to reduce food waste without shrinking its menu. Staff members believe the largest problem is unsold bread, but a one-week audit shows that preparation scraps and oversized portions contribute nearly as much. The café must decide whether to change purchasing, recipes, portion sizes, or how ingredients are reused.</p>
  <p>The team separates edible surplus from unavoidable waste. Vegetable stems can become stock, day-old bread can become crumbs or pudding, and bruised fruit may still work in cooked sauces. Food-safety limits remain non-negotiable; creative reuse cannot justify unsafe storage or cross-contamination.</p>
  <p><strong>Passage B:</strong> The café tests a redesigned lunch special using overlapping ingredients. The change lowers purchasing cost and waste mass, but preparation takes longer. Customer ratings stay stable, while staff report that the new workflow becomes easier after several days. A single day's labor data would therefore exaggerate the long-term cost.</p>
  <p>The team also studies portions. Plates returning with similar leftovers suggest that the standard serving may exceed what many customers want. Offering two portion sizes could reduce waste, but prices must remain fair and the smaller option should not feel like a penalty.</p>
  <p>The final proposal combines better forecasting, flexible portions, safe ingredient reuse, and a weekly waste log. Sustainability is not one clever recipe. It is a system in which purchasing, preparation, service, safety, cost, and customer experience are measured together.</p>`
    ]);
  }

  if (isNatureTheme(theme)) {
    return variantFromRun(run, "nature-high", [
      `<p><strong>Passage A:</strong> A student ecology team is studying why a local stream supports fewer aquatic insects than it did five years ago. One explanation points to warmer water. Another blames sediment after construction upstream. A third suggests that sampling has changed: earlier teams collected from shaded riffles, while the current team sampled easier-to-reach pools.</p>
  <p>The students cannot test every explanation at once. They create a sampling plan covering shaded and exposed sites, riffles and pools, and locations above and below the construction area. At each site they measure temperature, dissolved oxygen, turbidity, flow, and indicator species. Randomized site selection reduces the temptation to choose locations that confirm the team's expectation.</p>
  <p><strong>Passage B:</strong> The data show lower insect diversity where turbidity is high, but warm exposed pools also have low dissolved oxygen. These variables overlap, so correlation alone cannot identify one cause. Sediment may cover habitat, temperature may reduce oxygen, and slower water may influence both.</p>
  <p>The team compares observations after rainfall and during dry weather. Turbidity changes sharply below construction after rain, while upstream sites remain more stable. This strengthens the sediment explanation, but the students still avoid claiming it explains every decline. Long-term warming and habitat differences remain plausible contributors.</p>
  <p>The final report recommends erosion controls, restored streamside shade, and repeated monitoring across seasons. The goal is not to produce a simple villain. It is to identify actions supported by evidence while stating what remains uncertain. Ecological systems are connected; responsible conclusions must be precise enough to guide action without pretending complexity has disappeared.</p>`,
      `<p><strong>Passage A:</strong> A coastal reserve is considering whether to close part of a beach during nesting season. The closure could protect wildlife, but it would also limit recreation and affect nearby businesses. Managers need more than a count of nests; they need evidence about disturbance, habitat quality, visitor patterns, and which protections actually work.</p>
  <p>Researchers divide the beach into comparable zones. Some receive clear signs and marked paths, some use volunteer guides, and a small protected zone limits access during peak nesting hours. Cameras and field observations record nesting success, predator activity, visitor compliance, and accidental disturbance without identifying individual visitors.</p>
  <p><strong>Passage B:</strong> Early results show that signs improve compliance where paths are obvious but have little effect near popular viewpoints. Guided areas produce fewer disturbances, although staffing costs are higher. The limited closure protects nests most effectively, but its social cost is also greatest.</p>
  <p>A strong management decision must therefore define the goal. If zero disturbance is required, broad closure may be justified. If the goal is substantial protection with continued access, a combination of targeted closure, guides, and redesigned paths may perform better. The correct choice depends on values as well as biological evidence.</p>
  <p>The reserve chooses an adaptive plan: begin with targeted protections, publish the measures, and expand restrictions if nesting success falls below a stated threshold. This approach treats policy as a testable decision. Nature protection becomes more credible when goals, evidence, trade-offs, and revision rules are visible to everyone affected.</p>`
    ]);
  }

  const lens = interestLensFor(theme);
  const topic = escapeHtml(themePhrase(theme));
  return `<p><strong>Passage A:</strong> A ${escapeHtml(lens.role)} receives a real assignment connected to ${topic}: create a ${escapeHtml(lens.artifact)} that another person could understand and use. The team cannot succeed by repeating facts or decorating a generic school task with the topic's name. It must decide ${escapeHtml(lens.decision)}.</p>
  <p>The team begins by defining success. It identifies the intended audience, the constraints, and the evidence that would distinguish a strong result from an attractive but weak one. For this project, useful evidence includes ${escapeHtml(lens.evidence)}. Each measure captures part of the problem, but no single number or opinion can settle the decision alone.</p>
  <p><strong>Passage B:</strong> The first draft exposes a trade-off. One option is easier to understand but leaves out important complexity. Another is more complete but asks too much of the audience. A third is memorable but difficult to verify. The team compares the options against the same criteria instead of changing the standard after seeing which result it prefers.</p>
  <p>Iteration turns interest into disciplined work. The team uses the evidence to ${escapeHtml(lens.action)}, records what changed, and checks whether the revision solved the original problem or merely created a new one. It also invites a skeptical review: What assumption is hidden? Whose perspective is missing? What result would make the team reverse its choice?</p>
  <p>The final ${escapeHtml(lens.artifact)} includes both a recommendation and its limits. This is what advanced work with ${topic} looks like: authentic decisions, precise evidence, thoughtful trade-offs, and a product made for someone beyond the person completing the worksheet.</p>`;
}

function middleSchoolFallbackPassage(theme: string, interests: string, run: WorksheetRun): string {
  if (isHistoryTheme(theme)) {
    return variantFromRun(run, "history-middle", [
      `<p>A historian is a detective of the past, but the clues are not always simple. One source might be a letter, another might be a map, and another might be a broken tool found near an old road. Each source can teach something, but each source also has limits. A letter tells one person's perspective. A map may show roads and rivers, but not the people who could not afford to travel. An artifact shows what people made or used, but it may not explain what they believed.</p>
  <p>Imagine a class studying why a town grew quickly after a railroad arrived. The easiest answer is, "The railroad caused the growth." A stronger answer looks for evidence. Did stores open before or after the railroad station? Did more families move into town? Did farmers ship crops farther away? Did some people lose land when the tracks were built? A timeline helps the class put events in order, but the students still need to explain cause and effect.</p>
  <p>The class also compares perspectives. A shop owner might remember the railroad as a success because more customers arrived. A farmer might remember it as expensive because land prices changed. A worker might remember dangerous jobs building the tracks. These memories do not all cancel each other out. Together, they help students see that history is bigger than one person's story.</p>
  <p>Because the learner also mentioned ${interests}, the worksheet connects history to real interests and real choices. Good historical thinking asks students to read carefully, use dates accurately, notice bias, and explain claims in their own words. The goal is not to memorize every detail. The goal is to use evidence to make a fair explanation of what changed, what stayed the same, and why it mattered.</p>`,
      `<p>A class history team opens a box labeled ${escapeHtml(run.detail)}. Inside are clues from different years, but the clues do not explain themselves. One student wants to put the objects in time order. Another wants to know who made them. A third asks which clue is most trustworthy.</p>
  <p>The team builds a timeline, then notices that time order is only the beginning. If a newspaper article praises a new rule, it may show what leaders wanted people to believe. If a family letter complains about the same rule, it may show how ordinary people experienced it. Both sources matter, but neither source tells the whole story alone.</p>
  <p>Good historians compare sources the way careful readers compare details in a passage. They ask what changed, what stayed the same, and which cause seems strongest. When two sources disagree, the disagreement becomes a question to investigate rather than a problem to ignore.</p>
  <p>That is why ${theme} can train strong thinking. The learner practices reading closely, weighing evidence, and explaining why one claim is stronger than another.</p>`
    ]);
  }

  if (isBooksTheme(theme)) {
    return variantFromRun(run, "books-middle", [
      `<p>A book club is preparing a recommendation shelf, but the group cannot agree on what makes a book worth sharing. One student chooses exciting plots. Another chooses characters who change. A third chooses books with sentences that make readers stop and think. The teacher asks them to support each choice with evidence from the text.</p>
  <p>The group studies ${escapeHtml(run.detail)} and starts to notice patterns. A cover can attract attention, but it does not prove the story is strong. A chapter title can give a clue, but the chapter itself has to support the prediction. A reader review can be useful, but only if it explains why the book works.</p>
  <p>By the end of the discussion, the students understand that reading is more than finishing pages. A strong reader asks questions, notices details, and explains ideas clearly. When two readers disagree, they go back to the text and ask, "Which detail proves it?"</p>
  <p>For someone interested in ${theme}, this kind of book talk builds reading comprehension, vocabulary, and writing. It also makes the next book feel like a new mystery with clues waiting inside.</p>`
    ]);
  }

  const lens = interestLensFor(theme);
  return `<p>A ${escapeHtml(lens.role)} receives a challenge connected to ${escapeHtml(themePhrase(theme))}: make a ${escapeHtml(lens.artifact)} for another student. The team first asks what the audience needs and what would make the result accurate, useful, and interesting.</p>
  <p>The first version has a problem. One part is exciting but unclear, while another part is accurate but hard to use. The team gathers ${escapeHtml(lens.evidence)}, compares the choices, and decides ${escapeHtml(lens.decision)}.</p>
  <p>Instead of changing everything, the team revises one feature and checks the result. This makes it easier to explain what helped. The students also name one limitation so the final claim does not sound stronger than the evidence.</p>
  <p>By the end, the team can ${escapeHtml(lens.action)} with purpose. Their ${escapeHtml(lens.artifact)} does more than display facts about ${escapeHtml(themePhrase(theme))}; it helps a real person understand, choose, or do something.</p>`;
}

function elementaryFallbackPassage(theme: string, interests: string, run: WorksheetRun): string {
  if (isHistoryTheme(theme)) {
    return variantFromRun(run, "history-elementary", [
      `<p>Maya's class visits a small history room at the library. On the first table, the students see an old photograph, a train ticket, and a handwritten letter. Their teacher says, "These are sources. A source gives us information about the past." Maya looks closely at the photo. It shows a street with horses, a tiny grocery store, and children standing near a wooden schoolhouse.</p>
  <p>The class makes a timeline. First, the schoolhouse opened in 1908. Next, the train station opened in 1912. Then a new bridge opened in 1916. Maya notices that each event helped the community in a different way. The school helped children learn. The train helped people and goods move. The bridge helped neighbors visit each other more safely.</p>
  <p>Maya also learns that one source does not tell the whole story. The photograph shows the schoolhouse, but it does not say how the children felt. The letter says one family was excited about the train, but another family may have felt worried about changes in the town. Good historians ask questions, compare sources, and use evidence before they decide what happened.</p>
  <p>At the end of the visit, Maya writes one clear sentence: "Our community changed when schools, trains, and bridges helped people connect." She underlines the word evidence because every good history answer needs proof. Then she adds one question she still has: "Who built the bridge, and what tools did they use?" A new question means the learning can keep going.</p>`,
      `<p>A class opens a history box with ${escapeHtml(run.detail)} inside. The teacher says, "A source is something that gives us information." The students look closely before they guess. One source has a date. One source has a picture. One source has a name written in careful letters.</p>
  <p>The students put three cards on a timeline. First, a small park opened. Next, a school garden was planted. Last, families held a picnic to celebrate. The order helps the students see how one event can lead to another.</p>
  <p>One student says the park was important because it gave neighbors a place to meet. Another student says the garden mattered because children learned to grow food. Both ideas can be fair if the students use evidence from the sources.</p>
  <p>At the end, each learner writes one sentence about what changed in the community and one question they still have. In history, a new question is a good thing because it helps the learning continue.</p>`
    ]);
  }

  if (isBooksTheme(theme)) {
    return variantFromRun(run, "books-elementary", [
      `<p>A class visits the library to build a recommendation shelf. Each student chooses one book and gives a reason. One student picks a funny story because the character makes a brave choice. Another picks an animal book because the pictures give helpful clues. A third student picks a mystery because each chapter adds a new clue.</p>
  <p>The librarian shows the class how to look at ${escapeHtml(run.detail)}. A title can give a hint. A cover can make a prediction. A chapter ending can make the reader ask, "What will happen next?" Good readers use these clues, but they also go back to the words on the page.</p>
  <p>Then the class writes short book cards. Each card names the book, tells the main idea, and gives one detail from the story. The detail is important because it proves the recommendation.</p>
  <p>For a learner who likes ${theme}, every book can become a small mission: notice clues, learn new words, explain the reason, and share the story with someone else.</p>`
    ]);
  }

  if (isCookingTheme(theme)) {
    return `<p>Mia's class opens a tiny test kitchen. Their mission is to make enough fruit cups for twelve students. First, they read the recipe card and circle the action words: wash, measure, mix, and share. The teacher reminds them that good cooks read every step before they begin.</p>
  <p>The class has 24 strawberry pieces, 12 banana slices, and 36 blueberries. They want every cup to be the same. The students count, make equal groups, and check that no cup receives all the berries. Fair portions are a math problem and a teamwork problem.</p>
  <p>Next, the class compares two apple slices. One has lemon juice and one does not. After ten minutes, the plain slice turns browner. The students do not taste the test slices. They observe color, record what changed, and learn that kitchen science needs safe rules.</p>
  <p>At the end, each learner designs a recipe card with a title, three ordered steps, and one helpful picture. The mission feels like cooking, but it also practices reading directions, equal groups, observation, and clear writing.</p>`;
  }

  if (isNatureTheme(theme)) {
    return `<p>Leo's class becomes a backyard field team. Each pair receives a small observation square and a mission: find living and nonliving things without pulling, chasing, or harming anything. The students look closely at leaves, soil, stones, insects, and shadows.</p>
  <p>They make a tally chart. One square has 7 clover leaves, 3 ants, and 2 small stones. Another square has 4 clover leaves, 1 ant, and 6 stones. The class compares the numbers and asks why the places might be different.</p>
  <p>The students notice that the first square is shady and damp, while the second is sunny and dry. That clue may explain part of the pattern, but one observation is not enough. The class decides to check two more squares before making a conclusion.</p>
  <p>At the end, each learner draws one thing they observed, labels two details, and writes one question. The goal is not to collect nature. The goal is to notice carefully, count fairly, and leave the habitat as they found it.</p>`;
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

  const lens = interestLensFor(theme);
  return `<p>The class gets a mission about ${escapeHtml(themePhrase(theme))}. They will make a small ${escapeHtml(lens.artifact)} for another class. First, they read the mission card and circle the goal. Then they choose jobs: reader, counter, maker, and checker.</p>
  <p>The team has two ideas. One looks exciting but misses an important detail. The other is clear but needs more color, examples, or action. The students use ${escapeHtml(lens.evidence)} to choose what to keep and what to improve.</p>
  <p>They count the materials, put the steps in order, and test one part. When something does not work, the checker does not say, "Wrong." The checker asks, "What clue can help us fix it?" That keeps the mission calm and moving.</p>
  <p>At the end, the class shares the ${escapeHtml(lens.artifact)} and names one thing it helps someone do. The learners practiced reading, math, teamwork, and explanation while working with something they genuinely care about.</p>`;
}

type AnswerContext = { high: boolean; isSpace: boolean; run: WorksheetRun };
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

  if (question.section === "Critical Thinking") {
    return escapeHtml(criticalThinkingAnswerFor(question.text));
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
  if (isHistoryTheme(theme) && ctx.high) {
    const answers = [
      "The central claim is that advanced history requires corroborating sources, naming limits, and making claims only as strong as the evidence allows.",
      "A strong answer can use the interview, map, ledger, petition, budget, speech, or other source named in the passage, as long as it explains what that source can and cannot prove.",
      "Source limits matter because every record is shaped by who created it, what it includes, what it omits, and what pressure surrounded it.",
      "Corroboration strengthens a historical claim by checking one source against another instead of trusting the most dramatic source alone.",
      "A simple explanation is weak when it credits one person, source, or event without testing competing causes or missing evidence.",
      "The passage shows that responsible historical interpretation is disciplined: compare sources, contextualize evidence, and admit uncertainty where the archive is incomplete."
    ];
    return answers[index] || "Use a specific source from the passage and explain how it supports or limits the historical claim.";
  }

  if (isCookingTheme(theme) && ctx.high) {
    const answers = [
      "The central problem is how to redesign a food product or kitchen system that satisfies safety, chemistry, sensory quality, cost, workflow, and audience needs together.",
      "Several criteria prevent the team from declaring success based on one attractive result such as immediate taste, low cost, or reduced waste.",
      "Changing one variable while controlling the rest makes differences more attributable to the substitution or process being tested.",
      "The highest flavor score may fail texture, safety, stability, cost, or workflow requirements; the cheapest option may not satisfy users or the design brief.",
      "The final choice is supported by balanced sensory scores, stable texture, target cost, reduced waste, or workflow evidence rather than one isolated measure.",
      "Rigorous culinary creativity combines sensory judgment with food science, controlled testing, accurate scaling, safety, resource use, and honest documentation."
    ];
    return answers[index] || "Use a specific recipe, sensory, cost, or workflow detail from the passage and explain how it supports the choice.";
  }
  if (isCookingTheme(theme)) {
    const answers = [
      "The main idea is that the class uses cooking to practice reading directions, equal sharing, safe observation, and clear writing.",
      "A strong detail is that the students circle the recipe action words before they begin or divide the fruit into equal cups.",
      "A recipe is a set of ingredients and ordered directions for making food.",
      "The students should count each fruit type and divide it equally so every cup is fair.",
      "First they read the recipe, next they make equal fruit cups and observe apples, and last they design a recipe card.",
      "Open response. A useful question could ask why lemon slows browning or how many fruit pieces belong in each cup."
    ];
    return answers[index] || "Use a detail from the test-kitchen passage and explain your answer.";
  }

  if (isNatureTheme(theme) && ctx.high) {
    const answers = [
      "The central problem is how to identify likely ecological causes and choose an intervention while balancing uncertainty, connected variables, biological goals, and human consequences.",
      "One observation cannot isolate cause because sampling location, temperature, flow, rainfall, habitat, disturbance, and other variables may overlap.",
      "The plan samples comparable conditions, includes reference sites, repeats observations, and measures several variables, reducing selection bias and improving causal reasoning.",
      "Environmental variables interact, while management choices also trade protection against access, cost, livelihoods, and community trust.",
      "The recommendation is supported by repeated spatial or weather-linked patterns and uses thresholds or monitoring so the intervention can be revised.",
      "Responsible action uses the strongest available evidence, states uncertainty, makes goals and trade-offs visible, and commits to monitoring and adaptation."
    ];
    return answers[index] || "Use a specific field observation or management detail from the passage and explain how it supports the recommendation.";
  }
  if (isNatureTheme(theme)) {
    const answers = [
      "The main idea is that careful nature study means observing, counting, comparing habitats, asking questions, and leaving living things unharmed.",
      "A strong detail is that the class uses tally charts and checks more observation squares before making a conclusion.",
      "A habitat is the place where a living thing finds what it needs.",
      "The shady, damp square may support more clover and ants, but the class needs more observations before deciding.",
      "First the students observe without harming anything, next they count and compare two squares, and last they plan more checks and draw what they found.",
      "Open response. A useful question could ask how sunlight, water, soil, or season changes what lives in each square."
    ];
    return answers[index] || "Use a detail from the field-team passage and explain your answer.";
  }

  if (isSportsTheme(theme) && ctx.high) {
    const answers = [
      "The central decision is how to improve or select performance by balancing peak output, consistency, fatigue, recovery, tactics, and the demands of the competition.",
      "Wins and averages compress different performance patterns. They can hide late-game decline, variance, opponent strength, fatigue, or how the result was produced.",
      "The comparison changes one meaningful factor, holds key conditions steady, and measures several outcomes, making causal claims more defensible.",
      "The coach must weigh short-term output against consistency, recovery, injury risk, tactical fit, and the possibility that a smaller training load produces better adaptation.",
      "The recommendation is supported by maintained accuracy under fatigue, improved recovery, or a performance profile that better matches the event's actual demands.",
      "Responsible analysis defines the goal, uses multiple measures, includes athlete context, acknowledges uncertainty, and keeps the reasoning clear regardless of the final result."
    ];
    return answers[index] || "Use a specific performance measure from the passage and explain why it matters to the decision.";
  }

  if (isMusicTheme(theme) && ctx.high) {
    const answers = [
      "The central decision is how to shape an arrangement or performance so musical intention remains clear under the acoustic, technical, and expressive conditions of the performance.",
      "Acoustics and balance determine which frequencies, rhythms, voices, and motifs remain distinct; the same notes can be perceived differently in another room or texture.",
      "Accuracy reproduces the written notes, while interpretation establishes hierarchy, direction, tension, release, and meaning through dynamics, articulation, balance, and timbre.",
      "The passage weighs energy against clarity, density against space, speed against precision, and individual prominence against the coherence of the whole.",
      "The final choice is supported by clearer listener perception, a more audible motif, controlled syncopation, or instrumentation adapted to the performance space.",
      "The conclusion argues that creative intention becomes stronger when artists test how specific musical choices affect performers, listeners, and the physical sound."
    ];
    return answers[index] || "Use a specific musical or acoustic detail from the passage and explain how it supports the interpretation.";
  }

  if (isTechnologyTheme(theme) && ctx.high) {
    const answers = [
      "The central problem is how to identify the actual cause of poor performance and choose a design that balances accessibility, learning, speed, reliability, and human needs.",
      "A symptom such as a low score or stopped robot can come from different causes. Separating causes prevents the team from changing the wrong feature or component.",
      "The experiment changes one feature while holding conditions steady and measures several outcomes, making the evidence more useful for judging causation.",
      "The design with the best immediate completion or speed may weaken long-term mastery, battery life, safety, clarity, or another goal the team values.",
      "The evidence supports progressive support or compromise because performance improves while guidance can fade, or because a modest speed cost produces a much larger battery and safety benefit.",
      "Responsible technology defines a human purpose, tests effects with evidence, documents trade-offs, and makes automated behavior understandable and accountable."
    ];
    return answers[index] || "Use a specific design detail or data point from the passage and explain how it supports the conclusion.";
  }

  if (isArtTheme(theme) && ctx.high) {
    const answers = [
      "The central problem is how to make a responsible conservation or curatorial decision when authenticity, visual impact, historical context, and community interests point toward different choices.",
      "Sample: the red diagonal interrupts the repeated vertical forms and directs attention toward the river; this supports an interpretation of the line as a boundary or disruption.",
      "Preference states a reaction, while an evidence-based visual claim identifies a visible feature such as composition, color, scale, or framing and explains how it produces meaning.",
      "The work was made for a particular place and public. Moving it or altering it can change its meaning, while different audiences may value age, legibility, history, or participation differently.",
      "A strong answer supports the limited, documented treatment because it stabilizes damage, tests intervention cautiously, and lets visitors compare alternatives without pretending uncertainty is solved.",
      "Responsible judgment states its purpose, cites visual and contextual evidence, documents trade-offs, and remains accountable to both the artwork and the people affected by the decision."
    ];
    return answers[index] || "Use a specific visual or contextual detail from the passage and explain how it supports the interpretation.";
  }

  if (isMediaTheme(theme) && ctx.high) {
    const answers = [
      "The central claim is that strong movie analysis must prove an interpretation with specific film evidence, not just personal reaction.",
      `A strong detail is the discussion of ${ctx.run.detail}, because it shows that film meaning can come from visible or audible technique, not only plot summary.`,
      "Audience reaction can show a pattern, but it does not prove the cause; the analyst still needs scene evidence such as editing, framing, sound, or performance.",
      "A weak media claim would say only that the movie was exciting, boring, or good without naming a technique or scene detail that supports the view.",
      "A competing interpretation matters because the same scene detail can support more than one plausible meaning; strong analysis weighs which reading has better evidence.",
      "The final paragraph connects movie analysis to advanced reasoning by emphasizing claim, evidence, alternate explanations, and disciplined interpretation."
    ];
    return answers[index] || "Use a specific scene detail from the passage and explain how it supports the interpretation.";
  }

  if (isMediaTheme(theme)) {
    const answers = [
      "The main idea is that viewers should use scene clues and evidence to explain what a movie means.",
      "A viewer can use dialogue, music, camera angles, setting, character actions, or editing as clues.",
      "A movie review needs a scene detail because the detail proves the opinion instead of just stating it.",
      "Good viewers go back to the scene and find the clue that supports each idea.",
      "Open response. A strong sentence names a movie or scene and gives a clear reason.",
      "Open response. A good question asks about a character, scene, setting, or why the filmmaker made a choice."
    ];
    return answers[index] || "Use evidence from the movie passage and explain your thinking.";
  }

  if (isBooksTheme(theme) && ctx.high) {
    const answers = [
      "The central claim is that strong reading is evidence-based: a reader should make an interpretation, support it with text details, and explain why the details matter.",
      "A strong detail is that print, audio, graphic, review, or display evidence can each change what a reader notices, but none replaces textual proof.",
      "The response with a quotation or specific detail is stronger because another reader can check it against the text; a summary alone retells but does not prove a claim.",
      "Annotation is presented as a way to preserve thinking, mark patterns, and turn noticed details into questions or claims.",
      "A weak literary claim would say only that the reader liked the book or thought it was exciting without evidence from the text.",
      "The final paragraph connects books to argument by showing that readers practice claims, evidence, interpretation, and revision."
    ];
    return answers[index] || "Use a detail from the book passage and explain how it proves the claim.";
  }

  if (isBooksTheme(theme)) {
    const answers = [
      "The main idea is that readers use clues and story details to understand and recommend books.",
      "A reader can use a title, cover, chapter ending, character action, or detail from the page as a clue.",
      "A recommendation needs a story detail because the detail proves the reason instead of just giving an opinion.",
      "Good readers go back to the text and find the detail that supports each idea.",
      "Open response. A strong sentence names a book or kind of book and gives a clear reason.",
      "Open response. A good question asks about the topic, character, setting, or what kind of book the reader wants next."
    ];
    return answers[index] || "Use evidence from the book passage and explain your thinking.";
  }

  if (ctx.high) {
    const lens = interestLensFor(theme);
    const answers = [
      `The central problem is deciding ${lens.decision} while producing a ${lens.artifact} that a real audience can understand and use.`,
      "Defining the audience, constraints, and evidence prevents the team from judging success by preference or changing the standard after seeing the results.",
      "One option is simple but incomplete, another is complete but demanding, and a third is memorable but difficult to verify.",
      "The same criteria make the comparison consistent, so each option is judged against the project's purpose rather than against a convenient new standard.",
      "A skeptical review reveals hidden assumptions, missing perspectives, and evidence that could overturn the preferred choice.",
      `Advanced work with ${theme} requires authentic decisions, precise evidence, acknowledged trade-offs, iteration, and a useful product made for someone else.`
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
    `The main idea is that the class can use ${theme} to make something useful while practicing reading, counting, teamwork, and explanation.`,
    `A strong detail is that the team uses ${interestLensFor(theme).evidence} to compare two ideas before improving the ${interestLensFor(theme).artifact}.`,
    `${themeTitle(interestLensFor(theme).artifact)} means the useful product or plan the team creates for another person.`,
    `The interest gives the mission a real purpose: the team is making a ${interestLensFor(theme).artifact} about ${theme} for an audience.`,
    "When one part does not work, the team should find a clue, change one thing, test it, and explain what improved."
  ];
  const answers = ctx.isSpace ? spaceAnswers : genericAnswers;
  return answers[index] || "Use evidence from the passage and explain the answer in your own words.";
}

function mathAnswerFor(text: string): string | null {
  if (/\$2,400 budget.*18 percent.*37 percent.*22 percent/i.test(text)) return "$552 remains.";
  if (/review of 160 users.*116.*132/i.test(text)) return "The rate rises from 72.5 percent to 82.5 percent, an increase of 10 percentage points.";
  if (/scores of 72, 84, and 78.*fifth criterion/i.test(text)) return "Prototype 3, with a weighted average of about 79.3.";
  if (/takes 48 minutes.*17\.5 percent/i.test(text)) return "39.6 minutes.";
  if (/250 observations includes 42 exceptions/i.test(text)) return "16.8 percent are exceptions; they reveal the limits and conditions of the pattern.";
  if (/18 muffins using 540 grams/i.test(text)) return "1,500 grams of flour.";
  if (/batch costs \$13\.68.*24 portions/i.test(text)) return "$0.68 per packaged portion.";
  if (/18\.4 kg before changes and 12\.1 kg/i.test(text)) return "About a 34.2 percent reduction.";
  if (/62 percent flour, 38 percent water/i.test(text)) return "775 grams flour and 475 grams water.";
  if (/scores 7, 8, 8, 9, 6, 8, 9, and 7/i.test(text)) return "Mean 7.75; range 3.";
  if (/counts at four sites are 24, 18, 11, and 7/i.test(text)) return "About 70.8 percent lower.";
  if (/42 of 70 nests.*57 of 75/i.test(text)) return "The rate rises from 60 percent to 76 percent, an increase of 16 percentage points.";
  if (/6 sites monthly for 18 months/i.test(text)) return "432 site-measurements.";
  if (/1,250 to 1,475.*1,298/i.test(text)) return "An 18 percent increase, followed by a 12 percent decrease.";
  if (/36 invasive plants in 15 plots/i.test(text)) return "30 plants per 100 square meters.";
  if (/passing accuracy rises from 64 percent to 78 percent/i.test(text)) return "About a 21.9 percent relative increase.";
  if (/72, 71, 73, 70, 72, 86/i.test(text)) return "Mean 74 seconds; the 86-second outlier raises the mean above the typical 70-73 second cluster.";
  if (/54\.2, 54\.5, 54\.3, 54\.4, and 54\.1/i.test(text)) return "Range 0.4 seconds; mean 54.3 seconds.";
  if (/420 to 350 minutes/i.test(text)) return "Training volume decreases about 16.7 percent; high-intensity distance decreases about 3.3 percent.";
  if (/18 of 30 matches.*14 of 20/i.test(text)) return "The win rate rises from 60 percent to 70 percent, an increase of 10 percentage points.";
  if (/96 beats per minute.*64 measures/i.test(text)) return "2 minutes 40 seconds.";
  if (/48 audio layers to 34/i.test(text)) return "About a 29.2 percent reduction.";
  if (/126 of 180 listeners.*99 rate/i.test(text)) return "70 percent chose Version B as clearer; 55 percent rated Version A more exciting.";
  if (/four-note motif lasts 1\.5 seconds/i.test(text)) return "18 seconds total, which is 10 percent of the three-minute piece.";
  if (/92 dB.*80 dB/i.test(text)) return "Approximately 6.3 percent of the original intensity remains.";
  if (/raises mission completion from 58 percent to 81 percent/i.test(text)) return "About a 39.7 percent relative increase.";
  if (/route takes 150 seconds.*adds 18 seconds/i.test(text)) return "Battery life increases 31 percent; route time increases 12 percent.";
  if (/2,400 requests per minute/i.test(text)) return "About 2,824 requests per minute.";
  if (/126 of 180 users.*144 of 180/i.test(text)) return "10 percentage points.";
  if (/24 meters using 18 watt-hours/i.test(text)) return "52.5 watt-hours.";
  if (/8\.4 meters.*1:20 scale/i.test(text)) return "42 centimeters.";
  if (/\$18,500 budget/i.test(text)) return "About 27.0 percent remains.";
  if (/168 of 240 visitors/i.test(text)) return "Approximately 64.1 percent to 75.9 percent; the survey estimates that roughly two-thirds to three-quarters of similar visitors prefer limited conservation.";
  if (/loses 12 percent.*brightness/i.test(text)) return "About 62.0 brightness units.";
  if (/frame measures 90 cm by 70 cm/i.test(text)) return "2,556 square centimeters.";
  if (/1880 and .*1895/i.test(text)) return "15 years.";
  if (/\$40,000 to \$58,000/i.test(text)) return "$18,000 increase; more evidence is needed because spending alone does not prove outcomes improved.";
  if (/120 letters.*35 percent/i.test(text)) return "42 letters.";
  if (/petitions in 1888/i.test(text)) return "The petitions came first; that timing could mean public demand shaped later speeches and budgets.";
  if (/4 shelves with 6 artifacts/i.test(text)) return "24 artifacts.";
  if (/4 rows with 6 books/i.test(text)) return "24 books.";
  if (/4 rows with 6 panels/i.test(text)) return "24 panels.";
  if (/1908 and .*1912/i.test(text)) return "4 years later.";
  if (/1908, 1912, 1916/i.test(text)) return "1920. The pattern adds 4 years.";
  if (/12 source cards/i.test(text)) return "27 source cards.";
  if (/bookmark costs \$8/i.test(text)) return "$56, with $4 change from $60.";
  if (/ticket costs \$8/i.test(text)) return "$56, with $4 change from $60.";
  if (/scores 4 points in each of 6 rounds/i.test(text)) return "24 points.";
  if (/240 km.*60 km each hour/i.test(text)) return "4 hours.";
  if (/Mission Data table/i.test(text)) return "Full strategy had the best accuracy at 83 percent.";
  if (/4 sets of 6/i.test(text)) return "24 cards.";
  if (/3, 6, 12, 24/i.test(text)) return "48 and 96.";
  if (/12 pages/i.test(text)) return "27 pages.";
  if (/30 minutes/i.test(text)) return "6 minutes per mission.";
  if (/42 of 60/i.test(text)) return "85 percent.";
  if (/budget of \$360/i.test(text)) return "9 panels.";
  if (/f\(x\) = 3x \+ 7/i.test(text)) return "x = 15.";
  if (/study time rising from 20 to 50/i.test(text)) return "5 percentage points per 10 minutes.";
  if (/viewing time rising from 20 to 50/i.test(text)) return "5 percentage points per 10 minutes.";
  if (/practice time rising from 20 to 50/i.test(text)) return "5 percentage points per 10 minutes.";
  return null;
}

function mathExplanationFor(text: string): string | null {
  if (/\$2,400 budget.*18 percent.*37 percent.*22 percent/i.test(text)) return "The listed shares total 77 percent, leaving 23 percent. Then 0.23 x 2,400 = $552.";
  if (/review of 160 users.*116.*132/i.test(text)) return "116/160 = 72.5 percent and 132/160 = 82.5 percent, so the increase is 10 percentage points.";
  if (/scores of 72, 84, and 78.*fifth criterion/i.test(text)) return "Treat the first four criteria as four copies of each score and the fifth as two copies: P1=(4x72+2x90)/6=78; P2=(4x84+2x65)/6=77.7; P3=(4x78+2x82)/6=79.3.";
  if (/takes 48 minutes.*17\.5 percent/i.test(text)) return "Keep 82.5 percent of the original time: 48 x 0.825 = 39.6 minutes.";
  if (/250 observations includes 42 exceptions/i.test(text)) return "42/250 x 100 = 16.8 percent. Reporting exceptions prevents the conclusion from appearing more universal than the evidence supports.";
  if (/18 muffins using 540 grams/i.test(text)) return "Each muffin uses 540/18 = 30 grams of flour. Then 50 x 30 = 1,500 grams.";
  if (/batch costs \$13\.68.*24 portions/i.test(text)) return "Food cost is 13.68/24 = $0.57. Add $0.11 packaging for $0.68 per portion.";
  if (/18\.4 kg before changes and 12\.1 kg/i.test(text)) return "Waste falls by 6.3 kg. Then 6.3/18.4 x 100 is about 34.2 percent.";
  if (/62 percent flour, 38 percent water/i.test(text)) return "Flour is 0.62 x 1,250 = 775 grams. Water is 0.38 x 1,250 = 475 grams.";
  if (/scores 7, 8, 8, 9, 6, 8, 9, and 7/i.test(text)) return "The scores total 62, so the mean is 62/8 = 7.75. Range is 9 - 6 = 3.";
  if (/counts at four sites are 24, 18, 11, and 7/i.test(text)) return "The decrease is 17. Divide 17 by the original 24 and multiply by 100 to get about 70.8 percent.";
  if (/42 of 70 nests.*57 of 75/i.test(text)) return "42/70 = 60 percent and 57/75 = 76 percent. The difference is 16 percentage points.";
  if (/6 sites monthly for 18 months/i.test(text)) return "There are 6 x 18 = 108 site visits, with 4 measurements each: 108 x 4 = 432.";
  if (/1,250 to 1,475.*1,298/i.test(text)) return "Increase: 225/1,250 x 100 = 18 percent. Decrease: 177/1,475 x 100 = 12 percent.";
  if (/36 invasive plants in 15 plots/i.test(text)) return "The sampled area is 15 x 8 = 120 square meters. Density is 36/120 x 100 = 30 plants per 100 square meters.";
  if (/passing accuracy rises from 64 percent to 78 percent/i.test(text)) return "The gain is 14 percentage points. Relative increase is 14 / 64 x 100, about 21.9 percent.";
  if (/72, 71, 73, 70, 72, 86/i.test(text)) return "The total is 444, so 444 / 6 = 74. Without 86, the mean is 71.6, showing how the outlier pulls the mean upward.";
  if (/54\.2, 54\.5, 54\.3, 54\.4, and 54\.1/i.test(text)) return "Range is 54.5 - 54.1 = 0.4. The total is 271.5, and 271.5 / 5 = 54.3.";
  if (/420 to 350 minutes/i.test(text)) return "Volume falls 70/420 x 100 = 16.7 percent. Distance falls 0.3/9.0 x 100 = 3.3 percent.";
  if (/18 of 30 matches.*14 of 20/i.test(text)) return "18/30 = 60 percent and 14/20 = 70 percent, so the difference is 10 percentage points.";
  if (/96 beats per minute.*64 measures/i.test(text)) return "There are 64 x 4 = 256 beats. At 96 beats per minute, 256/96 = 2.6667 minutes, or 2 minutes 40 seconds.";
  if (/48 audio layers to 34/i.test(text)) return "The reduction is 14 layers. Then 14/48 x 100 is about 29.2 percent.";
  if (/126 of 180 listeners.*99 rate/i.test(text)) return "126/180 = 70 percent and 99/180 = 55 percent. These descriptions are separate, so they need not total 100 percent.";
  if (/four-note motif lasts 1\.5 seconds/i.test(text)) return "1.5 x 12 = 18 seconds. Three minutes is 180 seconds, and 18/180 = 0.10.";
  if (/92 dB.*80 dB/i.test(text)) return "A 12 dB drop corresponds to an intensity ratio of 10^(-12/10), about 0.063, or 6.3 percent.";
  if (/raises mission completion from 58 percent to 81 percent/i.test(text)) return "The increase is 23 percentage points. Relative increase is 23 / 58 x 100, about 39.7 percent.";
  if (/route takes 150 seconds.*adds 18 seconds/i.test(text)) return "Battery gain is 12.4 / 40 x 100 = 31 percent. Route-time gain is 18 / 150 x 100 = 12 percent.";
  if (/2,400 requests per minute/i.test(text)) return "A 15 percent time reduction leaves 85 percent of the original processing time, so capacity is 2,400 / 0.85, about 2,824.";
  if (/126 of 180 users.*144 of 180/i.test(text)) return "Version A is 126/180 = 70 percent and version B is 144/180 = 80 percent, a difference of 10 percentage points.";
  if (/24 meters using 18 watt-hours/i.test(text)) return "The robot uses 18/24 = 0.75 watt-hours per meter. For 70 meters, 70 x 0.75 = 52.5 watt-hours.";
  if (/8\.4 meters.*1:20 scale/i.test(text)) return "Convert 8.4 meters to 840 centimeters, then divide by 20: 840 / 20 = 42 centimeters.";
  if (/\$18,500 budget/i.test(text)) return "The listed costs total $13,500, leaving $5,000. Then 5,000 / 18,500 x 100 is about 27.0 percent.";
  if (/168 of 240 visitors/i.test(text)) return "p = 168/240 = 0.70. The margin is 2 x sqrt(0.70 x 0.30 / 240), about 0.059, so the interval is 0.641 to 0.759.";
  if (/loses 12 percent.*brightness/i.test(text)) return "Retain 88 percent each decade: 80 x 0.88 x 0.88 = 61.952, which rounds to 62.0.";
  if (/frame measures 90 cm by 70 cm/i.test(text)) return "The outer area is 90 x 70 = 6,300 square centimeters. The opening is 72 x 52 = 3,744, so 6,300 - 3,744 = 2,556.";
  if (/1880 and .*1895/i.test(text)) return "Subtract the earlier year from the later year: 1895 - 1880 = 15.";
  if (/\$40,000 to \$58,000/i.test(text)) return "Subtract 40,000 from 58,000. A historian still checks whether the extra money changed attendance, access, or outcomes.";
  if (/120 letters.*35 percent/i.test(text)) return "35 percent of 120 is 0.35 x 120 = 42.";
  if (/petitions in 1888/i.test(text)) return "Chronology matters because an earlier petition could have influenced a later speech or budget decision.";
  if (/4 shelves with 6 artifacts/i.test(text)) return "There are 4 equal groups with 6 in each group, so 4 x 6 = 24.";
  if (/4 rows with 6 books/i.test(text)) return "There are 4 equal rows with 6 books in each row, so 4 x 6 = 24.";
  if (/4 rows with 6 panels/i.test(text)) return "There are 4 equal rows with 6 panels in each row, so 4 x 6 = 24.";
  if (/1908 and .*1912/i.test(text)) return "Subtract 1908 from 1912 to find 4 years.";
  if (/1908, 1912, 1916/i.test(text)) return "Each date is 4 years later, so 1916 + 4 = 1920.";
  if (/12 source cards/i.test(text)) return "Add the two days: 12 + 15 = 27.";
  if (/bookmark costs \$8/i.test(text)) return "Seven bookmarks cost 7 x 8 = 56 dollars, and 60 - 56 = 4 dollars left.";
  if (/ticket costs \$8/i.test(text)) return "Seven tickets cost 7 x 8 = 56 dollars, and 60 - 56 = 4 dollars left.";
  if (/scores 4 points in each of 6 rounds/i.test(text)) return "There are 6 equal rounds with 4 points each, so 4 x 6 = 24.";
  if (/240 km.*60 km each hour/i.test(text)) return "Divide the distance by the speed: 240 / 60 = 4 hours.";
  if (/Mission Data table/i.test(text)) return "Compare the Accuracy column: 68 percent, 77 percent, and 83 percent. The largest number is 83 percent.";
  if (/4 sets of 6/i.test(text)) return "There are 4 equal groups with 6 in each group, so 4 x 6 = 24.";
  if (/3, 6, 12, 24/i.test(text)) return "Each number doubles, so 24 doubles to 48 and 48 doubles to 96.";
  if (/12 pages/i.test(text)) return "Add the two reading amounts: 12 + 15 = 27.";
  if (/30 minutes/i.test(text)) return "Divide the total time by the number of missions: 30 / 5 = 6.";
  if (/42 of 60/i.test(text)) return "42 of 60 is 70 percent; adding 15 percentage points gives 85 percent.";
  if (/budget of \$360/i.test(text)) return "8 sensors cost 8 x 18 = 144; 360 - 144 = 216 left; 216 / 24 = 9 panels.";
  if (/f\(x\) = 3x \+ 7/i.test(text)) return "Set 3x + 7 = 52, so 3x = 45 and x = 15.";
  if (/study time rising from 20 to 50/i.test(text)) return "From 20 to 50 minutes is three 10-minute steps; accuracy rises 68 to 83, a 15-point gain, so 15 / 3 = 5 points per 10 minutes.";
  if (/viewing time rising from 20 to 50/i.test(text)) return "From 20 to 50 minutes is three 10-minute steps; accuracy rises 68 to 83, a 15-point gain, so 15 / 3 = 5 points per 10 minutes.";
  if (/practice time rising from 20 to 50/i.test(text)) return "From 20 to 50 minutes is three 10-minute steps; accuracy rises 68 to 83, a 15-point gain, so 15 / 3 = 5 points per 10 minutes.";
  return null;
}

function logicAnswerFor(text: string): string | null {
  if (/Most people preferred Option A/i.test(text)) return "Preference is only one criterion and may reflect familiarity or presentation. The decision also needs evidence about accuracy, purpose, cost, safety, or audience usefulness.";
  if (/Rank clarity, accuracy, cost, and audience usefulness/i.test(text)) return "Sample: accuracy first and audience usefulness second, because the product must be trustworthy and help the intended person; clarity and cost shape the best feasible version.";
  if (/every successful .* meets the audience goal/i.test(text)) return "This version does not satisfy the stated condition for success. That does not prove every feature is poor or identify why the audience goal was missed.";
  if (/keeping, revising, or rejecting a .* proposal/i.test(text)) return "Sample: keep when core criteria and the audience goal are met, revise when a correctable feature misses its target, and reject when the central purpose or a non-negotiable constraint fails.";
  if (/5, 8, 11/.test(text)) return "14 and 17. The rule adds 3 each time.";
  if (/2, 5, 11, 23, 47/.test(text)) return "95. Each step doubles the number and adds 1 (n x 2 + 1).";
  if (/better evidence/i.test(text)) return "A detail from the passage, because it can be proven by pointing to the text; a memory guess cannot be checked.";
  if (/tiny diagram/i.test(text)) return "A simple labeled sketch that lays out the known numbers or steps before solving.";
  if (/can help someone practice/i.test(text)) return "Open response: any clear sentence linking the interest to focus, repetition, or strategy.";
  if (/which plan would you recommend/i.test(text)) return "Open response. A strong answer weighs higher average scores against steadier scores and justifies the choice with the data.";
  if (/historian argues/i.test(text)) return "Open response. Stronger evidence would include records, dates, economic data, or comparisons that rule out other causes.";
  if (/two-sentence argument/i.test(text)) return "Open response: two sentences linking the interest to persistence, with one reason and one example.";
  if (/Most surveyed visitors prefer restoration/i.test(text)) return "The conclusion treats popularity as proof of ethical correctness. The curator also needs evidence about original material, long-term risk, artist intent, community history, and viable alternatives.";
  if (/Rank these criteria for an exhibition/i.test(text)) return "Sample: historical significance first and community relevance second, because the entrance should establish why the exhibition matters and whom it serves; immediate attention is useful but should not override purpose.";
  if (/every authentic restoration preserves original material/i.test(text)) return "The proposal does not meet the stated condition for authentic restoration. This does not prove it is unethical or ineffective; it only shows it fails that definition of authenticity.";
  if (/Construct a decision rule/i.test(text)) return "Sample: choose the least irreversible option that meets the stated purpose, protects original material, addresses documented damage, and can be justified with visual, historical, technical, and community evidence.";
  if (/Players who stayed longer learned more/i.test(text)) return "The claim confuses correlation with causation; motivated or skilled players may both stay longer and learn more. Randomly assign comparable players to different session lengths and measure later mastery.";
  if (/Rank accessibility, learning retention/i.test(text)) return "Sample: accessibility first and learning retention second, because users must be able to enter the experience and the benefit should persist; speed and polish support those goals but should not replace them.";
  if (/every reliable release passes the regression suite/i.test(text)) return "The release does not satisfy the stated condition for reliability. The failure does not prove the entire product is unusable; it identifies at least one unresolved regression or test problem.";
  if (/choosing whether to ship, revise, or remove a feature/i.test(text)) return "Sample: ship only if the feature meets its user goal, passes safety and regression checks, and shows no unacceptable harm; revise when evidence is mixed; remove it when costs consistently exceed benefits.";
  if (/team won after the new training plan/i.test(text)) return "A single before-and-after result does not rule out opponent strength, player availability, luck, or other changes. Compare repeated matches, training measures, and a suitable control or baseline.";
  if (/Rank peak performance, consistency/i.test(text)) return "Sample: tactical fit first and recovery second, because the athlete must serve the event's role and be physically ready; peak and consistency then distinguish candidates who meet those conditions.";
  if (/every overtrained athlete shows declining recovery/i.test(text)) return "Declining recovery is consistent with overtraining but does not prove it; illness, stress, poor sleep, or measurement error could produce the same sign.";
  if (/increasing, maintaining, or reducing training load/i.test(text)) return "Sample: increase only when recovery and technique remain stable, maintain when adaptation continues without warning signs, and reduce when performance and recovery decline together.";
  if (/Most listeners preferred the louder mix/i.test(text)) return "The claim confuses preference in one test with universal musical quality and may confound loudness with arrangement. Loudness-match the mixes and measure clarity, emotional impact, and preference separately.";
  if (/Rank clarity, emotional impact/i.test(text)) return "Sample: emotional impact first and clarity second, because the arrangement needs a meaningful expressive goal that listeners can perceive; performer comfort and energy remain constraints.";
  if (/every effective arrangement preserves the melody/i.test(text)) return "The arrangement fails the stated condition for effectiveness. That does not prove every listener will dislike it or that it lacks other artistic value.";
  if (/keeping, revising, or removing a musical layer/i.test(text)) return "Sample: keep a layer when it has a distinct musical role, revise it when it masks a more important element, and remove it when it adds density without improving rhythm, harmony, color, or form.";
  if (/Batch B had the highest flavor score/i.test(text)) return "The conclusion ignores texture, stability, cost, safety, and the full design brief. Use a weighted rule that requires every non-negotiable criterion and then compares the remaining scores.";
  if (/Rank safety, taste, texture, cost/i.test(text)) return "Sample: safety first because harm is unacceptable, then taste because the product must be willingly eaten; texture, cost, and sustainability shape the best option among safe, appealing prototypes.";
  if (/every safe batch meets the allergen protocol/i.test(text)) return "Batch D does not satisfy the stated condition for safety. This does not identify the exact hazard or prove that every other aspect of the batch is poor.";
  if (/keeping, revising, or rejecting a prototype/i.test(text)) return "Sample: keep when all non-negotiable criteria pass, revise when one adjustable quality misses its target, and reject when safety fails or several core requirements conflict.";
  if (/Insect diversity fell where turbidity was high/i.test(text)) return "The claim treats correlation as a complete causal explanation and ignores temperature, flow, habitat, and sampling. Repeated above-below and before-after comparisons would strengthen the case.";
  if (/Rank biodiversity, public access/i.test(text)) return "Sample: biodiversity first and community trust second, because the policy exists to protect ecological function and will work only if people understand and support it; access and cost remain constraints.";
  if (/every resilient wetland recovers/i.test(text)) return "The wetland does not meet the stated recovery condition, but one failure does not reveal whether the cause is low resilience, an extraordinary disturbance, or inadequate measurement time.";
  if (/maintaining, expanding, or ending an environmental intervention/i.test(text)) return "Sample: maintain when indicators improve toward the target, expand when harm remains above a threshold, and end or redesign when repeated monitoring shows no benefit or unacceptable social cost.";
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
  if (/\$2,400 budget.*18 percent.*37 percent.*22 percent/i.test(text)) return ["$432", "$504", "$552", "$1,848"];
  if (/review of 160 users.*116.*132/i.test(text)) return ["8 points", "10 points", "16 points", "20 points"];
  if (/scores of 72, 84, and 78.*fifth criterion/i.test(text)) return ["Prototype 1", "Prototype 2", "Prototype 3", "All are equal"];
  if (/takes 48 minutes.*17\.5 percent/i.test(text)) return ["30.5", "39.6", "40.5", "45.2"];
  if (/250 observations includes 42 exceptions/i.test(text)) return ["8.4%", "16.8%", "20.8%", "42%"];
  if (/18 muffins using 540 grams/i.test(text)) return ["900 g", "1,080 g", "1,500 g", "2,700 g"];
  if (/batch costs \$13\.68.*24 portions/i.test(text)) return ["$0.57", "$0.68", "$0.79", "$1.14"];
  if (/18\.4 kg before changes and 12\.1 kg/i.test(text)) return ["25.7%", "34.2%", "52.3%", "65.8%"];
  if (/62 percent flour, 38 percent water/i.test(text)) return ["620 g and 380 g", "775 g and 475 g", "800 g and 450 g", "850 g and 400 g"];
  if (/scores 7, 8, 8, 9, 6, 8, 9, and 7/i.test(text)) return ["7.5 and 2", "7.75 and 3", "8 and 3", "8.25 and 2"];
  if (/counts at four sites are 24, 18, 11, and 7/i.test(text)) return ["29.2%", "41.7%", "70.8%", "242.9%"];
  if (/42 of 70 nests.*57 of 75/i.test(text)) return ["10 points", "14 points", "16 points", "19 points"];
  if (/6 sites monthly for 18 months/i.test(text)) return ["108", "216", "432", "648"];
  if (/1,250 to 1,475.*1,298/i.test(text)) return ["18% then 12%", "12% then 18%", "22.5% then 17.7%", "18% then 15%"];
  if (/36 invasive plants in 15 plots/i.test(text)) return ["12", "24", "30", "45"];
  if (/passing accuracy rises from 64 percent to 78 percent/i.test(text)) return ["14.0%", "17.9%", "21.9%", "78.0%"];
  if (/72, 71, 73, 70, 72, 86/i.test(text)) return ["72", "73", "74", "76"];
  if (/54\.2, 54\.5, 54\.3, 54\.4, and 54\.1/i.test(text)) return ["0.4 and 54.3", "0.5 and 54.2", "0.4 and 54.5", "1.4 and 54.3"];
  if (/420 to 350 minutes/i.test(text)) return ["16.7% and 3.3%", "3.3% and 16.7%", "20% and 5%", "70% and 0.3%"];
  if (/18 of 30 matches.*14 of 20/i.test(text)) return ["5 points", "10 points", "14 points", "20 points"];
  if (/96 beats per minute.*64 measures/i.test(text)) return ["2:24", "2:40", "3:12", "4:16"];
  if (/48 audio layers to 34/i.test(text)) return ["14.0%", "22.6%", "29.2%", "41.2%"];
  if (/126 of 180 listeners.*99 rate/i.test(text)) return ["70% and 55%", "55% and 70%", "63% and 50%", "70% and 30%"];
  if (/four-note motif lasts 1\.5 seconds/i.test(text)) return ["12 sec and 6.7%", "18 sec and 10%", "18 sec and 15%", "24 sec and 10%"];
  if (/92 dB.*80 dB/i.test(text)) return ["1.2%", "6.3%", "12%", "63%"];
  if (/raises mission completion from 58 percent to 81 percent/i.test(text)) return ["23.0%", "28.4%", "39.7%", "58.0%"];
  if (/route takes 150 seconds.*adds 18 seconds/i.test(text)) return ["31% and 12%", "12% and 31%", "24% and 18%", "42% and 8%"];
  if (/2,400 requests per minute/i.test(text)) return ["2,040", "2,760", "2,824", "3,600"];
  if (/126 of 180 users.*144 of 180/i.test(text)) return ["8 points", "10 points", "18 points", "20 points"];
  if (/24 meters using 18 watt-hours/i.test(text)) return ["42.0 Wh", "48.0 Wh", "52.5 Wh", "70.0 Wh"];
  if (/8\.4 meters.*1:20 scale/i.test(text)) return ["4.2 cm", "42 cm", "168 cm", "420 cm"];
  if (/\$18,500 budget/i.test(text)) return ["18.5 percent", "27.0 percent", "32.4 percent", "73.0 percent"];
  if (/168 of 240 visitors/i.test(text)) return ["64.1% to 75.9%", "68.0% to 72.0%", "70.0% to 82.0%", "58.2% to 81.8%"];
  if (/loses 12 percent.*brightness/i.test(text)) return ["61.9", "64.0", "68.0", "70.4"];
  if (/frame measures 90 cm by 70 cm/i.test(text)) return ["1,278 cm²", "2,556 cm²", "3,744 cm²", "6,300 cm²"];
  if (/1880 and .*1895/i.test(text)) return ["5 years", "15 years", "25 years", "95 years"];
  if (/\$40,000 to \$58,000/i.test(text)) return ["$8,000", "$18,000", "$22,000", "$98,000"];
  if (/120 letters.*35 percent/i.test(text)) return ["24", "35", "42", "85"];
  if (/petitions in 1888/i.test(text)) return ["The petition", "The speech", "The budget growth", "They happened together"];
  if (/4 shelves with 6 artifacts/i.test(text)) return ["10", "20", "24", "30"];
  if (/4 rows with 6 books/i.test(text)) return ["10", "20", "24", "30"];
  if (/4 rows with 6 panels/i.test(text)) return ["10", "20", "24", "30"];
  if (/1908 and .*1912/i.test(text)) return ["2", "4", "8", "12"];
  if (/1908, 1912, 1916/i.test(text)) return ["1918", "1920", "1922", "1924"];
  if (/12 source cards/i.test(text)) return ["17", "25", "27", "30"];
  if (/bookmark costs \$8/i.test(text)) return ["$48, $12 change", "$56, $4 change", "$60, $0 change", "$64, $4 change"];
  if (/ticket costs \$8/i.test(text)) return ["$48, $12 change", "$56, $4 change", "$60, $0 change", "$64, $4 change"];
  if (/scores 4 points in each of 6 rounds/i.test(text)) return ["10", "20", "24", "46"];
  if (/240 km.*60 km each hour/i.test(text)) return ["3 hours", "4 hours", "5 hours", "6 hours"];
  if (/Mission Data table/i.test(text)) return ["Quick review", "Evidence notes", "Full strategy", "They were all the same"];
  if (/4 sets of 6/i.test(text)) return ["18", "24", "10", "36"];
  if (/3, 6, 12, 24/i.test(text)) return ["36 and 48", "48 and 96", "30 and 36", "48 and 72"];
  if (/12 pages/i.test(text)) return ["25", "27", "3", "17"];
  if (/30 minutes/i.test(text)) return ["5", "6", "25", "35"];
  if (/42 of 60/i.test(text)) return ["80 percent", "85 percent", "70 percent", "57 percent"];
  if (/budget of \$360/i.test(text)) return ["7 panels", "9 panels", "12 panels", "15 panels"];
  if (/f\(x\) = 3x \+ 7/i.test(text)) return ["x = 12", "x = 15", "x = 18", "x = 20"];
  if (/study time rising from 20 to 50/i.test(text)) return ["3 points", "5 points", "7.5 points", "15 points"];
  if (/viewing time rising from 20 to 50/i.test(text)) return ["3 points", "5 points", "7.5 points", "15 points"];
  if (/practice time rising from 20 to 50/i.test(text)) return ["3 points", "5 points", "7.5 points", "15 points"];
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
  if (/project was good because it worked well/i.test(text)) return "Sample: \"The revised project met the audience-comprehension target while staying within the stated constraints.\"";
  if (/was easy to understand.*left out an important limitation/i.test(text)) return "Sample: \"Although the proposal was easy to understand, it left out an important limitation.\"";
  if (/first result proves this is the best way/i.test(text)) return "Sample: \"The first result supports this approach under the tested conditions, but broader evidence is needed.\"";
  if (/team compared costs, measuring outcomes/i.test(text)) return "The team compared costs, measured outcomes, and interviewed users.";
  if (/criterion, one piece of evidence/i.test(text)) return "Sample: \"The revised proposal best meets the clarity criterion because comprehension rose by ten percentage points, although the sample represents only one audience.\"";
  if (/counterargument to the team's preferred/i.test(text)) return "Sample: \"The preferred option may be easier to use but oversimplifies the problem. However, its clarity could justify using it as an introduction before a more complete version.\"";
  if (/Batch C was better because it worked better/i.test(text)) return "Sample: \"Batch C met the cost target while maintaining acceptable flavor and texture after four hours.\"";
  if (/Batch B had the best flavor/i.test(text)) return "Sample: \"Although Batch B had the best flavor, its center was gummy.\"";
  if (/tasting proves fruit puree/i.test(text)) return "Sample: \"The tasting suggests fruit puree improves flavor in this formula, but texture and recipe-specific conditions limit the conclusion.\"";
  if (/team measured cost, rating texture/i.test(text)) return "The team measured cost, rated texture, and tested whether the muffins stayed moist.";
  if (/recipe-development claim/i.test(text)) return "Sample: \"Batch C best satisfies the design brief because it meets cost and texture targets, although its flavor score is slightly lower than Batch B's.\"";
  if (/cheapest acceptable recipe/i.test(text)) return "Sample: \"The cheapest recipe may improve access and profitability but could reduce sensory quality or stability. Cost should decide only among options that meet safety and quality thresholds.\"";
  if (/stream is unhealthy because the water is bad/i.test(text)) return "Sample: \"Aquatic-insect diversity is lowest at sites with high turbidity and low dissolved oxygen.\"";
  if (/Turbidity rose after rainfall/i.test(text)) return "Sample: \"Turbidity rose after rainfall; however, dissolved oxygen was already low in warm pools.\"";
  if (/Construction proves it caused every insect decline/i.test(text)) return "Sample: \"Construction-related sediment likely contributes to some declines, although temperature, flow, and habitat also remain plausible causes.\"";
  if (/team measured temperature, recording turbidity/i.test(text)) return "The team measured temperature, recorded turbidity, and identified insects.";
  if (/ecological claim naming/i.test(text)) return "Sample: \"Insect diversity declines below the construction site after rainfall, supporting a sediment effect while leaving temperature as a possible contributor.\"";
  if (/closing the entire habitat/i.test(text)) return "Sample: \"A full closure would provide the strongest immediate protection but impose high social costs. Targeted closures should be tested first with a published threshold for expansion.\"";
  if (/athlete played badly because they were tired/i.test(text)) return "Sample: \"The athlete's passing accuracy declined after the seventieth minute as high-intensity distance fell.\"";
  if (/Training volume decreased/i.test(text)) return "Sample: \"Although training volume decreased, late-session accuracy improved.\"";
  if (/recovery plan proves every athlete/i.test(text)) return "Sample: \"The recovery plan may help similar athletes, but the small sample and short trial limit the conclusion.\"";
  if (/staff measured sprint speed/i.test(text)) return "The staff measured sprint speed, recorded sleep, and tested passing accuracy.";
  if (/performance claim that names/i.test(text)) return "Sample: \"The adjusted group maintained higher late-session accuracy, although the two-week sample is too small for a universal conclusion.\"";
  if (/selecting an athlete using average performance alone/i.test(text)) return "Sample: \"Average time summarizes performance but hides consistency and race-specific strengths. Still, it provides a useful first comparison when combined with variance and tactical fit.\"";
  if (/arrangement sounded better because/i.test(text)) return "Sample: \"The spacious arrangement improved vocal clarity by reducing competition in the middle register.\"";
  if (/Version B was clearer/i.test(text)) return "Sample: \"Although Version B was clearer, some listeners preferred the energy of Version A.\"";
  if (/listener survey proves the sparse arrangement/i.test(text)) return "Sample: \"The survey suggests the sparse arrangement improves clarity in this auditorium, but it does not establish universal musical quality.\"";
  if (/producer adjusted the tempo/i.test(text)) return "The producer adjusted the tempo, changed the dynamics, and reduced the bass.";
  if (/interpretation connecting one musical element/i.test(text)) return "Sample: \"The shift from piano to distorted guitar changes the motif from reflective to urgent.\"";
  if (/making every instrument equally prominent/i.test(text)) return "Sample: \"Equal prominence can hide the melody and weaken musical hierarchy. However, shared prominence may be appropriate when the piece intentionally presents several independent voices.\"";
  if (/game was bad because the controls were bad/i.test(text)) return "Sample: \"The game felt unresponsive because input latency delayed each movement.\"";
  if (/tutorial improved completion/i.test(text)) return "Sample: \"Although the tutorial improved completion, it increased the mission time.\"";
  if (/new interface proves every player/i.test(text)) return "Sample: \"The new interface may help similar players learn faster, but broader testing is needed.\"";
  if (/team measured completion/i.test(text)) return "The team measured completion, recorded errors, and tested whether players understood the system.";
  if (/user need, a feature/i.test(text)) return "Sample: \"To help new players understand the energy system, fading prompts will explain early decisions and disappear after demonstrated mastery.\"";
  if (/optimizing only for speed or completion/i.test(text)) return "Sample: \"Optimizing only for completion may produce dependence on prompts rather than durable learning. However, completion data remains useful for identifying where users become blocked.\"";
  if (/powerful because it has powerful colors/i.test(text)) return "Sample: \"The artwork creates tension through its sharp contrast between saturated red and muted gray.\"";
  if (/mural is damaged/i.test(text)) return "Sample: \"Although the mural is damaged, its composition remains legible.\"";
  if (/red line definitely proves/i.test(text)) return "Sample: \"The red line may suggest anger or conflict, although the interpretation requires contextual evidence.\"";
  if (/parallel structure/i.test(text)) return "The curator wants to stabilize the paint, document the damage, and consult residents.";
  if (/precise thesis/i.test(text)) return "Sample: \"The mural's red diagonal disrupts the stable vertical composition, turning the river into a symbol of social division.\"";
  if (/counterargument to a restoration proposal/i.test(text)) return "Sample: \"Full restoration risks replacing evidence of the mural's public history with a newly manufactured surface. However, restoration could recover details that current viewers can no longer interpret.\"";
  if (/trained hard/i.test(text)) return "Two sentences or a semicolon: \"The team trained hard. They were ready.\"";
  if (/plan was simple/i.test(text)) return "Sample: \"The simple plan worked.\"";
  if (/Due to the fact that/i.test(text)) return "Sample: \"Because they practiced, they improved.\"";
  if (/strong adjective and adverb/i.test(text)) return "Sample: \"The focused learner quickly solved the tricky problem.\"";
  if (/comma correctly/i.test(text)) return "Sample: \"After practice, the team reviewed the game.\"";
  if (/Their . There . They're|Their \/ There \/ They're/i.test(text)) return "They're (they are): \"They're going to practice today.\"";
  return "Sample: a complete, correctly punctuated sentence with clear word choice.";
}

function scienceAnswerFor(text: string): string {
  if (/controlled recipe test/i.test(text)) return "Independent variable: egg substitute. Outcomes could include firmness and moisture after four hours. Controls include flour mass, mixing method, portion mass, oven temperature, and baking time.";
  if (/tasters be blinded/i.test(text)) return "Blinding reduces expectation bias so names, ingredients, or preferred theories do not shape sensory ratings.";
  if (/moist immediately after baking/i.test(text)) return "Steam may temporarily soften the crumb, and moisture may migrate or evaporate during storage. One warm sample does not establish shelf stability.";
  if (/oven temperature variation/i.test(text)) return "A hotter or cooler oven can change rise, browning, moisture, and structure, making a recipe difference look larger or smaller than it is.";
  if (/objective texture measurement/i.test(text)) return "Sample: compression force can measure firmness, but it cannot fully capture flavor, aroma, mouthfeel, or whether a texture is pleasant.";
  if (/food safety from food quality/i.test(text)) return "Safety concerns whether food can cause harm, such as allergen exposure or unsafe storage; quality concerns preference and performance, such as flavor or dryness.";
  if (/sampling plan that tests one possible cause/i.test(text)) return "Sample: compare matched sites above and below construction after similar rainfall. Measure turbidity and insect diversity while controlling habitat type, sampling effort, season, and time of day.";
  if (/include sites above and below/i.test(text)) return "Upstream sites provide a reference for natural conditions, while downstream sites reveal whether the suspected disturbance aligns with a change.";
  if (/Species diversity is lower at one site/i.test(text)) return "The habitat may differ naturally, or sampling effort and season may differ. Temperature, flow, predators, disease, or random variation are other explanations.";
  if (/rainfall could confound/i.test(text)) return "Rainfall can raise turbidity differently across sites and times, so location effects may actually reflect unequal recent weather or runoff.";
  if (/indicator species or environmental measure/i.test(text)) return "Sample: dissolved oxygen is directly relevant to aquatic organisms, but one reading varies with time and temperature and cannot describe the entire ecosystem.";
  if (/relationship in the passage/i.test(text)) return "High turbidity and low diversity are correlated. Causation requires showing that sediment changes precede and produce biological change while alternatives are controlled.";
  if (/controlled comparison of two recovery routines/i.test(text)) return "Independent variable: recovery routine. Outcomes could include late-session accuracy and a standardized recovery score. Controls include training load, testing time, nutrition guidance, and comparable athletes.";
  if (/avoid changing training volume, sleep routine/i.test(text)) return "Changing several factors together makes it impossible to identify which factor caused the performance difference.";
  if (/performs better after a lighter week/i.test(text)) return "The opponent may have been weaker, or injured players may have returned. Tactical changes, motivation, and random variation are other alternatives.";
  if (/opponent strength could confound/i.test(text)) return "If later opponents are weaker, improved results may be attributed to the tactic even when opponent difficulty caused the difference.";
  if (/measure of fatigue that complements/i.test(text)) return "Sample: repeated sprint decline provides an objective performance measure, but it can also be affected by motivation, technique, and testing conditions.";
  if (/training load and injury data/i.test(text)) return "A correlation shows injuries rise with load; causation requires controlling prior injury, recovery, schedule, and other factors while testing whether load changes alter risk.";
  if (/controlled listening test/i.test(text)) return "Independent variable: arrangement version. Measures could include clarity ratings and recall of the main motif. Controls include playback level, room, equipment, excerpt, and listener instructions.";
  if (/producer change only one major element/i.test(text)) return "Changing one element makes differences in listener response easier to attribute to that element rather than to several simultaneous edits.";
  if (/prefer one mix in a classroom/i.test(text)) return "The auditorium has different reverberation and audience size, and the playback system or listening position may alter balance.";
  if (/playback volume could confound/i.test(text)) return "Listeners often prefer a louder version even when the arrangement is unchanged, so mixes should be loudness-matched.";
  if (/objective acoustic measurement/i.test(text)) return "Sample: reverberation time measures how long sound persists, but it cannot determine whether an arrangement is expressive or meaningful.";
  if (/rehearsal time and performance ratings/i.test(text)) return "More rehearsal may correlate with higher ratings because stronger ensembles rehearse differently; causation requires comparable groups and controlled rehearsal changes.";
  if (/controlled usability test/i.test(text)) return "Independent variable: the interface version. Dependent measures could include completion rate and error type. Controls include the same task, device class, instructions, time limit, and comparable participants.";
  if (/robotics team change only one/i.test(text)) return "Changing one variable makes it possible to connect a performance difference to that variable instead of guessing among several simultaneous changes.";
  if (/feature improves scores in one session/i.test(text)) return "Participants may have had more prior experience, or the second task may have been easier. Practice, device speed, and random variation are other possibilities.";
  if (/device performance could confound/i.test(text)) return "A faster device can reduce latency independently of the interface, so apparent interface gains may actually come from hardware differences.";
  if (/measure of long-term mastery/i.test(text)) return "Sample: test whether users can complete a new transfer task several days later without prompts.";
  if (/correlation from causation/i.test(text)) return "Correlation means two outcomes vary together; causation requires evidence that changing one factor produced the other while alternatives were controlled.";
  if (/direct light and filtered light/i.test(text)) return "Independent variable: light condition. Dependent variable: measured color or brightness change. Controls include identical pigment samples, exposure time, temperature, humidity, and measurement method.";
  if (/tiny hidden area/i.test(text)) return "A test patch reveals discoloration, pigment loss, residue, or chemical reaction before the treatment risks the visible artwork.";
  if (/cleaned test patch appears brighter/i.test(text)) return "Brightness may come from temporary moisture or surface change, and one day does not reveal delayed pigment damage or long-term instability.";
  if (/humidity could act as a confounding variable/i.test(text)) return "Humidity may change fading, swelling, or chemical reactions at the same time as light exposure, making it unclear which variable caused the damage.";
  if (/non-destructive measurement/i.test(text)) return "Sample: calibrated digital colorimetry could record the same pigment area's color values over time without removing material.";
  if (/conservation from restoration/i.test(text)) return "Conservation stabilizes existing material and limits further damage; restoration attempts to recover an earlier appearance and may introduce replacement material.";
  if (/observe first/i.test(text)) return "Sample: observe what changes and what stays the same, because evidence beats guessing.";
  if (/NOT proof the change caused it/i.test(text)) return "Sample: the test may have been easier, or measured differently. Those are other possible causes.";
  if (/fair test/i.test(text)) return "Sample: change only one thing and keep everything else the same.";
  if (/guess and a hypothesis/i.test(text)) return "A hypothesis is a testable, reasoned prediction; a guess has no reasoning behind it.";
  if (/results go up each trial/i.test(text)) return "Repeat the test, change only one variable, and rule out other causes before deciding.";
  if (/cause-and-effect/i.test(text)) return "Sample: more focused practice (cause) leads to higher accuracy (effect).";
  return "Sample: name the evidence, the one thing you changed, and what you kept the same.";
}

function socialAnswerFor(text: string): string {
  if (/original transit-station setting/i.test(text)) return "The station made the mural public, mobile, and part of daily community life; a museum changes the viewing pace, audience, and social function.";
  if (/perspectives should be represented/i.test(text)) return "Include the artist or estate, conservators, historians, longtime residents, current community members, and museum audiences because each holds different evidence and stakes.";
  if (/public ownership gives a community/i.test(text)) return "Sample: public ownership gives the community meaningful authority because the work forms part of shared space and memory, though technical conservation decisions still require specialist evidence.";
  if (/patronage influence/i.test(text)) return "Patrons shape which artists receive resources, which subjects become visible, and which works institutions can preserve, so funding can affect the historical record.";
  if (/clarify the artwork's historical context/i.test(text)) return "Sample: an interview with the artist could clarify intent, but memory and hindsight may reshape the account, so it should be checked against contemporary records.";
  if (/change life in a town/i.test(text)) return "Sample: it could create jobs, learning, or fun, which helps families and students.";
  if (/which mattered more/i.test(text)) return "Compare records and outcomes before and after each, then weigh the evidence.";
  if (/remember the same .* event differently/i.test(text)) return "People have different viewpoints, information, and feelings about the same event.";
  if (/rule or fair choice/i.test(text)) return "Sample: take fair turns, because it keeps the group welcoming and orderly.";
  return "Sample: give a reason and one piece of evidence for who is affected and why.";
}

function criticalThinkingAnswerFor(text: string): string {
  if (/product recommendation citing/i.test(text)) return "Sample: Select Batch C because it meets the cost target and maintains texture after four hours while retaining strong flavor ratings. The trade-off is a slightly lower flavor score than Batch B.";
  if (/one sensory score with satisfying/i.test(text)) return "One score captures a narrow preference; a design brief requires safety and minimum performance across several criteria. The best product is the strongest feasible whole, not the highest isolated number.";
  if (/precise measurement can support/i.test(text)) return "Measurement makes cause and proportion visible, allowing the cook to repeat a successful idea, diagnose failure, and intentionally vary the recipe rather than guessing.";
  if (/menu or product note/i.test(text)) return "Sample: \"Seed-and-fruit breakfast muffin developed for an allergen-aware school menu. The formula balances tenderness, cost, and four-hour freshness. It contains seeds and should be checked against individual dietary requirements.\"";
  if (/intervention recommendation citing/i.test(text)) return "Sample: Install erosion controls and restore streamside shade because turbidity spikes below construction after rainfall and warm exposed pools show low oxygen. Seasonal monitoring is still needed to separate the contributions.";
  if (/acting quickly with waiting/i.test(text)) return "Waiting can improve certainty but allow reversible harm to become permanent. A proportionate action with monitoring is appropriate when potential harm is serious and the intervention can be revised.";
  if (/biodiversity can matter beyond/i.test(text)) return "Biodiversity can support food-web functions, recovery after disturbance, genetic options, and multiple ecological roles; equal species counts can still hide major functional differences.";
  if (/causal assumption in the passage/i.test(text)) return "Sample: Challenge the assumption that sediment is the main cause by comparing matched shaded and exposed sites with similar turbidity while measuring oxygen and insect diversity.";
  if (/concise public notice/i.test(text)) return "Sample: \"Targeted seasonal access limits will protect nesting zones where disturbance is highest while keeping marked paths open. Nesting success and compliance will be reviewed weekly; restrictions will expand only if success falls below the published threshold.\"";
  if (/coaching recommendation/i.test(text)) return "Sample: Keep one high-intensity session but replace unnecessary volume with tactical work and recovery. The adjusted group maintained accuracy under fatigue and reported better recovery, although the two-week sample remains uncertain.";
  if (/peak performance with maximizing reliable/i.test(text)) return "Peak performance may win when an exceptional result is necessary; reliability reduces the risk of a damaging result. The correct priority depends on event demands and acceptable risk.";
  if (/harder training does not automatically/i.test(text)) return "Adaptation occurs through stress followed by recovery. Excess load can reduce technique, decision quality, health, and the body's ability to adapt.";
  if (/athlete briefing/i.test(text)) return "Sample: \"This week preserves one hard session and reduces low-value volume so you can maintain late-match quality. Success means stable passing under fatigue and improved recovery scores. Complete the recovery target and report unusual soreness early.\"";
  if (/arrangement recommendation/i.test(text)) return "Sample: Use the spacious arrangement in the auditorium because low frequencies linger and listeners rated its vocal line clearer. The trade-off is less continuous intensity, so save added layers for the final section.";
  if (/technical accuracy with expressive interpretation/i.test(text)) return "Accuracy supplies the intended notes and rhythms; interpretation organizes them into direction, hierarchy, tension, and release. Strong performance requires both.";
  if (/same motif can communicate differently/i.test(text)) return "Timbre and dynamics change associations and intensity: a quiet piano motif may feel reflective, while the same notes on distorted guitar can feel urgent.";
  if (/production assumption/i.test(text)) return "Sample: Test the assumption that denser layers create more excitement by loudness-matching sparse and dense versions and measuring excitement, clarity, and motif recall.";
  if (/concise program note/i.test(text)) return "Sample: \"A four-note motif travels between contrasting instruments while syncopated accompaniment repeatedly shifts its balance. Changes in timbre and dynamics reshape the motif without changing its notes, allowing the ensemble to explore how repetition can produce both familiarity and surprise.\"";
  if (/product recommendation/i.test(text)) return "Sample: Adopt progressive support because completion rose from 58 to 81 percent and the design can fade prompts after success. The trade-off is a longer opening mission, which should be monitored against later independent performance.";
  if (/immediate completion with optimizing for long-term mastery/i.test(text)) return "Immediate completion measures whether users can finish now; long-term mastery measures whether they understand and can transfer the skill later. A strong design uses early support without creating permanent dependence.";
  if (/more automation does not always/i.test(text)) return "Automation can reduce effort but also hide decisions, weaken user control, create unsafe surprises, or optimize the wrong goal. Better automation is understandable, interruptible, and aligned with human needs.";
  if (/Challenge one design assumption/i.test(text)) return "Sample: The team assumes a longer tutorial harms engagement. Test that assumption by comparing return rate and later independent performance, not only first-session duration.";
  if (/concise release note/i.test(text)) return "Sample: \"Added fading tutorial prompts to clarify the energy system. We expect higher early completion without reducing independent play. The opening may take longer; we will monitor completion, return rate, and prompt-free transfer tasks.\"";
  if (/curatorial recommendation/i.test(text)) return "Sample: The museum should use limited conservation because stabilizing the damaged panels protects original material, while a documented test area can recover information without committing the entire mural to repainting. The trade-off is that some faded passages will remain difficult to read.";
  if (/Compare conservation and restoration/i.test(text)) return "Sample: Conservation better respects authenticity if authenticity means preserving original material and the mural's accumulated history. Restoration may recover the original appearance, but it risks replacing evidence of age with new work.";
  if (/moves from a public station to a museum/i.test(text)) return "The move changes the audience, pace, and function: commuters encountered the mural as part of daily public life, while museum visitors approach it as a protected object with labels and institutional authority.";
  if (/Challenge one interpretation/i.test(text)) return "Sample: Instead of symbolizing industrial danger, the red diagonal may represent connection because it links the figures to the river. The interpretation is plausible if the line visually joins rather than separates the main forms.";
  if (/short exhibition label/i.test(text)) return "Sample: \"Created for a transit station in 1978, this mural connects workers, homes, and the river through repeated vertical forms and a striking red diagonal. Fading and water damage now complicate its display. Does the worn surface obscure the artist's meaning, or has age become part of the work's public history?\"";
  return "Sample: make a specific claim, cite relevant evidence, explain the connection, and acknowledge a reasonable limitation or alternative.";
}

type OverflowQuestion = { text: string; answer: string; explanation: string; choices?: string[] };

// Produces the (k+1)-th question BEYOND a subject's bank, fully specified with a
// computed answer. Numeric templates derive their numbers from the worksheet seed and k,
// so any requested section size (the plan editor allows up to 12) yields unique
// questions instead of verbatim repeats of bank items.
function overflowQuestionFor(
  subject: string,
  k: number,
  theme: string,
  ctx: { high: boolean; middle: boolean; run: WorksheetRun }
): OverflowQuestion {
  const rng = seededRng(`${ctx.run.seed}|overflow|${subject}|${k}`);
  const int = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
  // Each template keys at least one displayed number directly off k (injective across
  // the k-values that revisit the same template), so two overflow questions can never
  // render identical text even when the seeded draws coincide.

  if (subject === "Math Reasoning") {
    if (ctx.high) {
      const t = k % 3;
      if (t === 0) {
        const n = [40, 60, 80, 120][k % 4];
        const pct = [25, 35, 45, 65][int(0, 3)];
        const ans = (n * pct) / 100;
        return {
          text: `A data set about ${theme} has ${n} entries. If ${pct} percent of them meet the quality standard, how many entries is that?`,
          answer: `${ans} entries.`,
          explanation: `${pct} percent of ${n} is ${pct / 100} x ${n} = ${ans}.`,
          choices: shuffleUnique([ans, ans + n / 10, Math.max(1, ans - n / 10), n - ans], rng).map((v) => String(v))
        };
      }
      if (t === 1) {
        const a = int(2, 5);
        const b = 3 + (k % 4);
        const x = int(6, 14);
        const y = a * x + b;
        return {
          text: `The function f(x) = ${a}x + ${b} models points earned after x completed ${theme} tasks. If f(x) = ${y}, what is x?`,
          answer: `x = ${x}.`,
          explanation: `Set ${a}x + ${b} = ${y}, so ${a}x = ${y - b} and x = ${x}.`,
          choices: shuffleUnique([x, x + 2, x - 2, x + a], rng).map((v) => `x = ${v}`)
        };
      }
      const lo = (2 + (k % 4)) * 10;
      const steps = int(2, 4);
      const hi = lo + steps * 10;
      const gain = steps * int(3, 6);
      return {
        text: `A practice log for ${theme} shows time rising from ${lo} to ${hi} minutes while accuracy rises by ${gain} percentage points. What is the average accuracy gain per 10 minutes?`,
        answer: `${gain / steps} percentage points per 10 minutes.`,
        explanation: `From ${lo} to ${hi} minutes is ${steps} ten-minute steps; ${gain} / ${steps} = ${gain / steps} points per step.`,
        choices: shuffleUnique([gain / steps, gain, steps, gain / steps + 2], rng).map((v) => `${v} points`)
      };
    }

    const t = k % 4;
    if (t === 0) {
      const a = int(3, 9);
      const b = 4 + (k % 5);
      return {
        text: `A team working on ${theme} earns ${a} points in each of ${b} challenges. How many points in all? Show your setup.`,
        answer: `${a * b} points.`,
        explanation: `There are ${b} equal groups of ${a}, so ${a} x ${b} = ${a * b}.`,
        choices: shuffleUnique([a * b, a * b - a, a * b + b, a + b], rng).map((v) => String(v))
      };
    }
    if (t === 1) {
      const p = int(4, 9);
      const q = 3 + (k % 5);
      const cost = p * q;
      const bill = (Math.floor(cost / 10) + 1) * 10;
      return {
        text: `A pass for a ${theme} event costs $${p}. How much do ${q} passes cost, and what is the change from $${bill}?`,
        answer: `$${cost}, with $${bill - cost} change.`,
        explanation: `${q} x ${p} = ${cost} dollars, and ${bill} - ${cost} = ${bill - cost} dollars left.`,
        choices: shuffleUnique([cost, cost + p, cost - p, cost + q], rng).map((v) => `$${v}`)
      };
    }
    if (t === 2) {
      const s = [30, 40, 50, 60, 80][k % 5];
      const h = int(3, 6);
      return {
        text: `A journey connected to ${theme} covers ${s * h} km at ${s} km each hour. How many hours does it take? Show your work.`,
        answer: `${h} hours.`,
        explanation: `Divide distance by speed: ${s * h} / ${s} = ${h}.`,
        choices: shuffleUnique([h, h + 1, h - 1, h + 2], rng).map((v) => `${v} hours`)
      };
    }
    const m = 4 + (k % 5);
    const per = int(5, 9);
    return {
      text: `A session about ${theme} lasts ${m * per} minutes, split equally among ${m} activities. How many minutes does each activity get?`,
      answer: `${per} minutes.`,
      explanation: `Divide the total time by the activities: ${m * per} / ${m} = ${per}.`,
      choices: shuffleUnique([per, per + 2, per - 1, per + m], rng).map((v) => `${v} minutes`)
    };
  }

  if (subject === "Logic and Patterns") {
    const t = k % 4;
    if (t === 0) {
      // d starts at 4: the bank's own pattern question uses d = 3 (5, 8, 11, 14), so
      // overflow sequences can never reproduce it.
      const a = int(2, 9);
      const d = 4 + (k % 5);
      const seq = [a, a + d, a + 2 * d, a + 3 * d];
      return {
        text: `Continue the pattern and say the rule in words: ${seq.join(", ")}, ___, ___.`,
        answer: `${a + 4 * d} and ${a + 5 * d}. The rule adds ${d} each time.`,
        explanation: `Each number is ${d} more than the one before: ${a + 3 * d} + ${d} = ${a + 4 * d}, then ${a + 4 * d} + ${d} = ${a + 5 * d}.`
      };
    }
    if (t === 1) {
      // a starts at 4: the math bank's doubling pattern starts at 3 (3, 6, 12, 24).
      const a = 4 + (k % 5);
      const seq = [a, a * 2, a * 4, a * 8];
      return {
        text: `Find the next number and explain the rule: ${seq.join(", ")}, ___.`,
        answer: `${a * 16}. Each number doubles.`,
        explanation: `Every step multiplies by 2, so ${a * 8} x 2 = ${a * 16}.`
      };
    }
    if (t === 2) {
      const m = [3, 4, 5, 6, 7][k % 5];
      const outlier = m * 4 + 1;
      const values = [m * 2, m * 3, outlier, m * 4, m * 5].sort((x, y) => x - y);
      return {
        text: `Find the odd one out and say why: ${values.join(", ")}.`,
        answer: `${outlier}, because all the others are multiples of ${m}.`,
        explanation: `${m * 2}, ${m * 3}, ${m * 4}, and ${m * 5} divide evenly by ${m}; ${outlier} does not.`
      };
    }
    const pools = [
      ["Mia", "Leo", "Sam"],
      ["Ravi", "Noor", "Kai"],
      ["Tara", "Ben", "Lina"],
      ["Owen", "Zoe", "Raj"],
      ["Iris", "Theo", "Nina"]
    ];
    const [first, second, third] = pools[k % pools.length];
    return {
      text: `Three players finish a ${theme} relay. ${first} finishes before ${second}. ${second} finishes before ${third}. Who finishes last? Explain how you know.`,
      answer: `${third} finishes last.`,
      explanation: `${first} is ahead of ${second}, and ${second} is ahead of ${third}, so ${third} must be at the back.`
    };
  }

  // Text subjects: distinct prompt templates per subject (enough to cover the largest
  // possible overflow given bank sizes and the 12-question section cap).
  const open = (text: string, answer: string, explanation: string): OverflowQuestion => ({ text, answer, explanation });
  const templatesBySubject: Record<string, OverflowQuestion[]> = {
    "Reading Comprehension": [
      open(
        `Write a new title for the passage and give two details from the text that support your title.`,
        "Open response. A strong title names the passage's main idea, with two supporting details copied or paraphrased from the text.",
        "A good title is a one-line summary; the two details prove it fits the whole passage, not just one paragraph."
      ),
      open(
        `Summarize the passage in exactly two sentences: one for the main idea and one for the strongest detail.`,
        "Open response. Sentence one states the main idea; sentence two gives the best supporting detail from the passage.",
        "Limiting the summary to two sentences forces the reader to choose what matters most."
      ),
      open(
        `Find one sentence in the passage that states a fact and one that gives an opinion or interpretation. Copy both and label them.`,
        "Open response. The fact can be checked or measured; the opinion or interpretation makes a judgment that needs support.",
        "Separating facts from interpretations is the first step of evidence-based reading."
      ),
      open(
        `Which paragraph is most important to the passage's message? Name it and defend your choice with one detail.`,
        "Open response. Any paragraph is acceptable if the answer names it and supports the choice with a detail from the text.",
        "Defending the choice with a detail turns a preference into an argument."
      ),
      open(
        `What would the reader lose if the final paragraph were removed? Explain in one or two sentences.`,
        "Open response. A strong answer names what the conclusion adds — the lesson, the summary, or the connection back to the main idea.",
        "Conclusions usually carry the author's point; noticing that is part of understanding structure."
      ),
      open(
        `Write one question the passage raises but does not answer, and say where you would look for the answer.`,
        "Open response. A strong answer asks a question tied to the passage and names a sensible source — a book, an expert, an experiment, or a record.",
        "Good readers leave a text with new questions, not just answers."
      ),
      open(
        `Pick the most important word in the passage and explain why the author needed it.`,
        "Open response. A strong answer picks a word tied to the main idea and explains what would be lost without it.",
        "Weighing individual words builds precise reading habits."
      ),
      open(
        `Describe how the passage would change if it were told from a different point of view.`,
        "Open response. A strong answer names the new point of view and one detail that would change.",
        "Considering other perspectives deepens comprehension of the original."
      )
    ],
    "Vocabulary in Context": [
      open(
        `Choose two vocabulary words from the cards above and use both in one sentence about ${theme}.`,
        "Open response. One grammatical sentence that uses both words correctly and connects to the theme.",
        "Combining two words in one sentence proves control of both meanings at once."
      ),
      open(
        `Pick one vocabulary word and write one synonym and one antonym for it. Explain the difference the antonym makes.`,
        "Open response. A reasonable synonym and antonym for any card word, with one sentence on the contrast.",
        "Synonyms and antonyms map where a word sits among its neighbors."
      ),
      open(
        `Write a question about ${theme} that uses one vocabulary word correctly.`,
        "Open response. A real question that uses one card word with its correct meaning.",
        "Using a word inside a question shows flexible, not memorized, understanding."
      ),
      open(
        `Choose one vocabulary word and explain how its meaning would shift in a different subject, like science or sports.`,
        "Open response. A strong answer shows the same word doing slightly different work in a new context.",
        "Words carry core meanings that adapt to context; noticing the shift builds vocabulary depth."
      ),
      open(
        `Use one vocabulary word in a sentence that describes something from the reading passage.`,
        "Open response. A sentence that uses the word correctly and refers to a real detail from the passage.",
        "Connecting vocabulary back to the passage links word study with comprehension."
      ),
      open(
        `Teach one vocabulary word to a younger student: write a kid-friendly definition and one example about ${theme}.`,
        "Open response. A simple, accurate definition and one concrete example.",
        "If you can teach a word simply, you truly own it."
      ),
      open(
        `Pick the vocabulary word you think you will use most this week and explain when you expect to use it.`,
        "Open response. Any card word, with a believable everyday situation.",
        "Planning to use a word makes it far more likely to stick."
      ),
      open(
        `Write two sentences about ${theme} that use the same vocabulary word in two different ways.`,
        "Open response. Two correct sentences showing the word in different roles or situations.",
        "Reusing one word in new frames stretches understanding of its range."
      )
    ],
    "Grammar and Writing": [
      open(
        `Fix the capitalization and punctuation: "after the ${theme} session the team celebrated together"`,
        `Sample: "After the ${theme} session, the team celebrated together."`,
        "Start with a capital letter, add the comma after the opening phrase, and end with a period."
      ),
      open(
        `Combine these into one sentence with a connecting word: "The group practiced daily. The results improved."`,
        `Sample: "Because the group practiced daily, the results improved."`,
        "A connector like because, so, or and joins two short sentences into one clear thought."
      ),
      open(
        `Rewrite this run-on as two complete sentences: "we made a plan it worked on the first try"`,
        `Sample: "We made a plan. It worked on the first try."`,
        "Each complete thought gets its own capital letter and end mark."
      ),
      open(
        `Choose the correct word and explain why: "The team did (good / well) in the ${theme} challenge."`,
        `"Well" — it is an adverb describing how the team did; "good" is an adjective for nouns.`,
        "Adverbs describe verbs; adjectives describe nouns."
      ),
      open(
        `Add one adjective and one adverb to make this sentence stronger: "The group finished the project."`,
        `Sample: "The determined group carefully finished the project."`,
        "The adjective sharpens the noun; the adverb sharpens the verb."
      ),
      open(
        `Rewrite in the past tense: "The team wins the ${theme} round and celebrates together."`,
        `Sample: "The team won the ${theme} round and celebrated together."`,
        "Both verbs must shift to past tense: wins becomes won, celebrates becomes celebrated."
      ),
      open(
        `Write one sentence about ${theme} that correctly uses quotation marks.`,
        `Sample: "We are ready," said the captain before the ${theme} round began.`,
        "Quotation marks wrap the exact spoken words, with punctuation inside the closing mark."
      ),
      open(
        `Shorten this sentence without losing its meaning: "Due to the fact that the team was prepared, the team was able to succeed."`,
        `Sample: "Because the team was prepared, it succeeded."`,
        "Concise writing replaces wordy phrases and repeated nouns."
      )
    ],
    "Science Investigation": [
      open(
        `Plan a ${theme} test: name the one thing you will change, two things you will keep the same, and what you will measure.`,
        "Sample: change one variable, keep the time and the setup the same, and measure the result with the same tool each trial.",
        "A fair test changes one variable while controlling the rest."
      ),
      open(
        `Why should a ${theme} test be repeated more than once before trusting the result?`,
        "Sample: one trial can be luck; repeated trials show whether the result is a pattern.",
        "Repetition separates real effects from chance."
      ),
      open(
        `Name one tool or method you could use to measure results in a ${theme} experiment, and why it fits.`,
        "Sample: a timer, ruler, counter, or score sheet — whichever matches what is being measured.",
        "Choosing the measuring tool is part of designing the experiment."
      ),
      open(
        `A friend says, "It worked once, so it always works." Explain politely why one trial is not enough evidence.`,
        "Sample: one success could come from luck or hidden conditions; more trials under the same setup are needed.",
        "Scientific claims need repeatable evidence, not single events."
      ),
      open(
        `What problem appears if you change two things at once in a ${theme} test?`,
        "You cannot tell which change caused the result.",
        "When two variables change together, their effects are tangled; change one at a time."
      ),
      open(
        `Write one "If ..., then ..." hypothesis about ${theme} that you could actually test.`,
        "Open response. The 'if' names the change; the 'then' predicts a measurable result.",
        "A testable hypothesis makes a prediction that evidence can confirm or reject."
      ),
      open(
        `Describe one observation about ${theme} you could record with numbers instead of words. Why are numbers useful here?`,
        "Open response. Sample: counting attempts or timing rounds — numbers can be compared exactly.",
        "Quantitative records make comparisons and patterns checkable."
      ),
      open(
        `After a ${theme} test, your result surprises you. List the first two things you should check before announcing it.`,
        "Sample: check the measurement and check whether anything besides the planned variable changed.",
        "Surprising results are checked before they are trusted."
      )
    ],
    "Social Studies and History": [
      open(
        `Name one rule or tradition connected to ${theme} and explain why a community might value it.`,
        "Open response. A strong answer names the rule and ties it to fairness, safety, or belonging.",
        "Rules and traditions usually protect something a community cares about."
      ),
      open(
        `How could a new technology change the way people enjoy ${theme}? Name one benefit and one cost.`,
        "Open response. One realistic benefit and one realistic cost or trade-off.",
        "Change usually helps some people and burdens others; naming both sides is fair thinking."
      ),
      open(
        `Write two questions you would ask someone who experienced ${theme} long ago.`,
        "Open response. Two specific questions about what changed, what it felt like, or what evidence remains.",
        "Interview questions are how historians collect first-person sources."
      ),
      open(
        `Describe how two different groups might see the same ${theme} event differently, and why.`,
        "Open response. A strong answer names both groups and the reason their views differ.",
        "Perspective depends on what each group experiences and stands to gain or lose."
      ),
      open(
        `What evidence would show that ${theme} mattered to a community ten years ago?`,
        "Open response. Sample: photos, newsletters, schedules, awards, or records from that time.",
        "Claims about the past need sources from the past."
      ),
      open(
        `Plan a fair vote for a ${theme} club decision. What steps keep it fair?`,
        "Sample: everyone hears the options, votes privately or equally, and the count is checked openly.",
        "Fair process — equal voice and an open count — is what makes a result legitimate."
      ),
      open(
        `Name one way ${theme} connects people from different places or backgrounds.`,
        "Open response. A strong answer gives a concrete shared activity, event, or community.",
        "Shared interests build bridges across differences."
      ),
      open(
        `If your town built one new place for ${theme}, where should it go and who should get a say?`,
        "Open response. A location with a reason, plus the groups affected by the choice.",
        "Community decisions work best when affected voices are included."
      )
    ],
    "Critical Thinking": [
      open(
        `Name one habit that would make a ${theme} learner improve fastest, and defend it with a reason.`,
        "Open response. A specific habit plus a reason tied to practice, feedback, or focus.",
        "A defensible choice needs a mechanism: why would this habit cause improvement?"
      ),
      open(
        `What is one mistake people make when judging ${theme} results too quickly?`,
        "Sample: trusting one result, ignoring conditions, or confusing luck with skill.",
        "Quick judgments skip the evidence check that careful thinking requires."
      ),
      open(
        `Compare practicing ${theme} alone versus with a partner. Give one strength of each.`,
        "Open response. Sample: alone builds focus at your own pace; a partner gives feedback and new ideas.",
        "Comparisons are strongest when each side gets a genuine advantage."
      ),
      open(
        `Design a one-week improvement plan for ${theme} with one measurable checkpoint.`,
        "Open response. A plan with specific days or sessions and one number to check at the end.",
        "A measurable checkpoint turns a wish into a testable plan."
      ),
      open(
        `Which matters more for ${theme}: speed or accuracy? Take a side and defend it.`,
        "Open response. Either side works if the reason fits the situation described.",
        "Strong arguments acknowledge that the answer depends on the goal, then commit to a case."
      ),
      open(
        `Explain how you would teach a beginner the single most important idea in ${theme}.`,
        "Open response. One core idea, explained simply, with one example or demonstration.",
        "Choosing the ONE most important idea forces prioritization — a core thinking skill."
      ),
      open(
        `Describe a time when the obvious answer about ${theme} would be wrong. What clue reveals the better answer?`,
        "Open response. A situation where first impressions mislead, plus the detail that corrects them.",
        "Spotting when intuition fails is the heart of careful reasoning."
      ),
      open(
        `You can only keep three pieces of advice about ${theme}. Which three, and why those?`,
        "Open response. Three concrete tips with a short reason for each.",
        "Ranking advice requires weighing usefulness, not just listing it."
      )
    ]
  };

  const templates = templatesBySubject[subject] ?? templatesBySubject["Critical Thinking"];
  return templates[k % templates.length];
}

// Order multiple-choice options deterministically (seeded) with duplicates removed and
// the correct answer guaranteed present (it is always the first input).
function shuffleUnique(values: number[], rng: () => number): number[] {
  const unique = [...new Set(values)];
  for (let i = unique.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [unique[i], unique[j]] = [unique[j], unique[i]];
  }
  return unique;
}

// Theme-aware question banks, one per canonical subject. Sections that ask for more
// questions than a bank holds are topped up by overflowQuestionFor, never by repeats.
function fallbackQuestionBanks(args: {
  high: boolean;
  middle: boolean;
  history: boolean;
  theme: string;
  vocabWords: string[][];
}): Record<string, string[]> {
  const { high, middle, history, theme, vocabWords } = args;
  const books = isBooksTheme(theme);
  const art = isArtTheme(theme);
  const technology = isTechnologyTheme(theme);
  const sports = isSportsTheme(theme);
  const music = isMusicTheme(theme);
  const cooking = isCookingTheme(theme);
  const nature = isNatureTheme(theme);
  const lens = interestLensFor(theme);
  const topic = themePhrase(theme);

  const reading = history && high
    ? [
        "Which statement best captures the central claim of the passage about historical evidence?",
        "Choose one source from the passage and explain what it can prove and what it cannot prove.",
        "Why does the passage warn readers to examine who created a source and what pressure shaped it?",
        "How does corroboration strengthen a historical claim?",
        "Which kind of simple explanation does the passage treat as historically weak?",
        "How does the final paragraph refine the idea of responsible historical interpretation?"
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
        : cooking && high
          ? [
              "Which statement best captures the culinary design problem?",
              "Why does the team define several success criteria before testing?",
              "How does changing one recipe variable at a time improve the evidence?",
              "What trade-off prevents the highest flavor score or lowest cost from automatically winning?",
              "Which evidence best supports the final recipe or waste-reduction proposal?",
              "How does the conclusion define rigorous culinary creativity?"
            ]
        : nature && high
          ? [
              "Which statement best captures the ecological or management problem?",
              "Why is the original observation insufficient to identify one cause?",
              "How does the sampling or comparison plan strengthen the evidence?",
              "What overlapping variables or stakeholder trade-offs complicate the decision?",
              "Which evidence best supports the recommended intervention?",
              "How does the final paragraph define responsible environmental action?"
            ]
        : sports && high
          ? [
              "Which statement best captures the performance decision in the passage?",
              "Why are match results or average times insufficient by themselves?",
              "How does the proposed comparison improve the quality of the evidence?",
              "What trade-off must the coach consider when choosing a training plan or athlete?",
              "Which evidence best supports the final recommendation?",
              "How does the final paragraph define responsible performance analysis?"
            ]
        : music && high
          ? [
              "Which statement best captures the musical decision in the passage?",
              "How do acoustics or ensemble balance change what the listener perceives?",
              "Why does the passage distinguish accurate execution from effective interpretation?",
              "What trade-off appears between energy, clarity, precision, or density?",
              "Which musical detail best supports the final arrangement or rehearsal decision?",
              "How does the conclusion connect creative intention with evidence?"
            ]
        : technology && high
          ? [
              "Which statement best captures the design problem in the passage?",
              "Why does the passage distinguish a visible symptom from its underlying cause?",
              "How does the controlled experiment improve the team's decision?",
              "What trade-off prevents the highest immediate score from automatically being the best design?",
              "Which evidence best supports progressive support or the final engineering compromise?",
              "How does the final paragraph define responsible technology or engineering?"
            ]
        : art && high
          ? [
              "Which statement best captures the museum or exhibition committee's central problem?",
              "Choose two visual details from the passage and explain how they support a specific interpretation.",
              "Why does the passage distinguish personal preference from an evidence-based visual claim?",
              "How do audience and historical context complicate the curatorial decision?",
              "Which proposed decision best acknowledges both the artwork's value and the limits of the available evidence?",
              "How does the final paragraph define responsible curatorial judgment?"
            ]
        : books && high
          ? [
              "Which statement best captures the central claim of the passage about reading and evidence?",
              "Which detail from the passage best shows that format can change what a reader notices?",
              "Why is the response with a quotation or specific text detail stronger than a plot summary alone?",
              "In the passage, annotation is presented mainly as a way to do what?",
              "Which answer would be a weak literary claim because it relies mostly on personal preference?",
              "How does the final paragraph connect books to advanced argument skills?"
            ]
          : isMediaTheme(theme) && high
            ? [
                "Which statement best captures the central claim of the passage about movie analysis?",
                "Which detail from the passage best shows that film meaning can come from technique rather than plot alone?",
                "Why is audience reaction not enough to prove what caused a scene to work?",
                "Which answer would be a weak media claim because it relies mostly on personal reaction?",
                "Why does the passage ask the viewer to consider a competing interpretation?",
                "How does the final paragraph connect movie analysis to advanced reasoning?"
              ]
            : isMediaTheme(theme)
              ? [
                  "What is the main idea of the passage about movies? Point to one detail that proves it.",
                  "Name one scene clue a viewer can use while watching.",
                  "Why does a movie review need a detail from the scene?",
                  "What does a good viewer do when two people disagree about a movie?",
                  "Write one sentence recommending a movie or scene and include one reason.",
                  "What question would you ask before judging a movie scene?"
                ]
          : books
            ? [
                "What is the main idea of the passage about books? Point to one detail that proves it.",
                "Name one clue a reader can use before or during reading.",
                "Why does a book recommendation need a detail from the story?",
                "What does a good reader do when two people disagree about a book?",
                "Write one sentence recommending a book and include one reason.",
                "What question would you ask before choosing your next book?"
              ]
            : high
    ? [
        `Which statement best captures the ${lens.role}'s central design problem?`,
        `Why does the team define audience, constraints, and evidence before creating the ${lens.artifact}?`,
        "What trade-off appears among the three proposed options?",
        "How does using the same criteria improve the fairness of the decision?",
        "Why does the team invite a skeptical review before finalizing its work?",
        `How does the final paragraph define advanced work with ${topic}?`
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

  const grammar = cooking && high
    ? [
        "Revise for precision: \"Batch C was better because it worked better.\"",
        "Combine using a semicolon or subordinating conjunction: \"Batch B had the best flavor. Its center was gummy.\"",
        "Rewrite with appropriate caution: \"The tasting proves fruit puree is the best egg replacement.\"",
        "Edit for parallel structure: \"The team measured cost, rating texture, and whether the muffins stayed moist.\"",
        "Write a concise recipe-development claim naming a criterion, result, and limitation.",
        "Write a two-sentence counterargument to choosing the cheapest acceptable recipe."
      ]
    : nature && high
      ? [
          "Revise for precision: \"The stream is unhealthy because the water is bad.\"",
          "Combine using a semicolon or subordinating conjunction: \"Turbidity rose after rainfall. Dissolved oxygen was already low in warm pools.\"",
          "Rewrite with appropriate caution: \"Construction proves it caused every insect decline.\"",
          "Edit for parallel structure: \"The team measured temperature, recording turbidity, and to identify insects.\"",
          "Write a concise ecological claim naming a pattern, evidence, and uncertainty.",
          "Write a two-sentence counterargument to closing the entire habitat."
        ]
    : sports && high
    ? [
        "Revise for precision: \"The athlete played badly because they were tired.\"",
        "Combine using a semicolon or subordinating conjunction: \"Training volume decreased. Late-session accuracy improved.\"",
        "Rewrite with appropriate caution: \"The recovery plan proves every athlete should train less.\"",
        "Edit for parallel structure: \"The staff measured sprint speed, recording sleep, and how accurately players passed.\"",
        "Write a concise performance claim that names a measure, comparison, and limitation.",
        "Write a two-sentence counterargument to selecting an athlete using average performance alone."
      ]
    : music && high
      ? [
          "Revise for precision: \"The arrangement sounded better because it had better sound.\"",
          "Combine using a semicolon or subordinating conjunction: \"Version B was clearer. Some listeners preferred Version A.\"",
          "Rewrite with appropriate caution: \"The listener survey proves the sparse arrangement is the best music.\"",
          "Edit for parallel structure: \"The producer adjusted the tempo, changing dynamics, and to reduce the bass.\"",
          "Write a concise interpretation connecting one musical element to an effect on the listener.",
          "Write a two-sentence counterargument to making every instrument equally prominent."
        ]
    : technology && high
    ? [
        "Revise for precision: \"The game was bad because the controls were bad.\"",
        "Combine using a semicolon or subordinating conjunction: \"The tutorial improved completion. It increased the mission time.\"",
        "Rewrite with appropriate caution: \"The new interface proves every player will learn faster.\"",
        "Edit for parallel structure: \"The team measured completion, recording errors, and whether players understood the system.\"",
        "Write a concise design claim that names a user need, a feature, and the expected effect.",
        "Write a two-sentence counterargument to optimizing only for speed or completion."
      ]
    : art && high
    ? [
        "Revise this sentence to remove vague language: \"The artwork is powerful because it has powerful colors.\"",
        "Combine these ideas using a semicolon or subordinating conjunction: \"The mural is damaged. Its composition remains legible.\"",
        "Rewrite this claim with appropriate academic caution: \"The red line definitely proves the artist was angry.\"",
        "Edit for parallel structure: \"The curator wants to stabilize the paint, documenting the damage, and to consult residents.\"",
        "Write a precise thesis explaining how one visual element shapes meaning in the passage's artwork.",
        "Write a two-sentence counterargument to a restoration proposal, then concede one strength of that proposal."
      ]
    : high
      ? [
          `Revise for precision: "The ${topic} project was good because it worked well."`,
          `Combine using a semicolon or subordinating conjunction: "The ${lens.artifact} was easy to understand. It left out an important limitation."`,
          `Rewrite with appropriate caution: "The first result proves this is the best way to approach ${topic}."`,
          `Edit for parallel structure: "The team compared costs, measuring outcomes, and to interview users."`,
          `Write a concise claim naming one criterion, one piece of evidence, and one limitation for the ${lens.artifact}.`,
          `Write a two-sentence counterargument to the team's preferred ${topic} proposal.`
        ]
    : [
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
    : books && high
      ? [
          "A reading group annotates 42 of 60 pages in week one and improves the annotation rate by 15 percentage points in week two. What is the week two annotation rate?",
          "A library display has a budget of $360. Book stands cost $18 each and poster panels cost $24 each. If the group buys 8 stands, how many poster panels can it buy with the remaining budget?",
          "The function f(x) = 3x + 7 models discussion points earned after x completed chapters. If f(x) = 52, what is x?",
          "A reading log shows study time rising from 20 to 50 minutes while quiz accuracy rises from 68 percent to 83 percent. What is the average accuracy gain per 10 minutes?"
        ]
      : isMediaTheme(theme) && high
        ? [
            "A film club analyzes 42 of 60 scenes in week one and improves the analysis rate by 15 percentage points in week two. What is the week two analysis rate?",
            "A short-film showcase has a budget of $360. Microphones cost $18 each and poster panels cost $24 each. If the group buys 8 microphones, how many poster panels can it buy with the remaining budget?",
            "The function f(x) = 3x + 7 models critique points earned after x completed scene analyses. If f(x) = 52, what is x?",
            "An audience study shows viewing time rising from 20 to 50 minutes while interpretation accuracy rises from 68 percent to 83 percent. What is the average accuracy gain per 10 minutes?"
          ]
      : books
        ? [
            "A shelf has 4 rows with 6 books on each row. How many books are there in all?",
            "A reader finishes 12 pages on Monday and 15 pages on Tuesday. How many pages did the reader finish in all?",
            "A chapter pattern goes 3, 6, 12, 24, ___, ___. What are the next two numbers, and what is the rule?",
            "A bookmark costs $8. How much do 7 bookmarks cost? Then find the change from $60.",
            "There are 30 minutes for 5 reading stations. How many minutes can each station take?"
          ]
        : isMediaTheme(theme)
          ? [
              "A storyboard has 4 rows with 6 panels on each row. How many panels are there in all?",
              "A reviewer watches 12 minutes on Monday and 15 minutes on Tuesday. How many minutes did the reviewer watch in all?",
              "A scene pattern goes 3, 6, 12, 24, ___, ___. What are the next two numbers, and what is the rule?",
              "A movie ticket costs $8. How much do 7 tickets cost? Then find the change from $60.",
              "There are 30 minutes for 5 movie stations. How many minutes can each station take?"
            ]
    : history
      ? [
          "A museum has 4 shelves with 6 artifacts on each shelf. How many artifacts are there in all?",
          "The schoolhouse opened in 1908 and the train station opened in 1912. How many years later did the train station open?",
          "A timeline goes 1908, 1912, 1916, ___. What year comes next if the pattern continues?",
          "A class reads 12 source cards on Monday and 15 on Tuesday. How many source cards did they read in all?",
          "There are 30 minutes for 5 history stations. How many minutes can each station take?"
      ]
    : cooking && high
    ? [
        "A recipe yields 18 muffins using 540 grams of flour. How much flour is needed for 50 muffins at the same ratio?",
        "A batch costs $13.68 and yields 24 portions. If packaging costs $0.11 per portion, what is the total cost per packaged portion?",
        "A waste audit records 18.4 kg before changes and 12.1 kg after. What is the percent reduction?",
        "A formula is 62 percent flour, 38 percent water by combined mass. If the total is 1,250 grams, find each mass.",
        "In a blinded test, Batch C receives scores 7, 8, 8, 9, 6, 8, 9, and 7. Find the mean and range."
      ]
    : nature && high
      ? [
        "Indicator-species counts at four sites are 24, 18, 11, and 7. What percent lower is the fourth site than the first?",
        "A reserve's nesting success rises from 42 of 70 nests to 57 of 75. Compare the success rates in percentage points.",
        "A stream-monitoring team samples 6 sites monthly for 18 months and takes 4 measurements per visit. How many site-measurements are collected?",
        "A population grows from 1,250 to 1,475, then falls to 1,298. Find the percent increase and the percent decrease.",
        "A random sample finds 36 invasive plants in 15 plots averaging 8 square meters each. Estimate the density per 100 square meters."
      ]
    : sports && high
    ? [
        "An athlete's late-session passing accuracy rises from 64 percent to 78 percent. What is the relative percent increase?",
        "A runner completes six intervals in seconds: 72, 71, 73, 70, 72, 86. Find the mean and identify how the outlier affects it.",
        "A swimmer's five race times are 54.2, 54.5, 54.3, 54.4, and 54.1 seconds. Find the range and mean.",
        "A training plan reduces weekly volume from 420 to 350 minutes while high-intensity distance falls only from 9.0 to 8.7 km. Find both percent changes.",
        "A team wins 18 of 30 matches before a tactical change and 14 of 20 afterward. Compare the win rates in percentage points."
      ]
    : music && high
      ? [
          "A song at 96 beats per minute contains 64 measures of 4 beats. How long is the song in minutes and seconds?",
          "A producer reduces a track from 48 audio layers to 34. What is the percent reduction?",
          "In a listener test, 126 of 180 listeners rate Version B clearer, while 99 rate Version A more exciting. What percentage chose each description?",
          "A four-note motif lasts 1.5 seconds and appears 12 times. What total duration does the motif occupy, and what fraction of a 3-minute piece is that?",
          "A concert hall's sound level drops from 92 dB near the stage to 80 dB at the back. Using a 10 dB drop as roughly one-tenth the intensity, approximately what fraction of the original intensity remains after a 12 dB drop?"
        ]
    : technology && high
    ? [
        "A game tutorial raises mission completion from 58 percent to 81 percent. What is the relative percent increase in completion?",
        "A robot's route takes 150 seconds. A revised speed setting adds 18 seconds but increases battery life from 40 to 52.4 minutes. Find the percent increase in battery life and the percent increase in route time.",
        "A server processes 2,400 requests per minute. Optimization reduces processing time per request by 15 percent. Assuming capacity changes inversely with processing time, estimate the new requests-per-minute capacity.",
        "In an A/B test, 126 of 180 users complete version A and 144 of 180 complete version B. What is the difference in completion rates in percentage points?",
        "A robot travels 24 meters using 18 watt-hours. At the same efficiency, how many watt-hours would it need for a 70-meter route?"
      ]
    : art && high
    ? [
        "A mural is 8.4 meters wide and a digital reproduction uses a 1:20 scale. How wide should the reproduction be in centimeters?",
        "A conservation project has a $18,500 budget. Imaging costs $3,200, stabilization costs $7,850, and documentation costs $2,450. What percentage of the budget remains?",
        "A visitor survey found that 168 of 240 visitors preferred limited conservation over full restoration. Construct a 95 percent confidence interval using p +/- 2 times the square root of p(1-p)/n, and interpret it.",
        "A pigment sample loses 12 percent of its measured brightness every decade. If its current brightness index is 80, what will the model predict after two decades? Round to the nearest tenth.",
        "A rectangular frame measures 90 cm by 70 cm, with an artwork opening measuring 72 cm by 52 cm. What area of mat board remains visible?"
      ]
    : high
    ? [
        `A ${lens.artifact} has a $2,400 budget. Research uses 18 percent, materials use 37 percent, and testing uses 22 percent. How many dollars remain?`,
        `In a review of 160 users, 116 understand the first ${topic} proposal and 132 understand the revised version. Compare the comprehension rates in percentage points.`,
        `Three ${topic} prototypes receive scores of 72, 84, and 78 across four equally weighted criteria. A fifth criterion worth twice as much gives scores of 90, 65, and 82. Which prototype has the highest weighted average?`,
        `A process takes 48 minutes. A revision reduces the time by 17.5 percent while preserving the same outcome. What is the new time?`,
        `A sample of 250 observations includes 42 exceptions. What percentage are exceptions, and why should the team report them rather than remove them?`
      ]
    : [
        `A team practicing ${theme} scores 4 points in each of 6 rounds. How many points in all? Show your setup.`,
        "A pattern goes 3, 6, 12, 24, ___, ___. What are the next two numbers, and what is the rule?",
        `A trip connected to ${theme} is 240 km. If you travel 60 km each hour, how many hours will it take? Show your work.`,
        "A ticket costs $8. How much do 7 tickets cost? Then find the change you get back from $60.",
        "There are 30 minutes for 5 equal activities. How many minutes can each one take?"
      ];

  const science = cooking && high
    ? [
        "Design a controlled recipe test for one egg substitute. Identify the independent variable, two outcome measures, and three controls.",
        "Why should tasters be blinded to the prototype identities?",
        "A batch is moist immediately after baking. Give two reasons this does not prove it will remain acceptable after four hours.",
        "Explain how oven temperature variation could confound a comparison between recipe prototypes.",
        "Propose one objective texture measurement and explain what sensory quality it cannot capture.",
        "Distinguish food safety from food quality using an example from the passage."
      ]
    : nature && high
      ? [
          "Design a sampling plan that tests one possible cause of the ecological change. Name the independent comparison, two outcomes, and two controls.",
          "Why should researchers include sites above and below the suspected disturbance?",
          "Species diversity is lower at one site. Give two alternative explanations besides pollution.",
          "Explain how rainfall could confound a comparison of turbidity between locations.",
          "Propose one useful indicator species or environmental measure and state its limitation.",
          "Distinguish correlation from causation using one relationship in the passage."
        ]
    : sports && high
    ? [
        "Design a controlled comparison of two recovery routines. Identify the independent variable, two outcome measures, and two controls.",
        "Why should a coach avoid changing training volume, sleep routine, and nutrition simultaneously during a trial?",
        "A team performs better after a lighter week. Give two alternative explanations besides lower volume causing the improvement.",
        "Explain how opponent strength could confound a comparison of match performance before and after a tactical change.",
        "Propose one measure of fatigue that complements athlete self-report and explain its limitation.",
        "Distinguish correlation from causation using training load and injury data."
      ]
    : music && high
      ? [
          "Design a controlled listening test comparing two arrangements. Identify the independent variable, two response measures, and two controls.",
          "Why should the producer change only one major element between test mixes?",
          "Listeners prefer one mix in a classroom. Give two reasons this may not predict preference in an auditorium.",
          "Explain how playback volume could confound a comparison of two arrangements.",
          "Propose one objective acoustic measurement and explain what it cannot reveal about musical quality.",
          "Distinguish correlation from causation using rehearsal time and performance ratings."
        ]
    : technology && high
    ? [
        "Design a controlled usability test for one interface change. Identify the independent variable, two dependent measures, and two controls.",
        "Why should the robotics team change only one hardware or software variable per trial?",
        "A new feature improves scores in one session. Give two alternative explanations besides the feature causing better learning.",
        "Explain how device performance could confound a comparison of two game interfaces.",
        "Propose one measure of long-term mastery that is stronger than immediate mission completion.",
        "Distinguish correlation from causation using one result from the passage."
      ]
    : art && high
    ? [
        "Design a controlled test comparing how direct light and filtered light affect pigment fading. Identify the independent variable, dependent variable, and two controls.",
        "Why would a conservator test cleaning solvent on a tiny hidden area before treating the whole mural?",
        "A cleaned test patch appears brighter after one day. Give two reasons this is not yet enough evidence that the treatment is safe.",
        "Explain how humidity could act as a confounding variable in a pigment-aging experiment.",
        "Propose one non-destructive measurement that could track deterioration over time and explain what data it would produce.",
        "Distinguish conservation from restoration using one scientific or ethical consideration from the passage."
      ]
    : high
      ? [
          `Design a controlled test for one feature of the ${lens.artifact}. Identify the variable changed, two outcomes, and two controls.`,
          `Why should the ${lens.role} revise one major feature at a time?`,
          `The revised ${lens.artifact} receives a better rating. Give two alternative explanations besides the revision causing the improvement.`,
          `Explain one confounding variable that could distort a comparison of two ${topic} options.`,
          `Propose one objective measure and one audience-response measure for the ${lens.artifact}.`,
          `Distinguish correlation from causation using a plausible ${topic} result.`
        ]
    : [
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
        : art && high
          ? [
              "Explain how the mural's original transit-station setting changes the way a museum should interpret it.",
              "Whose perspectives should be represented before the museum alters a public artwork, and why?",
              "Write a claim about whether public ownership gives a community special authority over conservation decisions.",
              "How can patronage influence which artworks are preserved, displayed, or forgotten?",
              "Name one source that could clarify the artwork's historical context and explain its limitation."
            ]
        : high
          ? [
              `Identify two groups affected by a ${topic} proposal and explain why their priorities may differ.`,
              `Name one historical, cultural, or community source that would improve the ${lens.artifact}.`,
              `Write a fair rule for making the ${topic} decision and explain whose voice could otherwise be missed.`,
              `Explain how cost, access, or tradition could change which ${topic} option seems best.`
            ]
        : [
            `Name one way ${theme} (or an interest like it) could change life in a town, and who it helps.`,
            "A leader and an invention both change a city. What evidence shows which mattered more?",
            `Why might two people remember the same ${theme} event differently?`,
            `Describe one fair rule a ${theme} club should make, and why.`
          ];

  const logic = cooking && high
    ? [
        "A chef argues, \"Batch B had the highest flavor score, so it is the best recipe.\" Identify the reasoning flaw and propose a better decision rule.",
        "Rank safety, taste, texture, cost, and sustainability for the passage's product. Defend your top two.",
        "If every safe batch meets the allergen protocol, and Batch D failed the protocol, what can and cannot be concluded?",
        "Construct a decision rule for keeping, revising, or rejecting a prototype."
      ]
    : nature && high
      ? [
          "A manager argues, \"Insect diversity fell where turbidity was high, so sediment is the only cause.\" Identify the reasoning flaw and propose stronger evidence.",
          "Rank biodiversity, public access, cost, and community trust for the habitat decision. Defend your top two.",
          "If every resilient wetland recovers after ordinary storms, and this wetland did not recover, what can and cannot be concluded?",
          "Construct a decision rule for maintaining, expanding, or ending an environmental intervention."
        ]
    : sports && high
    ? [
        "A coach argues, \"The team won after the new training plan, so the plan caused the win.\" Identify the reasoning flaw and propose stronger evidence.",
        "Rank peak performance, consistency, recovery, and tactical fit for selecting a relay or starting lineup. Defend your top two.",
        "If every overtrained athlete shows declining recovery scores, and one athlete's recovery score is declining, what can and cannot be concluded?",
        "Construct a decision rule for increasing, maintaining, or reducing training load."
      ]
    : music && high
      ? [
          "A producer argues, \"Most listeners preferred the louder mix, so louder is musically better.\" Identify the reasoning flaw and propose stronger evidence.",
          "Rank clarity, emotional impact, performer comfort, and audience energy for choosing an arrangement. Defend your top two.",
          "If every effective arrangement preserves the melody's focal role, and this arrangement hides the melody, what can and cannot be concluded?",
          "Construct a decision rule for keeping, revising, or removing a musical layer."
        ]
    : technology && high
    ? [
        "A team concludes, \"Players who stayed longer learned more, so longer play caused the learning.\" Identify the reasoning flaw and propose a better test.",
        "Rank accessibility, learning retention, speed, and visual polish for the passage's product. Defend your top two criteria.",
        "If every reliable release passes the regression suite, and this release failed the suite, what can and cannot be concluded?",
        "Construct a decision rule for choosing whether to ship, revise, or remove a feature."
      ]
    : art && high
    ? [
        "A curator argues: \"Most surveyed visitors prefer restoration, so full restoration is ethically correct.\" Identify the reasoning flaw and name one additional kind of evidence needed.",
        "Rank these criteria for an exhibition entrance image: immediate attention, historical significance, visual coherence, and community relevance. Defend the trade-off in your top two.",
        "If every authentic restoration preserves original material, and this proposal replaces original material, what can and cannot be concluded about the proposal?",
        "Construct a decision rule that would help a committee choose between conservation, restoration, and reinterpretation without relying only on taste."
      ]
    : high
    ? [
        `A reviewer says, "Most people preferred Option A, so it is the best ${topic} choice." Identify the flaw and name one missing criterion.`,
        `Rank clarity, accuracy, cost, and audience usefulness for the ${lens.artifact}. Defend your top two.`,
        `If every successful ${lens.artifact} meets the audience goal, and this version misses the audience goal, what can and cannot be concluded?`,
        `Construct a decision rule for keeping, revising, or rejecting a ${topic} proposal.`
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
    : cooking && high
      ? [
          "Write a product recommendation citing two results and acknowledging one trade-off.",
          "Compare optimizing one sensory score with satisfying a multi-criteria design brief.",
          "Explain why precise measurement can support rather than limit culinary creativity.",
          "Challenge one assumption in the passage and propose a test.",
          "Write a concise menu or product note that communicates ingredients, purpose, and an honest limitation."
        ]
    : nature && high
      ? [
          "Write an intervention recommendation citing two observations and acknowledging one uncertainty.",
          "Compare acting quickly with waiting for stronger ecological evidence.",
          "Explain why biodiversity can matter beyond simply counting species.",
          "Challenge one causal assumption in the passage and propose a field comparison.",
          "Write a concise public notice explaining the action, evidence, trade-off, and review threshold."
        ]
    : sports && high
      ? [
          "Write a coaching recommendation that cites two data points and acknowledges one uncertainty.",
          "Compare maximizing peak performance with maximizing reliable performance.",
          "Explain why harder training does not automatically create better adaptation.",
          "Challenge one assumption in the passage and propose evidence that would test it.",
          "Write a concise athlete briefing that explains the plan, purpose, success measure, and recovery expectation."
        ]
    : music && high
      ? [
          "Write an arrangement recommendation that cites two musical or acoustic details and acknowledges one trade-off.",
          "Compare technical accuracy with expressive interpretation.",
          "Explain how the same motif can communicate differently through timbre or dynamics.",
          "Challenge one production assumption in the passage and propose a listening test.",
          "Write a concise program note that describes the musical idea without telling the audience what to feel."
        ]
    : technology && high
      ? [
          "Write a product recommendation that cites two data points and acknowledges one trade-off.",
          "Compare optimizing for immediate completion with optimizing for long-term mastery.",
          "Explain why more automation does not always create a better human experience.",
          "Challenge one design assumption in the passage and propose evidence that would test it.",
          "Write a concise release note that explains the change, expected benefit, known limitation, and measurement plan."
        ]
    : art && high
      ? [
          "Write a curatorial recommendation that makes a clear claim, cites two details from the passage, and acknowledges one trade-off.",
          "Compare conservation and restoration. Which better respects authenticity in this case, and how are you defining authenticity?",
          "Explain how the meaning of an artwork can change when it moves from a public station to a museum.",
          "Challenge one interpretation of the red line or selected photograph by offering a plausible alternative supported by visual evidence.",
          "Design a short exhibition label that informs visitors without telling them what they must think."
        ]
    : high
      ? [
          `Write a recommendation for the ${lens.artifact} using two pieces of evidence and one acknowledged trade-off.`,
          `Compare making the ${lens.artifact} simpler with making it more complete.`,
          `Explain why an authentic audience changes how the ${lens.role} should work.`,
          `Challenge one assumption about ${topic} and propose evidence that would test it.`,
          `Write a concise final brief naming the purpose, recommendation, limitation, and next measurement.`
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
  const high = isHighSchoolOrAdult(input);
  const elementary = !high && input.age <= 10;
  const middle = !high && input.age > 10 && input.age <= 14;

  if (elementary) {
    return `This mission uses ${interests} to practice reading clues, solving step by step, and feeling proud of careful thinking. Try your best, show your work, and enjoy the challenge.`;
  }

  if (middle) {
    const tone = input.goal === "catching-up"
      ? "Start with the clearest wins, use each hint, and notice the progress you make."
      : input.goal === "getting-ahead"
        ? "Expect real choices, deeper reasoning, and a final challenge that rewards original thinking."
        : "Use evidence, show the setup, and build momentum one checkpoint at a time.";
    return `This mission uses ${interests} to build stronger reading, reasoning, and explanation habits. ${tone}`;
  }

  const purpose = input.goal === "test-prep"
    ? "Practice evidence-based reading, precise vocabulary, quantitative reasoning, and calm decisions under test-like pressure."
    : input.goal === "catching-up"
      ? "Build confidence through clear starting points, guided practice, and visible evidence of improvement."
      : input.goal === "getting-ahead"
        ? "Work through authentic, advanced problems that require judgment, evidence, and original thinking."
        : "Practice evidence-based reading, precise vocabulary, quantitative reasoning, and clear explanation through authentic problems.";
  return `This mission treats ${interests} as a serious field of study. ${purpose} ${blueprint.motivationStrategy}`;
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

function funZoneBlock(input: WorksheetInput, theme: string, run: WorksheetRun): { html: string; answersHtml: string } {
  const rng = seededRng(`${run.seed}|activity`);
  const young = input.age <= 6 || input.grade === "Pre-K" || input.grade === "Kindergarten";
  const elementary = !young && input.age <= 10;
  const high = isHighSchoolOrAdult(input);

  if (high) {
    const history = isHistoryTheme(theme);
    const art = isArtTheme(theme);
    const sports = isSportsTheme(theme);
    const music = isMusicTheme(theme);
    const cooking = isCookingTheme(theme);
    const nature = isNatureTheme(theme);
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
      : art
        ? [
            {
              html: `<p><strong>Curator's Decision.</strong> Choose conservation, restoration, or reinterpretation for the artwork in the passage.</p><p>Write a recommendation using two visual or contextual details and one acknowledged trade-off.</p><div class="write"></div>`,
              answer: "Sample: Choose limited conservation because it protects original material and preserves evidence of age; the trade-off is that some original colors remain difficult to see."
            },
            {
              html: `<p><strong>Visual Evidence Challenge.</strong> Sketch a simple composition using one focal point, one repeated shape, and one diagonal line.</p><p>Then annotate how each choice directs the viewer's attention.</p><div class="write"></div>`,
              answer: "Answers vary. A strong response labels the focal point and explains how repetition creates rhythm while the diagonal creates movement or tension."
            },
            {
              html: `<p><strong>Exhibition Label.</strong> Write a 60-word museum label that gives context without ordering the viewer to accept one interpretation.</p><p class="hint">Include what is visible, one relevant fact, and one open question.</p><div class="write"></div>`,
              answer: "A strong label describes visible evidence, supplies concise historical context, and invites interpretation with neutral language rather than declaring a single meaning."
            }
          ]
      : sports
        ? [
            {
              html: `<p><strong>Coach's Decision.</strong> Choose one change to training load, recovery, or tactics.</p><p>Defend it using two measures and state what result would make you reverse the decision.</p><div class="write"></div>`,
              answer: "A strong answer cites two relevant performance or recovery measures and names a clear stop or revision condition."
            },
            {
              html: `<p><strong>Pressure Scenario.</strong> Design a final-minute decision drill connected to ${escapeHtml(theme)}.</p><p>State the cue, two options, and the evidence that reveals the better choice.</p><div class="write"></div>`,
              answer: "Answers vary. The drill should require reading a realistic cue, choosing between plausible options, and explaining the decision rather than relying on speed alone."
            },
            {
              html: `<p><strong>Performance Dashboard.</strong> Choose four measures for a one-page athlete dashboard.</p><p>Explain why each measure matters and one way it could be misleading.</p><div class="write"></div>`,
              answer: "Strong dashboards combine outcome, process, load, and recovery measures and explain the limitation of each number."
            }
          ]
      : music
        ? [
            {
              html: `<p><strong>Producer's Decision.</strong> Choose one element to change: rhythm, timbre, dynamics, texture, or form.</p><p>Predict the listener effect and name evidence that would test your prediction.</p><div class="write"></div>`,
              answer: "A strong answer connects a specific musical change to a predicted effect and proposes a controlled listening comparison."
            },
            {
              html: `<p><strong>Motif Lab.</strong> Write or describe a four-note motif, then create two transformations using rhythm, register, or timbre.</p><div class="write"></div>`,
              answer: "Answers vary. Each transformation should preserve a recognizable relationship to the motif while changing one named musical dimension."
            },
            {
              html: `<p><strong>Program Note.</strong> Write 60 words that help an audience notice the piece's structure without telling them what emotion they must feel.</p><div class="write"></div>`,
              answer: "A strong note names audible features and form using inviting, neutral language rather than prescribing one reaction."
            }
          ]
      : cooking
        ? [
            {
              html: `<p><strong>Test Kitchen Decision.</strong> Select one prototype and defend it using safety, sensory, cost, and stability evidence.</p><p>Name one trade-off and one follow-up test.</p><div class="write"></div>`,
              answer: "A strong response chooses a prototype that meets every non-negotiable requirement, cites evidence across multiple criteria, and proposes a targeted next test."
            },
            {
              html: `<p><strong>Ratio Lab.</strong> Design a 1,000-gram formula using three or more ingredients expressed as percentages.</p><p>Verify that the percentages and masses each total correctly.</p><div class="write"></div>`,
              answer: "Answers vary. Ingredient percentages must total 100 percent and their gram masses must total 1,000 grams."
            },
            {
              html: `<p><strong>Menu Story.</strong> Write a 60-word product description that is appealing, accurate, and transparent about one limitation or allergen consideration.</p><div class="write"></div>`,
              answer: "A strong description communicates sensory appeal and purpose without hiding relevant safety or quality information."
            }
          ]
      : nature
        ? [
            {
              html: `<p><strong>Field Team Decision.</strong> Choose one intervention and support it with two observations.</p><p>State one uncertainty and the threshold that would make you revise the plan.</p><div class="write"></div>`,
              answer: "A strong response connects the intervention to field evidence, acknowledges uncertainty, and gives a measurable review threshold."
            },
            {
              html: `<p><strong>Sampling Map.</strong> Design six sampling locations that reduce bias.</p><p>Include reference and impacted sites, then explain what must stay consistent.</p><div class="write"></div>`,
              answer: "Answers vary. Strong designs include comparable reference and impacted sites and standardize timing, effort, habitat, and measurement method."
            },
            {
              html: `<p><strong>Public Brief.</strong> Write 60 words explaining the ecological action, evidence, trade-off, and monitoring plan to the community.</p><div class="write"></div>`,
              answer: "A strong brief is specific, transparent about uncertainty and costs, and explains how future evidence can change the plan."
            }
          ]
      : [
          {
            html: `<p><strong>Real-World Brief.</strong> Create a ${escapeHtml(interestLensFor(theme).artifact)} for a specific audience interested in ${escapeHtml(theme)}.</p><p>Name the audience, success criteria, evidence, and one constraint.</p><div class="write"></div>`,
            answer: `A strong brief identifies a real audience, measurable success criteria, relevant evidence, and a meaningful constraint for the ${interestLensFor(theme).artifact}.`
          },
          {
            html: `<p><strong>Trade-off Test.</strong> Compare two plausible ways to ${escapeHtml(interestLensFor(theme).action)} ${escapeHtml(theme)}.</p><p>Choose one, defend it, and state the evidence that would make you switch.</p><div class="write"></div>`,
            answer: "A strong response compares both options against the same criteria and gives a clear revision condition."
          },
          {
            html: `<p><strong>Make It Useful.</strong> Produce a short guide, label, pitch, map, demonstration plan, or recommendation connected to ${escapeHtml(theme)}.</p><p>It must help someone make a decision, not merely list facts.</p><div class="write"></div>`,
            answer: "A strong product has a clear purpose, uses accurate evidence, and helps its audience understand or decide something."
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
