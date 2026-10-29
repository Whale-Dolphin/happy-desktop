import type { ChatActionBlock, ChatActionChoice } from "./chatActionBlocks.js";

/**
 * A choice in one block as the daemon stores it on an agent message, by the
 * block's `blockIndex` (happy-agent API.md, "Inline actions"). A checklist's
 * other buttons count after its submit there, which is `0`.
 */
export type HappyAgentActionChoice =
    | ChatActionChoice
    /* A code field was submitted; what was typed is never stored. */
    | { readonly kind: "submitted" };

/**
 * An agent message's `actionChoices`, by block index. The published client
 * does not type the field yet, so it is read here against API.md's shape.
 */
export function happyAgentActionChoicesRead(
    message: object,
): ReadonlyMap<number, HappyAgentActionChoice> | undefined {
    const raw = (message as { actionChoices?: unknown }).actionChoices;
    if (typeof raw !== "object" || raw === null) return undefined;
    const choices = new Map<number, HappyAgentActionChoice>();
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        const index = Number(key);
        if (!Number.isInteger(index) || index < 0) continue;
        const choice = value as { kind?: unknown; index?: unknown; values?: unknown };
        if (choice.kind === "button" && typeof choice.index === "number")
            choices.set(index, { kind: "button", index: choice.index });
        else if (
            choice.kind === "checklist" &&
            Array.isArray(choice.values) &&
            choice.values.every((each) => typeof each === "string")
        )
            choices.set(index, { kind: "checklist", values: choice.values as string[] });
        else if (choice.kind === "submitted") choices.set(index, { kind: "submitted" });
    }
    return choices.size > 0 ? choices : undefined;
}

/**
 * A recorded choice as a block draws it. A checklist's other buttons count
 * after its submit in the daemon's record and from zero in the block; a
 * submitted code field leaves nothing chosen, since the field never locks.
 */
export function chatActionChoiceRecorded(
    block: ChatActionBlock,
    choice: HappyAgentActionChoice | undefined,
): ChatActionChoice | undefined {
    if (!choice || choice.kind === "submitted") return undefined;
    if (choice.kind === "button" && block.kind === "checklist")
        return choice.index >= 1 ? { kind: "button", index: choice.index - 1 } : undefined;
    return choice;
}
