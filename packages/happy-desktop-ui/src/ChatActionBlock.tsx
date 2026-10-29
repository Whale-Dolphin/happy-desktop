import { useId, useState, useSyncExternalStore, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
    CHAT_PROVIDER_IDS,
    chatChecklistAction,
    type ChatProviderId,
    type ChatActionBlock as ChatActionBlockModel,
    type ChatActionButton as ChatActionButtonModel,
    type ChatActionChoice,
    type ChatAction,
    type ChatStatusTone,
    type ChatStepStatus,
    type ChatTreeNode,
} from "happy-desktop-state";
import { AssistantMark } from "./AssistantMark";
import { Button } from "./Button";
import { Checkbox } from "./Checkbox";
import { HAPPY_MOBILE_STORE_URLS } from "./DesktopMobileSetup";
import { FileTree, type FileTreeNode } from "./FileTree";
import { QRCode } from "./QRCode";
import { clayIconMark, clayIconSlugIs } from "./clayIcons";
import { Ionicon } from "./vectorIcons/VectorIcon";
import { Spinner } from "./Spinner";
import { TextField } from "./TextField";
import { messageTextLayoutFontGenerationGet } from "./messageTextLayout";
import {
    chatActionFigureHeight,
    chatActionFigureHeightRecord,
    chatActionFigureHeightsSubscribe,
    chatActionFigureHeightsVersion,
    chatActionFigureSignature,
} from "./chatActionFigureHeights";

/**
 * C-330 ChatActionBlock — inline UI an agent wrote into its reply: a row of
 * buttons, a checklist with its submit, a list of steps, or one status line.
 *
 * It is laid on the chat, like every inline layout: no frame, no background,
 * the reply's own left edge and type. Buttons are outlined; at most one is
 * emphasized, and it is still outlined, only in ink. Pressing one marks it
 * chosen and locks the block, without changing the size of anything, so the
 * height the transcript reserved for the block stays true in every state. A
 * press never moves: it stays where it is, chosen, and the answer follows below.
 *
 * What a press means is the block's `ChatAction`, parsed and checked before the
 * block was drawn; this component only reports which control was used.
 */
export type ChatActionBlockProps = {
    readonly block: ChatActionBlockModel;
    /** What was chosen here already. A block with a choice is locked. */
    readonly choice?: ChatActionChoice;
    /** Reports a press. Absent, the block is shown but cannot be used. */
    readonly onInvoke?: (choice: ChatActionChoice, action: ChatAction, label: string) => void;
    /** Pins a step's spinner on one frame, for a still fixture. */
    readonly spinnerFrame?: number;
    /** What the live figures show, drawn by the conversation's owner. */
    readonly figures?: ChatActionFigures;
};

/**
 * The live figures a reply may hold, each drawn by whoever owns the
 * conversation from the daemon's own state. A figure with nothing here keeps
 * its space empty.
 */
export type ChatActionFigures = {
    /** This computer's live pairing with a phone. */
    readonly phonePairing?: ReactNode;
    /** That pairing has finished: an open offer to pair later has nothing left to put off. */
    readonly phonePaired?: boolean;
    /** One provider CLI's live install and sign-in. */
    readonly providerCli?: (cliId: ChatProviderId) => ReactNode;
    /** One setting by its name, such as the live default model. */
    readonly setting?: (setting: string) => ReactNode;
    /** A proposed sidebar, previewed live and read-only. */
    readonly sidebarProposal?: (artifactId: string) => ReactNode;
};

/** The settings a figure may name; any other is drawn as nothing. */
const FIGURE_SETTINGS: readonly string[] = ["default-model"];

