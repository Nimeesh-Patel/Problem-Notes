import { parseProblemNoteStructure } from "./problem_note_contract";

export interface SourceSection {
  text: string;
  lineStart: number;
  lineEnd: number;
}

/** Map the authored first *** to its own rendered rule, never any earlier hr.
 * If source information or the correspondence is unavailable, leave Markdown
 * visible. A thematic break is not authority to hide someone else's prose.
 */
export function findAuthoredSeparator(el: HTMLElement, info: SourceSection | null): HTMLHRElement | null {
  if (!info) return null;
  const parsed = parseProblemNoteStructure(info.text);
  const separator = parsed.separatorLine;
  if (separator === null || separator < info.lineStart || separator > info.lineEnd) return null;
  const lines = info.text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  let bodyStart = 0;
  if (lines[0]?.trim() === "---") {
    const close = lines.slice(1).findIndex(line => line.trim() === "---");
    if (close >= 0) bodyStart = close + 2;
  }
  let inFence = false;
  const rules: number[] = [];
  for (let index = bodyStart; index < lines.length; index++) {
    const line = lines[index].trim();
    if (line.startsWith("```")) { inFence = !inFence; continue; }
    if (inFence || index < info.lineStart || index > info.lineEnd) continue;
    if (/^(?:\*\s*){3,}$/.test(line) || /^(?:-\s*){3,}$/.test(line) || /^(?:_\s*){3,}$/.test(line)) rules.push(index);
  }
  const rendered = el.tagName === "HR" ? [el as HTMLHRElement] : Array.from(el.querySelectorAll<HTMLHRElement>("hr"));
  // Setext headings, embeds and raw HTML can make source/DOM correspondence
  // ambiguous; do not guess which rendered element owns the separator.
  if (rules.length !== rendered.length) return null;
  const position = rules.indexOf(separator);
  return position < 0 ? null : rendered[position];
}
