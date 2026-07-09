# Scoping an ambiguous, oversized request

## The rule

When a request is huge and underspecified ("build me an accounting system"),
do not start writing application code as the first action. Do this instead,
in order:

1. **Separate "what" from "how."** Produce a short strategic/comparative
   document first (what exists, what's missing, what's recommended) before
   any implementation. This forces you to state assumptions in prose, where
   they're cheap to correct, instead of in code, where they're expensive to
   unwind.
2. **Identify the 2-4 genuine forks** — decisions where two reasonable people
   would choose differently and the choice changes what you build (which
   repo/directory, which deliverable first, whether to wire real external
   APIs you don't have credentials for). Ask about *those specifically*, not
   about the whole task.
3. **If the question tool is unavailable or fails** (e.g. non-interactive
   session), do not block. Pick the most conservative, most reversible
   default for each fork, state the default and its reasoning in your
   response, and proceed. "Conservative" means: the option that's easiest to
   change later and least likely to touch something you don't own.
4. **Build the smallest complete slice**, not the whole imagined system.
   Working end-to-end on a narrow slice (one import format, one report) beats
   half-working breadth across ten features.
5. Re-scope out loud whenever new information changes the picture (a
   follow-up message, an uploaded document) — see `14-audit-against-reference-material.md`.

## Worked example from this project

The opening request was a wall of text: build a system to reconstruct three
years of personal/business accounting mixed across six bank accounts, for use
in a legal proceeding, "using multiple AI provider APIs chosen by cost."

Before any code: an artifact was produced — a comparison of existing
commercial tools (ContaAzul, Domínio, Alterdata, Ábacus/Peritus) against the
specific requirements, with an explicit recommended architecture and a
prioritized build list. Only after that did implementation start, and it
started with the narrowest slice that was still end-to-end useful: SQLite
schema → OFX import → rule-based categorization → DRE report. Import formats,
forensic auditing, and the multi-LLM router were later additions, not part of
slice one.

The repo itself was ambiguous — the session was bound to a repo literally
named "Lucide-react" (an icon library) with no relation to accounting. Rather
than guessing, `AskUserQuestion` was called with three concrete options
(separate repo / subfolder of this repo / no code yet, just a report). The
tool call failed (`Tool permission stream closed before response received` —
a non-interactive session cannot answer prompts). Work did not stop: the
repo was inspected (`git log` showed one commit, an untouched Vite starter
template — safe to build into), and the most conservative default was taken
("build into this repo, since it's provably unused") with that reasoning
stated in the next response.

## Anti-pattern to recognize

Writing 500 lines of code before writing one paragraph of "here is what I
understood and here is what I'm building first" is a sign this skill was
skipped. If you can't summarize the plan in five bullet points, you don't
have a plan yet — you have momentum.
