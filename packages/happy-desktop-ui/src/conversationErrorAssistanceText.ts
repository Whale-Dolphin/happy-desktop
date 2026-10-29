import type { ConversationErrorAssistance } from "happy-desktop-state";

/** Shared by the card and its exact virtual-row text geometry. */
export function conversationErrorAssistanceText(assistance: ConversationErrorAssistance): {
    readonly label: string;
    readonly detail?: string;
    readonly disabled: boolean;
} {
    switch (assistance.status) {
        case "ready":
            return { label: "Ask Happy", disabled: false };
        case "pending":
            return { label: "Preparing Happy draft…", disabled: true };
        case "prepared":
            return { label: "Draft prepared in Happy", disabled: true };
        case "failed":
            return {
                label: "Ask Happy",
                detail: `Could not prepare the draft: ${assistance.reason}`,
                disabled: false,
            };
        case "unavailable":
            return {
                label: "Ask Happy",
                detail: assistance.reason,
                disabled: true,
            };
    }
}
