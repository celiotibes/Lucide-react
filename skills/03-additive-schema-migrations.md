# Additive schema migrations, validated in isolation

## The rule

When a running app already has a database schema and real (even if
simulated) data flowing through it, never change a column's meaning or
remove a column to add a feature. Instead:

1. **Add new columns with `DEFAULT` values** that reproduce the old behavior
   exactly. Every row inserted by old code (which doesn't know the new
   column exists) must still be valid and semantically correct.
2. **Add new tables for new entities** (e.g. a one-to-many relationship)
   rather than overloading an existing column to mean two things.
3. **Validate the schema file by itself before touching application code.**
   Run it through the real engine in the smallest possible harness:
   ```bash
   python3 -c "
   import sqlite3
   con = sqlite3.connect(':memory:')
   con.executescript(open('schema.sql').read())
   print([r[0] for r in con.execute(\"SELECT name FROM sqlite_master WHERE type='table'\")])
   "
   ```
   This costs a second and catches syntax errors, typos in `REFERENCES`, and
   CHECK-constraint mistakes before you've written a single line of code that
   depends on the schema being right.
4. **After adding columns, re-run any code that inserts rows without listing
   every column explicitly**, and confirm it still produces correct values
   via the defaults — don't just confirm it doesn't error.
5. Write one sentence in the column's own SQL comment explaining what it
   means and what the default represents. The next reader (possibly you, in
   a different session) should not have to trace call sites to find out.

## Worked example from this project

`contratos_locacao` started with a single flat `multa_percentual` field. A
real uploaded contract showed a two-tier late-fee structure (2% up to day 5,
replaced — not added to — 10% after that), plus monetary correction and
conditional legal fees. Rather than repurposing `multa_percentual`, five new
columns were added, all with defaults that reproduce the old single-tier
behavior when unset:

```sql
multa_percentual REAL NOT NULL DEFAULT 2.0,          -- initial tier (until multa_ate_dias)
multa_ate_dias INTEGER NOT NULL DEFAULT 5,
multa_percentual_substitutiva REAL NOT NULL DEFAULT 10.0,
indice_correcao_mora TEXT ... DEFAULT 'ipca',
honorarios_percentual REAL NOT NULL DEFAULT 0,        -- 0 = feature inert unless configured
dias_gatilho_judicial INTEGER NOT NULL DEFAULT 9999,  -- effectively "never" unless configured
```

`honorarios_percentual DEFAULT 0` combined with `dias_gatilho_judicial
DEFAULT 9999` means every contract created by the existing seed generator —
which doesn't know these columns exist — automatically gets "no legal fees,
ever," which was the correct old behavior. This was verified by re-running
the seed generator and the demo app after the migration, not just assumed.

The same pattern was used for `contrato_locatarios` (new table, for multiple
tenants on one lease, instead of overloading `contratos_locacao.locatario`)
and for `percentual_aluguel_efetivo REAL NOT NULL DEFAULT 100` (100 = "this
contract has no embedded cost-sharing split," which is what every prior
contract actually was).

## Anti-pattern to recognize

If applying a schema change requires you to also rewrite existing INSERT
statements just to keep them valid (not to add new information — just to not
break), the migration wasn't additive. Stop and add a default instead.
