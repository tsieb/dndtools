# Local LLM verification

`pnpm ai:verify:local` is the strict local-LLM gate. It runs the deterministic provider, prompt,
and MCP exchange tests, then runs two real Ollama agent scenarios against the same staged-write
pipeline used by the app: a rollable-table request and an NPC request.

Before running it, install Ollama, start its local server, and pull the default tool-calling model:

```sh
ollama serve
ollama pull qwen2.5:7b
pnpm ai:verify:local
```

The command fails if Ollama is unavailable, the model is missing, or either live scenario does not
produce a schema-valid staged proposal. This makes it appropriate for a local pre-push hook, a
scheduled workstation task, or an agent's final validation. It never mutates a real campaign.

For an optional developer check that skips rather than fails when Ollama is not installed or running,
use `pnpm ai:smoke`.

Set `OLLAMA_MODEL` to test another installed model, or `OLLAMA_BASE_URL` for a different local
Ollama host. The test runner must be able to reach that address.
