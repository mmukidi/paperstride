import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const routePath = path.resolve("app/api/worksheets/route.ts");
const source = `${fs.readFileSync(routePath, "utf8")}

export function createDeterministicWorksheetForQualityCheck(input: WorksheetInput): string {
  return createFallbackHtmlWorksheet(input, defaultBlueprint(input));
}

export function createBlueprintForQualityCheck(input: WorksheetInput): LearningBlueprint {
  return defaultBlueprint(input);
}
`;
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
  fileName: routePath,
}).outputText;

const module = { exports: {} };
const load = new Function("require", "module", "exports", "__filename", "__dirname", compiled);
load(require, module, module.exports, routePath, path.dirname(routePath));

const createWorksheet = module.exports.createDeterministicWorksheetForQualityCheck;
const createBlueprint = module.exports.createBlueprintForQualityCheck;
if (typeof createWorksheet !== "function") {
  throw new Error("Quality-check worksheet entry point is unavailable.");
}
if (typeof createBlueprint !== "function") {
  throw new Error("Quality-check blueprint entry point is unavailable.");
}

const html = createWorksheet({
  childName: "jj",
  grade: "Grade 12",
  age: 17,
  interests: "Art",
  strugglingWith: [],
  subjectFocus: "balanced",
  goal: "general",
  timeAvailable: 40,
});

const required = [
  "composition",
  "conservation",
  "curatorial",
  "visual",
  "42 centimeters",
  "Sample:",
];
const forbidden = [
  "A Art",
  "a Art",
  "Master&#39;s-level learner",
  "Master's-level learner",
  "f(x) = 3x + 7",
  "The plan was simple. The plan worked.",
  "A complete sentence that uses the vocabulary word correctly",
  "Open response. A strong answer states a claim",
];

for (const term of required) {
  if (!html.toLowerCase().includes(term.toLowerCase())) {
    throw new Error(`Grade 12 Art worksheet is missing required quality signal: ${term}`);
  }
}

for (const term of forbidden) {
  if (html.includes(term)) {
    throw new Error(`Grade 12 Art worksheet contains known low-quality pattern: ${term}`);
  }
}

const output = path.join(os.tmpdir(), "paperstride-grade12-art-quality-check.html");
fs.writeFileSync(output, html);

const catchingUpInput = {
  childName: "Mia",
  grade: "Grade 6",
  age: 11,
  interests: "Gaming",
  strugglingWith: ["Reading", "Fractions"],
  subjectFocus: "balanced",
  goal: "catching-up",
  timeAvailable: 40,
};
const catchingUpPlan = createBlueprint(catchingUpInput);
const reading = catchingUpPlan.sections.find((section) => section.subject === "Reading Comprehension");
const math = catchingUpPlan.sections.find((section) => section.subject === "Math Reasoning");

if (catchingUpPlan.challengeLevel !== "gentle") {
  throw new Error("Catching-up plans must use a gentle challenge profile.");
}
if (!reading?.isWeakArea || !math?.isWeakArea) {
  throw new Error("Reported Reading and Fractions needs must mark the matching sections as weak areas.");
}
if (!reading.focus.includes("confidence-building") || !math.focus.includes("confidence-building")) {
  throw new Error("Catching-up weak areas must begin with explicit confidence-building scaffolding.");
}
if (!catchingUpPlan.motivationStrategy.includes("without labeling the learner by weakness")) {
  throw new Error("Motivation strategy must protect learner identity while targeting weak skills.");
}

const aheadPlan = createBlueprint({
  ...catchingUpInput,
  childName: "Kai",
  grade: "Grade 10",
  age: 15,
  interests: "Technology",
  strugglingWith: [],
  goal: "getting-ahead",
  timeAvailable: 60,
});
if (aheadPlan.challengeLevel !== "advanced") {
  throw new Error("Getting-ahead plans must use an advanced challenge profile.");
}
if (!aheadPlan.motivationStrategy.includes("authentic disciplinary problems")) {
  throw new Error("Older advanced learners must receive authentic, autonomy-supporting motivation.");
}

const technologyHtml = createWorksheet({
  childName: "Kai",
  grade: "Grade 10",
  age: 15,
  interests: "Gaming, Coding",
  strugglingWith: [],
  subjectFocus: "balanced",
  goal: "getting-ahead",
  timeAvailable: 60,
});
for (const term of ["algorithm", "latency", "trade-off", "controlled usability test", "39.7 percent"]) {
  if (!technologyHtml.toLowerCase().includes(term.toLowerCase())) {
    throw new Error(`Advanced technology worksheet is missing domain-quality signal: ${term}`);
  }
}
for (const term of ["A Gaming", "f(x) = 3x + 7", "Open response. A strong answer states a claim"]) {
  if (technologyHtml.includes(term)) {
    throw new Error(`Advanced technology worksheet contains low-quality pattern: ${term}`);
  }
}

