# PaperStride Performance Notes

Last updated: June 8, 2026

Track performance changes here before committing or deploying. The goal is to
keep PaperStride free to run on Oracle Cloud Always Free while still generating
useful printable worksheets in a few seconds to under a minute depending on
model warmth and worksheet depth.

## Current Reasons Generation Is Faster

- The preview blueprint uses the fast local model (`llama3.2:3b`) and is cached
  for repeated inputs.
- The worksheet generation path is compressed from many subject-by-subject calls
  into a passage bundle plus one batched section call when AI is available.
- Deterministic fallback banks fill gaps immediately instead of retrying weak or
  missing AI output until the user times out.
- Reading passage generation is capped with a bounded quality attempt and one
  fast repair attempt, so malformed or too-short model output no longer holds
  the worksheet request for several minutes.
- Ollama is called through native `/api/chat`, which allows request-level
  `keep_alive`, `num_thread`, and `num_ctx` tuning.
- `keep_alive: -1` keeps models resident in RAM, avoiding reloads between the
  7B passage model and the 3B structured-output model.
- `num_thread: 4` uses the full Oracle A1 Always Free CPU allocation for one
  active generation.
- `num_ctx: 4096` keeps the context window bounded, reducing memory and prefill
  work.
- The chart/data interpretation section was removed from the generated worksheet
  surface, reducing output size and avoiding an extra content burden.
- The homepage hero image was converted from a large PNG to a small WebP asset,
  improving first-page load without affecting worksheet quality.

## June 7, 2026 Update

- History fallback generation is now grade-aware without adding more model
  calls. This improves quality while preserving speed.
- The Fun Zone/Extension Challenge section now varies per generation locally,
  so repeated worksheets no longer reuse the exact same puzzle logic.
- High school, college, and Master's history worksheets now use advanced
  source-analysis challenge cards instead of child-style fun puzzles.
- Repeated fallback reading passages now receive a per-generation scenario key,
  so fallback mode varies the story, details, and reasoning angle without adding
  model calls.
- Books/reading interests now use literature-centered fallback passages,
  vocabulary, section plans, and book-themed math, which improves relevance
  while preserving the same fast fallback path.
- Movies/media interests now use film-analysis fallback passages, media
  vocabulary, matching reading answers, and media-themed math without adding
  model calls.
- Generic high-school fallback questions now reference the generated scenario
  instead of old coach/basketball/technology examples.

## June 8, 2026 Update

- Fixed the production fallback root cause where `OLLAMA_KEEP_ALIVE=-1` was sent
  as a string and rejected by Ollama's native API.
- Added a fast passage repair path after thin AI passage output. This keeps the
  generation path AI-authored when possible, while still preserving deterministic
  fallback as the final safety net.
- Reduced the default passage wait ceiling from five minutes to a bounded
  production-friendly attempt plus repair sequence, improving worst-case latency
  for families generating worksheets.
- Updated Oracle Compose defaults so blueprint, passage, and worksheet
  generation use `llama3.2:3b` on the Always Free CPU. The 7B model can still be
  selected explicitly, but it is no longer the default production path for
  student-facing generation.
- Set Oracle worksheet generation to the dynamic deterministic engine by default
  (`WORKSHEET_AI_ENABLED=false`) after live smoke tests showed CPU-only model
  calls can still exceed a student-friendly wait. This preserves fast, printable,
  varied worksheets while leaving AI-authored worksheet sections as an opt-in for
  stronger hardware.
- Reduced the production blueprint ceiling to 30 seconds; if local AI is busy,
  the app returns the deterministic expert plan instead of making the user wait.
- Reworked broad-interest deterministic reading passages to be longer and more
  varied by grade band, improving quality without adding model calls.

## Watch Next

- Add lightweight request timing logs for blueprint, section, fallback, and final
  assembly stages.
- Continue adding domain-quality pathways for emerging custom interests while
  preserving the no-latency deterministic fallback and its quality checks.
- Keep `OLLAMA_KEEP_ALIVE=-1` as a valid env value; the app parses numeric env
  strings to numbers before calling Ollama so models stay resident without
  triggering duration parsing errors.
- Add a simple queue or generation lock before opening to more users.
- Continue comparing fast-model passage quality for older grades against the 7B
  override on stronger hardware.
