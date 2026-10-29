import { CHAT_PROVIDER_IDS, type ChatProviderId } from "../chatActions/chatAction.js";
import { providerCliNewer, type ProviderCli, type ProviderCliClient } from "./providerCli.js";

/**
 * `ProviderCliClient` over Happy Agent's `/v0/provider-clis` routes
 * (happy-agent API.md, "Provider CLIs").
 *
 * The routes are newer than the published `@slopus/happy-agent-client`, so
 * this speaks them with `fetch` and its own copy of their wire shape, and is
 * the one place that shape is read. Updates are meant to arrive as
 * `provider_cli.updated` on the event stream; until the client package can
 * decode that event, a CLI with an install or sign-in still going is read
 * again every second, and nothing is polled once every operation settles.
 */
export type ProviderCliHttpOptions = {
    /** The daemon's HTTP origin, such as `http://127.0.0.1:7777`. */
    readonly endpoint: string;
    readonly token: string;
    readonly fetch?: typeof fetch;
};

/* The wire object, as API.md states it. Optional where older daemons may omit. */
type WireProviderCli = {
    readonly id: string;
    readonly name: string;
    readonly vendor: string;
    readonly providerId?: string | null;
    readonly installation: {
        readonly status: "installed" | "missing";
        readonly path?: string | null;
        readonly version?: string | null;
        readonly desktopApp?: string | null;
    };
    readonly installer?: { readonly command: string; readonly sourceHost: string } | null;
    readonly commands: { readonly run: string; readonly signIn: string };
    readonly signIn: {
        readonly status: "signed_in" | "signed_out" | "unknown";
        readonly account?: { readonly email?: string | null; readonly plan?: string | null } | null;
    };
    readonly operation?: {
        readonly kind: "install" | "sign_in";
        readonly status: "running" | "waiting" | "succeeded" | "failed" | "cancelled";
        readonly message?: string | null;
        readonly authorization?: {
            readonly url?: string | null;
            readonly userCode?: string | null;
            readonly openedByProgram?: boolean;
            readonly acceptsCode?: boolean;
            readonly expiresAt?: string | number | null;
        } | null;
        readonly error?: { readonly code: string; readonly message: string } | null;
    } | null;
    readonly version: string;
};

function present<T>(value: T | null | undefined): value is T {
    return value !== null && value !== undefined;
}

/** The wire object as the client's own; nothing, for a CLI this build does not know. */
export function providerCliFromWire(wire: WireProviderCli): ProviderCli | undefined {
    const id = CHAT_PROVIDER_IDS.find((candidate) => candidate === wire.id);
    if (!id) return undefined;
    const operation = wire.operation;
    const authorization = operation?.authorization;
    const expiresAt =
        typeof authorization?.expiresAt === "number"
            ? authorization.expiresAt
            : typeof authorization?.expiresAt === "string"
              ? Date.parse(authorization.expiresAt)
              : undefined;
    const account = wire.signIn.account;
    return {
        id,
        name: wire.name,
        vendor: wire.vendor,
        ...(present(wire.providerId) ? { providerId: wire.providerId } : {}),
        installation: {
            status: wire.installation.status,
            ...(present(wire.installation.path) ? { path: wire.installation.path } : {}),
            ...(present(wire.installation.version) ? { version: wire.installation.version } : {}),
            ...(present(wire.installation.desktopApp)
                ? { desktopApp: wire.installation.desktopApp }
                : {}),
        },
        ...(present(wire.installer)
            ? {
                  installer: {
                      command: wire.installer.command,
                      sourceHost: wire.installer.sourceHost,
                  },
              }
            : {}),
        commands: { run: wire.commands.run, signIn: wire.commands.signIn },
        signIn: {
            status: wire.signIn.status,
            ...(present(account)
                ? {
                      account: {
                          ...(present(account.email) ? { email: account.email } : {}),
                          ...(present(account.plan) ? { plan: account.plan } : {}),
                      },
                  }
                : {}),
        },
        ...(present(operation)
            ? {
                  operation: {
                      kind: operation.kind,
                      status: operation.status,
                      ...(present(operation.message) ? { message: operation.message } : {}),
                      ...(present(authorization)
                          ? {
                                authorization: {
                                    ...(present(authorization.url)
                                        ? { url: authorization.url }
                                        : {}),
                                    ...(present(authorization.userCode)
                                        ? { userCode: authorization.userCode }
                                        : {}),
                                    openedByProgram: authorization.openedByProgram === true,
                                    acceptsCode: authorization.acceptsCode === true,
                                    ...(expiresAt !== undefined && Number.isFinite(expiresAt)
                                        ? { expiresAt }
                                        : {}),
                                },
                            }
                          : {}),
                      ...(present(operation.error) ? { error: operation.error } : {}),
                  },
              }
            : {}),
        version: wire.version,
    };
}