const technologyOutput = path.join(os.tmpdir(), "paperstride-grade10-technology-quality-check.html");
fs.writeFileSync(technologyOutput, technologyHtml);

const sportsHtml = createWorksheet({
  childName: "Sam",
  grade: "Grade 11",
  age: 16,
  interests: "Soccer",
  strugglingWith: ["Statistics"],
  subjectFocus: "balanced",
  goal: "test-prep",
  timeAvailable: 40,
});
for (const term of ["periodization", "biomechanics", "recovery", "21.9 percent", "Coach's Decision"]) {
  if (!sportsHtml.toLowerCase().includes(term.toLowerCase())) {
    throw new Error(`Advanced Sports worksheet is missing domain-quality signal: ${term}`);
  }
}

const musicHtml = createWorksheet({
  childName: "Noor",
  grade: "Grade 12",
  age: 17,
  interests: "Music, Piano",
  strugglingWith: [],
  subjectFocus: "balanced",
  goal: "getting-ahead",
  timeAvailable: 60,
});
for (const term of ["syncopation", "timbre", "acoustics", "2 minutes 40 seconds", "Motif Lab"]) {
  if (!musicHtml.toLowerCase().includes(term.toLowerCase())) {
    throw new Error(`Advanced Music worksheet is missing domain-quality signal: ${term}`);
  }
}

for (const [label, worksheet] of [["Sports", sportsHtml], ["Music", musicHtml]]) {
  for (const term of ["Open response. A strong answer states a claim", "f(x) = 3x + 7"]) {
    if (worksheet.includes(term)) {
      throw new Error(`${label} worksheet contains low-quality pattern: ${term}`);
    }
  }
}

const sportsOutput = path.join(os.tmpdir(), "paperstride-grade11-sports-quality-check.html");
const musicOutput = path.join(os.tmpdir(), "paperstride-grade12-music-quality-check.html");
fs.writeFileSync(sportsOutput, sportsHtml);
fs.writeFileSync(musicOutput, musicHtml);

const cookingHtml = createWorksheet({
  childName: "Ari",
  grade: "College",
  age: 20,
  interests: "Cooking, Baking",
  strugglingWith: [],
  subjectFocus: "balanced",
  goal: "getting-ahead",
  timeAvailable: 60,
});
for (const term of ["emulsion", "fermentation", "sensory", "1,500 grams", "Test Kitchen Decision"]) {
  if (!cookingHtml.toLowerCase().includes(term.toLowerCase())) {
    throw new Error(`Advanced Cooking worksheet is missing domain-quality signal: ${term}`);
  }
}

const natureHtml = createWorksheet({
  childName: "Ivy",
  grade: "Grade 11",
  age: 16,
  interests: "Nature, Ocean Life",
  strugglingWith: ["Statistics"],
  subjectFocus: "balanced",
  goal: "test-prep",
  timeAvailable: 40,
});
for (const term of ["biodiversity", "indicator species", "sampling", "70.8 percent", "Field Team Decision"]) {
  if (!natureHtml.toLowerCase().includes(term.toLowerCase())) {
    throw new Error(`Advanced Nature worksheet is missing domain-quality signal: ${term}`);
  }
}

const youngCookingHtml = createWorksheet({
  childName: "Mia",
  grade: "Grade 3",
  age: 8,
  interests: "Cooking",
  strugglingWith: ["Reading", "Multiplication"],
  subjectFocus: "balanced",
  goal: "catching-up",
  timeAvailable: 20,
});
for (const term of ["tiny test kitchen", "24 strawberry pieces", "lemon juice", "recipe card"]) {
  if (!youngCookingHtml.toLowerCase().includes(term.toLowerCase())) {
    throw new Error(`Elementary Cooking worksheet is missing age-appropriate signal: ${term}`);
  }
}

const youngNatureHtml = createWorksheet({
  childName: "Leo",
  grade: "Grade 4",
  age: 9,
  interests: "Animals, Nature",
  strugglingWith: [],
  subjectFocus: "balanced",
  goal: "general",
  timeAvailable: 40,
});
for (const term of ["backyard field team", "tally chart", "shady and damp", "leave the habitat"]) {
  if (!youngNatureHtml.toLowerCase().includes(term.toLowerCase())) {
    throw new Error(`Elementary Nature worksheet is missing age-appropriate signal: ${term}`);
  }
}

for (const [label, worksheet] of [
  ["Cooking", cookingHtml],
  ["Nature", natureHtml],
  ["Young Cooking", youngCookingHtml],
  ["Young Nature", youngNatureHtml],
]) {
  if (worksheet.includes("Open response. A strong answer states a claim")) {
    throw new Error(`${label} worksheet contains a generic answer placeholder.`);
  }
}

