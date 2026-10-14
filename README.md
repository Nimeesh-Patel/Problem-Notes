# Problem Notes

An Obsidian plugin with two small, unrelated features:

1. **Tap-to-reveal `***` notes** — turns notes that use a `***` separator into
   problem/answer cards in reading mode.
2. **One-tap AnkiDroid sync** — a sidebar button that fires a deep link to a
   companion Android app.

The reading-mode renderer targets desktop and mobile. The plugin **never modifies
your notes** — it only changes how reading mode renders them, and it fires a URI.
The Android custom-URI handoff has not yet been verified on a device.

## The `***` convention

A note containing a line whose trimmed content is `***` is structurally a
*Problem Note* when that line is outside a triple-backtick code fence:

- Everything **above** `***` is the problem / question.
- Everything **below** `***` is the current best answer.

```markdown
What did Popper mean by "all observation is theory-laden"?

Some context for the problem...

***

The best current answer goes here, with [[wikilinks]] and **formatting**
fully working.
```

Only the **first** qualifying `***` line defines the split; anything after it is
all "answer side". A fenced `***` example is not a separator. Structurally empty
sides are accepted by the renderer, but the companion Anki sync reviews only
complete notes without collection membership. Collection notes withdraw existing
projections; a missing category still selects Default. Interest owns that rule.

When Obsidian supplies source-section information, the Markdown source decides
whether a rendered horizontal rule came from `***`; `---`, `___`, and `* * *`
remain ordinary rules. The selected rendered rule must correspond to the authored separator in that
section. With missing or ambiguous source/DOM correspondence, content remains
plain and visible; an unrelated horizontal rule never authorises hiding it.

### Feature 1 — what you see

In **reading mode**:

- The problem (above `***`) renders normally.
- The `***` separator is replaced by a subtle **"Tap to reveal"** bar.
- The answer (below `***`) is hidden until you tap the bar; tapping again hides
  it. All normal Markdown — wikilinks, formatting, embeds — keeps working,
  because the plugin reorganizes already-rendered elements rather than
  re-parsing Markdown.

In **editing mode** (Live Preview / source) the note is shown raw and untouched.
This is intentional: the renderer runs in reading mode only.

You can turn this off in **Settings → Problem Notes → Enable tap-to-reveal for
`***` notes** for plain rendering. Reopen a note for the change to take effect.

### Feature 2 — the Sync button

A **sync** icon in the left ribbon (tooltip *"Sync to AnkiDroid"*) and a command
palette entry of the same name both fire the URI:

```
interest://sync-anki
```

That custom scheme is registered by the separate **Interest** Android app,
which handles the actual whole-vault AnkiDroid sync. This plugin's
only job is to fire the URI — it does not talk to Anki, sync anything, or touch
Anki state. Without a companion app registered to that scheme, the button does
nothing.

> The URI is currently launched with `window.open(...)`. The source-side URI
> contract is aligned with the companion app; successful Android dispatch still
> needs on-device verification.

## Manual installation

1. Build the plugin (see below) or grab `main.js`, `manifest.json`, and
   `styles.css` from a release.
2. Copy those three files into your vault at:

   ```
   <your vault>/.obsidian/plugins/problem-notes/
   ```

   (Create the `problem-notes` folder if it doesn't exist.)
3. In Obsidian: **Settings → Community plugins**, make sure *Restricted mode* is
   off, then enable **Problem Notes**.

## Building from source

Requires Node.js and npm.

```bash
npm install      # install dependencies
npm run dev      # watch + rebuild during development
npm run build    # type-check + produce a minified main.js for release
```

The build bundles everything into a single `main.js` via esbuild.

## License

MIT
