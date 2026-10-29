import { chatActionSegments, type ChatActionBlock } from "./chatActionBlocks.js";
import { chatActionParams } from "./chatActionsStore.js";

/**
 * A press as the daemon stores it in the person's action message. The
 * published client does not type the `action` block yet, so it is read here
 * against API.md's shape.
 */
export type ChatActionPressBlock = {
    readonly messageId: string;
    readonly blockIndex: number;
    readonly actionId: string;
    readonly params: Readonly<Record<string, string>>;
    readonly values: readonly string[];
    /** What the control said when it was pressed, stored by the daemon. */
    readonly label?: string;
    /** A checklist's ticked options, by label, in the order they were shown. */
    readonly ticked?: readonly string[];
};

/** A message's action block, or undefined when it has none. */
export function chatActionPressRead(content: readonly object[]): ChatActionPressBlock | undefined {
    for (const block of content) {
        const raw = block as Record<string, unknown>;
        if (raw.type !== "action") continue;
        if (typeof raw.messageId !== "string" || typeof raw.blockIndex !== "number") continue;
        if (typeof raw.actionId !== "string") continue;
        const params: Record<string, string> = {};
        if (typeof raw.params === "object" && raw.params !== null)
            for (const [key, value] of Object.entries(raw.params as Record<string, unknown>))
                if (typeof value === "string") params[key] = value;
        const strings = (value: unknown): string[] =>
            Array.isArray(value)
                ? value.filter((each): each is string => typeof each === "string")
                : [];
        return {
            messageId: raw.messageId,
            blockIndex: raw.blockIndex,
            actionId: raw.actionId,
            params,
            values: strings(raw.values),
            ...(typeof raw.label === "string" && raw.label.length > 0 ? { label: raw.label } : {}),
            ...(Array.isArray(raw.ticked) ? { ticked: strings(raw.ticked) } : {}),
        };
    }
    return undefined;
}

/**
 * What a press says as the person's message: the button's label, or a
 * checklist's submit and what was ticked, "Use selected: Codex, Claude". The
 * daemon stores both at press time; a press stored before it did is read from
 * the control it names in `referencedText`, the text of the message it was in.
 * A code field never says what was typed.
 */
export function chatActionPressText(
    press: ChatActionPressBlock,
    referencedText: readonly string[] | undefined,
): string {
    if (press.label !== undefined)
        return press.ticked && press.ticked.length > 0
            ? `${press.label}: ${press.ticked.join(", ")}`
            : press.label;
    const block = referencedText
        ?.flatMap((text) =>
            chatActionSegments(text).flatMap((segment) =>
                segment.type === "actions" && segment.block ? [segment.block] : [],
            ),
        )
        .at(press.blockIndex);
    return (block && controlText(block, press)) ?? "Sent";
}

function controlText(block: ChatActionBlock, press: ChatActionPressBlock): string | undefined {
    const pressed = (label: string, action: { readonly id: string } | undefined) =>
        action?.id === press.actionId &&
        Object.entries(chatActionParams(action as Parameters<typeof chatActionParams>[0])).every(
            ([key, value]) => press.params[key] === value,
        )
            ? label
            : undefined;
    if (block.kind === "buttons") {
        for (const button of block.buttons) {
            const label = pressed(button.label, button.action);
            if (label) return label;
        }
        return undefined;
    }
    if (block.kind === "checklist") {
        for (const button of block.others) {
            const label = pressed(button.label, button.action);
            if (label) return label;
        }
        if (block.actionId !== press.actionId) return undefined;
        const ticked = block.options
            .filter((option) => press.values.includes(option.value))
            .map((option) => option.label);
        return ticked.length > 0
            ? `${block.submit.label}: ${ticked.join(", ")}`
            : (block.submit.emptyLabel ?? block.submit.label);
    }
    return undefined;
}
