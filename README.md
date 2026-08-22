# pi-mnemosyne-kb

Pi companion for [pi-mnemosyne](https://github.com/gandazgul/pi-mnemosyne). It does **not** replace that plugin.

`pi-mnemosyne` stores session memory (current directory + `global` + `core` injection). This package adds a **named knowledge collection**: index any local Markdown directory, then recall it with `kb_recall` from any working directory.

The repo ships code only. It does **not** ship notes, embeddings, or a Mnemosyne database.

## Why a companion

`pi-mnemosyne` can only search:

- the collection named after the current directory
- the `global` collection

It has no `collection` parameter. Registering another `memory_recall` would **override** the stock tool. This package registers different names:

| Tool | What it hits |
|---|---|
| `kb_recall` | your configured collection, e.g. `AppSec` |
| `kb_index` | rebuilds that collection from Markdown (`confirm=INDEX`) |
| `memory_*` | unchanged, still provided by `pi-mnemosyne` |

Install **both** packages.

## Prerequisites

Install these first. This package is a companion, not a replacement.

1. **[mnemosyne](https://github.com/gandazgul/mnemosyne)** — local CLI + SQLite collections. Must be on `PATH`.
2. **[pi-mnemosyne](https://github.com/gandazgul/pi-mnemosyne)** — Pi session-memory plugin (`memory_recall`, `memory_store`, `global`, `core`). Install with `pi install npm:pi-mnemosyne`.
3. **[Pi](https://pi.dev)** — the agent that loads both packages from `~/.pi/agent`.

## Install

From git (team):

```bash
pi install git:github.com/cylentsec/pi-mnemosyne-kb
```

From a local clone (development; Pi loads the directory in place):

```bash
git clone git@github.com:cylentsec/pi-mnemosyne-kb.git
pi install /absolute/path/to/pi-mnemosyne-kb
```

Confirm it landed under `~/.pi/agent`, not the Pi CLI prefix:

```bash
pi list
# should show both npm:pi-mnemosyne and this package
```

## Configure

Copy the example and point it at **your** notes. Do not commit this file.

```bash
cp config.example.json ~/.pi/agent/mnemosyne-kb.json
```

```json
{
  "limit": 6,
  "skipPathContains": [".obsidian", ".git", "node_modules", "/Attachments/"],
  "collections": [
    {
      "name": "AppSec",
      "path": "/absolute/path/to/your/AppSec/notes",
      "tags": ["appsec"]
    }
  ]
}
```

Search order (first existing file wins):

1. `$PI_MNEMOSYNE_KB_CONFIG`
2. `./.pi/mnemosyne-kb.json`
3. `~/.pi/agent/mnemosyne-kb.json`

Optional env overrides: `PI_MNEMOSYNE_KB_COLLECTION`, `PI_MNEMOSYNE_KB_PATH`, `PI_MNEMOSYNE_KB_LIMIT`.

`name` becomes the Mnemosyne collection (`mnemosyne search -n AppSec`). It cannot be `global`.

## Point the agent at the collection

The plugin registers `kb_recall`, but Pi will not use it reliably until your **system prompt** says so. Do **not** put this in Mnemosyne `core` memory. `core` is for tiny durable facts and, if it is only in the project collection, it will not follow you into a customer directory.

Put the routing in `~/.pi/agent/SYSTEM.md` (global) or `~/.pi/agent/APPEND_SYSTEM.md` (append-only). If a project has its own `.pi/SYSTEM.md`, that file **replaces** the global SYSTEM.md — use `APPEND_SYSTEM.md` or a one-line **global** `core` memory as backup.

Add a cascade like this, using your collection name:

```markdown
## Memory Sources & Routing

**Retrieval Cascade:**
1. Methodology, techniques, payloads, checklists → `kb_recall` (Mnemosyne collection `AppSec`).
2. This engagement's decisions and project facts → `memory_recall`.
3. Cross-project preferences → `memory_recall_global`.
4. If those miss → your notes vault, then the local file system.

Do not invent procedures when `kb_recall` can be used first.
Do not use `memory_recall` or bash `mnemosyne search` for those notes.
Never write customer data, tokens, or engagement evidence into the knowledge base.
```

Replace `AppSec` with the `name` from your config. Start a new Pi session after editing.

## Index

Preview, then rebuild. Rebuild deletes and recreates that collection only.

```bash
npx --yes --prefix . pi-mnemosyne-kb --help   # if linked
node bin/pi-mnemosyne-kb.mjs status
node bin/pi-mnemosyne-kb.mjs index --dry-run
node bin/pi-mnemosyne-kb.mjs index
node bin/pi-mnemosyne-kb.mjs search "boolean blind SQLi"
```

Or inside Pi: `/kb-status`, `/kb-index --dry-run`, `/kb-index`.

Each Markdown file is cleaned, then handed to `mnemosyne add --file`, which chunks by heading (~2000 characters). Cleaning:

- strips YAML frontmatter
- strips `data:image/...;base64,...` (embedded diagrams)
- stamps `[Source: Collection/relative/path.md]` so the agent can open the original note
- tags by folder name (`Web/SQLi` → `web`, `sqli`) plus any tags you set
- skips paths matching `skipPathContains`
- skips files that are still huge or empty after cleaning

Do **not** index wordlists, secret dumps, or generated corpora. Add those filenames to `skipPathContains`.

## Recall

The agent calls `kb_recall` with a query. That runs:

```bash
mnemosyne search -n <collection> -f plain --limit <limit> <query>
```

The query is **not** force-quoted, so hybrid search stays conceptual instead of becoming an FTS phrase match.

`limit` defaults to 6. Raise it only if you accept more tokens per turn.

## Team sharing

Share this git repo. Each person:

1. Installs `mnemosyne` and `pi-mnemosyne`
2. Installs this package
3. Creates their own `~/.pi/agent/mnemosyne-kb.json`
4. Updates `~/.pi/agent/SYSTEM.md` with the retrieval cascade above
5. Runs `index` against their own Markdown tree

Do not share `~/.local/share/mnemosyne/mnemosyne.db`. Do not put customer evidence in the notes path.

## Privacy

- All embeddings stay in the local Mnemosyne DB
- This plugin never uploads notes
- `kb_index` requires `confirm=INDEX` so a model cannot casually reindex during an engagement
- Never point `path` at a customer work directory

## Names that must stay distinct

| Package | Lives in | Tools |
|---|---|---|
| `npm:pi-mnemosyne` | `~/.pi/agent/npm/` | `memory_recall`, `memory_store`, … |
| `pi-mnemosyne-kb` | `~/.pi/agent` via git or local path | `kb_recall`, `kb_index` |

Do not rename the tools to `memory_*`. Same tool name = override.

## License

MIT
