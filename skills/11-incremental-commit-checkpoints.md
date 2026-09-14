# Checkpoint every feature: typecheck, build, verify, commit, push

## The rule

Don't let uncommitted work accumulate across many unrelated features. At
the boundary of each logically complete feature — not each file edit, but
each "this is now a working, demonstrable thing" — run the same fixed
sequence, in this order, and don't skip a step because the previous one
passed:

1. `npx tsc --noEmit` (or the project's typecheck script). Fast, catches a
   whole class of mistakes before you spend time on anything slower.
2. `npm run build`. Catches bundler-level issues typecheck alone won't
   (asset resolution, code that's type-correct but fails to bundle).
3. Drive the actual feature (see `04-browser-verification.md`). Do this
   *after* build succeeds, not instead of it, and not before it — a build
   failure means the manual test is pointless.
4. `git status --short` and read every line. Confirm nothing unexpected is
   staged (stray scratch files, credential files, `node_modules`) and
   nothing you meant to include is missing.
5. Commit with a message that states *why* the change exists and what
   problem it solves — not a restatement of the diff. The next reader
   (possibly a less capable model, possibly you next week) should understand
   the reasoning without re-deriving it from the code.
6. Push. Don't let more than one feature's worth of work sit unpushed —
   if the session ends or the environment is reclaimed, uncommitted work
   is gone.

Do this *per feature*, not once at the end of a long session. A single giant
commit spanning ten unrelated features is much harder to review, to bisect
if something breaks, and to explain.

## Worked example from this project

Across one long session, more than a dozen distinct features were added
(rateio engine, SAC/Price amortization, forensic audit module, learned
categorization rules, PDF report export, multi-party leases, taxable-income
report, DSS report, tiered late fees, double-entry ledger, Pluggy
integration). Each one went through the full sequence independently —
typecheck, build, Playwright click-through with a screenshot actually
inspected, `git status --short` read line by line, then a commit whose
message explained the *reason* (e.g. "Baseado na análise de um contrato
real de locação estudantil..." — grounding the change in the actual
uploaded document that motivated it, not just listing the files touched),
then a push.

This meant that when a bug was found (the SQL parameter-count mismatch),
it was isolated to a single, recently-pushed, narrowly-scoped commit — not
buried inside a multi-feature diff where finding which change caused it
would have taken much longer. It also meant the working tree was never more
than one feature away from a pushed, recoverable state, which mattered
because the session's environment is ephemeral and reclaimed after
inactivity — uncommitted work doesn't survive that.

## Anti-pattern to recognize

Reaching the end of a session with `git status` showing changes across many
unrelated features that were never individually committed. If you can't
describe, in one sentence per commit, what each pushed commit *is* without
looking at the diff, they weren't checkpointed at the right granularity.
