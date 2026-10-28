import { EXTENSION_TO_FILE_FORMAT } from "@pierre/diffs";

/** Every language name Pierre's own extension table can produce. */
const FENCE_LANGUAGES = new Set<string>(
    Object.values(EXTENSION_TO_FILE_FORMAT).filter((name) => name !== undefined),
);

/** Resolves an external language label through the same vocabulary as the app. */
export function codeBlockLanguage(info: string | undefined): string | undefined {
    if (info === undefined) return undefined;
    const word =
        info
            .trim()
            .toLowerCase()
            .split(/[\s,:{]/)[0] ?? "";
    if (word.length === 0) return undefined;
    const mapped = EXTENSION_TO_FILE_FORMAT[word];
    if (mapped !== undefined) return mapped;
    return FENCE_LANGUAGES.has(word) ? word : undefined;
}
