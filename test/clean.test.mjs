import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanMarkdown, shouldSkipPath, stripFrontmatter } from "../lib/clean.mjs";

test("stripFrontmatter removes YAML between --- fences", () => {
	const input = "---\ntags:\n- xss\n---\n# Title\n\nbody\n";
	assert.equal(stripFrontmatter(input), "# Title\n\nbody\n");
});

test("stripFrontmatter leaves markdown that is not frontmatter", () => {
	const input = "# Title\n\n---\nnot frontmatter\n";
	assert.equal(stripFrontmatter(input), input);
});

test("cleanMarkdown drops data-uri images and frontmatter", () => {
	const input = [
		"---",
		"created: 2025-01-01",
		"---",
		"",
		"# Note",
		"",
		"![diagram](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA)",
		"",
		"Useful sentence about SSRF.",
		"",
	].join("\n");
	const cleaned = cleanMarkdown(input);
	assert.match(cleaned, /Useful sentence about SSRF/);
	assert.doesNotMatch(cleaned, /base64/);
	assert.doesNotMatch(cleaned, /created:/);
});

test("shouldSkipPath matches configured fragments", () => {
	assert.equal(
		shouldSkipPath("/vault/AppSec/.obsidian/workspace.json", [".obsidian", "/Attachments/"]),
		".obsidian",
	);
	assert.equal(shouldSkipPath("/vault/AppSec/Web/XSS.md", [".obsidian", "/Attachments/"]), null);
});
