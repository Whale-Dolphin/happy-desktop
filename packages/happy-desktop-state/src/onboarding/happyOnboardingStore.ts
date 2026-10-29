import type { ChatAction, ChatProviderId } from "../chatActions/chatAction.js";
import {
    providerCliNewer,
    type ProviderCli,
    type ProviderCliClient,
} from "../providerClis/providerCli.js";
import {
    happyOnboardingFlowNewer,
    type HappyOnboardingFlow,
    type HappyOnboardingFlowClient,
} from "./happyOnboardingFlow.js";

/**
 * First run, as a current Happy Agent runs it: in Happy's own conversation,
 * in the ordinary window. The daemon writes every message and does the work
 * behind each press; the window shows Happy's chat like any other, with its
 * inline actions pressed the way any chat's are.
 *
 * This store holds only what onboarding adds to the window: when it starts
 * and ends, and the example the sidebar shows while Happy introduces itself.
 * Nothing opens transport until `begin`.
 */

export type HappyOnboardingSnapshot = {
    /**
     * `waiting` until this machine's Happy Agent answers; `running` while
     * onboarding goes on in Happy's chat; `unsupported` while this machine's
     * Happy Agent does not run it, so the window's own welcome and setup take
     * its place; `finished` once it is over.
     */
    readonly status: "waiting" | "running" | "unsupported" | "finished";
    /** The sidebar shows the example, from Happy's first message until Start onboarding. */
    readonly exampleSidebar: boolean;
};

export interface HappyOnboardingHost {
    /** Whether the window is talking to this machine's Happy Agent, which onboarding waits for. */
    readonly ready: { get(): boolean; subscribe(listener: () => void): () => void };
    readonly flow: Pick<HappyOnboardingFlowClient, "supported" | "flowRead" | "flowStart">;
    /**
     * Calls `listener` whenever the flow may have changed: on each
     * `onboarding.flow.updated`, a delivery hint, and after a reconnect.
     */
    flowFollow(listener: () => void): () => void;
    /** Where a sign-in the daemon started says which page to open. */
    readonly providerClis: ProviderCliClient;
    /** Opens a vendor page in the machine's browser. */
    linkOpen(url: string): void;
    /** Drains and restarts this machine's Happy Agent, resolving once it is back. */
    daemonRestart(): Promise<void>;
    /**
     * Opens Happy's conversation, where onboarding happens, resolving once the
     * window has gone there.
     */
    happyOpen(agentId: string): Promise<void>;
    /** Onboarding in Happy's chat is over. */
    finish(): void;
}

export interface HappyOnboardingStore {
    get(): HappyOnboardingSnapshot;
    subscribe(listener: () => void): () => void;
    /**
     * Starts once this machine's Happy Agent answers, or carries on where it
     * stands. A Happy Agent that does not run onboarding is asked again each
     * time the window reconnects to it, since an update may have brought it.
     */
    begin(): void;
    /**
     * Runs a press only the window can, a vendor's page; false for one that
     * is not onboarding's.
     */
    actionClientRun(action: ChatAction): boolean;
    /** The daemon took a press in Happy's chat as its message. */
    actionSent(action: ChatAction): void;
    dispose(): void;
}

/** The vendor's page for an AI's current plans, which Subscribe opens. */
const PLANS_URL: Record<ChatProviderId, string> = {
    claude: "https://claude.ai/upgrade",
    codex: "https://chatgpt.com/#pricing",
    grok: "https://x.ai/grok",
    antigravity: "https://one.google.com/about/google-ai-plans",
};

export function happyOnboardingPlansUrl(id: ChatProviderId): string {
    return PLANS_URL[id];
}

const WAITING: HappyOnboardingSnapshot = { status: "waiting", exampleSidebar: false };

/** No onboarding: a window that has had it, or one with no machine of its own. */
export const happyOnboardingStoreNoop: HappyOnboardingStore = {
    get: () => WAITING,
    subscribe: () => () => undefined,
    begin: () => undefined,
    actionClientRun: () => false,
    actionSent: () => undefined,
    dispose: () => undefined,
};

