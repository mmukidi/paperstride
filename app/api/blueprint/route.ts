import { NextRequest } from "next/server";

export const runtime = "nodejs";

// ─── LLM config (Ollama-only — no external API dependency) ───────────────────
// Native /api/chat so keep_alive/num_ctx/num_thread can be set per request.
const LLM_BASE_URL = (process.env.LLM_BASE_URL || "http://localhost:11434/v1").replace(/\/+$/, "");
const OLLAMA_HOST = LLM_BASE_URL.replace(/\/v1$/, "");
const ollamaEndpoint = `${OLLAMA_HOST}/api/chat`;
// The blueprint is internal planning that we normalize/validate anyway, so it runs on the
// FAST model — this turns the preview from a ~3 min wait into well under a minute.
const BLUEPRINT_MODEL = process.env.LLM_BLUEPRINT_MODEL || process.env.LLM_FAST_MODEL || "llama3.2:3b";

function parseOllamaKeepAlive(value: string | undefined): number | string {
  if (!value || value.trim() === "") return -1;
  const trimmed = value.trim();
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

const OLLAMA_NUM_THREAD = Number(process.env.OLLAMA_NUM_THREAD || 4);
const OLLAMA_KEEP_ALIVE = parseOllamaKeepAlive(process.env.OLLAMA_KEEP_ALIVE);
const OLLAMA_NUM_CTX = Number(process.env.OLLAMA_NUM_CTX || 4096);
const LLM_TIMEOUT_MS = Number(process.env.LLM_BLUEPRINT_TIMEOUT_MS || 180000);

// Small in-memory cache: blueprints are near-deterministic for a given input signature,
// so repeat previews (same grade/age/interests/focus/goal/struggles) return instantly.
const BLUEPRINT_CACHE = new Map<string, { value: BlueprintPreview; expires: number }>();
const BLUEPRINT_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const BLUEPRINT_CACHE_MAX = 200;

const allowedGrades = new Set([
  "Pre-K","Kindergarten","Grade 1","Grade 2","Grade 3","Grade 4","Grade 5",
  "Grade 6","Grade 7","Grade 8","Grade 9","Grade 10","Grade 11","Grade 12",
  "College","Master's"
]);

const KNOWN_SUBJECTS = [
  "Reading Comprehension","Vocabulary in Context","Grammar and Writing",
  "Math Reasoning","Science Investigation","Social Studies and History",
  "Logic and Patterns","Critical Thinking"
] as const;

const VALID_FOCUSES = new Set(["balanced","more-math","more-reading","math-only","reading-only"]);
const VALID_GOALS   = new Set(["general","test-prep","catching-up","getting-ahead"]);
const VALID_TIMES   = new Set([20, 40, 60]);

// ─── Types ────────────────────────────────────────────────────────────────────

export type BlueprintSection = {
  subject: string;
  questionCount: number;
  skills: string[];
  focus: string;
  expertPersona?: string;      // NEW: who writes this section (system prompt identity)
  questionBriefs?: string[];   // NEW: one brief per question slot
  questionTypes?: string[];    // NEW: question formats for this section
  engagementHook?: string;     // NEW: why this section excites this specific student
  scaffoldingNote?: string;    // NEW: how to build confidence if isWeakArea
  isWeakArea?: boolean;
  interestConnection?: string;
};

export type BlueprintPreview = {
  themeThread: string;
  estimatedMinutes: number;
  totalQuestions: number;
  challengeProfile: string;
  motivationStrategy: string;
  reading: { wordCount: number; topic: string; lexileTarget: string };
  vocabulary: { wordCount: number };
  sections: BlueprintSection[];
  funZone: { activities: string[] };
  parentNote: string;
  gradeExpectations: string;
  curriculumPath: string;
  // Full fields passed back to worksheet generation
  pageTarget: string;
  subjectMix: string[];
  cognitiveSkills: string[];
  challengeLevel: string;
  visualPlan: string[];
  questionFormats: string[];
  answerExpectations: string;
  vocabularyPlan: string;
  testReadinessPlan: string;
  // Expert-panel-enriched fields
  ageTrends?: string[];
  masterScenario?: string;
  engagementStrategy?: string;
  motivationTactics?: string[];
};

type ParsedInput = {
  childName: string;
  grade: string;
  age: number;
  interests: string;
  strugglingWith: string[];
  subjectFocus: string;
  goal: string;
  timeAvailable: number;
};

// ─── POST /api/blueprint ──────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let input: ParsedInput;
  try {
    input = await parseInput(request);
  } catch (err) {
    return Response.json(
      { message: err instanceof Error ? err.message : "Invalid input." },
      { status: 400 }
    );
  }

  // Serve a cached blueprint for identical inputs (instant preview on repeats).
  const cacheKey = blueprintCacheKey(input);
  const cached = BLUEPRINT_CACHE.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return Response.json(cached.value, { headers: { "Cache-Control": "no-store", "X-Blueprint-Cache": "hit" } });
  }

  try {
    const blueprint = await buildBlueprint(input);
    if (BLUEPRINT_CACHE.size >= BLUEPRINT_CACHE_MAX) {
      const oldest = BLUEPRINT_CACHE.keys().next().value;
      if (oldest) BLUEPRINT_CACHE.delete(oldest);
    }
    BLUEPRINT_CACHE.set(cacheKey, { value: blueprint, expires: Date.now() + BLUEPRINT_CACHE_TTL_MS });
    return Response.json(blueprint, {
      headers: { "Cache-Control": "no-store", "X-Blueprint-Cache": "miss" }
    });
  } catch (err) {
    console.warn("Blueprint generation failed; using deterministic fallback", err);
    const fallback = defaultBlueprint(input);
    return Response.json(fallback, {
      headers: {
        "Cache-Control": "no-store",
        "X-Blueprint-Cache": "fallback",
      },
    });
  }
}

