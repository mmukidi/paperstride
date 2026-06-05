# QualitySheets MVP Plan

## Summary

Build a small but real cloud-deployable web app where an adult creates simple learner profiles, and students generate screen-free printable worksheets with answer keys. Version 1 focuses on Pre-K through Grade 8, math and reading, skill-based practice, quick personalization, printable challenges, and a free beta with minimal learner data.

## Key Changes

- Use a modern web app stack: Next.js, TypeScript, Tailwind or scoped CSS, Supabase for future auth/database/storage, and Vercel-style or self-hosted deployment.
- Adult-managed accounts: adults create learner profiles with nickname, grade, subject, skill level, interests, and challenge preference.
- Student learner view: simple flow to choose math or reading, pick a skill or goal, select an interest theme, and generate a worksheet.
- Worksheet generator: combine reliable templates with AI personalization.
- PDF output: generate printable worksheet PDFs with separate or combined answer keys.
- Motivation loop: add printable badges, challenge labels, progress paths, and optional completion tracking without requiring long screen sessions.

## Interfaces

- `POST /api/worksheets`: accepts learner profile, subject, skill, grade band, difficulty, interest theme, and worksheet length.
- `GET /api/worksheets/:id/pdf?mode=worksheet|answer-key|combined`: returns printable PDF output.
- Core data types: `AdultUser`, `LearnerProfile`, `Skill`, `WorksheetRequest`, `Worksheet`, `WorksheetItem`, `AnswerKey`, `Completion`.
- No payments in v1; free beta only.

## Test Plan

- Generate math worksheets for Pre-K, Grade 3, and Grade 8 with correct answer keys.
- Generate reading worksheets with age-appropriate passages, questions, and answers.
- Verify PDFs print cleanly on letter-size paper and remain usable without screen interaction.
- Test learner profile creation, worksheet generation, download, and optional completion tracking.
- Check guardrails: no sensitive learner data required, no open-ended student chat, and no inappropriate worksheet content.

## Assumptions

- English-only launch.
- Skill-based practice first, not state-standard alignment.
- Minimal data policy: nicknames instead of full student names, no student email accounts, and no detailed learning records in v1.
- Branding can use PaperStride for the public launch while QualitySheets remains the workspace/project folder.
