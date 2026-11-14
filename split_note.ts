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
	/** The vault template with the child’s properties already set. */
	template: string;
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
	const open = source.match(/^\uFEFF?---[ \t]*\r?\n/);
	if (!open) return 0;
	const close = source.slice(open[0].length).match(/^---[ \t]*(?:\r?\n|$)/m);
	if (!close || close.index === undefined) return 0;
	return open[0].length + close.index + close[0].length;
}

/** Only deck and sync eligibility travel with the moved passage. */
export function childProperties(
	template: Record<string, unknown>,
	source: Record<string, unknown>,
): Record<string, unknown> {
	const properties = { ...template };
	delete properties.anki_note_id;
	for (const key of ["category", "collection", "exclude_resurface"]) {
		if (Object.prototype.hasOwnProperty.call(source, key)) properties[key] = source[key];
	}
	return properties;
}

/** Offsets of the first authored divider, with or without CRLF. */
function divider(text: string): { start: number; end: number } | null {
	const { separatorLine } = parseProblemNoteStructure(text);
	if (separatorLine === null) return null;
	const lines = text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
	const start = lines.slice(0, separatorLine).join("").length;
	return { start, end: start + lines[separatorLine].replace(/\s+$/, "").length };
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

	const originalDivider = divider(source);
	const remaining = closeGap(source, from, to, leaveLink ? `[[${title}]]` : "", newline);
	if (originalDivider && (
		(from < originalDivider.end && to > originalDivider.start) || !divider(remaining)
	)) {
		return "Leave the original problem/conjecture divider in place. Select text on either side.";
	}

	const template = request.template.replace(/\r?\n/g, newline);
	const templateDivider = divider(template);
	if (!templateDivider) return "The Problem Note template needs an authored *** divider.";

	const movedDivider = divider(moved);
	const fromProblem = originalDivider !== null && to <= originalDivider.start;
	const problemText = movedDivider ? moved.slice(0, movedDivider.start).replace(/\s+$/, "") : fromProblem ? moved : "";
	const conjectureText = movedDivider ? moved.slice(movedDivider.end).replace(/^\r?\n/, "") : fromProblem ? "" : moved;

	// Keep the template's divider and scaffold. Add the moved text at the end
	// of its corresponding side, leaving the other side available to write.
	const { start, end } = templateDivider;
	const before = template.slice(0, start);
	const after = template.slice(end);
	const problemSide = problemText ? before + problemText + newline : before;
	const conjectureSlot = after.endsWith(newline) ? after : after + newline;
	const conjectureSide = conjectureText ? conjectureSlot + conjectureText + newline : conjectureSlot;
	const headingAndDivider = problemSide + template.slice(start, end);
	const created = headingAndDivider + conjectureSide;
	if (!divider(created)) return "The moved text would hide the new note's divider inside a code block.";

	return {
		source: remaining,
		created,
		cursorOffset: movedDivider || !fromProblem ? before.length : headingAndDivider.length + conjectureSlot.length,
	};
}