export function ChatActionBlock(props: ChatActionBlockProps) {
    const block = props.block;
    switch (block.kind) {
        case "buttons":
            return (
                <div
                    className="happy-chat-action happy-chat-action__buttons"
                    data-happy-desktop-ui="chat-action-buttons"
                    data-locked={props.choice ? "" : undefined}
                    role="group"
                >
                    {block.buttons.map((button, index) => (
                        <ChatActionButtonView
                            button={button}
                            // Nothing left to put off: unavailable, in place.
                            unavailable={
                                props.choice === undefined &&
                                props.figures?.phonePaired === true &&
                                button.action?.id === "onboarding.phone" &&
                                button.action.choice === "later"
                            }
                            chosen={props.choice?.kind === "button" && props.choice.index === index}
                            key={index}
                            locked={props.choice !== undefined}
                            onPress={
                                button.action !== undefined && props.onInvoke !== undefined
                                    ? () =>
                                          props.onInvoke?.(
                                              { kind: "button", index },
                                              button.action!,
                                              button.label,
                                          )
                                    : undefined
                            }
                        />
                    ))}
                </div>
            );
        case "tree":
            return (
                <div
                    className="happy-chat-action happy-chat-action__tree"
                    data-happy-desktop-ui="chat-action-tree"
                >
                    <FileTree label="Where Happy will look" nodes={treeNodesOf(block.nodes, "")} />
                </div>
            );
        case "phoneApp":
            return <ChatActionPhoneApp />;
        case "phonePair":
            /* One fixed box for every state of the pairing, so the height the
               transcript reserved for it holds from code to emoji to paired. */
            return (
                <div
                    className="happy-chat-action happy-chat-action__phone-pair"
                    data-happy-desktop-ui="chat-action-phone-pair"
                >
                    {props.figures?.phonePairing}
                </div>
            );
        case "providerCli": {
            /* The same fixed box whether the CLI is missing, signing in, or signed in. */
            const cliId = CHAT_PROVIDER_IDS.find((id) => id === block.cliId);
            if (!cliId) return null;
            return (
                <div
                    className="happy-chat-action happy-chat-action__figure"
                    data-figure="provider-cli"
                    data-happy-desktop-ui="chat-action-provider-cli"
                >
                    {props.figures?.providerCli?.(cliId)}
                </div>
            );
        }
        case "setting":
            if (!FIGURE_SETTINGS.includes(block.setting)) return null;
            return (
                <div
                    className="happy-chat-action happy-chat-action__figure"
                    data-figure="setting"
                    data-happy-desktop-ui="chat-action-setting"
                >
                    {props.figures?.setting?.(block.setting)}
                </div>
            );
        case "sidebarProposal":
            return (
                <ChatActionLearnedFigure figureKey={`sidebar-proposal:${block.artifactId}`}>
                    {props.figures?.sidebarProposal?.(block.artifactId)}
                </ChatActionLearnedFigure>
            );
        case "checklist":
            return <ChatActionChecklist {...props} block={block} />;
        case "code":
            return <ChatActionCode {...props} block={block} />;
        case "steps":
            return (
                /* A list by role, not `<ol>`: the reply body's Markdown list rules
                   must not reach it, here or in the box that measures it. */
                <div
                    className="happy-chat-action happy-chat-action__steps"
                    data-happy-desktop-ui="chat-action-steps"
                    role="list"
                >
                    {block.steps.map((step, index) => (
                        <div
                            className="happy-chat-action__step"
                            role="listitem"
                            data-happy-desktop-ui="chat-action-step"
                            data-status={step.status}
                            key={index}
                        >
                            <span className="happy-chat-action__mark">
                                {stepMark(step.status, props.spinnerFrame)}
                            </span>
                            {step.mark ? (
                                <span className="happy-chat-action__product">
                                    <AssistantMark name={step.mark} size={16} />
                                </span>
                            ) : null}
                            <span className="happy-chat-action__text">
                                <span className="happy-chat-action__label">{step.label}</span>
                                {step.detail ? (
                                    <span className="happy-chat-action__detail">{step.detail}</span>
                                ) : null}
                            </span>
                        </div>
                    ))}
                </div>
            );
        case "status":
            return (
                <div
                    className="happy-chat-action happy-chat-action__status"
                    data-happy-desktop-ui="chat-action-status"
                    data-status={block.status}
                    role="status"
                >
                    <span className="happy-chat-action__mark">
                        {statusMark(block.status, props.spinnerFrame)}
                    </span>
                    <span className="happy-chat-action__text">
                        <span className="happy-chat-action__label">{block.text}</span>
                        {block.detail ? (
                            <span className="happy-chat-action__detail">{block.detail}</span>
                        ) : null}
                    </span>
                </div>
            );
    }
}

