import { UserError } from "../types.js";
import { cuid2Create } from "../utils/cuid2Create.js";
import type { ChatAction } from "./chatAction.js";
import type { ChatActionChoice, ChatActionInvocation } from "./chatActionBlocks.js";

/**
 * Pressing the inline actions an agent writes into any chat (happy-agent
 * API.md, "Action messages"). A press is the person's own message: an action
 * message sent like any other, naming the block it was pressed in. It shows
 * chosen at once; the daemon records the choice on the pressed message, so
 * from then on that message says what was chosen, in every window and after a
 * reload. The action message itself draws nothing.
 *
 * The `action` content block is newer than the published
 * `@slopus/happy-agent-client`, so, like the provider CLIs, this speaks the
 * send route with `fetch` and its own copy of the wire shape, and is the one
 * place that shape is written.
 */

/** One chat a press started, as `onboarding.workAccept` reports it. */
export type HappyAgentChatActionStarted = {
    /** The proposal row's value. */
    readonly value: string;
    readonly spaceId: string;
    readonly agentId: string;
};

/** How the daemon took a press. */
export type HappyAgentChatActionSent =
    /* Recorded on the pressed message, with the chats its work started. */
    | { readonly kind: "accepted"; readonly started: readonly HappyAgentChatActionStarted[] }
    /* Another choice won the block; the message carrying it arrives as an update. */
    | { readonly kind: "taken" };

export type HappyAgentChatActionPress = {
    /** The agent message the block was written in. */
    readonly messageId: string;
    /** The block's index across that whole message. */
    readonly blockIndex: number;
    readonly action: ChatAction;
    /** What the window adds to a press it ran first, such as the chat it made. */
    readonly values?: readonly string[];
};

export interface HappyAgentChatActionsClient {
    /** Sends one press as the action message `id`; every retry reuses that `id`. */
    actionSend(
        agentId: string,
        id: string,
        press: HappyAgentChatActionPress,
    ): Promise<HappyAgentChatActionSent>;
}

/** What the window did first with a press that is partly its own. */
export type HappyAgentChatActionClientRun =
    /* All of it: the daemon hears nothing. */
    | { readonly kind: "done" }
    /* Its part, and now the daemon hears the press with these values. */
    | { readonly kind: "post"; readonly values: readonly string[] };

/** How one press goes, beyond sending it. */
export type HappyAgentChatActionPressOptions = {
    /** The window's own part, run before anything is sent. */
    readonly run?: () => Promise<HappyAgentChatActionClientRun>;
    /** The daemon took the press as the conversation's message. */
    readonly sent?: (sent: Extract<HappyAgentChatActionSent, { kind: "accepted" }>) => void;
};

export type HappyAgentChatActionsSnapshot = {
    /**
     * Presses this window made, by `chatActionBlockKey`. The pressed message's
     * own recorded choice draws over them once it arrives. A failed press, or
     * one whose block another choice took, is dropped, so the block shows
     * what the message says.
     */
    readonly pending: ReadonlyMap<string, ChatActionChoice>;
    /** Why the last press failed, in words the person can read. */
    readonly error?: UserError;
};

/** One connection's presses, in every chat it serves. */
export interface HappyAgentChatActionsStore {
    get(): HappyAgentChatActionsSnapshot;
    subscribe(listener: () => void): () => void;
    actionPress(
        agentId: string,
        invocation: ChatActionInvocation,
        options?: HappyAgentChatActionPressOptions,
    ): void;
}

const NONE: HappyAgentChatActionsSnapshot = { pending: new Map() };

export function happyAgentChatActionsStoreCreate(host: {
    readonly client: HappyAgentChatActionsClient;
    readonly now?: () => number;
}): HappyAgentChatActionsStore {
    const listeners = new Set<() => void>();
    const idCreate = cuid2Create(host.now ?? Date.now);
    let snapshot = NONE;
    const publish = (next: HappyAgentChatActionsSnapshot) => {
        snapshot = next;
        for (const listener of listeners) listener();
    };
    const drop = (blockKey: string, error?: UserError) => {
        const pending = new Map(snapshot.pending);
        pending.delete(blockKey);
        publish({ pending, ...(error ? { error } : {}) });
    };
    const run = async (
        agentId: string,
        invocation: ChatActionInvocation,
        options: HappyAgentChatActionPressOptions,
    ) => {
        const ran = options.run ? await options.run() : undefined;
        if (ran?.kind === "done") return;
        const source = invocation.source;
        if (!source) return;
        const sent = await host.client.actionSend(agentId, idCreate(), {
            messageId: source.messageId,
            blockIndex: source.blockIndex,
            action: invocation.action,
            ...(ran?.kind === "post" ? { values: ran.values } : {}),
        });
        if (sent.kind === "taken") drop(invocation.blockKey);
        else options.sent?.(sent);
    };
    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        actionPress(agentId, invocation, options = {}) {
            if (snapshot.pending.has(invocation.blockKey)) return;
            publish({
                pending: new Map(snapshot.pending).set(invocation.blockKey, invocation.choice),
            });
            void run(agentId, invocation, options).catch((error: unknown) =>
                drop(
                    invocation.blockKey,
                    error instanceof UserError
                        ? error
                        : new UserError(error instanceof Error ? error.message : String(error)),
                ),
            );
        },
    };
}

