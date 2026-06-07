import { NextRequest } from "next/server";

export const runtime = "nodejs";

// ─── LLM config (Ollama-only — no external API dependency) ───────────────────
const LLM_BASE_URL = (process.env.LLM_BASE_URL || "http://localhost:11434/v1").replace(/\/+$/, "");
const QUALITY_MODEL = process.env.LLM_MODEL || "qwen2.5:7b-instruct";
const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 30000);
const llmEndpoint = `${LLM_BASE_URL}/chat/completions`;

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

const VALID_STRUGGLES = new Set([
  "Reading","Fractions","Word Problems","Vocabulary","Grammar","Writing","Science","Logic"
]);
const VALID_FOCUSES = new Set(["balanced","more-math","more-reading","math-only","reading-only"]);
const VALID_GOALS   = new Set(["general","test-prep","catching-up","getting-ahead"]);
const VALID_TIMES   = new Set([20, 40, 60]);

// ─── Types ────────────────────────────────────────────────────────────────────

export type BlueprintSection = {
  subject: string;
  questionCount: number;
  skills: string[];
  focus: string;
  isWeakArea: boolean;
  interestConnection: string;
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

  try {
    const blueprint = await buildBlueprint(input);
    return Response.json(blueprint, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (err) {
    console.error("Blueprint generation failed", err);
    return Response.json(
      { message: "Could not generate the expert plan right now. Please try again." },
      { status: 503 }
    );
  }
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

  const strugglingWith = Array.isArray(body.strugglingWith)
    ? body.strugglingWith.map(String).filter((s: string) => VALID_STRUGGLES.has(s))
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
    model: QUALITY_MODEL,
    temperature: 0.2,
    maxTokens: 1600,
    responseFormat: "json_object",
    messages: [
      {
        role: "system",
        content: `You are five specialists who collaborate to design the perfect worksheet for one student.
Each specialist owns specific decisions and pushes back if others overreach.

THE EDUCATOR — owns: subject selection, skills, question counts, reading level, vocabulary tier.
Ensures the right subjects for the grade, correct skill sequence, curriculum alignment.

THE DEVELOPMENTAL PSYCHOLOGIST — owns: total question count, difficulty curve, pacing, emotional safety.
Ensures the count fits the age and attention span. Confidence-builders before stretch questions.
Caps total questions — the Educator cannot exceed this cap.

THE MOTIVATIONAL COACH — owns: interest integration, theme thread, fun zone, energy of the worksheet.
Rejects generic interest use. Interests must become real scenarios, not just inserted words.
Picks fun zone activities that match the interests and age.

THE TEST READINESS COACH — owns: question formats, trap-answer inclusion, strategy language.
Ensures some questions build test-taking habits appropriate for the age.

THE LEARNING SUPPORT SPECIALIST — owns: weak-area targeting, scaffolding hints, parent note.
Ensures struggling areas get extra questions and specific scaffolding. Writes the parent note.
The first question in every weak-area section must always be accessible (confidence-builder).

All five must agree. Return only valid JSON. Never include the student's name or private data.`
      },
      {
        role: "user",
        content: `Design the complete worksheet spec for this learner.

LEARNER:
- Grade: ${input.grade}
- Age: ${input.age}
- Interests: ${input.interests}

SESSION CONSTRAINTS:
- ${timeNote}
- ${focusNote}
- ${goalNote}
- ${struggleNote}
- Total question range for this age: ${bounds.min}–${bounds.max}

SUBJECTS AVAILABLE (use only those appropriate for this grade):
${KNOWN_SUBJECTS.map(s => `  - ${s}`).join("\n")}

PANEL INSTRUCTIONS:
1. PSYCHOLOGIST sets total questions (${bounds.min}–${bounds.max}) and difficulty split.
2. EDUCATOR chooses subjects and question counts that sum to the total.
3. COACH sets themeThread — one specific, connected topic derived from the interests.
   (e.g. interests: "volcanoes, minecraft" → themeThread: "Building and surviving volcanic eruptions")
   The theme must weave through every section naturally.
4. SUPPORT SPECIALIST flags isWeakArea sections and writes the parentNote.
5. COACH picks fun zone activities suited to the age and interests.

Return this exact JSON shape:
{
  "themeThread": "one vivid theme sentence connecting interests to academics",
  "estimatedMinutes": 40,
  "totalQuestions": 16,
  "challengeProfile": "3 confidence-builders, 10 core, 3 stretch",
  "curriculumPath": "short curriculum direction",
  "gradeExpectations": "what this learner should practice",
  "pageTarget": "4 A4 pages",
  "motivationStrategy": "how to make this learner excited using their specific interests",
  "challengeLevel": "balanced",
  "reading": {
    "wordCount": 260,
    "topic": "specific passage topic tied to themeThread",
    "lexileTarget": "720L"
  },
  "vocabulary": { "wordCount": 6 },
  "sections": [
    {
      "subject": "Reading Comprehension",
      "questionCount": 4,
      "skills": ["main idea", "evidence", "inference"],
      "focus": "one sentence on what this section does and how it ties to themeThread",
      "isWeakArea": false,
      "interestConnection": "how the interest is used specifically in this section"
    }
  ],
  "subjectMix": ["subject names chosen"],
  "cognitiveSkills": ["analytical thinking"],
  "visualPlan": ["small SVG line-art"],
  "questionFormats": ["mission cards", "evidence hunt"],
  "answerExpectations": "what the answer sheet must include",
  "vocabularyPlan": "how vocab words, definitions, examples and hints should work",
  "testReadinessPlan": "age-appropriate test skill plan",
  "funZone": {
    "activities": ["word search", "pattern puzzle", "crack the code"]
  },
  "parentNote": "Specific, actionable note for the parent about today's weak areas and what to watch."
}`
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
      wordCount:    Math.max(60, Math.min(600, Number((r.reading as Record<string,unknown>)?.wordCount) || 200)),
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
    parentNote: cleanText(String(r.parentNote || fallback.parentNote), 400),
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
        isWeakArea:        r.isWeakArea === true,
        interestConnection:cleanText(String(r.interestConnection || ""), 200),
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
  const elem   = input.age >= 7 && input.age <= 10;
  const middle = input.age >= 11 && input.age <= 14;
  const theme  = input.interests.split(",")[0]?.trim() || "learning";

  const sections: BlueprintSection[] = early ? [
    { subject:"Reading Comprehension", questionCount:2, skills:["main idea","picture clues"], focus:"Short story tied to interests.", isWeakArea:false, interestConnection:`Uses ${theme} as the story setting.` },
    { subject:"Vocabulary in Context",  questionCount:2, skills:["new words","matching"],       focus:"Friendly theme words.",           isWeakArea:false, interestConnection:`Words from the ${theme} story.` },
    { subject:"Math Reasoning",         questionCount:3, skills:["counting","comparing"],       focus:"Counting with objects.",         isWeakArea:false, interestConnection:`Count ${theme} objects.` },
    { subject:"Logic and Patterns",     questionCount:1, skills:["patterns","sorting"],         focus:"Simple pattern puzzle.",         isWeakArea:false, interestConnection:`${theme}-themed shapes.` },
  ] : elem ? [
    { subject:"Reading Comprehension", questionCount:3, skills:["main idea","detail","vocab"],  focus:"Original passage with evidence.", isWeakArea:false, interestConnection:`Passage about ${theme}.` },
    { subject:"Vocabulary in Context",  questionCount:3, skills:["definitions","context"],       focus:"Words from the passage.",         isWeakArea:false, interestConnection:`Academic words in ${theme} context.` },
    { subject:"Math Reasoning",         questionCount:3, skills:["multi-step","word problems"],  focus:"Story problems showing setup.",   isWeakArea:false, interestConnection:`Math problems themed to ${theme}.` },
    { subject:"Grammar and Writing",    questionCount:2, skills:["sentences","punctuation"],     focus:"Fix-and-write practice.",         isWeakArea:false, interestConnection:`Writing about ${theme}.` },
    { subject:"Science Investigation",  questionCount:2, skills:["observation","evidence"],      focus:"Small investigation.",           isWeakArea:false, interestConnection:`Science connected to ${theme}.` },
    { subject:"Logic and Patterns",     questionCount:1, skills:["patterns","reasoning"],        focus:"Pattern or logic puzzle.",       isWeakArea:false, interestConnection:`${theme}-themed puzzle.` },
  ] : middle ? [
    { subject:"Reading Comprehension", questionCount:4, skills:["main idea","evidence","inference","tone"], focus:"Substantial passage with evidence.", isWeakArea:false, interestConnection:`Passage deeply tied to ${theme}.` },
    { subject:"Vocabulary in Context",  questionCount:3, skills:["context clues","shades"],                 focus:"Stronger words from passage.",      isWeakArea:false, interestConnection:`Academic vocab in ${theme} context.` },
    { subject:"Math Reasoning",         questionCount:4, skills:["multi-step","ratios","data"],             focus:"Multi-step problems and data.",      isWeakArea:false, interestConnection:`${theme}-themed data problems.` },
    { subject:"Grammar and Writing",    questionCount:2, skills:["revision","explanation"],                 focus:"Revise and explain.",               isWeakArea:false, interestConnection:`Writing about ${theme}.` },
    { subject:"Science Investigation",  questionCount:2, skills:["hypothesis","variables"],                 focus:"Interpret an experiment.",          isWeakArea:false, interestConnection:`${theme} science experiment.` },
    { subject:"Logic and Patterns",     questionCount:2, skills:["sequences","reasoning"],                  focus:"Number and logic puzzles.",         isWeakArea:false, interestConnection:`Logic connected to ${theme}.` },
    { subject:"Social Studies and History", questionCount:1, skills:["cause and effect"],                   focus:"A decision-point question.",        isWeakArea:false, interestConnection:`History/society angle of ${theme}.` },
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
    curriculumPath:     "General standards-aligned mixed practice",
    gradeExpectations:  early ? "Concrete early literacy, counting, and patterns."
                      : elem  ? "Reading comprehension, vocabulary, number sense, writing, and logic."
                      : middle? "Multi-step reasoning, evidence, and clear explanations."
                      :         "SAT-ready reading, vocabulary in context, and algebraic reasoning.",
    pageTarget:         early ? "1–2 A4 pages" : elem ? "3–5 A4 pages" : middle ? "5–7 A4 pages" : "6–9 A4 pages",
    challengeLevel:     middle || !early ? "balanced" : "gentle",
    subjectMix:         sections.map(s => s.subject),
    cognitiveSkills:    ["analytical thinking","mathematical reasoning","reading evidence","pattern recognition"],
    visualPlan:         ["small SVG line-art","mission cards","logic boxes"],
    questionFormats:    ["mission cards","evidence hunt","choose the best answer","explain your thinking"],
    answerExpectations: "Include correct answers, short explanations, skill tested, and next-time tip.",
    vocabularyPlan:     "Hard words with simple definitions, examples, and memory hints.",
    testReadinessPlan:  !early ? "Use evidence, careful reading, logic, and checking work." : "Future test skill building.",
    reading:   { wordCount: early ? 80 : elem ? 220 : middle ? 300 : 440, topic: `${theme} investigation`, lexileTarget: early ? "400L" : elem ? "680L" : middle ? "800L" : "1000L" },
    vocabulary:{ wordCount: early ? 3 : elem ? 5 : middle ? 6 : 8 },
    sections,
    funZone:   { activities: early ? ["pattern puzzle","connect the dots"] : ["word search","pattern puzzle","crack the code"] },
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
    response = await fetch(llmEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: options.model,
        temperature: options.temperature,
        max_tokens: options.maxTokens,
        ...(options.responseFormat ? { response_format: { type: options.responseFormat } } : {}),
        messages: options.messages,
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
  const content = data?.choices?.[0]?.message?.content;
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
  const elem  = !early && input.age <= 10;
  const mid   = !early && !elem && input.age <= 14;
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