// Cache key from the inputs that actually shape the plan (the nickname doesn't).
function blueprintCacheKey(input: ParsedInput): string {
  return [
    input.grade,
    input.age,
    input.interests.toLowerCase().trim(),
    input.subjectFocus,
    input.goal,
    [...input.strugglingWith].sort().join("+")
  ].join("|");
}

// ─── Input parsing ────────────────────────────────────────────────────────────

async function parseInput(request: NextRequest): Promise<ParsedInput> {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") throw new Error("Please fill in the worksheet details.");

  const childName = cleanText(String(body.childName || ""), 40);
  const grade     = cleanText(String(body.grade || ""), 24);
  const interests = cleanText(String(body.interests || ""), 200);
  const age       = Number(body.age);

  if (!childName)               throw new Error("Please add a nickname.");
  if (!allowedGrades.has(grade)) throw new Error("Please choose a grade from the list.");
  if (!Number.isInteger(age) || age < 3 || age > 26) throw new Error("Please choose an age between 3 and 26.");
  if (!interests)               throw new Error("Please add at least one interest.");

  // Struggle areas are dynamic (grade-specific topics from the UI) — accept any sanitized
  // short label rather than a fixed whitelist.
  const strugglingWith = Array.isArray(body.strugglingWith)
    ? body.strugglingWith.map((s: unknown) => cleanText(String(s), 40)).filter(Boolean).slice(0, 8)
    : [];

  const subjectFocus = VALID_FOCUSES.has(body.subjectFocus) ? String(body.subjectFocus) : "balanced";
  const goal         = VALID_GOALS.has(body.goal)           ? String(body.goal)         : "general";
  const timeAvailable = VALID_TIMES.has(Number(body.timeAvailable)) ? Number(body.timeAvailable) : 40;

  return { childName, grade, age, interests, strugglingWith, subjectFocus, goal, timeAvailable };
}

// ─── Expert panel blueprint generation ───────────────────────────────────────

