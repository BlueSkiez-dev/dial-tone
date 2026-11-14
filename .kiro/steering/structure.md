# Structure

## Current layout
```
dial-tone-app/
├── .kiro/
│   └── steering/        # product, tech, structure, design-system, field-findings, byte-budget
├── docs/
│   ├── BRIEF.md         # locked concept, scope, constraints, plan
│   └── FIELD-FINDINGS.md# channel spike results (protocol decisions)
└── LICENSE              # MIT
```
No source code exists yet. The earlier spike (`index.html`, `channels.js`, `sim-node.mjs`, `vendor/ggwave.js`) lived in a separate throwaway folder and was deliberately not carried over. Rebuild from specs; keep the knowledge, not the code.

## Planned layout
All application source lives under `src/`.
```
src/
├── protocol/   # frame format, encode/decode, relay, crypto. Pure logic, no UI or audio imports.
├── audio/      # audio I/O: AudioWorklet, decode worker, ggwave shim, channel profiles
└── ui/         # Preact components, one folder or file per Figma component
vendor/         # third-party code kept unmodified, with license files (ggwave 0.4.0)
```
Other planned paths:
- `.kiro/specs/`: one spec per feature (requirements, design, tasks)
- `.kiro/hooks/`, `.kiro/agents/`, `.kiro/settings/mcp.json`: guardrails, custom agents (Protocol Engineer, Field Tester, Design QA), MCP config
- `docs/kiro-journal.md`: auto-appended on task completion

## Conventions
- `src/protocol` is covered by property-based tests and runs headless in Node. It never imports from `src/audio` or `src/ui`.
- `src/audio` may import from `src/protocol`. `src/ui` may import from both, through their public exports only.
- UI shell code (spectrogram, flows, PWA shell, service worker registration) stays in `src/ui`. Tokens and styles follow `design-system.md`.
- Vendored third-party code goes in `vendor/` with its license file.
- The Crew app ("Base Station") lives in a separate public repo, not here.
- Steering files that load by file pattern: `field-findings.md` (`src/protocol`, `src/audio`), `byte-budget.md` (`src/protocol`), `design-system.md` (`src/ui`, `.tsx`, `.css`).
- Update this file once real directories exist.
