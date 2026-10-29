import type { HappyAgentEvent } from "@slopus/happy-agent-client";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";

/**
 * Onboarding as a current Happy Agent runs it, in Happy's own conversation
 * (happy-agent API.md, "Onboarding in Happy's conversation" and "Inline
 * actions"). The daemon writes every message and does the work behind each
 * press; the window draws the conversation, sends presses, and runs only what
 * the window itself can: a vendor's page, a sheet, a restart.
 *
 * The routes are newer than the published `@slopus/happy-agent-client`, so,
 * like the provider CLIs and routes, this speaks them with `fetch` and its own
 * copy of their wire shape, and is the one place that shape is read.
 */

export type HappyOnboardingFlowStep =
    | "not_started"
    | "welcome"
    | "providers"
    | "connecting"
    | "verifying"
    | "guided"
    | "finished";

/** The daemon's onboarding flow object. */
export type HappyOnboardingFlow = {
    /** UUIDv7, advanced on every change: the greater one is the newer object. */
    readonly version: string;
    readonly onboardingVersion: number;
    readonly completedVersion: number | null;
    readonly step: HappyOnboardingFlowStep;
    /** Happy's own conversation, once Happy exists. */
    readonly happyAgentId: string | null;
    /** Happy's composer takes messages once a provider has answered. */
    readonly composerEnabled: boolean;
    /** The example sidebar shows, from Happy's first message until Start onboarding. */
    readonly exampleSidebar: boolean;
    /** A provider chosen during onboarding takes effect only after the daemon restarts. */
    readonly restartRequired: boolean;
    /** The proposal rows Looks right ticked, and how far each chat has got; empty before. */
    readonly accepted: readonly HappyOnboardingAcceptedRow[];
};

/** One ticked proposal row and the chat Looks right fixed for it before making it. */
export type HappyOnboardingAcceptedRow = {
    /** The row's value in the proposal. */
    readonly value: string;
    readonly spaceId: string;
    readonly agentId: string;
    /** "started" once the chat exists and its row sits under its topic in the sidebar. */
    readonly status: "pending" | "started" | "failed";
};

export interface HappyOnboardingFlowClient {
    /**
     * Whether the daemon runs onboarding itself and takes presses: both
     * `capabilities.onboarding` and `capabilities.chatActions` from health.
     */
    supported(): Promise<boolean>;
    flowRead(): Promise<HappyOnboardingFlow>;
    /** Begins onboarding when it has not begun; changes nothing otherwise. */
    flowStart(): Promise<HappyOnboardingFlow>;
}

export type HappyOnboardingFlowHttpOptions = {
    /** The daemon's HTTP origin, such as `http://127.0.0.1:7777`. */
    readonly endpoint: string;
    readonly token: string;
    readonly fetch?: typeof fetch;
};

/* The wire object, as API.md states it. */
type WireFlow = {
    readonly version: string;
    readonly onboardingVersion: number;
    readonly completedVersion: number | null;
    readonly step: string;
    readonly happyAgentId: string | null;
    readonly composer: "disabled" | "enabled";
    readonly exampleSidebar: boolean;
    readonly restartRequired: boolean;
    readonly accepted?: readonly {
        readonly value: string;
        readonly spaceId: string;
        readonly agentId: string;
        readonly status: string;
    }[];
};

const ACCEPTED_STATUSES: readonly HappyOnboardingAcceptedRow["status"][] = [
    "pending",
    "started",
    "failed",
];

const STEPS: readonly HappyOnboardingFlowStep[] = [
    "not_started",
    "welcome",
    "providers",
    "connecting",
    "verifying",
    "guided",
    "finished",
];

/** The wire object as the client's own; a step this build does not know is "guided". */
export function happyOnboardingFlowFromWire(wire: WireFlow): HappyOnboardingFlow {
    return {
        version: wire.version,
        onboardingVersion: wire.onboardingVersion,
        completedVersion: wire.completedVersion,
        step: STEPS.find((step) => step === wire.step) ?? "guided",
        happyAgentId: wire.happyAgentId,
        composerEnabled: wire.composer === "enabled",
        exampleSidebar: wire.exampleSidebar,
        restartRequired: wire.restartRequired,
        /* A status this build does not know is still on its way. */
        accepted: (wire.accepted ?? []).map((row) => ({
            value: row.value,
            spaceId: row.spaceId,
            agentId: row.agentId,
            status: ACCEPTED_STATUSES.find((status) => status === row.status) ?? "pending",
        })),
    };
}

/** The newer of two flow objects, by version; the held one when they are the same. */
export function happyOnboardingFlowNewer(
    held: HappyOnboardingFlow | undefined,
    next: HappyOnboardingFlow,
): HappyOnboardingFlow {
    return held !== undefined && held.version >= next.version ? held : next;
}

/**
 * The published client's event union does not name `onboarding.flow.updated`
 * yet; the stream carries it all the same.
 */
const FLOW_UPDATED = "onboarding.flow.updated" as HappyAgentEvent["type"];

/**
 * Calls `listener` on each `onboarding.flow.updated` this connection hears,
 * and whenever it reconciles or reconnects, until the returned stop: each a
 * hint to read the flow again.
 */
export function happyOnboardingFlowFollow(sync: HappyAgentSync, listener: () => void): () => void {
    const following = new AbortController();
    void (async () => {
        for await (const input of sync.follow({
            signal: following.signal,
            events: [FLOW_UPDATED],
        })) {
            if (input.kind === "error") continue;
            if (
                input.kind === "bootstrap" ||
                input.kind === "reconcile" ||
                (input.kind === "update" &&
                    (input.update.kind === "connected" ||
                        (input.update.kind === "event" &&
                            input.update.event.type === FLOW_UPDATED)))
            )
                listener();
        }
    })().catch(() => undefined);
    return () => following.abort();
}

export function happyOnboardingFlowClientHttp(
    options: HappyOnboardingFlowHttpOptions,
): HappyOnboardingFlowClient {
    const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
    const request = async (method: "GET" | "POST", path: string, body?: unknown) => {
        const response = await fetcher(new URL(path, options.endpoint), {
            method,
            headers: {
                authorization: `Bearer ${options.token}`,
                ...(body === undefined ? {} : { "content-type": "application/json" }),
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        const json: unknown = await response.json().catch(() => undefined);
        if (!response.ok)
            throw new Error(
                (json as { error?: { message?: string } } | undefined)?.error?.message ??
                    `Happy Agent refused the request (${String(response.status)}).`,
            );
        return json;
    };
    return {
        async supported() {
            const health = (await request("GET", "/v0/health")) as {
                capabilities?: { onboarding?: boolean; chatActions?: boolean };
            };
            return (
                health.capabilities?.onboarding === true && health.capabilities.chatActions === true
            );
        },
        async flowRead() {
            const body = (await request("GET", "/v0/onboarding/flow")) as { flow: WireFlow };
            return happyOnboardingFlowFromWire(body.flow);
        },
        async flowStart() {
            const body = (await request("POST", "/v0/onboarding/flow/start", {
                mutationId: crypto.randomUUID(),
            })) as { flow: WireFlow };
            return happyOnboardingFlowFromWire(body.flow);
        },
    };
}
