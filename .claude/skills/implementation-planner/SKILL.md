---
name: implementation-planner
description: "Structure work on a heuristic/calibrated-logic task (a threshold, a detection rule, a parsing decision) the way this project always has: investigate with real data before writing code, calibrate against real evidence with the actual numbers shown, validate end-to-end on production data (not a research script), and register the result in TASKS.md/ARCHITECTURE.md with residual risk stated explicitly. Use when a task in this repo involves picking or tuning a threshold, adding a new content-detection heuristic, or any change whose correctness can only be judged against real sample data rather than by reading the code. Do NOT use for pure refactors, dependency bumps, or changes with a single deterministic correct answer."
---

# Implementation planner

This is the meta-prompt structure this project's task log (`TASKS.md`,
`ARCHITECTURE.md`) has used consistently across every fase, from header
detection to line-merging. It is not generic project-planning advice —
it's specifically for tasks where the right answer is a **number or rule
calibrated against real data**, not a logical deduction from
requirements. Following it produces the same kind of trace already in
this repo: a decision with real evidence, not just a decision.

## The structure

**1. State the objective and the constraint before touching code.**
What should change, and what must NOT regress (e.g., RAM ceiling, byte
identity of unrelated output, an already-validated heuristic on another
book). Write this down — it becomes the acceptance criteria at the end.

**2. Investigate with real data before deciding the approach.**
Pull real samples of the phenomenon (page heights, line positions,
header strings — whatever the signal is) from the actual project data
(`samples/`), not synthetic or imagined examples. If no real example of
the target case exists in the project, say so explicitly rather than
inventing one — it becomes a documented risk (see step 5), not a silent
assumption.

**3. Calibrate the threshold/rule against the numbers just gathered,
and show the numbers.** Not "a reasonable value" — the actual measured
range for both the positive and negative case, with the margin between
them. If there's a case in the middle (an outlier, a decorative
element, a subtitle) that could break a naive rule, name it and design
the rule to survive it.

**4. Validate end-to-end against the real pipeline, at the scale
that exposes volume-only defects.** A calibration validated only on the
same small sample it was tuned against is not validated — this project
has repeatedly found that a rule tuned on ~80 pages silently breaks on a
~200+ page book with more structure (more chapters, more edge cases).
Run the actual production code path (not an isolated research script —
see [[skeptical-review]] for why that distinction matters), on the
full/large sample, and inspect actual output, not just exit code.

**5. Register the result with residual risk stated as a fact, not
hedged into vagueness.** In `TASKS.md`/`ARCHITECTURE.md` (templates in
`assets/`), write: what was validated, what was NOT validated (how many
books/pages, which code path), and a concrete scenario that could break
the calibration if it turns out to be wrong. "Calibrated against 2 real
books, not a general proof" is the level of specificity to aim for —
not "should generalize" or "seems robust."

## Anti-patterns this structure exists to prevent

- Picking a threshold that "looks right" without measuring the real
  positive/negative distribution.
- Validating only against the same narrow sample used for calibration.
- Declaring a heuristic done because the code runs without error,
  without inspecting actual output on real data.
- Writing "should generalize" instead of naming the untested case.

## Templates

`assets/ARCHITECTURE_template.md` and `assets/TASKS_template.md` mirror
the section structure this project already uses (state header,
objective, investigation with real numbers, decision + rationale,
validation table, limitations/residual risk). Use them as the starting
skeleton when writing up a new fase; don't invent a new format per task.
