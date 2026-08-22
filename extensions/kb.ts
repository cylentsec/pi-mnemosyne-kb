/**
 * pi-mnemosyne-kb — companion to pi-mnemosyne.
 *
 * Does NOT replace memory_recall / memory_store.
 * Adds kb_recall / kb_index against a configured named collection.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { loadConfig, resolveCollection } from "../lib/config.mjs";
import { formatPlan, indexCollection, searchCollection } from "../lib/index-notes.mjs";

type KbConfig = ReturnType<typeof loadConfig>;

function safeLoadConfig(): { config?: KbConfig; error?: string } {
	try {
		return { config: loadConfig() };
	} catch (error) {
		return { error: error instanceof Error ? error.message : String(error) };
	}
}

function collectionNames(config: KbConfig): string[] {
	return config.collections.map((item) => item.name);
}

export default function mnemosyneKbExtension(pi: ExtensionAPI): void {
	const loaded = safeLoadConfig();
	const names = loaded.config ? collectionNames(loaded.config) : [];
	const defaultName = names.length === 1 ? names[0] : null;

	const recallParams =
		names.length > 1
			? Type.Object({
					query: Type.String({
						description: "Semantic search query against the notes collection",
					}),
					collection: Type.String({
						description: `Which configured collection to search. One of: ${names.join(", ")}`,
					}),
				})
			: Type.Object({
					query: Type.String({
						description: "Semantic search query against the notes collection",
					}),
				});

	pi.registerTool({
		name: "kb_recall",
		label: "KB Recall",
		description: defaultName
			? `Search the local "${defaultName}" notes collection (Mnemosyne knowledge base). Use this for methodology, techniques, payloads, and checklists. Do not use memory_recall for those notes.`
			: "Search a configured local Markdown notes collection in Mnemosyne. Use this for methodology notes, not for session memory.",
		promptSnippet: defaultName
			? `Search the ${defaultName} notes knowledge base`
			: "Search the configured notes knowledge base",
		promptGuidelines: [
			"Use kb_recall for methodology, techniques, payloads, and checklists stored in the notes collection.",
			"Use memory_recall / memory_recall_global for session decisions and personal preferences, not for those notes.",
			"Do not invent AppSec procedures when kb_recall can be used first.",
		],
		parameters: recallParams,
		async execute(_toolCallId, params) {
			const current = safeLoadConfig();
			if (current.error || !current.config) {
				return {
					content: [
						{
							type: "text",
							text: `kb_recall is not configured: ${current.error || "no config"}. Copy config.example.json to ~/.pi/agent/mnemosyne-kb.json`,
						},
					],
				};
			}
			try {
				const collection = resolveCollection(current.config, params.collection);
				const result = searchCollection(collection.name, params.query, current.config.limit);
				return {
					content: [{ type: "text", text: result.text }],
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: error instanceof Error ? error.message : String(error),
						},
					],
				};
			}
		},
	});

	pi.registerTool({
		name: "kb_index",
		label: "KB Index",
		description:
			"Rebuild a configured notes collection from its Markdown directory. Never index customer data, engagement evidence, or secrets. Requires confirm=INDEX.",
		promptSnippet: "Rebuild the configured notes knowledge base from Markdown",
		promptGuidelines: [
			"Use kb_index only when the user explicitly asks to reindex their own notes.",
			"Never call kb_index on customer directories or during an engagement unless the user names their own notes path.",
		],
		parameters: Type.Object({
			confirm: Type.String({
				description: 'Safety latch. Must be the exact string INDEX.',
			}),
			collection: Type.Optional(
				Type.String({
					description:
						names.length > 0
							? `Collection to rebuild. One of: ${names.join(", ")}. Optional if only one is configured.`
							: "Collection to rebuild.",
				}),
			),
			dryRun: Type.Optional(
				Type.Boolean({
					description: "If true, list files that would be indexed without writing to Mnemosyne.",
				}),
			),
		}),
		async execute(_toolCallId, params) {
			if (params.confirm !== "INDEX") {
				return {
					content: [
						{
							type: "text",
							text: 'Refused. Pass confirm="INDEX" after the user explicitly asked to reindex their own notes.',
						},
					],
				};
			}
			const current = safeLoadConfig();
			if (current.error || !current.config) {
				return {
					content: [
						{
							type: "text",
							text: `kb_index is not configured: ${current.error || "no config"}`,
						},
					],
				};
			}
			try {
				const collection = resolveCollection(current.config, params.collection);
				const result = indexCollection(collection, current.config, {
					dryRun: Boolean(params.dryRun),
				});
				return {
					content: [{ type: "text", text: formatPlan(result) }],
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: error instanceof Error ? error.message : String(error),
						},
					],
				};
			}
		},
	});

	pi.registerCommand("kb-status", {
		description: "Show pi-mnemosyne-kb config and collections",
		handler: async (_args, ctx) => {
			const current = safeLoadConfig();
			if (current.error || !current.config) {
				ctx.ui.notify(current.error || "No config", "error");
				return;
			}
			const lines = current.config.collections.map(
				(item) => `${item.name} -> ${item.path}`,
			);
			ctx.ui.notify(
				lines.length
					? `limit=${current.config.limit}\n${lines.join("\n")}`
					: "No collections configured",
				"info",
			);
		},
	});

	pi.registerCommand("kb-index", {
		description: "Rebuild the notes collection. Add --dry-run to preview.",
		handler: async (args, ctx) => {
			const current = safeLoadConfig();
			if (current.error || !current.config) {
				ctx.ui.notify(current.error || "No config", "error");
				return;
			}
			const dryRun = /\b--dry-run\b/.test(args || "");
			const nameMatch = args?.match(/--collection\s+(\S+)/);
			try {
				const collection = resolveCollection(current.config, nameMatch?.[1]);
				const result = indexCollection(collection, current.config, { dryRun });
				ctx.ui.notify(formatPlan(result), result.errors?.length ? "error" : "info");
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
			}
		},
	});

	pi.on("before_agent_start", async (event) => {
		const current = safeLoadConfig();
		if (!current.config || current.config.collections.length === 0) {
			return;
		}
		const listed = current.config.collections
			.map((item) => `"${item.name}"`)
			.join(", ");
		const reminder = `

Knowledge base (pi-mnemosyne-kb):
- Use kb_recall to search configured notes collection(s): ${listed}.
- Do not use memory_recall for those notes. memory_* is session memory only.
- Never write customer data, tokens, or engagement evidence into the knowledge base.`;
		return {
			systemPrompt: event.systemPrompt + reminder,
		};
	});
}
