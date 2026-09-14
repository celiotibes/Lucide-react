# "Make it better" means diff against a named reference, not brainstorm

## The rule

When asked to improve, audit, or find gaps in something you built, resist
the pull toward generic brainstorming ("here are some things that might be
nice to add"). That produces a wishlist with no grounding in what actually
matters. Instead:

1. **Insist on a concrete reference** — a competing product, a named
   standard, a real document the user provides. If the user's request
   already names one (a list of commercial tools, an uploaded contract),
   use exactly that; if they haven't, ask what the comparison point is
   rather than inventing one.
2. **Read the reference completely before writing anything.** For a
   document, that means every page/clause, not a skim for keywords. Extract
   concrete, specific facts — exact percentages, exact clause numbers,
   exact formulas, exact obligations — not paraphrased impressions.
3. **Build a literal gap table**: one row per capability the reference has,
   with columns for "does the current system have this / partially / not at
   all" and "what specifically is missing." This structure is what turns
   "improve the system" into a scoped, checkable list — and it's what forces
   you to notice the reference has capabilities you weren't already thinking
   about, instead of only confirming what you expected.
4. **Verify claims about the reference itself before trusting them**,
   especially if the reference material was itself AI-generated or
   secondhand (a pasted summary, a search result). Check whether named
   products/standards are real and do what's claimed before designing
   against them.
5. Prioritize the gap table by what's most consequential to the user's
   actual goal, not by what's most interesting to build. Say the priority
   order out loud before implementing.

## Worked example from this project

Two rounds of this in the same project:

**Round one** — the user pasted an AI-generated comparison of commercial
accounting tools and asked for an audit plus enrichment. Before building
anything, each named tool's claimed capability was checked against the
current system in an explicit table (multi-account reconciliation with
"learning," collective-expense cost-sharing, SAC/Price amortization with
usury/anatocismo detection, forensic-AI pattern detection, formal
double-entry ledgers). This surfaced concrete, previously-unplanned gaps —
the `rateios` table existed in the schema but nothing ever populated it; no
amortization schedule existed despite two real mortgages being part of the
user's stated situation. A web search was also used to confirm that
Open Finance Brasil's institutional-certification requirement was accurately
described, and that specific named products (a forensic-AI tool) were real
before treating claims about them as design input.

**Round two** — the user uploaded an actual 13-page lease contract. It was
read start to finish, not skimmed, and concrete facts were pulled out
verbatim: a monthly charge split exactly 55% rent / 45% cost-sharing across
nine named line items, a two-tier late fee (2% through day 5, replaced by
10% after), a semi-annual reconciliation report the contract *obligates* the
landlord to send tenants, multiple named tenants with joint liability on one
lease. Each of these became one row in a gap table against the existing
system, and each row became a task before any code was written. The 55/45
split, once implemented, was validated against the contract's own printed
number (R$1.120,50 rateio on a R$2.490 charge) rather than just checked for
plausibility.

## Anti-pattern to recognize

Responding to "make it better" with a list of features you thought of
yourself, with no named reference any of them trace back to, and no gap
table a reader could check your list against.
