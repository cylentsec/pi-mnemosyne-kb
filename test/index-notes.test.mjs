import assert from "node:assert/strict";
import { test } from "node:test";
import { parseListedSources } from "../lib/index-notes.mjs";

test("parseListedSources maps Source stamps to document IDs", () => {
	const listed = [
		"[6353] 2026-08-22 13:17:32 - [Source: AppSec/XSS in JSON.md]",
		"",
		"https://example.com",
		"[2614] 2026-08-22 13:13:13 - [Path: Blind SQL Injection > Introduction]",
		"",
		"## Introduction",
		"[100] 2026-08-22 13:10:00 - [Source: AppSec/Web/SQLi.md]",
		"",
		"[Path: SQLi]",
		"[101] 2026-08-22 13:10:01 - [Source: AppSec/Web/SQLi.md]",
		"",
	].join("\n");

	const map = parseListedSources(listed);
	assert.deepEqual(map.get("AppSec/XSS in JSON.md"), [6353]);
	assert.deepEqual(map.get("AppSec/Web/SQLi.md"), [100, 101]);
	assert.equal(map.has("Blind SQL Injection > Introduction"), false);
});