async function buildBlueprint(input: ParsedInput): Promise<BlueprintPreview> {
  const bounds  = questionBounds(input);
  const timeNote = input.timeAvailable === 20
    ? "This is a QUICK session (~20 min). Keep total questions at the low end. Short passage."
    : input.timeAvailable === 60
    ? "This is a DEEP session (60+ min). Can go to the high end of the range. Full passage."
    : "This is a standard session (~40 min). Use the middle of the range.";

  const focusNote = {
    "balanced":      "Cover all appropriate subjects with balanced question counts.",
    "more-math":     "Allocate 40–50% of questions to Math Reasoning. Keep other subjects shorter.",
    "more-reading":  "Allocate 40–50% to Reading Comprehension and Vocabulary. Lighter on math.",
    "math-only":     "Focus almost entirely on Math Reasoning and Logic. 1 short reading passage.",
    "reading-only":  "Focus on Reading Comprehension, Vocabulary, and Grammar. Minimal math.",
  }[input.subjectFocus] ?? "";

  const goalNote = {
    "general":       "Balanced skill practice. Mix confidence-builders with stretch questions.",
    "test-prep":     "Favour SAT/standardised-test question formats. Include elimination hints and trap answers.",
    "catching-up":   "Start easier than grade level. More scaffolding. More confidence-builders. Gentle challenge.",
    "getting-ahead": "Push above grade level. More stretch questions. Harder vocabulary. Complex reasoning.",
  }[input.goal] ?? "";

  const struggleNote = input.strugglingWith.length
    ? `STRUGGLING AREAS: ${input.strugglingWith.join(", ")}. The Learning Support Specialist MUST ensure each weak area appears in at least one section with extra questions and scaffolding hints. The parent note must name the weak areas specifically.`
    : "No specific weak areas reported.";

  const content = await llmChat({
    model: BLUEPRINT_MODEL,
    temperature: 0.4,
    maxTokens: 3200,
    responseFormat: "json_object",
    messages: [
      {
        role: "system",
        content: `You are a panel of five world-class education experts convened to design one perfect worksheet for a specific student. Each expert contributes their speciality:

EXPERT 1 — CHILD DEVELOPMENT PSYCHOLOGIST
You know exactly what engages learners at each developmental stage. You know attention spans, what creates flow vs frustration, how to sequence challenge and success so the student stays motivated start to finish. You push back if the worksheet is too long, too hard, or too generic.

EXPERT 2 — CULTURAL TREND ANALYST  
You track what children and teens are genuinely passionate about RIGHT NOW — specific games, YouTube channels, TV shows, sports figures, memes, music, social platforms, and topics that define their peer culture. You make content feel relevant by naming SPECIFIC things, not vague categories. You know that "kids like technology" is useless — but "Grade 5 students are currently obsessed with Minecraft Legends, MrBeast challenges, and Among Us" is actionable.

EXPERT 3 — MASTER CLASSROOM TEACHER
You know the exact skills this grade is building in school right now. You know the most common misconceptions students have at this age. You know which question types produce genuine learning vs mechanical completion. You design practice that connects directly to what they face in class tests.

EXPERT 4 — CURRICULUM ARCHITECT
You sequence subjects and questions within a single session to create a satisfying learning arc. You know when to put challenge before or after confidence-building. You know how many questions of each type a student can genuinely engage with before fatigue sets in. You design worksheets that feel complete and purposeful, not arbitrary.

EXPERT 5 — MOTIVATION COACH
You know the psychology of what makes students want to finish and come back. You use the student's own interests as genuine intellectual scaffolding — not superficial decoration. You design engagement hooks, challenge frames ("can you crack this?"), and emotional arcs that make learning feel like an adventure rather than a chore.

The panel's job: design one perfect worksheet from scratch. Nothing is pre-assumed. You choose which subjects belong (or don't). You choose how many questions per section. You choose the question types. You create the scenario. You write question briefs. Every decision must be justified by genuine pedagogy for THIS specific student.

Return only valid JSON. Never include the learner's name or any private data.`
      },
      {
        role: "user",
        content: `Design a complete worksheet plan for this student.

STUDENT PROFILE:
- Grade: ${input.grade}
- Age: ${input.age}
- Interests: ${input.interests}
- Struggling with: ${input.strugglingWith?.length ? input.strugglingWith.join(", ") : "nothing specific"}
- Goal today: ${input.goal || "general practice"}
- Time available: ${input.timeAvailable || 30} minutes
- Challenge preference: (the panel will decide based on grade and goal)

PANEL DISCUSSION — work through these before deciding the plan:

Step 1 (Trend Analyst): What 3-5 things are genuinely popular with a ${input.age}-year-old in ${input.grade} RIGHT NOW? Be specific — name shows, games, creators, trends, not categories.

Step 2 (Psychologist + Trend Analyst): Given their interests (${input.interests}) and the current trends you identified, what ONE vivid scenario would make this student forget they're doing schoolwork? Think: a real character facing a real problem in a world this student cares about. The scenario must use their specific interests authentically — not "a student who likes animals" but something more specific and exciting.

Step 3 (Master Teacher + Curriculum Architect): Given ${input.grade} and struggling with "${input.strugglingWith?.join(", ") || "nothing specific"}", decide:
  - Which subjects genuinely serve this student today? (Don't include a subject just because it's standard)
  - How many questions per subject? (Based on developmental attention span and what each subject needs to be meaningful — not arbitrary round numbers)
  - What question TYPES work best for each subject at this age? (Multiple choice, open-ended, fill-in, correct-the-mistake, show-your-working, rank-and-explain, yes/no-with-evidence, etc.)

Step 4 (Motivation Coach): Write the engagement hook for each section — why will THIS student want to do THIS section specifically?

Step 5 (Master Teacher): For each question slot in each section, write a specific brief: what cognitive operation does this question test (recall, application, inference, evaluation, creation), what should the stem reference from the master scenario, and what makes a correct vs incorrect answer clear.

Return this JSON (the panel's complete decision):
{
  "ageTrends": ["3-5 specific things popular with this exact age right now — names, not categories"],
  
  "masterScenario": "2-4 vivid sentences: a named character, a real problem they face, the specific setting, what is at stake. Must use the student's interests in a way that feels exciting, not educational. Every section of the worksheet takes place in this world.",
  
  "engagementStrategy": "1-2 sentences on the motivational arc: how does the worksheet open with confidence, build to challenge, and close with satisfaction?",
  
  "motivationTactics": ["3-5 specific psychological tactics for this age, e.g. 'open with a choice so they feel ownership', 'frame hard questions as expert-level challenges', 'use a running score or progress element'"],
  
  "curriculumPath": "brief curriculum direction for this student",
  "gradeExpectations": "what a learner at this exact age/grade should be mastering",
  "challengeLevel": "gentle | balanced | stretch | advanced — the panel's decision",
  
  "sections": [
    {
      "subject": "name this section — can be standard or creative based on what serves the student",
      "questionCount": "number the panel decided, not a default",
      "skills": ["specific skills practiced in this section"],
      "focus": "one sentence: what this section does and why it belongs in THIS worksheet",
      "expertPersona": "exactly who should write these questions — their subject specialty, their knowledge of this age group's errors, how they approach this question type, their tone. Be specific — 3-4 sentences. This becomes the AI's identity when writing the questions.",
      "questionTypes": ["the question formats to use in this section"],
      "engagementHook": "one sentence: why will THIS student specifically want to do this section?",
      "questionBriefs": [
        "Q1 (cognitive level — e.g. recall/application/inference): exactly what this question asks, what it references from the master scenario, what makes the correct answer distinguishable from wrong ones",
        "Q2 (cognitive level): ...",
        "...one brief per question slot"
      ],
      "isWeakArea": false,
      "scaffoldingNote": "if isWeakArea: how to open with confidence before the harder questions"
    }
  ],
  
  "subjectMix": ["list of section subjects chosen"],
  "cognitiveSkills": ["cognitive skills practiced across the whole worksheet"],
  "motivationStrategy": "how to make THIS learner excited, challenged, and confident",
  "visualPlan": ["what visual elements belong on this worksheet"],
  "questionFormats": ["all question formats used across the worksheet"],
  "answerExpectations": "what the answer sheet must include for every question",
  "vocabularyPlan": "how vocabulary is taught in context — not just definition lists",
  "testReadinessPlan": "how this worksheet builds toward future tests",
  "themeThread": "one sentence tying all sections together through the master scenario",
  "parentNote": "what to watch for and how to encourage this specific student",
  "estimatedMinutes": "the panel's estimate for this student"
}

Pedagogical rules the panel must follow:
- "questionCount" in the JSON root MUST equal the sum of all section "questionCount" values.
- Pre-K/K: max 8 questions total, concrete, playful, very short text.
- Grades 1-3: max ${bounds.max} questions, one reading passage, short activities.
- Grades 4-6: ${bounds.min}-${bounds.max} questions, real depth in reading and math.
- Grades 7-8: multi-step reasoning, evidence, written explanation.
- Grades 9-12: SAT-style evidence, quantitative reasoning, argument writing.
- Every section must have exactly as many questionBriefs as its questionCount.
- Never include private data. Never pad. Every question must earn its place.`
      }
    ]
  });
      }
    ]
  });

  return normaliseBlueprint(parseJson(content), input);
}

// ─── Normalisation ────────────────────────────────────────────────────────────

