# Structure

## Current layout
```
dial-tone-app/
├── .kiro/
│   └── steering/        # product.md, tech.md, structure.md
├── docs/
│   ├── BRIEF.md         # locked concept, scope, constraints, plan
│   └── FIELD-FINDINGS.md# channel spike results (protocol decisions)
└── LICENSE              # MIT
```
No source code exists yet. The earlier spike (`index.html`, `channels.js`, `sim-node.mjs`, `vendor/ggwave.js`) lived in a separate throwaway folder and was deliberately not carried over. Rebuild from specs; keep the knowledge, not the code.

## Planned additions
- `.kiro/specs/`: one spec per feature (requirements, design, tasks)
- `.kiro/hooks/`, `.kiro/agents/`, `.kiro/settings/mcp.json`: guardrails, custom agents (Protocol Engineer, Field Tester, Design QA), MCP config
- `/protocol`: frame format, encode/decode, relay, crypto. Pure logic, no UI imports, covered by property-based tests.
- `/audio`: audio I/O (AudioWorklet, decode worker, ggwave shim, channel profiles). Separate from `/protocol` and from UI.
- UI code (spectrogram, flows, PWA shell, service worker) kept separate from `/protocol`.
- `docs/kiro-journal.md`: auto-appended on task completion.
- Extra steering files planned: `byte-budget.md`, `design-system.md`, `field-findings.md`.

## Conventions
- Keep protocol logic separate from audio I/O and UI so it can be tested headless in Node.
- Vendored third-party code goes in a `vendor/` folder with its license file.
- The Crew app ("Base Station") lives in a separate public repo, not here.
- Update this file once real directories exist.
