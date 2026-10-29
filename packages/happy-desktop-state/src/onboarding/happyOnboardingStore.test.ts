import { expect, it, vi } from "vitest";
import type { HappyOnboardingFlow } from "./happyOnboardingFlow.js";
import { happyOnboardingStoreCreate, type HappyOnboardingHost } from "./happyOnboardingStore.js";

const FLOW: HappyOnboardingFlow = {
    version: "0190a000-0000-7000-8000-000000000001",
    onboardingVersion: 1,
    completedVersion: null,
    step: "welcome",
    happyAgentId: null,
    composerEnabled: false,
    exampleSidebar: true,
    restartRequired: false,
    accepted: [],
};

/** A machine whose Happy Agent connects and disconnects on demand, and answers health as told. */
function hostCreate(supported: () => Promise<boolean>) {
    let ready = false;
    const readyListeners = new Set<() => void>();
    const host = {
        ready: {
            get: () => ready,
            subscribe(listener: () => void) {
                readyListeners.add(listener);
                return () => readyListeners.delete(listener);
            },
        },
        flow: {
            supported: vi.fn(supported),
            flowRead: vi.fn(() => Promise.resolve(FLOW)),
            flowStart: vi.fn(() => Promise.resolve(FLOW)),
        },
        flowFollow: () => () => undefined,
        providerClis: {
            availability: () => ({ supported: true as const }),
            list: () => Promise.resolve([]),
            install: () => Promise.reject(new Error("unused")),
            signInStart: () => Promise.reject(new Error("unused")),
            signInCode: () => Promise.reject(new Error("unused")),
            cancel: () => Promise.reject(new Error("unused")),
            subscribe: () => () => undefined,
        },
        linkOpen: vi.fn(),
        daemonRestart: () => Promise.resolve(),
        happyOpen: () => Promise.resolve(),
        finish: vi.fn(),
    } satisfies HappyOnboardingHost;
    const connectedSet = (next: boolean) => {
        ready = next;
        for (const listener of readyListeners) listener();
    };
    return { host, connectedSet };
}

it("falls back to the window's own welcome for a Happy Agent without onboarding, finishing nothing", async () => {
    const { host, connectedSet } = hostCreate(() => Promise.resolve(false));
    const store = happyOnboardingStoreCreate(host);
    store.begin();
    expect(store.get().status).toBe("waiting");
    connectedSet(true);
    await vi.waitFor(() => expect(store.get().status).toBe("unsupported"));
    expect(store.get().exampleSidebar).toBe(false);
    expect(host.finish).not.toHaveBeenCalled();
    expect(host.flow.flowStart).not.toHaveBeenCalled();
    // The same connection is not asked again.
    connectedSet(true);
    await Promise.resolve();
    expect(host.flow.supported).toHaveBeenCalledTimes(1);
});

it("runs onboarding once a reconnected Happy Agent has gained it", async () => {
    let capable = false;
    const { host, connectedSet } = hostCreate(() => Promise.resolve(capable));
    const store = happyOnboardingStoreCreate(host);
    store.begin();
    connectedSet(true);
    await vi.waitFor(() => expect(store.get().status).toBe("unsupported"));
    // The update restarts Happy Agent, and the window reconnects to the newer one.
    capable = true;
    connectedSet(false);
    connectedSet(true);
    await vi.waitFor(() => expect(host.flow.flowStart).toHaveBeenCalledTimes(1));
    expect(store.get()).toEqual({ status: "running", exampleSidebar: true });
    expect(host.finish).not.toHaveBeenCalled();
    // A running onboarding is not asked about again on the next reconnect.
    connectedSet(false);
    connectedSet(true);
    await Promise.resolve();
    expect(host.flow.supported).toHaveBeenCalledTimes(2);
});

it("starts nothing once disposed, even when a capable Happy Agent answers afterwards", async () => {
    let answer: (supported: boolean) => void = () => undefined;
    const { host, connectedSet } = hostCreate(
        () => new Promise<boolean>((resolve) => (answer = resolve)),
    );
    const store = happyOnboardingStoreCreate(host);
    const listener = vi.fn();
    store.subscribe(listener);
    store.begin();
    connectedSet(true);
    store.dispose();
    answer(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(store.get().status).toBe("waiting");
    expect(listener).not.toHaveBeenCalled();
    expect(host.flow.flowRead).not.toHaveBeenCalled();
});