function normaliseBlueprint(raw: unknown, input: ParsedInput): BlueprintPreview {
  const fallback = defaultBlueprint(input);
  if (!raw || typeof raw !== "object") return fallback;
  const r = raw as Record<string, unknown>;

  const sections = normaliseSections(r.sections, fallback.sections, input);
  const totalQuestions = sections.reduce((s, sec) => s + sec.questionCount, 0);
  const estimatedMinutes = Math.max(15, Math.min(90, Number(r.estimatedMinutes) || input.timeAvailable));

  return {
    themeThread:       cleanText(String(r.themeThread    || fallback.themeThread), 200),
    estimatedMinutes,
    totalQuestions,
    challengeProfile:  cleanText(String(r.challengeProfile || fallback.challengeProfile), 120),
    motivationStrategy:cleanText(String(r.motivationStrategy || fallback.motivationStrategy), 360),
    curriculumPath:    cleanText(String(r.curriculumPath  || fallback.curriculumPath), 220),
    gradeExpectations: cleanText(String(r.gradeExpectations || fallback.gradeExpectations), 420),
    pageTarget:        cleanText(String(r.pageTarget      || fallback.pageTarget), 80),
    challengeLevel:    cleanText(String(r.challengeLevel  || fallback.challengeLevel), 40),
    subjectMix:        normaliseStrList(r.subjectMix, sections.map(s => s.subject), 10),
    cognitiveSkills:   normaliseStrList(r.cognitiveSkills, fallback.cognitiveSkills, 12),
    visualPlan:        normaliseStrList(r.visualPlan, fallback.visualPlan, 10),
    questionFormats:   normaliseStrList(r.questionFormats, fallback.questionFormats, 10),
    answerExpectations:cleanText(String(r.answerExpectations || fallback.answerExpectations), 360),
    vocabularyPlan:    cleanText(String(r.vocabularyPlan  || fallback.vocabularyPlan), 360),
    testReadinessPlan: cleanText(String(r.testReadinessPlan || fallback.testReadinessPlan), 360),
    reading: {
      wordCount:    Math.max(60, Math.min(800, Number((r.reading as Record<string,unknown>)?.wordCount) || 280)),
      topic:        cleanText(String((r.reading as Record<string,unknown>)?.topic || ""), 160) || fallback.reading.topic,
      lexileTarget: cleanText(String((r.reading as Record<string,unknown>)?.lexileTarget || ""), 40) || fallback.reading.lexileTarget,
    },
    vocabulary: {
      wordCount: Math.max(3, Math.min(12, Number((r.vocabulary as Record<string,unknown>)?.wordCount) || 6)),
    },
    sections,
    funZone: {
      activities: normaliseStrList(
        (r.funZone as Record<string,unknown>)?.activities,
        fallback.funZone.activities,
        4
      ),
    },
    parentNote: cleanText(String(r.parentNote || fallback.parentNote), 600),
    // Expert-panel-enriched fields
    ageTrends: Array.isArray(r.ageTrends) ? normaliseStrList(r.ageTrends, [], 8) : undefined,
    masterScenario: r.masterScenario ? cleanText(String(r.masterScenario), 800) : undefined,
    engagementStrategy: r.engagementStrategy ? cleanText(String(r.engagementStrategy), 360) : undefined,
    motivationTactics: Array.isArray(r.motivationTactics) ? normaliseStrList(r.motivationTactics, [], 8) : undefined,
  };
}

function normaliseSections(
  raw: unknown,
  fallback: BlueprintSection[],
  input: ParsedInput
): BlueprintSection[] {
  if (!Array.isArray(raw)) return fallback;
  const bounds = questionBounds(input);
  const known = new Set(KNOWN_SUBJECTS as readonly string[]);
  const bySubject = new Map<string, BlueprintSection>();

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r   = item as Record<string, unknown>;
    const sub = canonicalSubject(cleanText(String(r.subject || ""), 60));
    if (!sub || !known.has(sub)) continue;
    const count = Math.min(12, Math.max(1, Number(r.questionCount) || 2));
    const existing = bySubject.get(sub);
    if (existing) {
      existing.questionCount = Math.min(12, existing.questionCount + count);
    } else {
      bySubject.set(sub, {
        subject:           sub,
        questionCount:     count,
        skills:            normaliseStrList(r.skills, [], 6),
        focus:             cleanText(String(r.focus || ""), 200),
        expertPersona:     cleanText(String(r.expertPersona || ""), 800) || undefined,
        questionBriefs:    normaliseStrList(r.questionBriefs, [], 20),
        questionTypes:     normaliseStrList(r.questionTypes, [], 10),
        engagementHook:    cleanText(String(r.engagementHook || ""), 300) || undefined,
        scaffoldingNote:   cleanText(String(r.scaffoldingNote || ""), 300) || undefined,
        isWeakArea:        r.isWeakArea === true,
        interestConnection:cleanText(String(r.interestConnection || ""), 200) || undefined,
      });
    }
  }

  const sections = Array.from(bySubject.values());
  let total = sections.reduce((s, sec) => s + sec.questionCount, 0);
  if (sections.length < 2 || total < bounds.min) return fallback;
  while (total > bounds.max) {
    const largest = sections.reduce((a, b) => b.questionCount > a.questionCount ? b : a);
    if (largest.questionCount <= 1) break;
    largest.questionCount--;
    total--;
  }
  return sections;
}

// ─── Default blueprint ────────────────────────────────────────────────────────

