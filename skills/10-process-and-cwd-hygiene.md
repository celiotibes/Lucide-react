# Don't trust shell state you didn't just check

## The rule

A persistent shell across many tool calls accumulates state you can't see
from the current call alone: which directory you're actually in, which
background processes are still alive, whether a chained command's later
steps actually ran. Assuming any of these rather than checking is a
recurring, cheap-to-avoid source of wasted turns.

Concrete rules:

1. **Use absolute paths for anything that matters** — file reads/writes,
   `git` commands, `npm` commands tied to a specific package.json. A `cd`
   two tool calls ago that you've since forgotten about will silently
   redirect a relative-path command to the wrong project.
2. **After any `cd`, treat yourself as lost until proven otherwise.** If a
   command fails with something like "package.json: No such file or
   directory" and you weren't expecting that, your first move is `pwd`, not
   a second guess at what went wrong.
3. **Don't chain a cleanup step onto a command whose exit code you haven't
   checked**, especially after `pkill`/background-process commands, which
   often return non-zero (signal-related exit codes) even when they did
   exactly what you wanted. A `&&`-chained `rm` or `cd` after such a command
   may simply never execute, and the tool output can make this look like it
   succeeded.
4. **After starting or killing a background process, verify the actual
   state** (`ps aux | grep <name>`, or `curl` a health endpoint) rather than
   trusting that the start/kill command's apparent success means the process
   is in the state you expect.
5. When in doubt, re-run the check. `pwd`, `ls`, and `ps aux` are nearly free;
   a debugging session caused by wrong assumptions is not.

## Worked example from this project

Two separate incidents in the same session, same root cause:

**Lost cwd.** After `cd`-ing into `contabilidade-reconstituicao/` to
validate a schema file, a later command assumed repo root and ran
`npm install idb-keyval` — which failed with `package.json: No such file or
directory`, because the shell was still in the subdirectory from several
calls earlier. Recovery: `pwd` first (confirmed the stale location), then
`cd /home/user/Lucide-react && npm install ...` using an absolute path,
and thereafter absolute paths were used for anything that mattered for the
rest of the session.

**Background process left in a bad state.** A dev server needed restarting
after a code change. The sequence `pkill -f "vite --port 5173"; sleep 1;
npm run dev -- --port 5173 &` was run as one chained command. The tool
reported exit code 144 (a signal-related code from the `pkill`), and — as
one plausible reading of a chain that returns a non-zero code — the `npm
run dev` step **had not actually started**: a follow-up `curl` to the dev
port returned connection-refused, and `ps aux | grep vite` showed *no*
process at all, not the expected one. The fix was procedural, not just
"try again": run the restart as two separate, unchained tool calls (kill,
confirm-with-ps, then start, then confirm-with-curl), so each step's actual
result was checked before assuming the next step's precondition held.

The same "chain masked a step that silently didn't run" pattern also caused
a throwaway `server/.env` file (see `08-secrets-hygiene.md`) to survive an
intended cleanup — caught only by re-checking `ls server/.env` right before
the final commit, not by trusting the earlier `rm` had run.

## Anti-pattern to recognize

Reading a non-zero exit code from a `pkill`/background-process command and
moving on without checking real process state. Chaining "kill old thing,
start new thing, clean up" into one command and trusting all three parts
ran just because the tool call returned.