/** A connection that takes no presses, for a window without one. */
export const happyAgentChatActionsStoreNoop: HappyAgentChatActionsStore = {
    get: () => NONE,
    subscribe: () => () => undefined,
    actionPress: () => undefined,
};

/**
 * The parameters an action reads, and nothing a control only draws with: the
 * daemon finds the pressed control by exactly these, so any other key is a
 * different control.
 */
export function chatActionParams(action: ChatAction): Record<string, string> {
    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(action))
        if (key !== "id" && key !== "values") params[key] = String(value);
    return params;
}

/** What a checklist's submit carries: its ticked values. */
function chatActionValues(action: ChatAction): readonly string[] {
    return "values" in action && action.values ? action.values : [];
}

export type HappyAgentChatActionsHttpOptions = {
    readonly endpoint: string;
    readonly token: string;
    readonly fetch?: typeof globalThis.fetch;
};

/** Waits before each retry of a send that never reached the daemon or that it could not take yet. */
const SEND_RETRY_MS: readonly number[] = [500, 1_000, 2_000, 4_000];

export function happyAgentChatActionsClientHttp(
    options: HappyAgentChatActionsHttpOptions,
): HappyAgentChatActionsClient {
    const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    return {
        async actionSend(agentId, id, press) {
            const url = new URL(`/v0/agents/${encodeURIComponent(agentId)}/send`, options.endpoint);
            const body = JSON.stringify({
                id,
                content: [
                    {
                        type: "action",
                        messageId: press.messageId,
                        blockIndex: press.blockIndex,
                        actionId: press.action.id,
                        params: chatActionParams(press.action),
                        values: press.values ?? chatActionValues(press.action),
                    },
                ],
                delivery: "queue",
            });
            /* One `id` for every attempt: the daemon answers a repeat with the message it took. */
            let response: Response;
            for (let retry = 0; ; retry += 1) {
                const delay = SEND_RETRY_MS[retry];
                try {
                    response = await fetcher(url, {
                        method: "POST",
                        headers: {
                            authorization: `Bearer ${options.token}`,
                            "content-type": "application/json",
                        },
                        body,
                    });
                } catch (error) {
                    if (delay === undefined) throw error;
                    await wait(delay);
                    continue;
                }
                const retryable =
                    response.status === 408 || response.status === 429 || response.status >= 500;
                if (!retryable || delay === undefined) break;
                await wait(delay);
            }
            const json = (await response.json().catch(() => undefined)) as
                | { error?: unknown; message?: unknown }
                | undefined;
            /* Taken by another choice, or offered again since, or a step already over: the
               pressed message, carried or arriving as an update, says what the block shows. */
            if (response.status === 409) return { kind: "taken" };
            if (!response.ok)
                throw new UserError(
                    typeof json?.error === "string"
                        ? json.error
                        : `Happy Agent refused the press (${String(response.status)}).`,
                );
            return { kind: "accepted", started: startedRead(json?.message) };
        },
    };
}

/** The chats a sent press started, from its stored action block's `result`. */
function startedRead(message: unknown): readonly HappyAgentChatActionStarted[] {
    const content = (message as { content?: unknown } | undefined)?.content;
    if (!Array.isArray(content)) return [];
    const block: unknown = content.find(
        (each: unknown) =>
            typeof each === "object" &&
            each !== null &&
            (each as { type?: unknown }).type === "action",
    );
    const result = (block as { result?: unknown } | undefined)?.result;
    const started = (result as { started?: unknown } | null | undefined)?.started;
    if (!Array.isArray(started)) return [];
    return started.flatMap((row: unknown) => {
        const { value, spaceId, agentId } = (row ?? {}) as Record<string, unknown>;
        return typeof value === "string" &&
            typeof spaceId === "string" &&
            typeof agentId === "string"
            ? [{ value, spaceId, agentId }]
            : [];
    });
}
