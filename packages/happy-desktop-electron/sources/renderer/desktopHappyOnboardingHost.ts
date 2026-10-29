import {
    happyOnboardingFlowClientHttp,
    happyOnboardingFlowFollow,
    providerCliClientHttp,
    type HappyAgentSync,
    type HappyOnboardingFlowClient,
    type HappyOnboardingHost,
    type ProviderCli,
    type ProviderCliClient,
} from "happy-desktop-state";
import type { DesktopRuntimeStore } from "./runtimeStore";

const CAPABILITY = "happy-local-capability";

export interface DesktopHappyOnboardingHostOptions {
    readonly runtime: DesktopRuntimeStore;
    /** Whether the window is talking to this machine's own Happy Agent. */
    readonly localConnected: { get(): boolean; subscribe(listener: () => void): () => void };
    /** The local connection's transport input, once it has one. */
    readonly sync: () => HappyAgentSync | undefined;
    readonly linkOpen: (url: string) => void;
    /** Drains and restarts this machine's Happy Agent, resolving once it is back. */
    readonly daemonRestart: () => Promise<void>;
    /** Opens Happy's conversation in the window, resolving once it has. */
    readonly happyOpen: (agentId: string) => Promise<void>;
    readonly finish: () => void;
}

/**
 * First run against this machine's Happy Agent, which runs it in Happy's own
 * conversation: the flow's routes, its events on the local connection, and
 * what only the window can do. Nothing opens transport until it is asked.
 */
export function desktopHappyOnboardingHostCreate(
    options: DesktopHappyOnboardingHostOptions,
): HappyOnboardingHost {
    const endpoint = (): string | undefined => {
        const runtime = options.runtime.get();
        return runtime?.phase === "ready" ? runtime.activeTarget.happyAgentHttpUrl : undefined;
    };
    const flowClient = (): HappyOnboardingFlowClient => {
        const url = endpoint();
        if (!url) throw new Error("Happy isn't running on this computer yet.");
        return happyOnboardingFlowClientHttp({ endpoint: url, token: CAPABILITY });
    };
    const ready = () => options.localConnected.get() && endpoint() !== undefined;
    /** Calls `listener` whenever the local connection, or its daemon, may have changed. */
    const connectionFollow = (listener: () => void) => {
        const stops = [
            options.localConnected.subscribe(listener),
            options.runtime.subscribe(listener),
        ];
        return () => {
            for (const stop of stops) stop();
        };
    };
    return {
        ready: { get: ready, subscribe: connectionFollow },
        flow: {
            supported: () => flowClient().supported(),
            flowRead: () => flowClient().flowRead(),
            flowStart: () => flowClient().flowStart(),
        },
        flowFollow(listener) {
            /* The connection is replaced when Happy Agent restarts; follow whichever is current. */
            let held: HappyAgentSync | undefined;
            let heldStop: (() => void) | undefined;
            const follow = () => {
                const sync = options.sync();
                if (sync === held) return;
                heldStop?.();
                held = sync;
                heldStop = sync ? happyOnboardingFlowFollow(sync, listener) : undefined;
            };
            const stop = connectionFollow(follow);
            follow();
            return () => {
                stop();
                heldStop?.();
            };
        },
        providerClis: providerClisLazy(() => {
            const url = endpoint();
            return url ? providerCliClientHttp({ endpoint: url, token: CAPABILITY }) : undefined;
        }),
        linkOpen: options.linkOpen,
        async daemonRestart() {
            await options.daemonRestart();
            /* Back once the window is talking to Happy Agent again, or after a minute. */
            await new Promise<void>((resolve) => {
                const timer = setTimeout(done, 60_000);
                const stop = connectionFollow(() => {
                    if (ready()) done();
                });
                function done() {
                    clearTimeout(timer);
                    stop();
                    resolve();
                }
            });
        },
        happyOpen: options.happyOpen,
        finish: options.finish,
    };
}

/**
 * The provider CLI routes of a daemon that may not be up yet: made on first use,
 * once the window knows where Happy Agent answers.
 */
function providerClisLazy(
    make: () => ReturnType<typeof providerCliClientHttp> | undefined,
): ProviderCliClient {
    let made: ReturnType<typeof providerCliClientHttp> | undefined;
    const listeners = new Set<(cli: ProviderCli) => void>();
    const read = () => {
        if (made) return made;
        made = make();
        if (!made) throw new Error("Happy isn't running on this computer yet.");
        made.subscribe((cli) => {
            for (const listener of listeners) listener(cli);
        });
        void made.availabilityCheck().catch(() => undefined);
        return made;
    };
    return {
        availability: () =>
            made?.availability() ?? {
                supported: false,
                reason: "Happy isn't running on this computer yet.",
            },
        async list() {
            const client = read();
            await client.availabilityCheck().catch(() => undefined);
            return client.list();
        },
        install: (id) => read().install(id),
        signInStart: (id) => read().signInStart(id),
        signInCode: (id, code) => read().signInCode(id, code),
        cancel: (id) => read().cancel(id),
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
}