function ChatActionChecklist(
    props: ChatActionBlockProps & {
        readonly block: Extract<ChatActionBlockModel, { kind: "checklist" }>;
    },
) {
    const block = props.block;
    const id = useId();
    /* Ticks are this block's own until it is submitted; then the choice holds them. */
    const [ticked, setTicked] = useState<ReadonlySet<string>>(
        () =>
            new Set(block.options.filter((option) => option.checked).map((option) => option.value)),
    );
    const submitted = props.choice?.kind === "checklist" ? new Set(props.choice.values) : undefined;
    const values = submitted ?? ticked;
    const locked = props.choice !== undefined;
    const chosenValues = block.options
        .filter((option) => values.has(option.value))
        .map((option) => option.value);
    const action = chatChecklistAction(block, chosenValues);
    const usable = !locked && props.onInvoke !== undefined && action !== undefined;
    /* With nothing ticked, the submit says what it does then, when the block says. */
    const submitLabel =
        chosenValues.length === 0 && block.submit.emptyLabel
            ? block.submit.emptyLabel
            : block.submit.label;
    return (
        <div
            className="happy-chat-action happy-chat-action__checklist"
            data-happy-desktop-ui="chat-action-checklist"
            data-locked={locked ? "" : undefined}
        >
            {block.table ? (
                <ChatActionTable
                    columns={block.table.columns}
                    id={id}
                    locked={locked}
                    onTick={(value, checked) => {
                        const next = new Set(ticked);
                        if (checked) next.add(value);
                        else next.delete(value);
                        setTicked(next);
                    }}
                    options={block.options}
                    values={values}
                />
            ) : (
                <div className="happy-chat-action__options" role="group">
                    {block.options.map((option, index) => (
                        <div
                            className="happy-chat-action__option"
                            data-happy-desktop-ui="chat-action-option"
                            key={option.value}
                        >
                            <Checkbox
                                checked={values.has(option.value)}
                                disabled={locked || option.disabled}
                                id={`${id}-${String(index)}`}
                                onChange={(checked) => {
                                    const next = new Set(ticked);
                                    if (checked) next.add(option.value);
                                    else next.delete(option.value);
                                    setTicked(next);
                                }}
                            />
                            <label
                                className="happy-chat-action__text"
                                htmlFor={`${id}-${String(index)}`}
                            >
                                <span className="happy-chat-action__label">{option.label}</span>
                                {option.detail ? (
                                    <span className="happy-chat-action__detail">
                                        {option.detail}
                                    </span>
                                ) : null}
                            </label>
                        </div>
                    ))}
                </div>
            )}
            <div className="happy-chat-action__buttons" role="group">
                <ChatActionButtonView
                    button={{ label: submitLabel, emphasized: block.submit.emphasized }}
                    chosen={props.choice?.kind === "checklist"}
                    locked={locked}
                    onPress={
                        usable
                            ? () =>
                                  props.onInvoke?.(
                                      { kind: "checklist", values: chosenValues },
                                      action!,
                                      submitLabel,
                                  )
                            : undefined
                    }
                />
                {block.others.map((button, index) => (
                    <ChatActionButtonView
                        button={button}
                        chosen={props.choice?.kind === "button" && props.choice.index === index}
                        key={index}
                        locked={locked}
                        onPress={
                            button.action !== undefined && props.onInvoke !== undefined
                                ? () =>
                                      props.onInvoke?.(
                                          { kind: "button", index },
                                          button.action!,
                                          button.label,
                                      )
                                : undefined
                        }
                    />
                ))}
            </div>
        </div>
    );
}

/**
 * A checklist as a table: the checkbox column, the item column with its mark
 * and sub-line, then one column per cell, under the headings the action
 * names. A genuine two-dimensional layout, so it is a grid: every row's cells
 * line up under its heading, and long cells wrap within their column.
 */
function ChatActionTable(props: {
    readonly columns: readonly string[];
    readonly id: string;
    readonly options: Extract<ChatActionBlockModel, { kind: "checklist" }>["options"];
    readonly values: ReadonlySet<string>;
    readonly locked: boolean;
    readonly onTick: (value: string, checked: boolean) => void;
}) {
    const cells = props.columns.length - 2;
    /* The checkbox's column is as wide as its heading. No column is ever
       narrower than its longest word, so a heading or an email never breaks
       inside itself; past that the item and every cell but the last grow to
       what they need, and the last takes the rest. When the row is short of
       room, labels wrap between their words instead. */
    const template = [
        "minmax(20px, max-content)",
        ...Array.from({ length: cells + 1 }, (_, index) =>
            index === cells ? "minmax(min-content, 1fr)" : "minmax(min-content, max-content)",
        ),
    ].join(" ");
    return (
        <div
            className="happy-chat-action__table"
            data-happy-desktop-ui="chat-action-table"
            role="table"
            style={{ gridTemplateColumns: template }}
        >
            <div className="happy-chat-action__table-row happy-chat-action__table-head" role="row">
                {props.columns.map((column, index) => (
                    <span
                        className="happy-chat-action__table-heading"
                        key={column}
                        role="columnheader"
                    >
                        {column}
                    </span>
                ))}
            </div>
            {props.options.map((option, index) => {
                const inputId = `${props.id}-${String(index)}`;
                return (
                    <div
                        className="happy-chat-action__table-row"
                        data-happy-desktop-ui="chat-action-table-row"
                        key={option.value}
                        role="row"
                    >
                        <span className="happy-chat-action__table-check" role="cell">
                            <Checkbox
                                checked={props.values.has(option.value)}
                                disabled={props.locked || option.disabled}
                                id={inputId}
                                onChange={(checked) => props.onTick(option.value, checked)}
                            />
                        </span>
                        <label
                            className="happy-chat-action__table-item"
                            htmlFor={inputId}
                            role="cell"
                        >
                            <span className="happy-chat-action__table-name">
                                {option.icon !== undefined && clayIconSlugIs(option.icon) ? (
                                    <img
                                        className="happy-chat-action__clay"
                                        height={20}
                                        width={20}
                                        {...clayIconMark(option.icon)}
                                        alt=""
                                    />
                                ) : null}
                                {option.mark ? (
                                    <span className="happy-chat-action__product">
                                        <AssistantMark name={option.mark} size={16} />
                                    </span>
                                ) : null}
                                <span className="happy-chat-action__label">{option.label}</span>
                            </span>
                            {option.detail ? (
                                <span className="happy-chat-action__detail">{option.detail}</span>
                            ) : null}
                        </label>
                        {(option.cells ?? []).map((cell, at) => (
                            <span
                                className="happy-chat-action__table-cell"
                                key={at}
                                role="cell"
                                title={cell}
                            >
                                {cell}
                            </span>
                        ))}
                    </div>
                );
            })}
        </div>
    );
}

