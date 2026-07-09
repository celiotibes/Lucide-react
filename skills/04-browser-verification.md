# A green typecheck is not proof the feature works

## The rule

For any change that affects what a user sees or what data gets computed in a
running app, `tsc --noEmit` passing and `npm run build` succeeding tell you
the code is *well-typed*, not that it is *correct*. TypeScript cannot catch a
malformed SQL parameter list, a wrong sign convention, or a UI element that
never renders because a prop was misnamed. You have to actually run the app
and look.

Mechanical procedure, every time you change behavior (not just refactor):

1. Start (or confirm running) the dev server: `npm run dev -- --port 5173`,
   then `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/` to
   confirm it's actually serving (`200`) before writing a test script against
   it — a server that failed to bind still lets a script "run" against a
   stale port or nothing at all.
2. Drive the real page with Playwright: click the buttons a user would click,
   in the order they'd click them (load demo data *before* checking a report
   screen that depends on demo data existing).
3. Screenshot the result and **read the screenshot** — actually inspect the
   numbers, labels, and layout, not just check that the script exited 0.
4. Capture `page.on('pageerror', ...)` and `page.on('console', ...)` for
   `type === 'error'` on every run. A silent JS exception that Playwright
   didn't crash on is still a bug you shipped.
5. When you plant a known-answer test case (see
   `06-plant-known-answers-in-test-data.md`), confirm the screenshot shows
   *exactly* that case, not just "no errors."

## Worked example from this project

After building the simulated data generator, the app was clicked through
end-to-end. The dashboard loaded, but every KPI tile read **R$ 0** — not a
crash, not a console error visible at a glance, just quietly wrong numbers.

Only by looking at the screenshot (not just checking "did Playwright throw")
was this caught. Digging in with `page.on('pageerror', err => console.log(err.stack))`
surfaced the real error: `Error: column index out of range`, traced through
the stack to `dadosSimulados.ts:105`. The cause: an `INSERT` statement had
six `?` placeholders in the SQL string but a parameter array with seven
values (a leftover `financiado` value that was *also* hardcoded as a literal
`1` in the SQL text). TypeScript had no way to know this — parameter arrays
for raw SQL are just `(string | number | null)[]`, untyped against the query
string. The build was green throughout.

After the fix, the same click-through was repeated, and this time the
screenshot showed real numbers (10 imóveis, 39 contratos, R$ 205.562 receita)
— confirmed by reading the numbers, not just by the absence of a red error
banner.

## Anti-pattern to recognize

"The build passed, so I'm done" after touching a data-generation function,
a SQL query, or a component that renders computed values. If you didn't open
a screenshot or read rendered text after the change, you don't know it works
— you know it compiles.
