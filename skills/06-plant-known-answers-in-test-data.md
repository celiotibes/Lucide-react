# A detector that finds nothing on clean data is unverified, not correct

## The rule

If you build anything whose job is to *find* something — duplicates,
statistical outliers, contract divergences, anomalies — you cannot verify it
by running it on ordinary data and observing that it reports zero findings.
Zero findings is exactly what you'd also see from a detector that is
silently broken (wrong SQL join, inverted comparison, off-by-one threshold).
"Ran without crashing and found nothing" and "correctly determined there was
nothing to find" produce identical output. You cannot tell them apart from
the outside.

The fix: before trusting a detector, feed it a case where you already know
what the answer must be, and confirm it produces exactly that answer.

1. Inject a deliberate, clearly-labeled positive case into your test/demo
   data — a duplicate row, a value 20x the category average, a number you
   computed by hand to be wrong by a known amount.
2. Run the detector.
3. Confirm it reports *that specific case*, not just "something." Check the
   count, the identity of the flagged record, and — where relevant — the
   magnitude (does the reported deviation match what you engineered it to
   be?).
4. Only after that passes do you have evidence the detector works on real,
   unlabeled data too.
5. Leave the planted case in the demo dataset (clearly commented as
   deliberate) so the next person who touches the detector has a standing
   regression check, not just a one-time manual confirmation.

## Worked example from this project

Three detectors were built: duplicate-transaction detection, statistical
outlier detection (z-score per category), and an amortization-schedule
comparator that flags interest overcharges (a proxy for *anatocismo* /
improper compounding).

For each, a known-answer case was planted in the seed generator rather than
trusting a clean run:

- **Duplicates**: the same account, date, amount, and description were
  inserted twice on purpose (`PIX PORTARIA ED AURORA REFORCO`, R$540, same
  day, two separate `fitid`s so the import-time uniqueness constraint
  wouldn't silently merge them). Expected result: exactly 1 duplicate group,
  2 occurrences.
- **Outlier**: a `2.1.04` (service provider) transaction of R$8.900 was
  inserted into a category whose other ~70 entries average around R$600.
  Expected result: exactly 1 outlier, in that category, with a z-score
  clearly above the 3-sigma threshold.
- **Amortization divergence**: one of two simulated mortgages had its
  interest transactions generated at `theoretical_interest × 1.22` (22%
  above the real SAC schedule) instead of matching it exactly; the second
  mortgage was left accurate.

Running the app confirmed the *exact* planted numbers: the duplicates panel
showed "1" with 2 occurrences of that specific R$540 line; the outlier panel
showed the R$8.900 line with a z-score of 8.7; the financing screen showed
0 divergent months for the accurate mortgage and a flat 22.0% divergence on
every month of the inflated one. Only at that point were the detectors
considered verified — not when they first ran without an exception.

## Anti-pattern to recognize

Writing a detection function, running it once against whatever data happens
to be loaded, seeing an empty results table, and calling it done. Empty is
not evidence.
