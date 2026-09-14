# When output could become evidence, implement the formula yourself and say when it applies

## The rule

Most application code can lean on a well-chosen dependency without a second
thought. A different standard applies when the code computes a number that a
professional (an accountant, a lawyer, a court) might later rely on as fact:
interest schedules, statutory penalties, statistical tests used to allege
irregularity. For that category:

1. **Implement the formula yourself, transparently**, rather than pulling in
   an opaque or lightly-maintained package. A twenty-line function you wrote
   and can point to is auditable; a black-box dependency is not — and for
   anything that might be scrutinized in a legal or financial context, the
   person relying on it needs to be able to see exactly what was computed
   and how, not just that "a library did it."
2. **Cite the exact rule you're implementing** in a comment — the contract
   clause, the named amortization method, the statistical test — so a domain
   expert reviewing the code can check it against the source, not just
   against your prose description of it.
3. **State the technique's validity conditions in the UI, not just in a
   code comment.** A correct statistical test applied outside its valid
   conditions produces a confident-looking wrong answer. If the person using
   the output can't tell the difference, you haven't finished the feature.
4. **Never present a computed number as a conclusion.** Label it as what it
   is — an indicator, a divergence, a candidate for review — and say what a
   human should do with it (check it against the source document).

## Worked example from this project

Two cases from the same project, same standard applied differently:

**Amortization schedules.** A contract-divergence detector needed a
theoretical SAC/Price loan schedule to compare against actual transactions
(to flag possible improper interest compounding — *anatocismo*). Rather than
using one of the handful of npm loan-amortization packages found by name,
SAC and Price were implemented directly (`gerarCronogramaSAC`,
`gerarCronogramaPrice` — each under twenty lines, straight from the standard
formulas) with a comment naming the method and noting explicitly that this
is "sem juros sobre juros" (no compounding), which is the whole point of the
comparison. The alternative — an unfamiliar dependency computing "the
schedule" as a black box — would have made the divergence numbers
unverifiable by exactly the audience (an accountant, a court) who'd need to
trust them.

**Benford's Law.** A forensic-audit screen applies Benford's first-digit
test to flag anomalous transaction amounts. Benford's Law is only a
meaningful signal when the tested values span multiple orders of magnitude;
applied to a narrow band of similar amounts, *any* dataset — honest or
not — will show "deviation" that means nothing. Two things were done about
this: the test was restricted in code to variable-value expense categories
only, explicitly excluding fixed-value categories like rent or loan
payments (`// NÃO aplique a aluguel ou financiamento, cujo valor é fixado em
contrato`); and the UI itself carries a visible caveat explaining that a
demo dataset confined to a narrow value range will show deviation "and this
does not indicate anything wrong" — so a reader can't mistake the demo's
own artifact for a real finding.

## Anti-pattern to recognize

Importing a package to compute something a court or accountant might later
ask "how exactly was this calculated" about, and not being able to answer
from the code itself. If you can't explain the formula in one sentence
pointing at your own code, don't ship it as evidence-adjacent output.
