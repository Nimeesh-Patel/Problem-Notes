import { build } from "esbuild";
import assert from "node:assert/strict";

const compiled = await build({
	entryPoints: ["split_note.ts"],
	bundle: true,
	platform: "node",
	format: "cjs",
	write: false,
});
const module = { exports: {} };
new Function("module", "exports", compiled.outputFiles[0].text)(module, module.exports);
const { splitProblemNote: split, titleProblem, bodyStart, childProperties } = module.exports;
const template = "---\nup: null\ncriticisms: null\ncategory: Default\n---\n\n***\n\n";
const splitProblemNote = (request) => split({ template, ...request });

const note = [
	"---",
	"up:",
	'  - "[[Theory of Morality]]"',
	"category: Morality",
	"anki_note_id: 1780572895920",
	"---",
	"",
	"What problem does the Fun Criterion address?",
	"***",
	"First idea, about conflicting criteria.",
	"",
	"Second idea, about democracy.",
	"More on the second idea.",
	"",
].join("\n");
const at = (text) => note.indexOf(text);
const NL = String.fromCharCode(10);
let cases = 0;
const check = (name, run) => {
	run();
	cases++;
};

check("the end of a conjecture becomes a new note with the same deck", () => {
	const result = splitProblemNote({
		source: note,
		from: at("Second idea"),
		to: note.length,
		title: "Fun criterion and democracy",
		leaveLink: true,
	});
	assert.equal(
		result.created,
		"---\nup: null\ncriticisms: null\ncategory: Default\n---\n\n***\n\nSecond idea, about democracy.\nMore on the second idea.\n"
	);
	// The cursor waits where the missing problem is written.
	assert.equal(result.created.slice(0, result.cursorOffset), "---\nup: null\ncriticisms: null\ncategory: Default\n---\n\n");
	assert.equal(
		result.source,
		note.slice(0, at("Second idea")).trimEnd() + "\n\n[[Fun criterion and democracy]]\n"
	);
});

check("the card number and the parent never travel", () => {
	const { created } = splitProblemNote({
		source: note,
		from: at("Second idea"),
		to: note.length,
		title: "B",
		leaveLink: false,
	});
	assert.ok(!created.includes("anki_note_id"));
	assert.ok(!created.includes("Theory of Morality"));
});

check("without a link the gap closes and nothing else changes", () => {
	const result = splitProblemNote({
		source: note,
		from: at("First idea"),
		to: at("Second idea"),
		title: "B",
		leaveLink: false,
	});
	assert.equal(result.source, note.replace("First idea, about conflicting criteria.\n\n", ""));
	assert.ok(result.created.endsWith("***\n\nFirst idea, about conflicting criteria.\n"));
});

check("text from the problem side becomes a problem awaiting its conjecture", () => {
	const two = note.replace("address?", "address?\n\nAnd what does authority do to fun?");
	const from = two.indexOf("And what");
	const result = splitProblemNote({
		source: two,
		from,
		to: two.indexOf("***"),
		title: "Authority and fun",
		leaveLink: false,
	});
	assert.equal(
		result.created,
		"---\nup: null\ncriticisms: null\ncategory: Default\n---\n\nAnd what does authority do to fun?\n***\n\n"
	);
	assert.equal(result.cursorOffset, result.created.length);
	assert.equal(result.source, note);
});

check("text holding its own *** is already a whole Problem Note", () => {
	const both = note + "\nA second problem?\n***\nIts conjecture.\n";
	const result = splitProblemNote({
		source: both,
		from: both.indexOf("A second problem?"),
		to: both.length,
		title: "Second",
		leaveLink: false,
	});
	assert.ok(result.created.endsWith("---\n\nA second problem?\n***\n\nIts conjecture.\n"));
	assert.equal(result.source, note);
});

check("part of a line moves and the sentence stays one line", () => {
	const result = splitProblemNote({
		source: note,
		from: at("about democracy"),
		to: at("about democracy") + "about democracy".length,
		title: "Democracy",
		leaveLink: true,
	});
	assert.ok(result.source.includes("Second idea, [[Democracy]].\nMore on the second idea."));
	assert.ok(result.created.endsWith("***\n\nabout democracy\n"));
});

check("a template is converted to the source CRLF line endings", () => {
	const crlf = "---\r\ncategory:\r\n  - Enlightenment and Institutions\r\nanki_note_id: 5\r\n---\r\nQ\r\n***\r\nA\r\n\r\nB\r\n";
	const result = splitProblemNote({
		source: crlf,
		from: crlf.indexOf("B"),
		to: crlf.length,
		title: "B note",
		leaveLink: false,
	});
	assert.equal(
		result.created,
		"---\r\nup: null\r\ncriticisms: null\r\ncategory: Default\r\n---\r\n\r\n***\r\n\r\nB\r\n"
	);
	assert.equal(result.source, crlf.replace("\r\n\r\nB\r\n", "\r\n"));
});

check("a note with no deck goes to Default", () => {
	const plain = "Q\n***\nA\n\nB\n";
	const result = splitProblemNote({ source: plain, from: plain.indexOf("B"), to: plain.length, title: "B", leaveLink: false });
	assert.ok(result.created.startsWith("---\nup: null\ncriticisms: null\ncategory: Default\n---\n"));
});

check("a note withdrawn from Anki splits into a withdrawn note", () => {
	const withdrawn = ["---", "collection: People", "anki_note_id: 9", "---", "Q", "***", "A", "", "B", ""].join(NL);
	const result = splitProblemNote({
		source: withdrawn,
		from: withdrawn.lastIndexOf("B"),
		to: withdrawn.length,
		title: "B",
		leaveLink: false,
		template: template.replace("category: Default", "category: Default\ncollection: People"),
	});
	assert.ok(result.created.includes("collection: People"));
	assert.ok(!result.created.includes("anki_note_id"));
});

check("refusals say what is wrong", () => {
	const base = { source: note, from: at("Second idea"), to: note.length, leaveLink: false };
	assert.match(splitProblemNote({ ...base, title: " " }), /name/);
	assert.match(splitProblemNote({ ...base, title: "a/b" }), /cannot contain/);
	assert.match(splitProblemNote({ ...base, title: "B", from: 4 }), /below the properties/);
	assert.match(splitProblemNote({ ...base, title: "B", from: note.length }), /nothing to move/);
	assert.match(splitProblemNote({ ...base, title: "B", from: at("What problem") }), /whole note/);
	assert.equal(titleProblem("Fun criterion and democracy"), null);
	assert.equal(bodyStart("no properties"), 0);
});

check("the original divider cannot be moved", () => {
	assert.match(splitProblemNote({
		source: note, from: at("***"),
		to: at("Second idea"), title: "B", leaveLink: true,
	}), /original.*divider/);
});

check("template fields survive and only placement comes from the source", () => {
	assert.deepEqual(
		childProperties(
			{ up: null, criticisms: null, category: "Default", custom: 1, anki_note_id: 5 },
			{ up: ["[[A]]"], criticisms: ["[[B]]"], category: "Ethics", collection: "People", exclude_resurface: true },
		),
		{ up: null, criticisms: null, category: "Ethics", collection: "People", exclude_resurface: true, custom: 1 },
	);
	const result = splitProblemNote({
		source: note, from: at("Second idea"), to: note.length, title: "B", leaveLink: true,
		template: template.replace("***", "Scaffold\n\n***"),
	});
	assert.match(result.created, /Scaffold\n\n\*\*\*/);
});

console.log(`Split note: ${cases} cases passed`);