export function happyOnboardingStoreCreate(host: HappyOnboardingHost): HappyOnboardingStore {
    const listeners = new Set<() => void>();
    let snapshot = WAITING;
    const publish = (next: Partial<HappyOnboardingSnapshot>) => {
        snapshot = { ...snapshot, ...next };
        for (const listener of listeners) listener();
    };
    let begun = false;
    let disposed = false;
    const stops: (() => void)[] = [];
    let flow: HappyOnboardingFlow | undefined;

    // ——— The flow ———

    let reading: Promise<void> | undefined;
    let readAgain = false;
    /** Reads the flow again, once at a time; a hint during a read reads once more after it. */
    const flowRefresh = (): void => {
        if (disposed || snapshot.status !== "running") return;
        if (reading) {
            readAgain = true;
            return;
        }
        reading = host.flow
            .flowRead()
            .then(flowTake, (error: unknown) =>
                console.error("Onboarding flow read failed.", error),
            )
            .finally(() => {
                reading = undefined;
                if (readAgain) {
                    readAgain = false;
                    flowRefresh();
                }
            });
    };
    let restartedFor: string | undefined;
    let happyOpened = false;
    const flowTake = (next: HappyOnboardingFlow): void => {
        if (disposed || snapshot.status === "finished") return;
        const newer = happyOnboardingFlowNewer(flow, next);
        if (newer === flow) return;
        flow = newer;
        if (flow.step === "finished") {
            finish();
            return;
        }
        if (flow.happyAgentId && !happyOpened) {
            happyOpened = true;
            void host.happyOpen(flow.happyAgentId);
        }
        if (flow.restartRequired && restartedFor === undefined) {
            restartedFor = flow.version;
            void host
                .daemonRestart()
                .catch((error: unknown) => console.error("Happy Agent did not restart.", error))
                .finally(flowRefresh);
        } else if (!flow.restartRequired) restartedFor = undefined;
        if (flow.exampleSidebar !== snapshot.exampleSidebar)
            publish({ exampleSidebar: flow.exampleSidebar });
    };

    /** Once Happy Agent answers: onboarding begins, or carries on where it stands. */
    const flowBegin = async () => {
        try {
            const supported = await host.flow.supported();
            if (disposed) return;
            if (!supported) {
                /*
                 * An older Happy Agent has no onboarding of its own. The window
                 * falls back to its own welcome and setup, and nothing is
                 * finished, so a Happy Agent that gains onboarding later still
                 * runs it if the person has not been welcomed by then.
                 */
                if (snapshot.status !== "unsupported") publish({ status: "unsupported" });
                return;
            }
            publish({ status: "running" });
            stops.push(host.flowFollow(flowRefresh));
            const read = await host.flow.flowRead();
            // Happy's chat is on screen before its first message begins, so
            // the person watches it arrive.
            if (read.step === "not_started" && read.happyAgentId && !happyOpened) {
                happyOpened = true;
                await host.happyOpen(read.happyAgentId);
            }
            flowTake(read);
            if (read.step !== "finished") flowTake(await host.flow.flowStart());
        } catch (error) {
            console.error("Onboarding could not start.", error);
        }
    };

    const finish = () => {
        if (snapshot.status === "finished") return;
        publish({ status: "finished", exampleSidebar: false });
        host.finish();
    };

    // ——— A vendor's sign-in page ———

    const clis = new Map<ProviderCli["id"], ProviderCli>();
    /* Sign-ins this window started, which open their page here unless the program did. */
    const connecting = new Set<ProviderCli["id"]>();
    const signInsOpened = new Set<string>();
    const cliSet = (cli: ProviderCli) => {
        const next = providerCliNewer(clis.get(cli.id), cli);
        clis.set(cli.id, next);
        const authorization = next.operation?.authorization;
        const key = `${next.id}:${authorization?.url ?? ""}`;
        if (
            connecting.has(next.id) &&
            next.operation?.kind === "sign_in" &&
            next.operation.status === "waiting" &&
            authorization?.url &&
            !authorization.openedByProgram &&
            !signInsOpened.has(key)
        ) {
            signInsOpened.add(key);
            host.linkOpen(authorization.url);
        }
    };

    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        begin() {
            if (begun) return;
            begun = true;
            stops.push(host.providerClis.subscribe(cliSet));
            /* Asked once per connection, until one Happy Agent runs onboarding. */
            let asking = false;
            let askedConnected = false;
            const readyFollow = () => {
                const ready = host.ready.get();
                if (!ready) askedConnected = false;
                if (disposed || asking || askedConnected || !ready) return;
                if (snapshot.status !== "waiting" && snapshot.status !== "unsupported") return;
                asking = true;
                askedConnected = true;
                void flowBegin().finally(() => {
                    asking = false;
                    readyFollow();
                });
            };
            stops.push(host.ready.subscribe(readyFollow));
            readyFollow();
        },
        actionClientRun(action) {
            switch (action.id) {
                case "onboarding.signInOpen": {
                    const url = clis.get(action.provider)?.operation?.authorization?.url;
                    if (url) host.linkOpen(url);
                    return true;
                }
                case "onboarding.subscribe":
                    host.linkOpen(happyOnboardingPlansUrl(action.provider));
                    return true;
                default:
                    return false;
            }
        },
        actionSent(action) {
            /* A connection the daemon started reports its sign-in page here. */
            if (action.id === "onboarding.connect") {
                connecting.add(action.provider);
                void host.providerClis
                    .list()
                    .then((list) => list.forEach(cliSet))
                    .catch(() => undefined);
            }
        },
        dispose() {
            disposed = true;
            for (const stop of stops.splice(0)) stop();
            listeners.clear();
        },
    };
}
