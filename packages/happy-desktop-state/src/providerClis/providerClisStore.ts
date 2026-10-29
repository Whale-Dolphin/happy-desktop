import type { ChatProviderId } from "../chatActions/chatAction.js";
import { happyAgentUserError } from "../happyAgent/happyAgentSupport.js";
import type { UserError } from "../types.js";
import { providerCliNewer, type ProviderCli, type ProviderCliClient } from "./providerCli.js";

/**
 * One connection's provider CLIs as the chat figures draw them (happy-agent
 * API.md, `<figure data-provider-cli>`): each CLI as the daemon last described
 * it, and the requests this window made about it.
 *
 * Every control calls the generic provider CLI routes; none is a chat press.
 * Install and sign in is one control: an install started here goes on to the
 * sign-in once it succeeds. A sign-in page opens by itself only for a sign-in
 * started here, and only when the vendor's program did not open it already.
 */
export type HappyAgentProviderClisSnapshot = {
    /** Every CLI the daemon has described, by ID; empty until the first read lands. */
    readonly clis: ReadonlyMap<ChatProviderId, ProviderCli>;
    /** CLIs with a request from this window the daemon has not answered yet. */
    readonly requesting: ReadonlySet<ChatProviderId>;
    /** Why the last request about a CLI was refused, until the next one. */
    readonly errors: ReadonlyMap<ChatProviderId, UserError>;
};

export type HappyAgentProviderClisOutput = {
    /** A sign-in started here is waiting on a page the vendor's program did not open. */
    readonly type: "signInPageOpenRequested";
    readonly cliId: ChatProviderId;
    readonly url: string;
};

export interface HappyAgentProviderClisStore {
    get(): HappyAgentProviderClisSnapshot;
    /** Every new listener reads every CLI again; nothing is read before one. */
    subscribe(listener: () => void): () => void;
    /** Installs a missing CLI, then starts its sign-in. */
    cliInstall(id: ChatProviderId): void;
    cliSignInStart(id: ChatProviderId): void;
    /** Hands the waiting sign-in the code its page showed. */
    cliSignInCodeSend(id: ChatProviderId, code: string): void;
    cliCancel(id: ChatProviderId): void;
    [Symbol.dispose](): void;
}

export type HappyAgentProviderClisStoreOptions = {
    readonly client: ProviderCliClient;
    readonly listener?: (event: HappyAgentProviderClisOutput) => void;
};

const EMPTY: HappyAgentProviderClisSnapshot = {
    clis: new Map(),
    requesting: new Set(),
    errors: new Map(),
};

export function happyAgentProviderClisStoreCreate(
    options: HappyAgentProviderClisStoreOptions,
): HappyAgentProviderClisStore {
    const output = options.listener ?? (() => undefined);
    const listeners = new Set<() => void>();
    let snapshot = EMPTY;
    let disposed = false;
    let clientStop: (() => void) | undefined;
    /* Installs started here that go on to the sign-in once they succeed. */
    const chained = new Set<ChatProviderId>();
    /* Sign-ins started here, whose page this window opens. */
    const started = new Set<ChatProviderId>();
    const pagesOpened = new Set<string>();

    const publish = (next: Partial<HappyAgentProviderClisSnapshot>) => {
        snapshot = { ...snapshot, ...next };
        for (const listener of listeners) listener();
    };

    const cliSet = (cli: ProviderCli) => {
        if (disposed) return;
        const held = snapshot.clis.get(cli.id);
        const next = providerCliNewer(held, cli);
        if (next === held) return;
        const clis = new Map(snapshot.clis);
        clis.set(next.id, next);
        publish({ clis });
        const operation = next.operation;
        if (chained.has(next.id) && operation?.kind === "install") {
            if (operation.status === "succeeded") {
                chained.delete(next.id);
                if (next.signIn.status !== "signed_in") request(next.id, "signIn");
            } else if (operation.status === "failed" || operation.status === "cancelled")
                chained.delete(next.id);
        }
        if (!started.has(next.id) || operation?.kind !== "sign_in") return;
        if (operation.status !== "running" && operation.status !== "waiting") {
            started.delete(next.id);
            return;
        }
        const url = operation.authorization?.url;
        if (operation.status !== "waiting" || !url || operation.authorization?.openedByProgram)
            return;
        const key = `${next.id}:${url}`;
        if (pagesOpened.has(key)) return;
        pagesOpened.add(key);
        output({ type: "signInPageOpenRequested", cliId: next.id, url });
    };

    const read = () => {
        void options.client
            .list()
            .then((list) => list.forEach(cliSet))
            .catch(() => undefined);
    };

    function request(
        id: ChatProviderId,
        kind: "install" | "signIn" | "code" | "cancel",
        code = "",
    ) {
        if (disposed) return;
        if (kind === "signIn") started.add(id);
        const requesting = new Set(snapshot.requesting);
        requesting.add(id);
        const errors = new Map(snapshot.errors);
        errors.delete(id);
        publish({ requesting, errors });
        const sent =
            kind === "install"
                ? options.client.install(id)
                : kind === "signIn"
                  ? options.client.signInStart(id)
                  : kind === "code"
                    ? options.client.signInCode(id, code)
                    : options.client.cancel(id);
        const settle = (error?: UserError) => {
            if (disposed) return;
            const requesting = new Set(snapshot.requesting);
            requesting.delete(id);
            const errors = new Map(snapshot.errors);
            if (error) errors.set(id, error);
            publish({ requesting, errors });
        };
        sent.then(
            (cli) => {
                settle();
                cliSet(cli);
            },
            (error: unknown) => {
                if (kind === "install") chained.delete(id);
                if (kind === "signIn") started.delete(id);
                settle(happyAgentUserError(error));
            },
        );
    }

    return {
        get: () => snapshot,
        subscribe(listener) {
            if (disposed) return () => undefined;
            listeners.add(listener);
            /* Changes arrive through the client from the first figure on, so a
               sign-in started here still opens its page while none is shown. */
            clientStop ??= options.client.subscribe(cliSet);
            /* Every figure reads again as it appears: it comes with a reply to
               a press the daemon ran, which may have started an operation this
               window never asked for and the client has not heard of yet, such
               as a sign-in after one here was cancelled. */
            read();
            return () => {
                listeners.delete(listener);
            };
        },
        cliInstall(id) {
            chained.add(id);
            request(id, "install");
        },
        cliSignInStart: (id) => request(id, "signIn"),
        cliSignInCodeSend(id, code) {
            if (code.trim() !== "") request(id, "code", code.trim());
        },
        cliCancel(id) {
            chained.delete(id);
            request(id, "cancel");
        },
        [Symbol.dispose]() {
            disposed = true;
            clientStop?.();
            listeners.clear();
        },
    };
}
