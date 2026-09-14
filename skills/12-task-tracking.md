# Externalize the plan before you start, update it as you go

## The rule

The moment a request will take more than about three distinct steps, write
those steps down as an explicit task list *before* doing any of them —
don't carry the plan only in your own reasoning. Then:

1. Create one task per meaningfully distinct piece of work, named as an
   outcome ("Build the rateio engine"), not an activity ("Work on rateio").
2. Mark a task in-progress *before* you start it, not after — this is what
   makes the list an accurate live status rather than a retroactive log.
3. Mark it completed only when it's actually done (typechecked, built,
   verified — see `04-browser-verification.md`), not when you've mostly
   finished or intend to come back to it. An honest "still in progress" is
   more useful than a false "completed."
4. When new work is discovered mid-task (a gap found while reading a
   document, a follow-up the user asks for), add new tasks immediately
   rather than doing the work invisibly. This keeps the list a true
   reflection of everything that happened.
5. When a large request arrives in multiple parts across a long
   conversation, re-create the task list at each new part rather than
   trying to extend a mental model of "everything so far" — the list itself
   is the memory; don't rely on remembering what you didn't write down.

Why this matters more than it looks like it should: in a long session with
many independent sub-features, it is very easy to lose track of what's
actually finished versus what merely got discussed, and to either duplicate
work or silently drop something the user asked for. An explicit,
continuously-updated list is what prevents both failure modes, and it also
gives the person you're working for visibility into progress without them
having to ask.

## Worked example from this project

The session accumulated over 40 tracked tasks across several rounds of
work: the original architecture scaffold (schema, parsers, categorization,
DRE — 7 tasks), the full web app build-out (8 tasks), a self-directed audit
that produced 5 more tasks (rateio, amortization, forensic audit, learned
rules, PDF export), then a round driven by a real uploaded contract that
produced 7 more (multi-party leases, income-tax split, DSS report, tiered
late fees, ledger, backend, frontend widget, chart-of-accounts additions).

Each round started by creating the new tasks explicitly before writing any
code, each task was flipped to in-progress right before starting it and to
completed right after verifying it (not before), and — critically — when a
task's scope turned out to require another task first (the inadimplência
recalculation needed the new schema columns, which needed the schema
migration done and validated first), that dependency was made an explicit
new task rather than silently reordering work in a way only visible in the
diff.

## Anti-pattern to recognize

Doing five distinct pieces of work and only mentioning them in a final
prose summary, with no task ever having existed as a trackable unit along
the way. If the task list doesn't match what actually got built, it wasn't
being used as a plan — it was decoration.
