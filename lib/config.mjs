import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const DEFAULT_LIMIT = 6;
export const DEFAULT_MAX_RAW_BYTES = 8_000_000;
export const DEFAULT_MAX_CLEAN_BYTES = 400_000;
export const DEFAULT_SKIP_PATH_CONTAINS = [
	".obsidian",
	".git",
	"node_modules",
	"/Attachments/",
];

/**
 * Config search order (first file that exists wins):
 *   1. $PI_MNEMOSYNE_KB_CONFIG
 *   2. <cwd>/.pi/mnemosyne-kb.json
 *   3. ~/.pi/agent/mnemosyne-kb.json
 *
 * Env overrides applied on top:
 *   PI_MNEMOSYNE_KB_COLLECTION, PI_MNEMOSYNE_KB_PATH, PI_MNEMOSYNE_KB_LIMIT
 */
export function candidateConfigPaths() {
	const paths = [];
	if (process.env.PI_MNEMOSYNE_KB_CONFIG) {
		paths.push(path.resolve(process.env.PI_MNEMOSYNE_KB_CONFIG));
	}
	paths.push(path.resolve(process.cwd(), ".pi", "mnemosyne-kb.json"));
	paths.push(path.join(os.homedir(), ".pi", "agent", "mnemosyne-kb.json"));
	return paths;
}

export function defaultConfigPath() {
	return path.join(os.homedir(), ".pi", "agent", "mnemosyne-kb.json");
}

function isPlainObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeCollection(raw, index) {
	if (!isPlainObject(raw)) {
		throw new Error(`collections[${index}] must be an object`);
	}
	const name = String(raw.name || "").trim();
	const notesPath = String(raw.path || "").trim();
	if (!name) {
		throw new Error(`collections[${index}].name is required`);
	}
	if (name === "global") {
		throw new Error(`collections[${index}].name cannot be "global" (reserved by pi-mnemosyne)`);
	}
	if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) {
		throw new Error(
			`collections[${index}].name ${JSON.stringify(name)} must match [A-Za-z0-9][A-Za-z0-9._-]*`,
		);
	}
	if (!notesPath) {
		throw new Error(`collections[${index}].path is required`);
	}
	const tags = Array.isArray(raw.tags)
		? raw.tags.map((tag) => String(tag).trim()).filter(Boolean)
		: [];
	return {
		name,
		path: notesPath.startsWith("~")
			? path.join(os.homedir(), notesPath.slice(1).replace(/^\/+/, ""))
			: path.resolve(notesPath),
		tags,
	};
}

function emptyConfig() {
	return {
		source: null,
		limit: DEFAULT_LIMIT,
		maxRawBytes: DEFAULT_MAX_RAW_BYTES,
		maxCleanBytes: DEFAULT_MAX_CLEAN_BYTES,
		skipPathContains: [...DEFAULT_SKIP_PATH_CONTAINS],
		collections: [],
	};
}

export function loadConfig() {
	const config = emptyConfig();

	for (const candidate of candidateConfigPaths()) {
		if (!fs.existsSync(candidate)) continue;
		let parsed;
		try {
			parsed = JSON.parse(fs.readFileSync(candidate, "utf8"));
		} catch (error) {
			throw new Error(`Failed to parse ${candidate}: ${error.message}`);
		}
		if (!isPlainObject(parsed)) {
			throw new Error(`${candidate} must contain a JSON object`);
		}
		config.source = candidate;
		if (Number.isFinite(parsed.limit)) config.limit = Number(parsed.limit);
		if (Number.isFinite(parsed.maxRawBytes)) config.maxRawBytes = Number(parsed.maxRawBytes);
		if (Number.isFinite(parsed.maxCleanBytes)) config.maxCleanBytes = Number(parsed.maxCleanBytes);
		if (Array.isArray(parsed.skipPathContains)) {
			config.skipPathContains = parsed.skipPathContains.map(String).filter(Boolean);
		}
		if (Array.isArray(parsed.collections)) {
			config.collections = parsed.collections.map(normalizeCollection);
		}
		break;
	}

	if (process.env.PI_MNEMOSYNE_KB_LIMIT) {
		const limit = Number(process.env.PI_MNEMOSYNE_KB_LIMIT);
		if (!Number.isFinite(limit) || limit < 1) {
			throw new Error("PI_MNEMOSYNE_KB_LIMIT must be a positive number");
		}
		config.limit = limit;
	}

	const envName = process.env.PI_MNEMOSYNE_KB_COLLECTION?.trim();
	const envPath = process.env.PI_MNEMOSYNE_KB_PATH?.trim();
	if (envName || envPath) {
		if (!envName || !envPath) {
			throw new Error("Set both PI_MNEMOSYNE_KB_COLLECTION and PI_MNEMOSYNE_KB_PATH");
		}
		const fromEnv = normalizeCollection({ name: envName, path: envPath, tags: [] }, 0);
		const rest = config.collections.filter((item) => item.name !== fromEnv.name);
		config.collections = [fromEnv, ...rest];
	}

	if (config.limit < 1 || config.limit > 50) {
		throw new Error("limit must be between 1 and 50");
	}

	const seen = new Set();
	for (const collection of config.collections) {
		if (seen.has(collection.name)) {
			throw new Error(`Duplicate collection name: ${collection.name}`);
		}
		seen.add(collection.name);
	}

	return config;
}

export function resolveCollection(config, requestedName) {
	if (config.collections.length === 0) {
		throw new Error(
			"No collections configured. Copy config.example.json to ~/.pi/agent/mnemosyne-kb.json",
		);
	}
	if (requestedName) {
		const match = config.collections.find((item) => item.name === requestedName);
		if (!match) {
			const available = config.collections.map((item) => item.name).join(", ");
			throw new Error(`Unknown collection ${JSON.stringify(requestedName)}. Available: ${available}`);
		}
		return match;
	}
	if (config.collections.length === 1) {
		return config.collections[0];
	}
	const available = config.collections.map((item) => item.name).join(", ");
	throw new Error(`Multiple collections configured; pass one of: ${available}`);
}
