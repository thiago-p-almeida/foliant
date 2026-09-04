---
name: skeptical-review
description: "Before declaring a task/fase in this project done, run the checklist that has repeatedly caught real bugs here: does the ACTUAL production code path run against the ACTUAL case that motivated the request (not a research script, not an assumed code path)? Does inspecting real output confirm the claim, or was the claim assumed? Are adjacent 'not a regression'/'already correct' notes from earlier in the same task still true once checked with real evidence, not just repeated? Use before closing out any fix, calibration, or doc-clarity check in this repo — especially right before writing the closing paragraph of a TASKS.md entry. Do NOT use for trivial one-line changes with no real-data dependency."
---

# Skeptical review — closing checklist

This project's task log contains multiple real instances of a
confident, tested fix turning out to be incomplete or wrong once
checked against real evidence — and the log records the correction
openly rather than hiding it (see `TRACE.md` for the fullest example:
Fase 4.4, where a fix calibrated and validated against the OCR code
path turned out to never run for the book that motivated the request,
because that book used the native-text path instead). This skill is
the checklist that catches that class of error before a task is marked
closed, not after a user reports it.

## The checklist

**1. Did you validate against the real production code path, or a
stand-in for it?** A research/calibration script that renders+OCRs a
page manually, or that calls an isolated function, can pass while the
actual pipeline entry point (`extrair_texto_pagina`, or whatever the
real caller is) takes a completely different branch for the real input
file. Before closing, run the actual command a user would run
(`python3 foliant.py ...`, the actual CLI/binary) against the actual
file that motivated the request — not a synthetic stand-in — and
confirm the code you just wrote is the code that executed.

**2. Did you inspect real output, or trust a metric that could be
lying?** Exit code 0 and "no crash" are not evidence of correctness.
This project has caught real bugs by diffing actual generated HTML
byte-for-byte, grepping real output for expected markers, and visually
inspecting real pages — not by trusting a summary log. When a
measurement tool itself is suspect (e.g., a memory metric that reads
the wrong process in a forked binary), say so and find an independent
way to confirm the number, don't report it uncritically.

**3. Before repeating an earlier "not a regression" or "already
correct" note, re-derive it — don't just carry it forward.** If an
earlier pass in the same task labeled something neutral or fine, and
you're about to reference or extend that area, spend one extra check
confirming it's still true with real evidence (a byte-level diff, a
fresh read of the current file) rather than assuming your own earlier
note was right. This project found a real regression this way — a line
in `TASKS.md` that said "not a regression" turned out to be wrong once
actually diffed.

**4. If you're touching documentation while checking something else,
glance at nearby sections for staleness.** A stale paragraph sitting
right next to a just-corrected one (e.g., an old claim like "no native
PDF exists in this project" surviving next to the section that just
disproved it) is easy to miss if you only reread the section you were
asked about. This isn't scope creep — it's the same "verify, don't
assume the doc is already right" discipline applied one level up.

**5. Write the residual risk down, even if the task passed.** A closed
task with a stated residual risk (what wasn't tested, what could break
it) is more valuable — and more honest — than a closed task that reads
as fully proven. See [[implementation-planner]] for the calibration
side of this same discipline.

## When this has mattered in this project

- Fase 4.4: a fix calibrated only against the OCR code path was found,
  by running the real pipeline, to never execute for the book that
  motivated the request (native-text PDF, not OCR).
- Same fase, closing check: a "not a regression" note about
  bibliographic list indentation was re-checked with a real byte-diff
  and found to be an actual regression.
- Same fase, closing check: a stale claim in `ARCHITECTURE.md` ("no
  native PDF exists in this project") was caught while checking
  something unrelated (doc clarity), not by a dedicated audit pass.
