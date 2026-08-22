import { spawnSync } from "node:child_process";

export function runMnemosyne(args, options = {}) {
	const result = spawnSync("mnemosyne", args, {
		encoding: "utf8",
		cwd: options.cwd,
		maxBuffer: 32 * 1024 * 1024,
	});

	if (result.error) {
		const notFound = result.error.code === "ENOENT";
		return {
			code: 127,
			stdout: "",
			stderr: notFound
				? "mnemosyne binary not found on PATH. Install: https://github.com/gandazgul/mnemosyne"
				: result.error.message,
		};
	}

	return {
		code: result.status ?? 1,
		stdout: result.stdout || "",
		stderr: result.stderr || "",
	};
}

export function mnemosyneOutput(result) {
	return (result.stdout || result.stderr || "").trim();
}
