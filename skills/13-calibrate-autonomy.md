# Build the code for a consequential decision; don't make the decision

## The rule

Not all uncertainty should be resolved the same way. Split it into two
categories and treat them differently:

- **Reversible, local, doesn't change anyone's cost or exposure**: pick the
  most sensible default yourself, state it plainly, and keep moving. Asking
  here just slows things down for no benefit (see
  `01-scoping-ambiguous-requests.md`).
- **Consequential, hard to reverse, or changes what the user is exposed to**
  (ongoing cost, a privacy/security trade-off, where something gets hosted,
  giving up a guarantee you previously made): do the preparatory work — even
  all of it — but do not make the actual choice for them. Build the thing so
  the decision is theirs to make in one click, and say exactly what the
  trade-off is.

The test for which bucket something is in: *if you guessed wrong, would
fixing it cost the user money, exposure, or a broken promise you made
earlier — or would it just cost you a follow-up edit?* The former needs
their sign-off; the latter doesn't.

When you're in the second bucket, don't ask a vague "what do you want to do"
— that pushes the analysis back onto them. Do the analysis, state the
options and their real consequences in concrete terms, build whatever is
buildable without the decision, and name the specific open question.

## Worked example from this project

The app's core design promise, stated repeatedly to the user, was "nothing
leaves your browser" — a deliberate privacy property, chosen because the
data involved (years of personal bank statements) was sensitive and the
context was a legal proceeding. Two moments tested this:

**Open Finance integration, first mention.** Asked in the abstract "how
would you connect this to my actual bank," the honest answer required
naming a real trade-off: direct Open Finance Brasil certification is
infeasible for an individual (requires FAPI/mTLS institutional registration
with the Central Bank), but a certified aggregator (Pluggy) is reachable —
at the cost of the "nothing leaves your browser" guarantee, since data would
then transit a third party. That trade-off was stated, and *nothing was
built* until the user made an active choice (creating a Pluggy account
themselves).

**Same integration, after the user acted.** Once the user had created a
Pluggy account, the calculus changed — they'd made the decision. What
remained genuinely undecided was *where the required backend would run*
(their own choice of Render/Railway/Fly/a VPS/etc., each with different cost
and operational implications). The backend was built in full — routes,
normalization logic, verified against the real SDK, boot-tested — precisely
because writing the code doesn't commit anyone to a hosting bill or a
platform. But no hosting provider was chosen, no deployment was made, and
the README states explicitly: "Nenhum foi escolhido por você ainda; isto é
só o código, pronto para subir onde você decidir." Building the artifact and
choosing its home were kept as two separate acts, and only the second one
was left to the user.

## Anti-pattern to recognize

Silently picking a paid hosting provider, silently changing a previously
stated privacy/security guarantee, or silently spending the user's money or
credentials on their behalf because "it seemed like the obvious next step."
If reversing your choice would cost the user something beyond your own next
edit, it wasn't yours to make alone.
