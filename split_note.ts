import { parseProblemNoteStructure } from "./problem_note_contract";

/**
 * Splitting one Problem Note into two is part of refining it: a note should
 * hold one problem. The mechanical part is pure text, so it lives here where
 * it can be tested without Obsidian; choosing where to cut and stating the new
 * problem stay with the author.
 */
export interface SplitRequest {
	/** The note being split, exactly as it is in the editor. */
	source: string;
	/** Offsets of the text that moves, into `source`. */
	from: number;
	to: number;
	/** The new note's name, without `.md`. */
	title: string;
	/** Leave a `[[title]]` link where the text was. */
	leaveLink: boolean;
}

export interface SplitResult {
	/** The source note after the text has moved. */
	source: string;
	/** The whole text of the new note. */
	created: string;
	/** Offset in `created` where the author writes next: the missing side. */
	cursorOffset: number;
}

/** Characters Obsidian refuses in a note name, or that break a wikilink. */
const FORBIDDEN_IN_NAME = /[*"\\/<>:|?#^[\]]/;

export function titleProblem(title: string): string | null {
	const name = title.trim();
	if (!name) return "Give the new note a name.";
	if (FORBIDDEN_IN_NAME.test(name)) {
		return 'A note name cannot contain * " \\ / < > : | ? # ^ [ ]';
	}
	if (name.startsWith(".")) return "A note name cannot start with a dot.";
	return null;
}

/** Where the frontmatter ends: the offset of the first body character. */
export function bodyStart(source: string): number {
	const open = source.match(/^---[ \t]*\r?\n/);
	if (!open) return 0;
	const close = source.slice(open[0].length).match(/^---[ \t]*(?:\r?\n|$)/m);
	if (!close || close.index === undefined) return 0;
	return open[0].length + close.index + close[0].length;
}

/**
 * The new note keeps where the source lives and nothing else of its identity:
 * its deck, and its `collection:` when the source is withdrawn from Anki, so
 * splitting a withdrawn note cannot create a card. `anki_note_id` must not
 * travel: two notes naming one card stop the sync, because only the author
 * knows which note the card belongs to. `up:` is a claim about how the two
 * problems relate, which a cut does not establish.
 */
function inheritedPlacement(source: string, newline: string): string {
	const lines = source.slice(0, bodyStart(source)).split(/\r?\n/);
	const kept: string[] = [];
	for (const key of ["category", "collection"]) {
		const start = lines.findIndex((line) => line.replace(/\s*:.*$/, "") === key);
		if (start < 0) continue;
		kept.push(lines[start]);
		for (let index = start + 1; index < lines.length; index++) {
			// A list or continuation line belongs to the key above it.
			if (!/^(?:\s+\S|-\s)/.test(lines[index])) break;
			kept.push(lines[index]);
		}
	}
	return kept.length ? kept.join(newline) : "category: Default";
}

const SEPARATOR_OR_PROPERTIES_END = /(?:^|\n)(?:---|\*\*\*)[ \t]*$/;
const STARTS_WITH_SEPARATOR = /^\*\*\*[ \t]*(?:\r?\n|$)/;

/** The source with the moved text gone and the gap closed. */
function closeGap(
	source: string,
	from: number,
	to: number,
	link: string,
	newline: string
): string {
	const before = source.slice(0, from);
	const after = source.slice(to);
	const startsInsideLine = before !== "" && !before.endsWith("\n");
	const endsInsideLine =
		after !== "" && !/^\r?\n/.test(after) && !source.slice(0, to).endsWith("\n");

	if (startsInsideLine || endsInsideLine) {
		// Part of a line moved: the rest of the line stays one line.
		const left = before.replace(/[ \t]+$/, "");
		const right = after.replace(/^[ \t]+/, "");
		const joinsWords = (a: string, b: string) =>
			a !== "" && b !== "" && !a.endsWith("\n") && !/^[\s.,;:!?)]/.test(b);
		if (!link) return left + (joinsWords(left, right) ? " " : "") + right;
		return (
			left +
			(left !== "" && !left.endsWith("\n") ? " " : "") +
			link +
			(joinsWords(link, right) ? " " : "") +
			right
		);
	}

	// Whole lines moved: one blank line between paragraphs, none after the
	// properties or the *** and none before a *** that follows.
	const lead = before.replace(/\s+$/, "");
	const tail = after.replace(/^(?:[ \t]*\r?\n)+/, "");
	const paragraph = newline + newline;
	let text = lead;
	if (link) {
		text += lead === "" ? "" : SEPARATOR_OR_PROPERTIES_END.test(lead) ? newline : paragraph;
		text += link;
	}
	if (tail !== "") {
		if (text !== "") {
			const tight =
				STARTS_WITH_SEPARATOR.test(tail) ||
				(!link && SEPARATOR_OR_PROPERTIES_END.test(lead));
			text += tight ? newline : paragraph;
		}
		text += tail;
	}
	return text.endsWith("\n") ? text : text + newline;
}

export function splitProblemNote(request: SplitRequest): SplitResult | string {
	const { source, leaveLink } = request;
	const title = request.title.trim();
	const problem = titleProblem(title);
	if (problem) return problem;

	const from = Math.max(request.from, 0);
	const to = Math.min(request.to, source.length);
	if (from < bodyStart(source)) return "The text to move must be below the properties.";
	const newline = source.includes("\r\n") ? "\r\n" : "\n";
	const moved = source.slice(from, to).replace(/^(?:[ \t]*\r?\n)+|\s+$/g, "");
	if (!moved) return "There is nothing to move from here.";
	if (source.slice(bodyStart(source), from).trim() === "" && source.slice(to).trim() === "") {
		return "That would move the whole note. Put the cursor where the second idea starts.";
	}

	// What moves decides the shape of the new note. Text holding its own ***
	// is already a problem and a conjecture. Text from above the source's ***
	// is a problem whose conjecture is still to be written; anything else is a
	// conjecture whose problem is still to be written. Only the author can
	// write either, so the cursor goes to the side that is missing.
	const head = ["---", "up: null", inheritedPlacement(source, newline), "---", ""].join(newline);
	const cutIsBelowSeparator = parseProblemNoteStructure(source.slice(0, from)).hasSeparator;
	let body: string;
	let cursorOffset: number;
	if (parseProblemNoteStructure(moved).hasSeparator) {
		body = moved + newline;
		cursorOffset = head.length;
	} else if (!cutIsBelowSeparator && parseProblemNoteStructure(source).hasSeparator) {
		body = moved + newline + "***" + newline;
		cursorOffset = head.length + body.length;
	} else {
		body = newline + "***" + newline + moved + newline;
		cursorOffset = head.length;
	}

	return {
		source: closeGap(source, from, to, leaveLink ? `[[${title}]]` : "", newline),
		created: head + body,
		cursorOffset,
	};
}