const cookingOutput = path.join(os.tmpdir(), "paperstride-college-cooking-quality-check.html");
const natureOutput = path.join(os.tmpdir(), "paperstride-grade11-nature-quality-check.html");
const youngCookingOutput = path.join(os.tmpdir(), "paperstride-grade3-cooking-quality-check.html");
const youngNatureOutput = path.join(os.tmpdir(), "paperstride-grade4-nature-quality-check.html");
fs.writeFileSync(cookingOutput, cookingHtml);
fs.writeFileSync(natureOutput, natureHtml);
fs.writeFileSync(youngCookingOutput, youngCookingHtml);
fs.writeFileSync(youngNatureOutput, youngNatureHtml);

const customSystemsHtml = createWorksheet({
  childName: "Dev",
  grade: "Grade 12",
  age: 17,
  interests: "Vintage Trains",
  strugglingWith: [],
  subjectFocus: "balanced",
  goal: "getting-ahead",
  timeAvailable: 60,
});
for (const term of ["systems team", "operating plan", "routes, patterns, costs", "$552 remains", "Real-World Brief"]) {
  if (!customSystemsHtml.toLowerCase().includes(term.toLowerCase())) {
    throw new Error(`Custom systems worksheet is missing interpreted-interest signal: ${term}`);
  }
}

const customPerformanceHtml = createWorksheet({
  childName: "Zoe",
  grade: "Grade 7",
  age: 12,
  interests: "Ballet",
  strugglingWith: ["Essays"],
  subjectFocus: "balanced",
  goal: "catching-up",
  timeAvailable: 40,
});
for (const term of ["performance company", "rehearsal plan", "audience"]) {
  if (!customPerformanceHtml.toLowerCase().includes(term.toLowerCase())) {
    throw new Error(`Custom performance worksheet is missing interpreted-interest signal: ${term}`);
  }
}
const customPerformancePlan = createBlueprint({
  childName: "Zoe",
  grade: "Grade 7",
  age: 12,
  interests: "Ballet",
  strugglingWith: ["Essays"],
  subjectFocus: "balanced",
  goal: "catching-up",
  timeAvailable: 40,
});
if (!customPerformancePlan.sections.find((section) => section.subject === "Grammar and Writing")?.focus.includes("confidence-building")) {
  throw new Error("Custom performance catching-up plan is missing confidence-building writing scaffolding.");
}

for (const [label, worksheet] of [["Custom Systems", customSystemsHtml], ["Custom Performance", customPerformanceHtml]]) {
  for (const term of ["evidence board", "A Vintage Trains", "Open response. A strong answer states a claim"]) {
    if (worksheet.includes(term)) {
      throw new Error(`${label} worksheet contains old generic fallback pattern: ${term}`);
    }
  }
}

fs.writeFileSync(path.join(os.tmpdir(), "paperstride-grade12-custom-trains-quality-check.html"), customSystemsHtml);
fs.writeFileSync(path.join(os.tmpdir(), "paperstride-grade7-custom-ballet-quality-check.html"), customPerformanceHtml);

const mathFocusInput = {
  childName: "Max",
  grade: "Grade 6",
  age: 11,
  interests: "Robots",
  strugglingWith: ["Fractions"],
  subjectFocus: "math-only",
  goal: "general",
  timeAvailable: 40,
};
const mathFocusPlan = createBlueprint(mathFocusInput);
const mathFocusSubjects = new Set(mathFocusPlan.sections.map((section) => section.subject));
if (mathFocusSubjects.has("Grammar and Writing") || mathFocusSubjects.has("Science Investigation")) {
  throw new Error("Math Focus plan contains unrelated writing or science sections.");
}
if ((mathFocusPlan.sections.find((section) => section.subject === "Math Reasoning")?.questionCount ?? 0) < 8) {
  throw new Error("Math Focus plan does not allocate enough math practice.");
}

const readingFocusPlan = createBlueprint({
  ...mathFocusInput,
  childName: "Rae",
  interests: "Books",
  strugglingWith: ["Reading"],
  subjectFocus: "reading-only",
});
const readingFocusSubjects = new Set(readingFocusPlan.sections.map((section) => section.subject));
if (readingFocusSubjects.has("Math Reasoning") || !readingFocusSubjects.has("Grammar and Writing")) {
  throw new Error("Reading Focus plan does not produce a reading-and-writing-only mix.");
}

const pacingHtml = createWorksheet({
  ...mathFocusInput,
  subjectFocus: "balanced",
  grade: "Grade 10",
  age: 15,
  interests: "Art",
});
for (const term of ["write--compact", "write--extended", "repeating-linear-gradient"]) {
  if (!pacingHtml.includes(term)) {
    throw new Error(`Printable response-space pacing is missing: ${term}`);
  }
}
console.log(`Quality checks passed for Art, Technology, Sports, Music, Cooking, Nature, and elementary interest pathways.`);
