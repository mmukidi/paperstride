# PaperStride Performance Notes

Last updated: June 7, 2026

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

## Watch Next

- Add lightweight request timing logs for blueprint, passage, section, fallback,
  and final assembly stages.
- Add a simple queue or generation lock before opening to more users.
- Test the single-model experiment (`LLM_PASSAGE_MODEL=llama3.2:3b`) against
  worksheet quality, especially for older grades.
