import type { ChatActionBlock } from "happy-desktop-state";

/**
 * The drawn height of each live figure whose size its markup cannot state,
 * such as a proposed sidebar, whose rows come from the daemon after the reply
 * is laid out.
 *
 * The transcript lays a reply out from its markup alone, so such a figure
 * reports its height here once it has drawn, by the thing it shows; every
 * reply holding it is laid out again from then on — the one resize when it
 * first loads or changes, and the exact box at once on every later mount.
 *
 * Bounded, and memory only.
 */

/** How many figures' heights are kept; the oldest is forgotten first. */
const HEIGHTS_LIMIT = 256;

/** The box a figure holds before it has ever drawn. */
export const CHAT_ACTION_FIGURE_HEIGHT_UNKNOWN = 120;

const heights = new Map<string, number>();
const listeners = new Set<() => void>();
let version = 0;

/** Keeps a figure's drawn height, by the key `chatActionFigureKey` gives it. */
export function chatActionFigureHeightRecord(key: string, height: number): void {
    const rounded = Math.ceil(height);
    if (!(rounded > 0) || heights.get(key) === rounded) return;
    heights.delete(key);
    heights.set(key, rounded);
    if (heights.size > HEIGHTS_LIMIT) heights.delete(heights.keys().next().value!);
    version += 1;
    for (const listener of listeners) listener();
}

/** A figure's height as last drawn, or the box it holds before that. */
export function chatActionFigureHeight(key: string): number {
    return heights.get(key) ?? CHAT_ACTION_FIGURE_HEIGHT_UNKNOWN;
}

/** Changes whenever a height is learned; a layout that read the heights reads them again. */
export function chatActionFigureHeightsVersion(): number {
    return version;
}

export function chatActionFigureHeightsSubscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/** What a figure whose height is learned is keyed by; undefined for a fixed one. */
export function chatActionFigureKey(block: ChatActionBlock): string | undefined {
    return block.kind === "sidebarProposal" ? `sidebar-proposal:${block.artifactId}` : undefined;
}

/** The learned heights a block's layout reads, as part of a row's cache key. */
export function chatActionFigureSignature(block: ChatActionBlock, _at: number = version): string {
    const key = chatActionFigureKey(block);
    return key === undefined ? "" : `${String(chatActionFigureHeight(key))},`;
}