/** A route's refusal, with the daemon's own sentence when it sent one. */
export class ProviderCliRequestError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly code?: string,
    ) {
        super(message);
    }
}

export function providerCliClientHttp(options: ProviderCliHttpOptions): ProviderCliClient & {
    /** Asks the daemon whether it serves these routes; until answered, support is unknown. */
    readonly availabilityCheck: () => Promise<void>;
    readonly dispose: () => void;
} {
    const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
    const listeners = new Set<(cli: ProviderCli) => void>();
    const held = new Map<ChatProviderId, ProviderCli>();
    let availability: ReturnType<ProviderCliClient["availability"]> = {
        supported: false,
        reason: "Happy Agent hasn't said yet whether it can install assistants.",
    };
    let poll: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;

    const request = async (
        method: "GET" | "POST",
        path: string,
        body?: unknown,
    ): Promise<unknown> => {
        const response = await fetcher(new URL(path, options.endpoint), {
            method,
            headers: {
                authorization: `Bearer ${options.token}`,
                ...(body === undefined ? {} : { "content-type": "application/json" }),
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        const json: unknown = await response.json().catch(() => undefined);
        if (!response.ok) {
            const error = (json as { error?: { code?: string; message?: string } } | undefined)
                ?.error;
            throw new ProviderCliRequestError(
                error?.message ?? `Happy Agent refused the request (${String(response.status)}).`,
                response.status,
                error?.code,
            );
        }
        return json;
    };
    const take = (wire: WireProviderCli | undefined): ProviderCli => {
        const cli = wire && providerCliFromWire(wire);
        if (!cli)
            throw new Error(
                "Happy Agent answered about an assistant this version of Happy doesn't know.",
            );
        const next = providerCliNewer(held.get(cli.id), cli);
        if (next !== held.get(cli.id)) {
            held.set(cli.id, next);
            for (const listener of listeners) listener(next);
        }
        pollSchedule();
        return next;
    };
    const one = async (path: string, body?: unknown) =>
        take(
            (
                (await request(body === undefined ? "GET" : "POST", path, body)) as {
                    providerCli?: WireProviderCli;
                }
            ).providerCli,
        );

    /* While anything is installing or waiting on a browser, read those CLIs again. */
    function pollSchedule() {
        if (poll || disposed || listeners.size === 0) return;
        const busy = [...held.values()].filter(
            (cli) => cli.operation?.status === "running" || cli.operation?.status === "waiting",
        );
        if (busy.length === 0) return;
        poll = setTimeout(() => {
            poll = undefined;
            for (const cli of busy)
                void one(`v0/provider-clis/${cli.id}`).catch(() => pollSchedule());
        }, 1000);
    }

    return {
        availability: () => availability,
        async availabilityCheck() {
            try {
                const health = (await request("GET", "v0/health")) as {
                    capabilities?: { providerClis?: boolean };
                };
                availability =
                    health.capabilities?.providerClis === true
                        ? { supported: true }
                        : {
                              supported: false,
                              reason: "This version of Happy Agent can't install assistants for you yet.",
                          };
            } catch (error) {
                availability = {
                    supported: false,
                    reason:
                        error instanceof Error ? error.message : "Happy Agent couldn't be reached.",
                };
            }
        },
        async list() {
            const body = (await request("GET", "v0/provider-clis")) as {
                providerClis?: WireProviderCli[];
            };
            return (body.providerClis ?? []).flatMap((wire) =>
                providerCliFromWire(wire) ? [take(wire)] : [],
            );
        },
        install: (id) => one(`v0/provider-clis/${id}/install`, {}),
        signInStart: (id) => one(`v0/provider-clis/${id}/sign-in`, {}),
        signInCode: (id, code) => one(`v0/provider-clis/${id}/sign-in/code`, { code }),
        cancel: (id) => one(`v0/provider-clis/${id}/cancel`, {}),
        subscribe(listener) {
            listeners.add(listener);
            pollSchedule();
            return () => {
                listeners.delete(listener);
                if (listeners.size === 0 && poll) {
                    clearTimeout(poll);
                    poll = undefined;
                }
            };
        },
        dispose() {
            disposed = true;
            if (poll) clearTimeout(poll);
            listeners.clear();
        },
    };
}
