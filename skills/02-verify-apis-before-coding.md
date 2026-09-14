# Verify third-party APIs before you write a line against them

## The rule

If you are about to call a method, construct a class, or read a field from a
package you did not write — and you have not personally seen its real type
definitions in *this* environment — stop and go look. Training data about
popular SDKs is frequently stale, subtly wrong about signatures, or confused
between similarly-named packages. You will not know which case you're in
until you check.

Mechanical procedure:

1. `mkdir -p /tmp/scratch-pkg && cd /tmp/scratch-pkg && npm init -y && npm install <package>`
2. Find the type declarations: `find node_modules/<package> -iname "*.d.ts"`
3. `grep` the exported class/functions you intend to call. Read the actual
   parameter list and return type, not the first plausible-looking line —
   overloads exist, and dashboard-generated example snippets sometimes use a
   different (looser) call shape than the installed package's real signature.
4. Write your code against what you just read, not against memory.
5. Delete the scratch dir when done. It is not part of the deliverable.

This costs one `npm install` and a few `grep` calls — a few seconds. A wrong
guess costs a full debug cycle later, often deep inside a working app where
the failure is harder to isolate.

## Worked example from this project

Task: wire a backend to the Pluggy Open Finance API. The Pluggy dashboard's
own generated code sample showed:

```js
const connectToken = await pluggy.createConnectToken({ clientUserId });
```

That reads as "pass an object as the first argument." Instead of trusting it,
the installed `pluggy-sdk` package's real `client.d.ts` was inspected:

```ts
createConnectToken(itemId?: string, options?: ConnectTokenOptions): Promise<{ accessToken: string }>;
```

The real signature takes `itemId` as the *first* positional argument and the
options object *second*. The dashboard's own sample code did not match the
installed package. Had the dashboard snippet been trusted verbatim, the call
would have silently passed `clientUserId` where `itemId` was expected.

The same check was repeated for `fetchAccounts`, `fetchAllTransactions`, the
`Transaction` type's `amount`/`type` fields (confirming `type: 'DEBIT' |
'CREDIT'` needed to be used to determine sign, because the docs did not
guarantee `amount` was already signed), and the `PluggyConnect` widget's
constructor (confirmed it takes a *named* export, not a default export —
`import { PluggyConnect } from 'pluggy-connect-sdk'`, not `import PluggyConnect
from ...`). Each check took under a minute and prevented a code path that
would have compiled, looked reasonable, and been wrong.

## When you can skip this

Standard library functions, and packages whose exact call shape you have
verified earlier in the *same* session, don't need re-checking. Anything
you're integrating for the first time in this session does.
