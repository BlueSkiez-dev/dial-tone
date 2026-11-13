---
inclusion: fileMatch
fileMatchPattern: "**/protocol/**"
---

# Byte budget rules

The 140-byte cap, airtime (~0.1 s per byte), AES-128-GCM overhead, IV derivation and the length guard are defined in `tech.md` under "Byte budget". Don't restate them here. These rules cover how the frame header changes.

## Header rules
- **Every header byte must be justified.** Each field gets a row in the size table in the owning spec's `design.md` (normally `.kiro/specs/frame-protocol/design.md`) with its size in bytes and the reason it exists. No row, no field.
- **Encryption overhead counts against the budget.** Compute remaining plaintext bytes as 140 minus header minus crypto overhead, never 140 minus header.
- **Header growth must show its airtime cost.** Any change that adds bytes states the extra airtime (about 0.1 s per byte) and the new remaining plaintext bytes. Put it in the spec and the commit or PR description.
- **Shrinking is welcome, but not free.** Removing a field needs the same table update.

## Size table format
```
| Field | Bytes | Reason |
|---|---|---|
| ...   | n     | why it exists |
| Header total | n | |
| Crypto overhead | n | tag, plus IV if transmitted |
| Remaining text | 140 - above | ~100 bytes is the product figure |
```

## Checks
- Code that builds a frame must not add or widen a field the size table doesn't list.
- The planned byte-budget hook fails when the header grows without a matching `design.md` change.
