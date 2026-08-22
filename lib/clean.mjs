/**
 * Prepare a Markdown note for Mnemosyne.
 *
 * The embedder is a 512-token sentence model. Base64 images and YAML
 * frontmatter destroy retrieval quality, so they are stripped before ingest.
 */

export function stripFrontmatter(text) {
	if (!text.startsWith("---")) return text;
	const newline = text.indexOf("\n");
	if (newline === -1) return text;
	const closer = text.indexOf("\n---", newline);
	if (closer === -1) return text;
	const afterCloser = closer + 4;
	if (afterCloser < text.length && text[afterCloser] !== "\n" && text[afterCloser] !== "\r") {
		return text;
	}
	const bodyStart = text.indexOf("\n", afterCloser);
	return bodyStart === -1 ? "" : text.slice(bodyStart + 1);
}

export function stripDataImages(text) {
	return text
		.replace(/!\[[^\]]*\]\(\s*data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+\)/g, "")
		.replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+/g, "");
}

export function cleanMarkdown(text) {
	let cleaned = stripFrontmatter(String(text ?? ""));
	cleaned = stripDataImages(cleaned);
	cleaned = cleaned.replace(/\r\n/g, "\n");
	cleaned = cleaned.replace(/[ \t]+\n/g, "\n");
	cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
	return cleaned.trim();
}

export function shouldSkipPath(filePath, skipPathContains) {
	const normalized = filePath.replaceAll("\\", "/");
	for (const fragment of skipPathContains) {
		if (fragment && normalized.includes(fragment)) {
			return fragment;
		}
	}
	return null;
}