function defaultBlueprint(input: ParsedInput): BlueprintPreview {
  const early  = input.age <= 6;
  const high = input.age >= 15 || ["Grade 9","Grade 10","Grade 11","Grade 12","College","Master's"].includes(input.grade);
  const elem   = !high && input.age >= 7 && input.age <= 10;
  const middle = !high && input.age >= 11 && input.age <= 14;
  const theme  = input.interests.split(",")[0]?.trim() || "learning";
  const history = /\b(history|historical|social studies|civics|civilization|ancient|medieval|modern|war|revolution|empire|archive|museum)\b/i.test(theme);
  const books = /\b(book|books|reading|reader|novel|novels|story|stories|literature|library|manga|comic|comics|poetry|poem)\b/i.test(theme);
  const media = /\b(movie|movies|film|films|cinema|animation|animated|video|videos|screenplay|screenplays|director|directors|acting|actor|actors|theater|theatre|documentary|documentaries)\b/i.test(theme);

  const sections: BlueprintSection[] = early ? [
    { subject:"Reading Comprehension", questionCount:2, skills:["main idea","picture clues"], focus:"Short story tied to interests.", isWeakArea:false, interestConnection:`Uses ${theme} as the story setting.` },
    { subject:"Vocabulary in Context",  questionCount:2, skills:["new words","matching"],       focus:"Friendly theme words.",           isWeakArea:false, interestConnection:`Words from the ${theme} story.` },
    { subject:"Math Reasoning",         questionCount:3, skills:["counting","comparing"],       focus:"Counting with objects.",         isWeakArea:false, interestConnection:`Count ${theme} objects.` },
    { subject:"Logic and Patterns",     questionCount:1, skills:["patterns","sorting"],         focus:"Simple pattern puzzle.",         isWeakArea:false, interestConnection:`${theme}-themed shapes.` },
  ] : elem && history ? [
    { subject:"Reading Comprehension", questionCount:4, skills:["main idea","details","sequence","source clues"], focus:"Grade-level history passage with evidence.", isWeakArea:false, interestConnection:`Passage about ${theme} sources and timelines.` },
    { subject:"Vocabulary in Context",  questionCount:3, skills:["timeline","source","artifact"], focus:"History words from the passage.", isWeakArea:false, interestConnection:`Words historians use when studying ${theme}.` },
    { subject:"Social Studies and History", questionCount:3, skills:["timeline","past and present","cause and effect"], focus:"Sources, order, and change over time.", isWeakArea:false, interestConnection:`${theme} evidence questions.` },
    { subject:"Grammar and Writing", questionCount:3, skills:["sentences","punctuation"], focus:"Clear sentences about evidence.", isWeakArea:false, interestConnection:`Writing about ${theme}.` },
    { subject:"Math Reasoning", questionCount:2, skills:["elapsed time","word problems"], focus:"Timeline and museum-count problems.", isWeakArea:false, interestConnection:`Dates and artifacts from ${theme}.` },
    { subject:"Logic and Patterns", questionCount:1, skills:["sequence","reasoning"], focus:"Timeline order puzzle.", isWeakArea:false, interestConnection:`Put ${theme} events in order.` },
  ] : elem && books ? [
    { subject:"Reading Comprehension", questionCount:5, skills:["main idea","story details","sequence","character clues"], focus:"Book-themed passage with evidence.", isWeakArea:false, interestConnection:`Passage about ${theme} and reading clues.` },
    { subject:"Vocabulary in Context", questionCount:3, skills:["context clues","story words"], focus:"Words readers use to discuss stories.", isWeakArea:false, interestConnection:`${theme} vocabulary.` },
    { subject:"Grammar and Writing", questionCount:4, skills:["sentences","punctuation","recommendation"], focus:"Write and revise sentences about books.", isWeakArea:false, interestConnection:`Book recommendation writing.` },
    { subject:"Math Reasoning", questionCount:2, skills:["word problems","counting groups"], focus:"Bookshelf and reading-time math.", isWeakArea:false, interestConnection:`Book-themed numbers.` },
    { subject:"Logic and Patterns", questionCount:2, skills:["sequence","reasoning"], focus:"Chapter-order and clue puzzles.", isWeakArea:false, interestConnection:`${theme} clue patterns.` },
  ] : elem && media ? [
    { subject:"Reading Comprehension", questionCount:5, skills:["main idea","scene details","sequence","character clues"], focus:"Movie-themed passage with evidence.", isWeakArea:false, interestConnection:`Passage about ${theme} and scene clues.` },
    { subject:"Vocabulary in Context", questionCount:3, skills:["context clues","media words"], focus:"Words viewers use to discuss scenes.", isWeakArea:false, interestConnection:`${theme} vocabulary.` },
    { subject:"Grammar and Writing", questionCount:4, skills:["sentences","punctuation","review"], focus:"Write and revise sentences about movies.", isWeakArea:false, interestConnection:`Movie review writing.` },
    { subject:"Math Reasoning", questionCount:2, skills:["word problems","elapsed time"], focus:"Movie schedule and audience-count math.", isWeakArea:false, interestConnection:`Movie-themed numbers.` },
    { subject:"Logic and Patterns", questionCount:2, skills:["sequence","reasoning"], focus:"Scene-order and clue puzzles.", isWeakArea:false, interestConnection:`${theme} scene patterns.` },
  ] : elem ? [
    { subject:"Reading Comprehension", questionCount:3, skills:["main idea","detail","vocab"],  focus:"Original passage with evidence.", isWeakArea:false, interestConnection:`Passage about ${theme}.` },
    { subject:"Vocabulary in Context",  questionCount:3, skills:["definitions","context"],       focus:"Words from the passage.",         isWeakArea:false, interestConnection:`Academic words in ${theme} context.` },
    { subject:"Math Reasoning",         questionCount:3, skills:["multi-step","word problems"],  focus:"Story problems showing setup.",   isWeakArea:false, interestConnection:`Math problems themed to ${theme}.` },
    { subject:"Grammar and Writing",    questionCount:2, skills:["sentences","punctuation"],     focus:"Fix-and-write practice.",         isWeakArea:false, interestConnection:`Writing about ${theme}.` },
    { subject:"Science Investigation",  questionCount:2, skills:["observation","evidence"],      focus:"Small investigation.",           isWeakArea:false, interestConnection:`Science connected to ${theme}.` },
    { subject:"Logic and Patterns",     questionCount:1, skills:["patterns","reasoning"],        focus:"Pattern or logic puzzle.",       isWeakArea:false, interestConnection:`${theme}-themed puzzle.` },
  ] : middle && history ? [
    { subject:"Reading Comprehension", questionCount:5, skills:["main idea","evidence","inference","source perspective"], focus:"Substantial history passage.", isWeakArea:false, interestConnection:`Passage deeply tied to ${theme}.` },
    { subject:"Vocabulary in Context", questionCount:3, skills:["chronology","artifact","primary source"], focus:"Academic history vocabulary.", isWeakArea:false, interestConnection:`${theme} source vocabulary.` },
    { subject:"Social Studies and History", questionCount:4, skills:["chronology","cause and effect","source reasoning"], focus:"Analyze timelines and claims.", isWeakArea:false, interestConnection:`Historical reasoning about ${theme}.` },
    { subject:"Grammar and Writing", questionCount:3, skills:["revision","claim evidence reasoning"], focus:"Revise and explain a historical claim.", isWeakArea:false, interestConnection:`Writing about ${theme}.` },
    { subject:"Math Reasoning", questionCount:3, skills:["timeline math","ratios"], focus:"Quantitative history reasoning.", isWeakArea:false, interestConnection:`Use dates and counts from ${theme}.` },
    { subject:"Critical Thinking", questionCount:1, skills:["synthesis","argument"], focus:"Weigh two explanations.", isWeakArea:false, interestConnection:`Compare interpretations of ${theme}.` },
  ] : middle && books ? [
    { subject:"Reading Comprehension", questionCount:5, skills:["main idea","evidence","inference","character motivation"], focus:"Substantial book-themed passage.", isWeakArea:false, interestConnection:`${theme} and text evidence.` },
    { subject:"Vocabulary in Context", questionCount:3, skills:["context clues","literary terms"], focus:"Terms readers use to discuss texts.", isWeakArea:false, interestConnection:`${theme} vocabulary.` },
    { subject:"Grammar and Writing", questionCount:4, skills:["revision","sentence combining","recommendation writing"], focus:"Revise and explain a book recommendation.", isWeakArea:false, interestConnection:`Writing about ${theme}.` },
    { subject:"Math Reasoning", questionCount:3, skills:["multi-step","ratios","reading schedules"], focus:"Book-club and reading-log math.", isWeakArea:false, interestConnection:`${theme} reading log numbers.` },
    { subject:"Critical Thinking", questionCount:2, skills:["claim evidence reasoning","comparison"], focus:"Compare interpretations and defend a claim.", isWeakArea:false, interestConnection:`Text-based claims about ${theme}.` },
  ] : middle && media ? [
    { subject:"Reading Comprehension", questionCount:5, skills:["main idea","evidence","inference","director's purpose"], focus:"Substantial media-themed passage.", isWeakArea:false, interestConnection:`${theme} and media evidence.` },
    { subject:"Vocabulary in Context", questionCount:3, skills:["context clues","media terms"], focus:"Terms viewers use to analyze film.", isWeakArea:false, interestConnection:`${theme} vocabulary.` },
    { subject:"Grammar and Writing", questionCount:4, skills:["revision","sentence combining","review writing"], focus:"Revise and explain a movie review.", isWeakArea:false, interestConnection:`Writing about ${theme}.` },
    { subject:"Math Reasoning", questionCount:3, skills:["multi-step","percentages","audience data"], focus:"Movie-club and audience-rating math.", isWeakArea:false, interestConnection:`${theme} audience numbers.` },
    { subject:"Critical Thinking", questionCount:2, skills:["claim evidence reasoning","comparison"], focus:"Compare interpretations and defend a scene-based claim.", isWeakArea:false, interestConnection:`Media-based claims about ${theme}.` },
  ] : middle ? [
    { subject:"Reading Comprehension", questionCount:4, skills:["main idea","evidence","inference","tone"], focus:"Substantial passage with evidence.", isWeakArea:false, interestConnection:`Passage deeply tied to ${theme}.` },
    { subject:"Vocabulary in Context",  questionCount:3, skills:["context clues","shades"],                 focus:"Stronger words from passage.",      isWeakArea:false, interestConnection:`Academic vocab in ${theme} context.` },
    { subject:"Math Reasoning",         questionCount:4, skills:["multi-step","ratios","data"],             focus:"Multi-step problems and data.",      isWeakArea:false, interestConnection:`${theme}-themed data problems.` },
    { subject:"Grammar and Writing",    questionCount:2, skills:["revision","explanation"],                 focus:"Revise and explain.",               isWeakArea:false, interestConnection:`Writing about ${theme}.` },
    { subject:"Science Investigation",  questionCount:2, skills:["hypothesis","variables"],                 focus:"Interpret an experiment.",          isWeakArea:false, interestConnection:`${theme} science experiment.` },
    { subject:"Logic and Patterns",     questionCount:2, skills:["sequences","reasoning"],                  focus:"Number and logic puzzles.",         isWeakArea:false, interestConnection:`Logic connected to ${theme}.` },
    { subject:"Social Studies and History", questionCount:1, skills:["cause and effect"],                   focus:"A decision-point question.",        isWeakArea:false, interestConnection:`History/society angle of ${theme}.` },
  ] : history ? [
    { subject:"Reading Comprehension", questionCount:6, skills:["central claim","source evidence","inference","comparing interpretations"], focus:"Advanced history passage.", isWeakArea:false, interestConnection:`Complex ${theme} historical texts.` },
    { subject:"Vocabulary in Context", questionCount:4, skills:["historiography vocabulary","precise meaning"], focus:"Academic history words.", isWeakArea:false, interestConnection:`${theme} scholarly vocabulary.` },
    { subject:"Social Studies and History", questionCount:5, skills:["primary source analysis","corroboration","causation"], focus:"Evaluate evidence and explanations.", isWeakArea:false, interestConnection:`Source analysis for ${theme}.` },
    { subject:"Grammar and Writing", questionCount:3, skills:["concision","claim evidence reasoning","argument"], focus:"Short historical argument.", isWeakArea:false, interestConnection:`Writing about ${theme}.` },
    { subject:"Math Reasoning", questionCount:2, skills:["timeline reasoning","percentages"], focus:"Quantitative interpretation.", isWeakArea:false, interestConnection:`Dates and figures in ${theme}.` },
    { subject:"Critical Thinking", questionCount:2, skills:["synthesis","argument"], focus:"Interpretation and uncertainty.", isWeakArea:false, interestConnection:`Historiography and ${theme}.` },
  ] : books ? [
    { subject:"Reading Comprehension", questionCount:6, skills:["central claim","text evidence","inference","tone","interpretation"], focus:"Advanced passage about reading and evidence.", isWeakArea:false, interestConnection:`Complex ${theme} texts.` },
    { subject:"Vocabulary in Context", questionCount:4, skills:["literary vocabulary","precise meaning"], focus:"Academic reading words.", isWeakArea:false, interestConnection:`${theme} scholarly vocabulary.` },
    { subject:"Grammar and Writing", questionCount:4, skills:["concision","claim evidence reasoning","argument"], focus:"Book-based argument writing.", isWeakArea:false, interestConnection:`Writing about ${theme}.` },
    { subject:"Math Reasoning", questionCount:3, skills:["percentages","functions","reading-log interpretation"], focus:"Book-club quantitative reasoning.", isWeakArea:false, interestConnection:`Reading log data for ${theme}.` },
    { subject:"Critical Thinking", questionCount:3, skills:["synthesis","comparison","argument"], focus:"Compare interpretations.", isWeakArea:false, interestConnection:`Text-based interpretation of ${theme}.` },
  ] : media ? [
    { subject:"Reading Comprehension", questionCount:6, skills:["central claim","media evidence","inference","tone","interpretation"], focus:"Advanced passage about film and evidence.", isWeakArea:false, interestConnection:`Complex ${theme} media analysis.` },
    { subject:"Vocabulary in Context", questionCount:4, skills:["media vocabulary","precise meaning"], focus:"Academic film and media words.", isWeakArea:false, interestConnection:`${theme} scholarly vocabulary.` },
    { subject:"Grammar and Writing", questionCount:4, skills:["concision","claim evidence reasoning","argument"], focus:"Media-analysis argument writing.", isWeakArea:false, interestConnection:`Writing about ${theme}.` },
    { subject:"Math Reasoning", questionCount:3, skills:["percentages","functions","audience-data interpretation"], focus:"Media quantitative reasoning.", isWeakArea:false, interestConnection:`Audience and rating data for ${theme}.` },
    { subject:"Critical Thinking", questionCount:3, skills:["synthesis","comparison","argument"], focus:"Compare interpretations.", isWeakArea:false, interestConnection:`Scene-based interpretation of ${theme}.` },
  ] : [
    { subject:"Reading Comprehension",      questionCount:5, skills:["central claim","evidence","inference","tone"], focus:"SAT-style passages.",        isWeakArea:false, interestConnection:`Complex ${theme} texts.` },
    { subject:"Vocabulary in Context",       questionCount:3, skills:["vocabulary in context","precise meaning"],      focus:"Academic words in context.", isWeakArea:false, interestConnection:`${theme} academic vocabulary.` },
    { subject:"Math Reasoning",              questionCount:4, skills:["algebra","percentages","data"],                 focus:"Multi-step data problems.",  isWeakArea:false, interestConnection:`${theme} data and algebra.` },
    { subject:"Grammar and Writing",         questionCount:2, skills:["concision","argument"],                          focus:"Revision and argument.",     isWeakArea:false, interestConnection:`Writing about ${theme}.` },
    { subject:"Science Investigation",       questionCount:2, skills:["data analysis","inference"],                     focus:"Experimental data.",         isWeakArea:false, interestConnection:`${theme} scientific analysis.` },
    { subject:"Social Studies and History",  questionCount:1, skills:["source analysis"],                               focus:"Evaluate a claim.",          isWeakArea:false, interestConnection:`${theme} and society.` },
    { subject:"Logic and Patterns",          questionCount:2, skills:["sequences","abstract reasoning"],                 focus:"Abstract reasoning.",        isWeakArea:false, interestConnection:`${theme} pattern analysis.` },
    { subject:"Critical Thinking",           questionCount:1, skills:["synthesis","argument"],                           focus:"Connect interest to learning.",isWeakArea:false,interestConnection:`${theme} and academic persistence.` },
  ];

  const totalQuestions = sections.reduce((s, sec) => s + sec.questionCount, 0);

  return {
    themeThread:        `${theme} as an academic investigation mission`,
    estimatedMinutes:   input.timeAvailable,
    totalQuestions,
    challengeProfile:   "3 confidence-builders, balanced core, 2 stretch",
    motivationStrategy: `Use ${theme} as the mission context for every section.`,
    curriculumPath:     history ? "History and evidence-centered mixed practice" : books ? "Reading and literature-centered mixed practice" : media ? "Media analysis and evidence-centered mixed practice" : "General standards-aligned mixed practice",
    gradeExpectations:  early ? "Concrete early literacy, counting, and patterns."
                      : elem  ? history ? "Reading comprehension, timelines, source clues, vocabulary, writing, and number sense." : books ? "Reading comprehension, story evidence, vocabulary, writing, and book-themed number sense." : media ? "Reading comprehension, scene evidence, vocabulary, writing, and movie-themed number sense." : "Reading comprehension, vocabulary, number sense, writing, and logic."
                      : middle? history ? "Source reasoning, chronology, cause-and-effect, vocabulary, and clear explanations." : books ? "Text evidence, inference, vocabulary, revision, and clear book-based explanations." : media ? "Media evidence, inference, vocabulary, revision, and clear scene-based explanations." : "Multi-step reasoning, evidence, and clear explanations."
                      :         history ? "Advanced historical interpretation, corroboration, causation, and argument writing." : books ? "Advanced reading interpretation, vocabulary in context, text evidence, and argument writing." : media ? "Advanced media interpretation, vocabulary in context, scene evidence, and argument writing." : "SAT-ready reading, vocabulary in context, and algebraic reasoning.",
    pageTarget:         early ? "1–2 A4 pages" : elem ? "3–5 A4 pages" : middle ? "5–7 A4 pages" : "6–9 A4 pages",
    challengeLevel:     middle || !early ? "balanced" : "gentle",
    subjectMix:         sections.map(s => s.subject),
    cognitiveSkills:    ["analytical thinking","mathematical reasoning","reading evidence","pattern recognition"],
    visualPlan:         ["small SVG line-art","mission cards","logic boxes"],
    questionFormats:    ["mission cards","evidence hunt","choose the best answer","explain your thinking"],
    answerExpectations: "Include correct answers, short explanations, skill tested, and next-time tip.",
    vocabularyPlan:     "Hard words with simple definitions, examples, and memory hints.",
    testReadinessPlan:  !early ? "Use evidence, careful reading, logic, and checking work." : "Future test skill building.",
    reading:   { wordCount: early ? 80 : elem ? 280 : middle ? 460 : 650, topic: `${theme} investigation`, lexileTarget: early ? "400L" : elem ? "680L" : middle ? "800L" : "1000L" },
    vocabulary:{ wordCount: early ? 3 : elem ? 5 : middle ? 6 : 8 },
    sections,
    funZone:   { activities: early ? ["pattern puzzle","connect the dots"] : !middle && !history && input.age <= 10 ? ["word search","pattern puzzle","crack the code"] : ["extension challenge","source reasoning","logic stretch"] },
    parentNote: input.strugglingWith.length
      ? `Today's worksheet focuses on: ${input.strugglingWith.join(", ")}. Watch for these sections and offer encouragement when the student gets stuck.`
      : "Encourage your student to show their work and underline key clues before answering.",
  };
}

