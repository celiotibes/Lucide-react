# When an isolated repro fights the tooling, stop isolating and read the live trace

## The rule

Your first instinct when a bug appears should be to reproduce it in the
smallest possible harness (a standalone script, outside the app). This is
usually right. But some bugs only exist *because* of how the app's bundler
wires things together — special import syntax, virtual modules, WASM asset
loading — and trying to replicate that wiring in a bare Node script wastes
time fighting tooling incompatibilities that have nothing to do with your
actual bug.

**Recognize the moment to switch strategies**: if your second attempt at an
isolated repro fails with an error about the *tooling* (`ERR_MODULE_NOT_FOUND`,
`Unknown file extension`, resolver errors) rather than an error about your
*logic*, you are no longer debugging your bug — you are debugging your test
harness. Stop. Go get the trace from the real running instance instead:

1. Attach a listener that captures the *full* stack, not just the message:
   `page.on('pageerror', (err) => erros.push(err.stack))` — `err.stack`
   includes file and line; `err.message` alone often doesn't.
2. Trigger the exact user action that causes the failure.
3. Print the captured stack. It will name the real file and line in your
   actual source (even through a dev-server source map), which is strictly
   more useful than a hand-rolled repro that almost matches production.
4. Fix at that exact location. Don't fix by pattern-matching a similar-looking
   spot — the stack trace already told you the precise line.

## Worked example from this project

A "column index out of range" SQL error appeared only when the seed
generator ran inside the browser app. The first instinct was to isolate it:
a standalone script (`tsx repro_seed.mts`) that imported the same
`gerarDadosSimulados` function and ran it against an in-memory `sql.js`
database outside the browser.

That repro hit two dead ends in a row, both tooling problems, not logic
problems:
- `ERR_MODULE_NOT_FOUND: Cannot find package 'sql.js'` — the script lived
  outside the project directory, so Node's resolver couldn't find
  `node_modules`. (Fixed by moving the script inside the repo — but this was
  a resolver issue, not the bug.)
- `Unknown file extension ".sql"` — the module under test imports
  `schema.sql` via Vite's `?raw` suffix, which only Vite's bundler knows how
  to handle. Plain `tsx` has no idea what to do with a `.sql` import and
  fails before your code even runs.

At that point the isolated-repro approach was abandoned — not because it was
a bad idea, but because it had stopped testing the actual bug and started
testing whether `tsx` could emulate Vite. The correction: go back to the
running browser app, click the same button that failed, and capture
`err.stack` from `page.on('pageerror', ...)`. That produced:

```
Error: column index out of range
    at ... executar (http://localhost:5173/src/db/connection.ts:52:6)
    at gerarDadosSimulados (http://localhost:5173/src/domain/seed/dadosSimulados.ts:105:3)
```

Line 105, read directly, showed the mismatched parameter count immediately.
Total time from "switch strategies" to "found the line": under a minute,
versus two more failed attempts at replicating Vite's module resolution by
hand.

## Anti-pattern to recognize

Spending a third attempt trying to make an isolated repro script work when
the first two failures were both about module resolution, not your actual
logic. That's the signal to go get the trace from the real environment.
