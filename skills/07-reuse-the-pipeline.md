# Normalize new data sources into the existing shape; don't fork the pipeline

## The rule

When you add a new way of getting data into the app (a new file format, a
new external API), your default plan should be: write one small function
that converts the new source into the *exact same shape* your existing
pipeline already consumes, then feed it through that pipeline unchanged. Do
not build a second preview screen, a second persistence path, or a second
review UI "because this source is a bit different." Sources differ; the
shape they're normalized to shouldn't.

Mechanical procedure:

1. Find the narrowest interface your existing pipeline already accepts (a
   type, a function signature) — not the full internal implementation, just
   the boundary type.
2. Write a pure normalization function: `newSourceThing -> ExistingShape`.
   Put all of the new source's quirks (field names, sign conventions, ID
   formats) inside this one function, and nowhere else.
3. Feed the normalized output into the *same* downstream functions and *same*
   UI components the existing sources use. If the existing UI needs one new
   label (e.g. a new entry in a "type of import" lookup table), add that —
   don't duplicate the component.
4. If the new source has genuinely extra information the old shape can't
   carry (e.g. a structured payer name, a boleto's digitizable line), extend
   the shared shape with an *optional* field, and make old sources leave it
   `undefined`. Don't create a parallel type.

This matters because every downstream consumer — preview rendering,
duplicate detection, persistence, categorization rules — was already written,
tested, and debugged once, against one shape. Forking the pipeline means
re-earning correctness for a second, parallel copy of all of that.

## Worked example from this project

The app already had a working import pipeline: `processarArquivo(file) ->
ResultadoImportacao { tipoDetectado, transacoes: TransacaoBruta[], avisos }`,
feeding a review table and a `persistirTransacoes()` call, all built for
file uploads (OFX/CSV/PDF/OCR).

Adding a live bank connection (Pluggy/Open Finance) was a *different kind* of
source — paginated API responses instead of files, a widget-driven
authorization flow instead of a file picker. The temptation would be to build
a separate "connected accounts" screen with its own preview table and its own
save button.

Instead, a single function did the normalization:

```ts
function normalizarTransacao(transacao: PluggyTransaction): TransacaoBruta {
  const valor = transacao.type === "DEBIT" ? -Math.abs(transacao.amount) : Math.abs(transacao.amount);
  return { data: ..., valor, descricaoOriginal: ..., fitid: transacao.id, documentoFonte: ... };
}
```

The `TransacaoBruta` type gained one new optional field
(`documentoFonte?: string`, to carry a boleto's digitizable line when
present — something files never had) rather than a parallel `PluggyBruta`
type. The UI addition (`ConectarPluggy.tsx`) does exactly one new thing —
call the backend, get accounts, get transactions — and then calls the exact
same `onImportado()` path that file uploads use, which pushes into the same
`arquivos` review array, rendered by the same table, saved by the same
`persistirTransacoes()`. The only UI change to existing code was adding one
label (`open_finance: "Open Finance (Pluggy)"`) to an existing lookup object.

## Anti-pattern to recognize

If adding a new data source means writing a second version of a review
table, a second "confirm import" button, or a second duplicate-detection
path, stop — you're forking logic that already works instead of feeding it.