/**
 * A single-line field for a code a vendor's page shows, with its submit. What
 * is typed goes to the block's action and nowhere else; the field empties once
 * it is sent, and the block never locks, so a wrong code can be typed again.
 */
function ChatActionCode(
    props: ChatActionBlockProps & {
        readonly block: Extract<ChatActionBlockModel, { kind: "code" }>;
    },
) {
    const [code, setCode] = useState("");
    const action = code.trim() === "" ? undefined : chatChecklistAction(props.block, [code]);
    const send = () => {
        if (!action || !props.onInvoke) return;
        props.onInvoke({ kind: "button", index: 0 }, action, props.block.submit.label);
        setCode("");
    };
    return (
        <div
            className="happy-chat-action happy-chat-action__code"
            data-happy-desktop-ui="chat-action-code"
        >
            <TextField
                aria-label={props.block.placeholder}
                autoComplete="one-time-code"
                className="happy-chat-action__code-field"
                onSubmit={send}
                onValueChange={setCode}
                placeholder={props.block.placeholder}
                size="medium"
                value={code}
            />
            <Button
                disabled={!action || !props.onInvoke}
                onClick={send}
                size="medium"
                variant="outline"
            >
                {props.block.submit.label}
            </Button>
        </div>
    );
}

/**
 * One outline button. Live, the emphasized one is drawn in ink; once its block
 * is answered nothing is emphasized any more: the chosen one takes the pressed
 * fill and the others fade. One naming something already connected wears a
 * green check on its corner, out of the flow so it moves nothing.
 */
function ChatActionButtonView(props: {
    readonly button: ChatActionButtonModel;
    readonly chosen: boolean;
    readonly locked: boolean;
    readonly onPress: (() => void) | undefined;
    /** Drawn, but no longer pressable. */
    readonly unavailable?: boolean;
}) {
    const usable = props.onPress !== undefined && !props.locked && !props.unavailable;
    /* The check rides the button's corner, so it hangs off a wrapper: the
       button's label is its own containing block. */
    return (
        <span className="happy-chat-action__choice">
            <Button
                aria-pressed={props.locked ? props.chosen : undefined}
                className="happy-chat-action__button"
                data-chosen={props.chosen ? "" : undefined}
                data-emphasis={props.button.emphasized && !props.locked ? "" : undefined}
                data-strong={props.button.emphasized ? "" : undefined}
                disabled={!usable && !props.chosen}
                onClick={() => {
                    if (usable) props.onPress?.();
                }}
                size="medium"
                variant="outline"
            >
                {props.button.mark ? (
                    <span className="happy-chat-action__product">
                        <AssistantMark name={props.button.mark} size={16} />
                    </span>
                ) : null}
                {props.button.label}
            </Button>
            {props.button.connected ? (
                <span aria-label="Connected" className="happy-chat-action__connected" role="img">
                    <Ionicon name="checkmark" size={11} />
                </span>
            ) : null}
        </span>
    );
}

/** A tree block's places as the file tree draws them, every folder open. */
function treeNodesOf(nodes: readonly ChatTreeNode[], parent: string): FileTreeNode[] {
    return nodes.map((node) => {
        const id = `${parent}/${node.name}`;
        return node.children.length > 0
            ? {
                  id,
                  name: node.name,
                  kind: "directory",
                  expanded: true,
                  children: treeNodesOf(node.children, id),
              }
            : { id, name: node.name, kind: "directory" };
    });
}

