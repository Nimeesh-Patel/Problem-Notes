Build a new, standalone Obsidian plugin called "Problem Notes."
This is a fresh TypeScript project, separate from the Interest Flutter
app — a new repository using the official Obsidian sample plugin
template (obsidianmd/obsidian-sample-plugin) as the starting point.

I have no prior Obsidian plugin experience. Scaffold the whole project
correctly: manifest.json, package.json, tsconfig, esbuild config,
versions.json — everything the sample template includes. Use the
current Obsidian plugin API (import from "obsidian").

Verify Node.js and npm are available; if not, install them before scaffolding.

---

## What the plugin does

Two unrelated features in one plugin:

### Feature 1 — Tap-to-reveal rendering of *** notes (the core feature)

In my vault, a note containing a `***` line is a "Problem Note":
everything above `***` is a problem/question, everything below is the
current best answer. `***` is only ever used for this — I use `---`
for horizontal rules, never `***` — so any `***` can be treated as a
problem/answer separator unconditionally.

In READING MODE, a note containing `***` should render so that:
- The content above `***` (the problem) is shown normally
- The `***` separator is replaced by a tappable "reveal" affordance
  (e.g. a subtle "tap to reveal" bar or button)
- The content below `***` (the answer) is hidden until the user taps
- After tapping, the answer is revealed in place; tapping again hides
  it again (toggle)

Technical notes from API research (use these, don't rediscover them):
- Use registerMarkdownPostProcessor. It runs in Reading mode only,
  NOT Live Preview — that is exactly what we want here. Do not attempt
  to support Live Preview; targeting reading mode is correct and
  simpler. Editing the note (Live Preview / source mode) should show
  the raw note normally, untouched.
- The post-processor receives rendered HTML elements per block, not
  the whole document at once. You will need to detect the `***`
  separator (it renders as an <hr> element, the same as Obsidian
  renders a thematic break) and partition the rendered children into
  "before" and "after" the first such separator, then wrap the "after"
  group in a collapsible container with a reveal control.
- Only the FIRST `***` in a note defines the split. Anything after the
  first separator is all "answer side."
- Preserve all normal Markdown rendering within both halves — wikilinks,
  formatting, embeds must still work. You are reorganizing already-
  rendered elements and adding a hide/reveal wrapper, not re-parsing
  Markdown yourself.

Styling: calm and minimal. A styles.css with a subtle reveal bar.
Respect Obsidian's theme variables (var(--text-muted),
var(--background-modifier-border), etc.) so it works in light and
dark themes and with community themes. Do not hardcode colors.

### Feature 2 — Sync button (left sidebar ribbon)

Add a ribbon icon to the left sidebar (where "open quick switcher",
"open graph view", etc. live). Use this.addRibbonIcon(icon, title, callback).
- Icon: a sensible built-in Obsidian icon suggesting sync (e.g. "sync")
- Title/tooltip: "Sync to AnkiDroid"
- On click: launch the URI  interest://sync-anki

That URI is a custom scheme registered by a separate companion Android
app (not part of this plugin and not something you need to know about).
The plugin's ONLY job here is to fire that exact URI string. It does
not talk to Anki, does not sync anything, does not need to know what
happens after the URI is fired. It is a one-tap launcher for an
external app, nothing more.

Launching an external-app URI from Obsidian mobile:
- Obsidian's API has no dedicated cross-platform "open external URI"
  method. The reliable approach is window.open("interest://sync-anki")
  or creating a temporary <a href> element and programmatically
  clicking it. Implement it and note in a comment that this is the
  mobile-launch mechanism that needs on-device verification.
- This fires the deep link that the Interest app already handles
  (interest://sync-anki triggers a whole-vault AnkiDroid sync in
  Interest). The plugin's only job is to fire the URI — it does not
  talk to Anki itself, does not sync anything, does not touch Anki
  state. It is a one-tap launcher.

Also register the same action as a command (addCommand) so it shows
in the command palette and can be hotkeyed.

---

## Settings (minimal)

A settings tab with:
- A toggle: "Enable tap-to-reveal for *** notes" (default on) — lets
  the user turn off Feature 1 rendering if they want plain rendering
- That's enough for v1. Don't over-build settings.

---

## manifest.json

- id: problem-notes
- name: Problem Notes
- minAppVersion: a recent stable Obsidian version
- description: "Renders notes with a *** separator as tap-to-reveal
  problem/answer cards, and adds a one-tap AnkiDroid sync."
- isDesktopOnly: false  (must work on mobile — Feature 1 and the
  ribbon both need to work on Android)

---

## Constraints

- The plugin NEVER modifies note files. It only changes how reading
  mode renders them, and fires a URI. No vault writes whatsoever.
- No Node.js-only APIs (must run on mobile).
- Bundle with esbuild as the sample template does — single main.js
  output.
- Keep it small and readable. This is v1 of someone's first plugin.

---

## Deliverables

- Full working plugin source
- A short README for the plugin repo: what it does, the *** convention,
  how to install manually (copy main.js + manifest.json + styles.css
  into .obsidian/plugins/problem-notes/), and that the sync button fires the interest://sync-anki URI, which requires a companion app registered to that scheme to do anything.
- Brief inline comments where the API behaviour is non-obvious
  (especially the reading-mode-only post-processor and the mobile
  URI launch)

After building, tell me exactly how to load this into my vault to
test it on both desktop and mobile.