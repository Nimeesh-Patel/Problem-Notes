export interface ProblemNoteStructure {
	hasSeparator: boolean;
	problem: string | null;
	conjecture: string | null;
	reviewable: boolean;
	separatorLine: number | null;
}

/** Minimal, semantic-free structure shared with Perspirator and Interest. */
export function parseProblemNoteStructure(source: string): ProblemNoteStructure {
	const normalized = source.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
	const lines = normalized.split("\n");
	let bodyStart = 0;
	if (lines[0]?.trim() === "---") {
		const close = lines.slice(1).findIndex((line) => line.trim() === "---");
		if (close >= 0) bodyStart = close + 2;
	}

	let inFence = false;
	let separatorLine: number | null = null;
	for (let index = bodyStart; index < lines.length; index++) {
		const line = lines[index].trim();
		if (line.startsWith("```")) {
			inFence = !inFence;
			continue;
		}
		if (!inFence && line === "***") {
			separatorLine = index;
			break;
		}
	}

	if (separatorLine === null) {
		return {
			hasSeparator: false,
			problem: null,
			conjecture: null,
			reviewable: false,
			separatorLine: null,
		};
	}
	const problem = lines.slice(bodyStart, separatorLine).join("\n").trim();
	const conjecture = lines.slice(separatorLine + 1).join("\n").trim();
	return {
		hasSeparator: true,
		problem,
		conjecture,
		reviewable: problem.length > 0 && conjecture.length > 0,
		separatorLine,
	};
}
