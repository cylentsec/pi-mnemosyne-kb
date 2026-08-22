import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { loadConfig, resolveCollection } from "../lib/config.mjs";

const originalEnv = { ...process.env };

afterEach(() => {
	for (const key of Object.keys(process.env)) {
		if (!(key in originalEnv)) delete process.env[key];
	}
	for (const [key, value] of Object.entries(originalEnv)) {
		process.env[key] = value;
	}
});

test("loadConfig reads the PI_MNEMOSYNE_KB_CONFIG file", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-config-"));
	const file = path.join(dir, "mnemosyne-kb.json");
	fs.writeFileSync(
		file,
		JSON.stringify({
			limit: 8,
			collections: [{ name: "AppSec", path: dir, tags: ["appsec"] }],
		}),
	);
	process.env.PI_MNEMOSYNE_KB_CONFIG = file;
	delete process.env.PI_MNEMOSYNE_KB_COLLECTION;
	delete process.env.PI_MNEMOSYNE_KB_PATH;

	const config = loadConfig();
	assert.equal(config.source, file);
	assert.equal(config.limit, 8);
	assert.equal(config.collections[0].name, "AppSec");
	assert.equal(resolveCollection(config).name, "AppSec");
});

test("rejects the reserved collection name global", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-config-"));
	const file = path.join(dir, "mnemosyne-kb.json");
	fs.writeFileSync(
		file,
		JSON.stringify({
			collections: [{ name: "global", path: dir }],
		}),
	);
	process.env.PI_MNEMOSYNE_KB_CONFIG = file;
	delete process.env.PI_MNEMOSYNE_KB_COLLECTION;
	delete process.env.PI_MNEMOSYNE_KB_PATH;
	assert.throws(() => loadConfig(), /cannot be "global"/);
});
