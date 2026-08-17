# Build Log Maintenance — Setup and Agent Instructions

Three parts: a one-time setup, a prompt to give your coding agent, and the git wiring that attaches commit hashes to prompts.

---

## 1. The ordering problem, and the fix

The obvious approach — "write the log entry, then commit" — cannot record its own hash. The commit containing the log entry does not exist yet when the entry is written.

**Fix: log lags commits by one step.**

```text
prompt  →  agent makes the change  →  agent commits the CODE only
                                             ↓
                                     hash now exists
                                             ↓
                       agent appends the log row citing that hash
                                             ↓
                    log row rides along in the NEXT commit
```

The log therefore always describes the commit *before* the one it is stored in. This is correct, self-consistent, and requires no hooks.

If you prefer the log and code in the same commit, use `--amend` instead (§3.2), at the cost of rewriting history.

---

## 2. Prompt to give your coding agent

Paste this at the start of your first session. Re-paste it at the start of any session where the agent seems to have lost the thread.

> I'm building a game prototype for a competition over the next three weeks. The full design is in `WINDWARD_master_spec.md` — treat it as the source of truth and read it before proposing changes.
>
> Maintain `buildlog.md` continuously as we work. It has two parts:
>
> **Part 1 — "Decisions locked so far"** at the top of the file: design and technical decisions we have settled (controls, core systems, scope, constraints, art). Re-read this at the start of every session so you stay consistent with what we already decided. When a decision changes, edit it here *and* note the change in that session's entry.
>
> **Part 2 — one entry per work session**, dated, covering: which AI tools we used; what we built or changed; the key decisions I made and why; anything I pivoted on and what changed my thinking; what I changed after playtesting, including what felt off; the biggest problems and how we solved them; what I learned; and where things stand for next time.
>
> **Commit discipline, and this part matters:**
> - After each meaningful change, commit the **code only** with a message beginning `feat:`, `fix:`, `tune:`, or `cut:`.
> - Then run `git rev-parse --short HEAD` and append a row to this session's **Prompts and commits** table: the prompt number, a one-line summary of what I asked for, that hash, and a one-line result.
> - The log row is committed with the *next* commit. Do not try to put a commit's own hash in itself.
> - Never commit the log without also having a code commit it refers to.
>
> Update the log as we go, not at the end. Capture enough detail to be genuinely useful to look back on. Be honest, including what did not work — the log is not scored on quality. Do not put my name, handle, or any identifying information in it.

---

## 3. Git wiring

### 3.1 One-time setup

```bash
git init
git config commit.template .gitmessage
printf 'node_modules/\n*.log\ndist/\n' > .gitignore
git add . && git commit -m "chore: initial spec and build log scaffold"
```

Commit message convention — keeps the log table readable and makes `git log --oneline` a usable second record:

```text
feat: <new system>
fix:  <bug>
tune: <constants only>
cut:  <removed scope>
```

### 3.2 Helper script

Save as `log.sh`, `chmod +x log.sh`. Run it after each code commit:

```bash
#!/usr/bin/env bash
# usage: ./log.sh "prompt summary" "result"
set -e
HASH=$(git rev-parse --short HEAD)
SUBJ=$(git log -1 --format=%s)
N=$(grep -c '^| [0-9]' buildlog.md || echo 0)
printf '| %s | %s | `%s` | %s |\n' "$((N+1))" "$1" "$HASH" "${2:-$SUBJ}" >> buildlog.md
echo "logged $HASH"
```

Append manually beneath the current session's table header, or let the agent place the row correctly.

### 3.3 Reconstructing the table if it drifts

Every commit is recoverable regardless of whether the log kept up:

```bash
git log --pretty=format:'| — | %s | `%h` | %ad |' --date=short > commits.txt
```

Paste into the session entry and annotate.

---

## 4. Never set one up? Recovery prompt

If the log falls behind, give the agent this rather than reconstructing by hand:

> We have built this prototype together over several sessions. From our full conversation and from `git log`, generate `buildlog.md` now with a "Decisions locked so far" list and one dated entry per session covering what we built, key decisions and why, pivots, what changed after playtesting, the biggest problems and how we solved them, and what we learned. Use `git log --pretty=format:'%h %ad %s' --date=short` to recover the commit history and cite hashes against the work. Be honest, including what didn't work.

---

## 5. Submission requirements

| | Requirement |
|---|---|
| Filename | `buildlog.md` |
| Format | Markdown |
| Content | Decisions list + per-session entries |
| Privacy | No personal or sensitive information, no other people's names |
| Scoring | Required, but not scored on quality |
| Handling | Shared only with internal teams and judges; never published; not used for training |

The Design Intent document is separate: `.docx`, 500 words maximum, text only, the seven template sections exactly as given, no identifying information.
