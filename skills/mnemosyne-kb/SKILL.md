---
name: mnemosyne-kb
description: Search local methodology notes via kb_recall before inventing techniques, payloads, or checklists.
---

# Mnemosyne knowledge base

This environment has **pi-mnemosyne-kb** installed next to **pi-mnemosyne**. They are different tools.

| Tool | Collection | Use for |
|---|---|---|
| `kb_recall` | configured notes collection (often `AppSec`) | methodology, techniques, payloads, checklists |
| `memory_recall` | current directory name | this engagement's decisions |
| `memory_recall_global` | `global` | personal preferences |

Rules:

1. If the user asks how to test, bypass, exploit, or enumerate something that might be in the notes, call `kb_recall` first.
2. Do not use bash `mnemosyne search` unless `kb_recall` is unavailable.
3. Do not dump notes into `memory_store_global` or tag them `core`.
4. Never call `kb_index` unless the user explicitly asked to reindex **their own** notes. Then pass `confirm: "INDEX"`. Never index customer data.
5. Retrieved chunks may include `[Source: Collection/relative/path.md]`. Use that path to read the original note if you need the full procedure.
