# Skill library — index

Fourteen short files, each one discipline this project actually needed, each
with one worked example pulled from real events in this repo's history —
not hypotheticals. Read them once, fully, before your first session on this
codebase. After that, treat this index as the map: when you're about to do
something risky (touch the schema, integrate an unfamiliar API, ship a
"detector," decide something for the user that isn't yours to decide),
re-read the one file that covers it.

None of these are specific to accounting software. They're specific to
*working carefully in a fast-moving codebase where correctness is checkable
and mistakes are cheap to prevent but expensive to find later.* That
describes most real engineering work, which is why they're written to
generalize past this one repo.

## Ranked by quality bought per token spent

Ranking logic: cheap-to-apply + high-frequency + prevents-a-concrete-cost
ranks above expensive-to-apply or rarely-triggered, even when the rarely
triggered one guards something important. Read top-down; the top few pay for
themselves almost every session, the bottom few pay for themselves big on
the rare session where they're the thing that matters.

1. **[04-browser-verification](04-browser-verification.md)** — Read this
   one first. One sentence of rule ("screenshot it and actually look"),
   triggers on nearly every task involving a running app, and directly
   caught a real shipped bug (`column index out of range`) that a clean
   typecheck and build both missed. Highest value per word in this library.

2. **[08-secrets-hygiene](08-secrets-hygiene.md)** — Zero judgment required,
   unconditional, and the failure mode it prevents (leaking or reusing a
   credential) is the one category of mistake here that can't be walked
   back with a follow-up edit. Cheap to read, cheap to apply, catastrophic
   to skip.

3. **[10-process-and-cwd-hygiene](10-process-and-cwd-hygiene.md)** — Two
   free commands (`pwd`, `ps aux`) prevent a recurring, silly, time-costing
   class of error. Almost pure signal, no nuance to misapply.

4. **[02-verify-apis-before-coding](02-verify-apis-before-coding.md)** — One
   `npm install` + `grep` habit that would have prevented a wrong-signature
   call going straight into working code. Triggers every time you touch an
   unfamiliar package, which in a growing project is often.

5. **[03-additive-schema-migrations](03-additive-schema-migrations.md)** —
   Narrower trigger (only schema-touching work) but the payoff is large and
   the rule is completely mechanical: add columns with defaults, validate
   the file alone before writing app code against it.

6. **[06-plant-known-answers-in-test-data](06-plant-known-answers-in-test-data.md)**
   — Cheap technique with a sharp edge: without it, a broken detector and a
   correct one are indistinguishable from the outside. Narrower scope
   (features that "find" things) but decisive when it applies.

7. **[12-task-tracking](12-task-tracking.md)** — Nearly free, keeps a long
   multi-part session from losing or duplicating work. General-purpose
   process hygiene rather than a specific bug-preventer, which is why it
   sits mid-table despite broad applicability.

8. **[11-incremental-commit-checkpoints](11-incremental-commit-checkpoints.md)**
   — The fixed sequence (typecheck → build → verify → commit → push) is
   cheap per use and compounds: it's what made the bug in #1 isolable to one
   small commit instead of buried in a mega-diff.

9. **[05-debug-with-live-stack-traces](05-debug-with-live-stack-traces.md)**
   — High value exactly when it fires (isolated repro fighting the
   tooling instead of testing your bug), but that's a specific enough
   situation that it doesn't come up every session.

10. **[07-reuse-the-pipeline](07-reuse-the-pipeline.md)** — Real
    architectural leverage (avoids maintaining two copies of logic forever),
    but applying it well requires judgment about what counts as "the same
    shape" — more expensive to internalize than the mechanical rules above it.

11. **[01-scoping-ambiguous-requests](01-scoping-ambiguous-requests.md)** —
    Large payoff when a big vague request lands, but that's a once-per-project
    (or once-per-major-phase) trigger, not a per-task one.

12. **[14-audit-against-reference-material](14-audit-against-reference-material.md)**
    — Turns "improve this" into a checkable list instead of a wishlist;
    valuable but requires real reading effort (a whole document, a whole
    competitor list) each time it's invoked.

13. **[13-calibrate-autonomy](13-calibrate-autonomy.md)** — Important and
    genuinely hard to make fully mechanical — "is this reversible" is a
    judgment call every time, which is inherently more expensive to apply
    correctly than a checklist, even though the write-up itself is short.

14. **[09-domain-correctness](09-domain-correctness.md)** — The narrowest
    trigger condition (financial/legal-adjacent calculations specifically),
    but on the sessions where it applies, it's close to the whole ballgame.
    Ranked last only because most sessions in most codebases never hit it —
    in *this* codebase, treat it as much higher priority than #14 suggests.

## One-line versions, if you only have room for the summary

1. Screenshot it and look. 2. Never echo a secret. 3. `pwd` before you trust
your location. 4. Check the real types before calling a method. 5. Add
columns with defaults, validate the schema file alone first. 6. Plant a
known bug to prove your detector finds bugs. 7. Write the plan down before
you start. 8. Typecheck, build, verify, commit, push — every feature, in
that order. 9. When your test harness fights you, go read the real stack
trace instead. 10. New data source, same shape, same pipeline. 11. Report
the plan in five bullets before writing five hundred lines. 12. Read the
whole reference document before claiming a gap. 13. Build the option,
don't spend the user's money or trust for them. 14. If a court might read
the number, write the formula yourself and say when it's valid.
