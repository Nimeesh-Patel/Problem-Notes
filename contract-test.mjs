import { build } from "esbuild";
import fs from "node:fs";

const compiled = await build({
	entryPoints: ["problem_note_contract.ts"],
	bundle: true,
	platform: "node",
	format: "cjs",
	write: false,
});
const module = { exports: {} };
new Function("module", "exports", compiled.outputFiles[0].text)(
	module,
	module.exports
);
const fixture = JSON.parse(
	fs.readFileSync("fixtures/problem_note_conformance.json", "utf8")
);
const fields = {
	hasSeparator: "has_separator",
	problem: "problem",
	conjecture: "conjecture",
	reviewable: "reviewable",
};
for (const item of fixture.cases) {
	const actual = module.exports.parseProblemNoteStructure(item.text);
	for (const [field, fixtureField] of Object.entries(fields)) {
		if (actual[field] !== item[fixtureField]) {
			throw new Error(
				`${item.name}: ${field} expected ${JSON.stringify(item[fixtureField])}, got ${JSON.stringify(actual[field])}`
			);
		}
	}
}
console.log(`Problem Note contract: ${fixture.cases.length} cases passed`);