/** The codes that download Happy's phone app, one for each kind of phone. */
function ChatActionPhoneApp() {
    return (
        <div
            className="happy-chat-action happy-chat-action__phone"
            data-happy-desktop-ui="chat-action-phone-app"
        >
            <QRCode
                appearance="plain"
                data={HAPPY_MOBILE_STORE_URLS.ios}
                label="iPhone"
                mark="app-store"
                size={120}
            />
            <QRCode
                appearance="plain"
                data={HAPPY_MOBILE_STORE_URLS.android}
                label="Android"
                mark="google-play"
                size={120}
            />
        </div>
    );
}

function stepMark(status: ChatStepStatus, frame: number | undefined): ReactNode {
    switch (status) {
        case "pending":
            return <Ionicon name="ellipse-outline" size={16} />;
        case "running":
            return <Spinner size={16} {...(frame === undefined ? {} : { frame })} />;
        case "done":
            return <Ionicon name="checkmark-circle" size={16} />;
        case "failed":
            return <Ionicon name="close-circle" size={16} />;
    }
}

function statusMark(tone: ChatStatusTone, frame: number | undefined): ReactNode {
    switch (tone) {
        case "info":
            return <Ionicon name="information-circle-outline" size={16} />;
        case "running":
            return <Spinner size={16} {...(frame === undefined ? {} : { frame })} />;
        case "done":
            return <Ionicon name="checkmark-circle" size={16} />;
        case "failed":
            return <Ionicon name="alert-circle" size={16} />;
    }
}

/**
 * A figure whose size its markup cannot state: its box is the height it last
 * drew, and what it draws reports the height it takes, so the reply holding
 * it is laid out again at that height.
 */
function ChatActionLearnedFigure(props: { figureKey: string; children: ReactNode }) {
    const key = props.figureKey;
    // The height itself is the snapshot: read beside the subscription, the
    // compiler would keep the first one it saw for as long as the key holds.
    const height = useSyncExternalStore(
        chatActionFigureHeightsSubscribe,
        () => chatActionFigureHeight(key),
        () => chatActionFigureHeight(key),
    );
    return (
        <div
            className="happy-chat-action happy-chat-action__figure"
            data-figure="learned"
            data-happy-desktop-ui="chat-action-learned-figure"
            style={{ height: `${String(height)}px` }}
        >
            <div
                className="happy-chat-action__figure-content"
                ref={(node) => {
                    if (!node) return;
                    const report = () =>
                        chatActionFigureHeightRecord(key, node.getBoundingClientRect().height);
                    const observer = new ResizeObserver(report);
                    observer.observe(node);
                    return () => observer.disconnect();
                }}
            >
                {props.children}
            </div>
        </div>
    );
}

let measureHost: HTMLDivElement | undefined;
const measured = new WeakMap<ChatActionBlockModel, Map<string, number>>();

/**
 * The block's height at `width`, measured by laying out the same markup the
 * block renders in an invisible box of that width. A choice never changes it.
 */
export function chatActionBlockHeight(block: ChatActionBlockModel, width: number): number {
    if (typeof document === "undefined") return 0;
    const key = `${String(width)}|${String(messageTextLayoutFontGenerationGet())}|${chatActionFigureSignature(block)}`;
    let byKey = measured.get(block);
    const known = byKey?.get(key);
    if (known !== undefined) return known;
    if (!measureHost?.isConnected) {
        measureHost = document.createElement("div");
        measureHost.setAttribute("aria-hidden", "true");
        measureHost.dataset.happyDesktopUi = "chat-action-measure";
        /* Absolute: measuring must sit outside every flow so it moves nothing on screen.
           The class gives it the reply body's type, which the block inherits. */
        measureHost.className = "happy-message__body happy-message__body--markdown";
        measureHost.style.cssText =
            "position:absolute;top:0;left:-100000px;visibility:hidden;pointer-events:none;contain:layout paint;";
        document.body.append(measureHost);
    }
    measureHost.style.width = `${String(width)}px`;
    measureHost.innerHTML = renderToStaticMarkup(
        <ChatActionBlock block={block} spinnerFrame={0} />,
    );
    /* The block itself, past the image preloads React writes ahead of it. */
    const height =
        [...measureHost.children].find((child) => child.tagName !== "LINK")?.getBoundingClientRect()
            .height ?? 0;
    measureHost.replaceChildren();
    if (!byKey) {
        byKey = new Map();
        measured.set(block, byKey);
    }
    byKey.set(key, height);
    return height;
}
