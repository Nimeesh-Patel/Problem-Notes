# Problem Notes

An Obsidian plugin with two small, unrelated features:

1. **Tap-to-reveal `***` notes** — turns notes that use a `***` separator into
   problem/answer cards in reading mode.
2. **One-tap AnkiDroid sync** — a sidebar button that fires a deep link to a
   companion Android app.

Works on desktop and mobile. The plugin **never modifies your notes** — it only
changes how reading mode renders them, and it fires a URI.

## The `***` convention

A note containing a line that is exactly `***` is a *Problem Note*:

- Everything **above** `***` is the problem / question.
- Everything **below** `***` is the current best answer.

```markdown
What did Popper mean by "all observation is theory-laden"?

Some context for the problem...

***

The best current answer goes here, with [[wikilinks]] and **formatting**
fully working.
```

`***` is treated as a problem/answer separator unconditionally (use `---` for
horizontal rules). Only the **first** `***` in a note defines the split;
anything after it is all "answer side".

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

That custom scheme is registered by a **separate companion Android app**
("Interest"), which handles the actual whole-vault AnkiDroid sync. This plugin's
only job is to fire the URI — it does not talk to Anki, sync anything, or touch
Anki state. Without a companion app registered to that scheme, the button does
nothing.

> The URI is launched with `window.open(...)`, which is the reliable
> cross-platform mechanism. The mobile launch path still needs on-device
> verification on Android.

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
