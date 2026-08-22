#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	candidateConfigPaths,
	defaultConfigPath,
	loadConfig,
	resolveCollection,
} from "../lib/config.mjs";
import {
	addFiles,
	addNewFiles,
	formatPlan,
	indexCollection,
	searchCollection,
} from "../lib/index-notes.mjs";

const USAGE = `pi-mnemosyne-kb — index a Markdown directory into a named Mnemosyne collection

Usage:
  pi-mnemosyne-kb status
  pi-mnemosyne-kb init-config
  pi-mnemosyne-kb index [--collection NAME] [--dry-run]
      Full rebuild. Deletes the collection and re-reads every note.
      Use this after editing or deleting existing notes.
  pi-mnemosyne-kb add [--collection NAME] [--dry-run] <file.md> [file.md...]
      Append specific new notes. Does not delete old chunks.
      Files must sit under the configured notes path.
  pi-mnemosyne-kb add --new [--collection NAME] [--dry-run]
      Append notes on disk that are not in the collection yet.
  pi-mnemosyne-kb search <query> [--collection NAME] [--limit N]

Config (first existing file wins):
  $PI_MNEMOSYNE_KB_CONFIG
  ./.pi/mnemosyne-kb.json
  ~/.pi/agent/mnemosyne-kb.json

This package does not ship notes or a Mnemosyne database.
`;

function print(message) {
	process.stdout.write(`${message}\n`);
}

function fail(message, code = 1) {
	process.stderr.write(`${message}\n`);
	process.exit(code);
}

function parseArgs(argv) {
	const args = { _: [] };
	for (let i = 0; i < argv.length; i += 1) {
		const token = argv[i];
		if (token === "--dry-run") {
			args.dryRun = true;
		} else if (token === "--collection" || token === "-n") {
			args.collection = argv[i + 1];
			i += 1;
		} else if (token === "--new") {
			args.new = true;
		} else if (token === "--limit") {
			args.limit = Number(argv[i + 1]);
			i += 1;
		} else if (token === "--help" || token === "-h") {
			args.help = true;
		} else if (token.startsWith("-")) {
			fail(`Unknown flag: ${token}\n\n${USAGE}`);
		} else {
			args._.push(token);
		}
	}
	return args;
}

function cmdStatus() {
	const paths = candidateConfigPaths();
	print("Config search order:");
	for (const candidate of paths) {
		print(`  ${fs.existsSync(candidate) ? "*" : " "} ${candidate}`);
	}

	const config = loadConfig();
	print("");
	print(`Loaded: ${config.source || "(none — env or empty)"}`);
	print(`Recall limit: ${config.limit}`);
	print(`Collections: ${config.collections.length}`);
	for (const collection of config.collections) {
		const exists = fs.existsSync(collection.path) ? "ok" : "MISSING";
		print(`  - ${collection.name}  ${collection.path}  [${exists}]`);
	}
	if (config.collections.length === 0) {
		print("");
		print("No collections configured. Run: pi-mnemosyne-kb init-config");
	}
}

function cmdInitConfig() {
	const dest = defaultConfigPath();
	if (fs.existsSync(dest)) {
		fail(`Config already exists: ${dest}`);
	}
	const example = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "config.example.json");
	fs.mkdirSync(path.dirname(dest), { recursive: true });
	fs.copyFileSync(example, dest);
	print(`Wrote ${dest}`);
	print("Edit the collection name and notes path, then run: pi-mnemosyne-kb index --dry-run");
}

function cmdIndex(args) {
	const config = loadConfig();
	const collection = resolveCollection(config, args.collection);
	const result = indexCollection(collection, config, {
		dryRun: Boolean(args.dryRun),
		onProgress: ({ added, total, file, ok }) => {
			const mark = ok ? "ok" : "ERR";
			process.stderr.write(`[${added}/${total}] ${mark} ${file}\n`);
		},
	});
	print(formatPlan(result));
	if (result.errors?.length) process.exit(2);
}

function cmdAdd(args) {
	const config = loadConfig();
	const collection = resolveCollection(config, args.collection);
	const files = args._.slice(1);
	const progress = ({
		added, total, file, ok,
	}) => {
		process.stderr.write(`[${added}/${total}] ${ok ? "ok" : "ERR"} ${file}\n`);
	};

	let result;
	if (args.new) {
		if (files.length) fail("add --new does not take file arguments");
		result = addNewFiles(collection, config, {
			dryRun: Boolean(args.dryRun),
			onProgress: progress,
		});
	} else {
		if (!files.length) fail("add requires file.md arguments, or use add --new");
		result = addFiles(collection, config, files, {
			dryRun: Boolean(args.dryRun),
			onProgress: progress,
		});
	}
	print(formatPlan(result));
	if (result.errors?.length) process.exit(2);
}

function cmdSearch(args) {
	const query = args._.slice(1).join(" ").trim();
	if (!query) fail("search requires a query");
	const config = loadConfig();
	const collection = resolveCollection(config, args.collection);
	const limit = Number.isFinite(args.limit) && args.limit > 0 ? args.limit : config.limit;
	const result = searchCollection(collection.name, query, limit);
	print(result.text);
	if (result.code !== 0) process.exit(result.code);
}

const args = parseArgs(process.argv.slice(2));
if (args.help || args._.length === 0) {
	print(USAGE);
	process.exit(args.help ? 0 : 1);
}

const command = args._[0];
try {
	if (command === "status") cmdStatus();
	else if (command === "init-config") cmdInitConfig();
	else if (command === "index") cmdIndex(args);
	else if (command === "add") cmdAdd(args);
	else if (command === "search") cmdSearch(args);
	else fail(`Unknown command: ${command}\n\n${USAGE}`);
} catch (error) {
	fail(error.message);
}
