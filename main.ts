import {
	App,
	MarkdownPostProcessorContext,
	MarkdownRenderChild,
	MarkdownView,
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
 * uses "***" for this purpose (never as a horizontal rule, never as bold), so
 * Obsidian rendering it as an <hr> is a reliable signal: we treat the first
 * <hr> in a reading-mode render as the separator unconditionally.
 */

interface ProblemNotesSettings {
	enableReveal: boolean;
}

const DEFAULT_SETTINGS: ProblemNotesSettings = {
	enableReveal: true,
};

export default class ProblemNotesPlugin extends Plugin {
	settings!: ProblemNotesSettings;

	async onload() {
		await this.loadSettings();

		// ── Feature 1: tap-to-reveal rendering of *** notes ──────────────────
		// registerMarkdownPostProcessor runs in READING MODE ONLY (not Live
		// Preview / source mode), which is exactly what we want: editing a note
		// shows the raw text untouched, reading it shows the reveal card.
		this.registerMarkdownPostProcessor((el, ctx) =>
			this.renderProblemNote(el, ctx)
		);

		// Cold-start fix: on app launch Obsidian restores and paints the
		// already-open note BEFORE this onload registers the post-processor, so
		// that first-painted note never gets a RevealRenderChild and renders
		// without tap-to-reveal until a manual toggle forces a re-render. Once
		// the workspace has finished restoring its layout, force every open
		// markdown view to re-render so the post-processor runs on them too.
		this.app.workspace.onLayoutReady(() => this.rerenderOpenMarkdownViews());

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
	 * Reading-mode post-processor. It runs synchronously while Obsidian is still
	 * building a block, BEFORE that block is attached to the document — so
	 * `el.closest(...)` and `ctx.getSectionInfo()` are both unreliable here.
	 * That timing is exactly why earlier versions broke on fresh load / nav /
	 * restart: the work ran before the DOM context existed.
	 *
	 * So we do NOTHING here except register a MarkdownRenderChild on the block.
	 * Its onload() fires AFTER the block is in the DOM, where we can reliably
	 * find the reading-view container and partition the note. The render child
	 * re-runs on every render, so the reveal is re-established each time without
	 * any dependence on getSectionInfo or on state shared across blocks.
	 */
	renderProblemNote(el: HTMLElement, ctx: MarkdownPostProcessorContext) {
		if (!this.settings.enableReveal) return;

		// Only the block that rendered the *** (an <hr>) needs setup. Every
		// other block is handled in CSS, so skip the render-child overhead.
		if (!el.querySelector("hr")) return;

		ctx.addChild(new RevealRenderChild(el, this));
	}

	/**
	 * Force every open markdown view's reading-mode preview to re-render, so the
	 * post-processor (and thus RevealRenderChild) runs on notes that were already
	 * painted before the plugin finished loading. `rerender(true)` is a full
	 * reprocess; for a view currently in editing/Live Preview it harmlessly
	 * applies the next time reading mode is shown.
	 */
	private rerenderOpenMarkdownViews() {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			if (view instanceof MarkdownView) {
				view.previewMode?.rerender(true);
			}
		}
	}

	/**
	 * Partition the rendered note around its FIRST <hr> (the *** separator).
	 * Runs from a render child's onload, i.e. once `el` is in the document.
	 *
	 * Returns false ONLY if `el` is not yet attached (no container found and
	 * not connected) so the caller can retry on the next frame. Otherwise it
	 * has either installed the reveal bar or decided there is nothing to do.
	 */
	partitionRenderedNote(el: HTMLElement): boolean {
		const hr = el.querySelector("hr");
		if (!hr) return true; // block re-rendered without an hr — nothing to do

		// The reading-view container whose direct children are the per-block
		// section wrappers (.markdown-preview-sizer in a pane, .markdown-rendered
		// in embeds/exports). `closest` is reliable now that el is attached.
		const container = el.closest(
			".markdown-preview-sizer, .markdown-rendered"
		) as HTMLElement | null;

		if (container && container !== el) {
			// Only the FIRST *** is the separator (one *** per note, by
			// convention). If a bar already exists, leave later *** as plain
			// rules and don't double-process.
			if (container.querySelector(".pn-reveal-bar")) return true;
			this.installRevealBar(hr, container);
			return true;
		}

		// No recognizable section container. If el is attached, the whole note
		// arrived as one element (embed / exported HTML): partition locally.
		if (el.isConnected) {
			this.partitionWithinEl(el);
			return true;
		}

		return false; // not attached yet — ask caller to retry
	}

	/**
	 * Replace the separator's <hr> with the reveal bar and arrange for every
	 * answer block to be hidden until revealed. The reveal STATE lives on a
	 * single section-level "anchor" element that sits immediately before the
	 * answer blocks; a CSS sibling rule (`.pn-reveal-block ~ *`) then hides the
	 * answers purely by DOM position. That is what survives Obsidian's lazy
	 * re-rendering: blocks rendered later on scroll are hidden the moment they
	 * appear, with no per-block JS and no shared-ancestor coordination.
	 */
	private installRevealBar(hr: HTMLElement, container: HTMLElement) {
		// The section = the container's direct child that holds the hr. This is
		// the sibling of the answer blocks, so it must carry the reveal state.
		let section: HTMLElement = hr;
		while (section.parentElement && section.parentElement !== container) {
			section = section.parentElement;
		}

		const bar = this.buildRevealBar();

		if (section === hr) {
			// The hr is itself a direct child of the container: the bar takes
			// its place at section level and IS the (plugin-owned) anchor.
			hr.replaceWith(bar);
			bar.addClass("pn-reveal-block");
			this.wireRevealBar(bar, bar);
			return;
		}

		// The hr is wrapped in a section. Tag that section as the anchor and
		// replace the hr inside it with the bar. Any trailing content that
		// shared the separator's section is folded into a hidden group governed
		// by the same state.
		const answer = createDiv({ cls: "pn-answer" });
		let node = hr.nextSibling;
		while (node) {
			const next = node.nextSibling;
			answer.appendChild(node);
			node = next;
		}
		hr.replaceWith(bar);
		if (answer.childNodes.length) bar.after(answer);
		section.addClass("pn-reveal-block");
		this.wireRevealBar(bar, section);
	}

	/**
	 * Fallback for whole-note-in-one-element renders (embeds / exported HTML).
	 * Everything after the first <hr> is moved into a plugin-owned wrapper that
	 * the bar toggles directly — fully self-contained, no ancestor needed.
	 */
	private partitionWithinEl(el: HTMLElement) {
		const hr = el.querySelector("hr");
		if (!hr || el.querySelector(".pn-reveal-bar")) return;

		// The top-level child of el that holds the hr.
		let top: HTMLElement = hr;
		while (top.parentElement && top.parentElement !== el) {
			top = top.parentElement;
		}

		const wrapper = createDiv({ cls: "pn-answer-wrapper" });
		// 1) Content after the hr within its own block, in order.
		let inline = hr.nextSibling;
		while (inline) {
			const next = inline.nextSibling;
			wrapper.appendChild(inline);
			inline = next;
		}
		// 2) Every block after the hr's block, in order.
		let block = top.nextSibling;
		while (block) {
			const next = block.nextSibling;
			wrapper.appendChild(block);
			block = next;
		}

		const bar = this.buildRevealBar();
		hr.replaceWith(bar);
		el.appendChild(wrapper);
		this.wireRevealBar(bar, wrapper);
	}

	/** Build the bar element (presentation only; behaviour added by wireRevealBar). */
	private buildRevealBar(): HTMLElement {
		const bar = createDiv({ cls: "pn-reveal-bar" });
		bar.setAttribute("role", "button");
		bar.setAttribute("tabindex", "0");
		return bar;
	}

	/**
	 * Wire the bar to toggle `pn-revealed` on `anchor` (the element that carries
	 * the reveal state — a section wrapper, the bar itself, or the fallback
	 * answer wrapper). The bar re-reads the anchor's state after each toggle so
	 * its label stays correct even on a freshly built bar after re-render.
	 */
	private wireRevealBar(bar: HTMLElement, anchor: HTMLElement) {
		const sync = () => {
			const revealed = anchor.classList.contains("pn-revealed");
			bar.toggleClass("pn-revealed", revealed);
			bar.setAttribute("aria-expanded", revealed ? "true" : "false");
			bar.setText(revealed ? "Hide answer" : "Tap to reveal");
		};

		const onToggle = (e: Event) => {
			e.preventDefault();
			anchor.toggleClass("pn-revealed", !anchor.classList.contains("pn-revealed"));
			sync();
		};
		bar.addEventListener("click", onToggle);
		bar.addEventListener("keydown", (e: KeyboardEvent) => {
			if (e.key === "Enter" || e.key === " ") onToggle(e);
		});

		sync();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

/**
 * Render child attached to the separator's block. Obsidian calls onload() once
 * the block is in the DOM, which is the earliest point the reading-view
 * container can be located reliably (the post-processor callback runs too
 * early). The work re-runs on every render, so the reveal is re-established
 * after navigation and restart without depending on getSectionInfo.
 */
class RevealRenderChild extends MarkdownRenderChild {
	private done = false;

	constructor(containerEl: HTMLElement, private plugin: ProblemNotesPlugin) {
		super(containerEl);
	}

	onload() {
		// Normally the element is already attached here. If not (some render
		// paths attach a frame later), retry once on the next frame rather than
		// falling back to the unreliable detached-DOM path.
		if (this.plugin.partitionRenderedNote(this.containerEl)) {
			this.done = true;
			return;
		}
		const raf = requestAnimationFrame(() => {
			if (!this.done) {
				this.done = this.plugin.partitionRenderedNote(this.containerEl);
			}
		});
		this.register(() => cancelAnimationFrame(raf));
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
