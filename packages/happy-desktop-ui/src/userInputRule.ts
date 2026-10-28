/** Where a question prompt is shown: the transcript card or a flat list. */
export type HappyAgentUserInputPromptVariant = "card" | "flat";

/**
 * The line beside a question's name: how many of its options may be taken, so
 * the rule is read before the options rather than discovered by clicking one.
 * An optional question says so too: nothing under it is holding the submit
 * back. A settled question keeps the same words, so answering it changes
 * nothing about its card's size. The prompt and its modeled row height read
 * the same words.
 */
export function userInputRuleText(
    question: {
        readonly multiSelect: boolean;
        readonly required: boolean;
        readonly options: readonly unknown[];
    },
    variant: HappyAgentUserInputPromptVariant,
): string {
    const count =
        question.options.length === 0
            ? variant === "card"
                ? "Reply in the message box"
                : "Open chat to reply"
            : question.multiSelect
              ? "Choose any"
              : "Choose one";
    return question.required ? count : `${count} · optional`;
}
