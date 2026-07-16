# Git Workflow

**Every file change must be committed immediately after making it.** Do not wait for user confirmation. Do not batch changes across turns.

1. `git diff` — confirm changes are complete and correct
2. `git add` + `git commit` — split logical changes into separate commits
3. **Do NOT push** — unless the user explicitly says "push"

## Notes

- Commit what exists — better to over-commit and squash later than to miss one
- Never commit secrets or credentials
- Write concise commit messages describing the change
