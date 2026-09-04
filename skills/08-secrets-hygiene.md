# Secrets discipline: never echo, never store, always flag

## The rule

If a credential — API key, client secret, password, token — appears
anywhere in your context (typed by the user, visible in a screenshot they
shared, present in a file you read), treat it as compromised the moment you
see it, regardless of *why* it's there.

1. **Never reproduce the value.** Not in your response, not in a code
   comment, not in a commit, not in a log message you write. If you need to
   refer to it, refer to it by name ("the Client Secret") and never by value.
2. **Tell the user immediately and plainly** that the credential is now
   exposed in the conversation (which may be logged, stored, or shared) and
   that they should rotate/regenerate it before relying on it. Do this the
   moment you notice — don't bury it at the end of a long response, and
   don't wait to be asked.
3. **Never write a real secret into a file you create**, even a temporary
   one, even one you intend to delete. If you must test something that needs
   a credential, use an obviously-fake placeholder value and confirm the
   code path you're testing doesn't actually need the real value to succeed
   structurally (e.g. "does the server boot and route requests" vs. "does
   the real remote call succeed").
4. **Keep real secrets out of version control mechanically, not by memory**:
   a `.env.example` with empty values committed, the real `.env` covered by
   `.gitignore` *before* it's ever created, and `git status` checked after
   every commit that touches anything credential-adjacent to confirm nothing
   unexpected is staged.
5. **Delete throwaway credential files the moment you're done with them** —
   don't leave a `.env` with even placeholder/fake values sitting in a
   working tree after the task that needed it is finished; confirm the
   delete actually happened (`ls <path> 2>&1` should say "No such file").

## Worked example from this project

The user pasted a screenshot of their Pluggy (Open Finance) developer
dashboard. It showed, in plaintext, a real Client ID, a real Client Secret
(the "hide" toggle was in the "currently visible" state), and part of a real
API key.

Response, in order: the very first sentence of the next reply flagged the
exposure explicitly and recommended immediate rotation in the Pluggy
dashboard — before answering anything else the user had asked. None of the
three values were echoed anywhere, including in the extensive backend code
written afterward, which used `process.env.CLIENT_ID` / `process.env.CLIENT_SECRET`
exclusively, with a committed `.env.example` containing only empty keys.

Separately, when the backend needed to be smoke-tested (does it boot? does
routing work? does it return a clean error instead of crashing on a bad call?),
a `.env` was created with the literal placeholder values `CLIENT_ID=teste` /
`CLIENT_SECRET=teste` — enough to satisfy the code's "are these set" guard
clause and to observe a real (expected) authentication failure from the
provider, without ever touching the real credentials. That file was deleted
immediately after the test (`rm -f server/.env`), and the deletion was
verified (`ls server/.env` confirmed "No such file or directory") before
moving on — and confirmed *again* right before the final commit, because an
earlier cleanup attempt had silently failed (a chained shell command's exit
code masked a step that didn't run), which was only caught by re-checking
rather than assuming the first cleanup attempt worked.

## Anti-pattern to recognize

Any code, commit, or message that contains a credential's actual value —
even truncated, even in a "don't worry, I won't use it" aside — is the
failure. The rule is zero exceptions, not "usually don't."