// ─── LLM helpers ─────────────────────────────────────────────────────────────

async function llmChat(options: {
  model: string;
  messages: Array<{ role: "system" | "user"; content: string }>;
  maxTokens: number;
  temperature: number;
  responseFormat?: "json_object";
}): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(ollamaEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        stream: false,
        keep_alive: OLLAMA_KEEP_ALIVE,
        ...(options.responseFormat === "json_object" ? { format: "json" } : {}),
        options: {
          temperature: options.temperature,
          num_predict: options.maxTokens,
          num_ctx: OLLAMA_NUM_CTX,
          num_thread: OLLAMA_NUM_THREAD,
        },
      }),
    });
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`LLM returned ${response.status}: ${body.slice(0, 240)}`);
  }
  const data = await response.json();
  const content = data?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("LLM returned empty content.");
  return content;
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function parseJson(content: string): unknown {
  const t = content.trim();
  try { return JSON.parse(t); } catch { /* fall through */ }
  const s = t.indexOf("{"), e = t.lastIndexOf("}");
  if (s >= 0 && e > s) { try { return JSON.parse(t.slice(s, e + 1)); } catch { /* fall through */ } }
  return null;
}

function cleanText(value: string, max: number): string {
  return value.replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function normaliseStrList(value: unknown, fallback: string[], max: number): string[] {
  if (!Array.isArray(value)) return fallback;
  const items = value.map(v => cleanText(String(v || ""), 120)).filter(Boolean).slice(0, max);
  return items.length ? items : fallback;
}

function questionBounds(input: ParsedInput): { min: number; max: number } {
  const early = input.age <= 6 || input.grade === "Pre-K" || input.grade === "Kindergarten";
  const high = input.age >= 15 || ["Grade 9","Grade 10","Grade 11","Grade 12","College","Master's"].includes(input.grade);
  const elem  = !early && !high && input.age <= 10;
  const mid   = !early && !elem && !high && input.age <= 14;
  const factor = input.timeAvailable === 20 ? 0.6 : input.timeAvailable === 60 ? 1.3 : 1.0;
  const base = early ? { min: 6,  max: 10 }
             : elem  ? { min: 10, max: 16 }
             : mid   ? { min: 12, max: 22 }
             :         { min: 16, max: 28 };
  return {
    min: Math.round(base.min * factor),
    max: Math.round(base.max * factor),
  };
}

function canonicalSubject(name: string): string | null {
  const l = name.toLowerCase();
  if (/read|comprehension|passage/.test(l))         return "Reading Comprehension";
  if (/vocab|word/.test(l))                          return "Vocabulary in Context";
  if (/grammar|writing|write|language|essay/.test(l))return "Grammar and Writing";
  if (/math|number|algebra|arithmetic|geometry|quantitative/.test(l)) return "Math Reasoning";
  if (/science|biology|physics|chemistry|experiment|investigat/.test(l)) return "Science Investigation";
  if (/social|history|geograph|civics|economic/.test(l)) return "Social Studies and History";
  if (/logic|pattern|puzzle|sequence|reasoning/.test(l)) return "Logic and Patterns";
  if (/critical|think|synthesis|argument/.test(l))   return "Critical Thinking";
  return null;
}
