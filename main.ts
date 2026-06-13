import {
	App,
	MarkdownPostProcessorContext,
	Plugin,
	PluginSettingTab,
	Setting,
} from "obsidian";

/**
 * The custom URI scheme handled by the companion "Interest" Android app.
 * Firing this deep link triggers a whole-vault AnkiDroid sync inside that app.
 * This plugin's ONLY job is to fire the string — it never talks to Anki itself.
 */
const SYNC_URI = "interest://sync-anki";

/**
 * A "***" line on its own is the problem/answer separator. The user only ever
 * uses "***" for this purpose (never as a horizontal rule, never as bold), so a
 * standalone line of three-or-more asterisks can be treated as the separator
 * unconditionally. Obsidian renders such a line as an <hr> element.
 */
const SEPARATOR_RE = /^\*{3,}$/;

interface ProblemNotesSettings {
	enableReveal: boolean;
}

const DEFAULT_SETTINGS: ProblemNotesSettings = {
	enableReveal: true,
};

export default class ProblemNotesPlugin extends Plugin {
	settings: ProblemNotesSettings;

	async onload() {
		await this.loadSettings();

		// ── Feature 1: tap-to-reveal rendering of *** notes ──────────────────
		// registerMarkdownPostProcessor runs in READING MODE ONLY (not Live
		// Preview / source mode), which is exactly what we want: editing a note
		// shows the raw text untouched, reading it shows the reveal card.
		this.registerMarkdownPostProcessor((el, ctx) =>
			this.renderProblemNote(el, ctx)
		);

		// ── Feature 2: one-tap AnkiDroid sync ────────────────────────────────
		this.addRibbonIcon("sync", "Sync to AnkiDroid", () => this.fireSyncUri());

		this.addCommand({
			id: "sync-to-ankidroid",
			name: "Sync to AnkiDroid",
			callback: () => this.fireSyncUri(),
		});

		this.addSettingTab(new ProblemNotesSettingTab(this.app, this));
	}

	/**
	 * Fire the companion app's deep link. Obsidian has no dedicated
	 * cross-platform "open external URI" API, so window.open() is the reliable
	 * mechanism for handing a custom-scheme URI to the OS. This is the
	 * mobile-launch path and NEEDS ON-DEVICE VERIFICATION on Android.
	 */
	fireSyncUri() {
		window.open(SYNC_URI);
	}

	/**
	 * Reading-mode post-processor. Obsidian renders reading view section by
	 * section and calls this once per rendered block, so we cannot assume the
	 * whole note arrives in one `el`. We use ctx.getSectionInfo() — which gives
	 * the full source text plus this block's line range — to decide what each
	 * block is relative to the FIRST separator:
	 *   • the block that *is* the separator  -> replace its <hr> with a reveal bar
	 *   • any block after the separator       -> mark as hidden answer content
	 *   • blocks before the separator         -> left untouched
	 * Hide/reveal is coordinated by a class on the shared reading-view container
	 * so the single reveal bar toggles all answer blocks at once, and survives
	 * Obsidian re-rendering blocks as you scroll.
	 */
	renderProblemNote(el: HTMLElement, ctx: MarkdownPostProcessorContext) {
		if (!this.settings.enableReveal) return;

		const info = ctx.getSectionInfo(el);

		// Fallback: no section info (e.g. embeds / exported HTML) means the
		// content may have been rendered as one element — partition it locally.
		if (!info) {
			this.partitionWithinEl(el);
			return;
		}

		const lines = info.text.split("\n");
		const sepLine = lines.findIndex((l) => SEPARATOR_RE.test(l.trim()));
		if (sepLine === -1) return; // not a problem note

		// The persistent per-pane container we toggle the revealed state on.
		const container = el.closest(
			".markdown-preview-view, .markdown-rendered"
		) as HTMLElement | null;
		// Safety: never hide content we have no control to reveal again.
		if (!container) return;

		if (info.lineStart <= sepLine && sepLine <= info.lineEnd) {
			// This block contains the separator line.
			this.installRevealBar(el, container);
		} else if (info.lineStart > sepLine) {
			// This block is part of the answer.
			el.addClass("pn-answer");
		}
	}

	/**
	 * Replace the rendered <hr> with a reveal bar, and (for the case where a
	 * single block also contains following content) move that trailing content
	 * into a hidden answer group. Subsequent answer blocks are handled
	 * separately via the `pn-answer` class.
	 */
	private installRevealBar(el: HTMLElement, container: HTMLElement) {
		const hr = el.querySelector("hr");
		const bar = this.createRevealBar(
			() => container.classList.contains("pn-revealed"),
			() => container.classList.toggle("pn-revealed")
		);

		if (hr) {
			// Move anything after the <hr> within this same element into a
			// hidden group (covers the rare "block contains more than the hr").
			const answer = createDiv({ cls: "pn-answer" });
			let node = hr.nextSibling;
			while (node) {
				const next = node.nextSibling;
				answer.appendChild(node);
				node = next;
			}
			hr.replaceWith(bar);
			if (answer.childNodes.length) el.appendChild(answer);
		} else {
			el.appendChild(bar);
		}
	}

	/**
	 * Fallback used when the whole note is rendered into one element. We
	 * partition that element's direct children at the first <hr>: everything
	 * after it goes into a locally-toggled hidden wrapper.
	 */
	private partitionWithinEl(el: HTMLElement) {
		const children = Array.from(el.children);
		const sepIndex = children.findIndex((c) => c.tagName === "HR");
		if (sepIndex === -1) return;

		const wrapper = createDiv({ cls: "pn-answer-wrapper" });
		for (const node of children.slice(sepIndex + 1)) {
			wrapper.appendChild(node);
		}

		const bar = this.createRevealBar(
			() => wrapper.classList.contains("pn-revealed"),
			() => wrapper.classList.toggle("pn-revealed")
		);
		children[sepIndex].replaceWith(bar);
		el.appendChild(wrapper);
	}

	/**
	 * Build the tap-to-reveal affordance. `isRevealed` reads current state and
	 * `toggle` flips it; the bar re-reads state after each toggle so its label
	 * stays correct even when a fresh bar is created on re-render.
	 */
	private createRevealBar(
		isRevealed: () => boolean,
		toggle: () => void
	): HTMLElement {
		const bar = createDiv({ cls: "pn-reveal-bar" });
		bar.setAttribute("role", "button");
		bar.setAttribute("tabindex", "0");

		const sync = () => {
			const revealed = isRevealed();
			bar.toggleClass("pn-revealed", revealed);
			bar.setAttribute("aria-expanded", revealed ? "true" : "false");
			bar.setText(revealed ? "Hide answer" : "Tap to reveal");
		};
		sync();

		const onToggle = (e: Event) => {
			e.preventDefault();
			toggle();
			sync();
		};
		bar.addEventListener("click", onToggle);
		bar.addEventListener("keydown", (e: KeyboardEvent) => {
			if (e.key === "Enter" || e.key === " ") onToggle(e);
		});

		return bar;
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class ProblemNotesSettingTab extends PluginSettingTab {
	plugin: ProblemNotesPlugin;

	constructor(app: App, plugin: ProblemNotesPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Enable tap-to-reveal for *** notes")
			.setDesc(
				"When on, reading mode hides the answer (below the first ***) " +
					"behind a tap-to-reveal bar. Turn off for plain rendering. " +
					"Reopen a note for changes to take effect."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableReveal)
					.onChange(async (value) => {
						this.plugin.settings.enableReveal = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
