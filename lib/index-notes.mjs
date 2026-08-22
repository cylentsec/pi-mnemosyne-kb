import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cleanMarkdown, shouldSkipPath } from "./clean.mjs";
import { mnemosyneOutput, runMnemosyne } from "./mnemosyne.mjs";

export function walkMarkdown(root) {
	const files = [];

	function walk(dir) {
		let entries;
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(full);
			} else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
				files.push(full);
			}
		}
	}

	walk(root);
	return files.sort();
}

export function folderTags(notesRoot, filePath, extraTags) {
	const relativeDir = path.relative(notesRoot, path.dirname(filePath));
	const parts = !relativeDir || relativeDir === "." ? [] : relativeDir.split(path.sep);
	const tags = new Set(extraTags || []);
	for (const part of parts) {
		const tag = part
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "");
		if (tag && tag.length < 40) tags.add(tag);
	}
	return [...tags];
}

export function sourceLabel(collectionName, notesRoot, filePath) {
	const relative = path.relative(notesRoot, filePath).replaceAll(path.sep, "/");
	return `${collectionName}/${relative}`;
}

export function stampSource(collectionName, notesRoot, filePath, cleaned) {
	return `[Source: ${sourceLabel(collectionName, notesRoot, filePath)}]\n\n${cleaned}`;
}

export function planIndex(collection, config) {
	const notesRoot = collection.path;
	if (!fs.existsSync(notesRoot)) {
		throw new Error(`Notes path does not exist: ${notesRoot}`);
	}

	const planned = [];
	const skipped = [];

	for (const file of walkMarkdown(notesRoot)) {
		const pathSkip = shouldSkipPath(file, config.skipPathContains);
		if (pathSkip) {
			skipped.push({ file, reason: `path contains ${JSON.stringify(pathSkip)}` });
			continue;
		}

		let stat;
		try {
			stat = fs.statSync(file);
		} catch (error) {
			skipped.push({ file, reason: `stat failed: ${error.message}` });
			continue;
		}

		if (stat.size > config.maxRawBytes) {
			skipped.push({ file, reason: `raw size ${stat.size} exceeds maxRawBytes ${config.maxRawBytes}` });
			continue;
		}

		let raw;
		try {
			raw = fs.readFileSync(file, "utf8");
		} catch (error) {
			skipped.push({ file, reason: `read failed: ${error.message}` });
			continue;
		}

		const cleaned = cleanMarkdown(raw);
		if (cleaned.length < 40) {
			skipped.push({ file, reason: "too little text after cleaning" });
			continue;
		}
		if (cleaned.length > config.maxCleanBytes) {
			skipped.push({
				file,
				reason: `cleaned size ${cleaned.length} exceeds maxCleanBytes ${config.maxCleanBytes}`,
			});
			continue;
		}

		planned.push({
			file,
			bytes: cleaned.length,
			tags: folderTags(notesRoot, file, collection.tags),
			source: sourceLabel(collection.name, notesRoot, file),
		});
	}

	return { planned, skipped };
}

export function searchCollection(collectionName, query, limit) {
	const result = runMnemosyne([
		"search",
		"-n",
		collectionName,
		"-f",
		"plain",
		"--limit",
		String(limit),
		query,
	]);
	return {
		code: result.code,
		text: mnemosyneOutput(result) || "No notes found.",
	};
}

export function indexCollection(collection, config, options = {}) {
	const dryRun = Boolean(options.dryRun);
	const onProgress = options.onProgress;
	const { planned, skipped } = planIndex(collection, config);

	if (dryRun) {
		return {
			dryRun: true,
			collection: collection.name,
			path: collection.path,
			planned,
			skipped,
			added: 0,
			errors: [],
		};
	}

	const forget = runMnemosyne(["forget", "-n", collection.name, "--yes"]);
	const forgetText = mnemosyneOutput(forget).toLowerCase();
	const forgetMissing =
		forget.code !== 0 &&
		(forgetText.includes("does not exist") || forgetText.includes("not found"));
	if (forget.code !== 0 && !forgetMissing) {
		throw new Error(`mnemosyne forget failed: ${mnemosyneOutput(forget)}`);
	}

	const init = runMnemosyne(["init", "-n", collection.name]);
	if (init.code !== 0) {
		throw new Error(`mnemosyne init failed: ${mnemosyneOutput(init)}`);
	}

	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-mnemosyne-kb-"));
	const errors = [];
	let added = 0;

	try {
		for (const item of planned) {
			const cleaned = cleanMarkdown(fs.readFileSync(item.file, "utf8"));
			const stamped = stampSource(collection.name, collection.path, item.file, cleaned);
			const tmpFile = path.join(tmpDir, `${added}-${path.basename(item.file)}`);
			fs.writeFileSync(tmpFile, stamped, "utf8");

			const args = ["add", "--file", tmpFile, "-n", collection.name];
			for (const tag of item.tags) {
				args.push("-t", tag);
			}

			const add = runMnemosyne(args);
			const ok = add.code === 0;
			if (ok) {
				added += 1;
			} else {
				errors.push({ file: item.file, error: mnemosyneOutput(add) });
			}
			onProgress?.({ added, total: planned.length, file: item.file, ok });
		}
	} finally {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	}

	return {
		dryRun: false,
		collection: collection.name,
		path: collection.path,
		planned,
		skipped,
		added,
		errors,
	};
}

export function formatPlan(result) {
	const lines = [
		`${result.dryRun ? "Dry run" : "Indexed"} collection ${result.collection}`,
		`Notes path: ${result.path}`,
		`Planned files: ${result.planned.length}`,
		`Skipped files: ${result.skipped.length}`,
	];
	if (!result.dryRun) {
		lines.push(`Added files: ${result.added}`);
		lines.push(`Add errors: ${result.errors.length}`);
	}
	if (result.skipped.length) {
		lines.push("", "Skipped:");
		for (const item of result.skipped.slice(0, 40)) {
			lines.push(`  - ${item.file} (${item.reason})`);
		}
		if (result.skipped.length > 40) {
			lines.push(`  … ${result.skipped.length - 40} more`);
		}
	}
	if (result.errors?.length) {
		lines.push("", "Errors:");
		for (const item of result.errors.slice(0, 20)) {
			lines.push(`  - ${item.file}: ${item.error}`);
		}
	}
	return lines.join("\n");
}
