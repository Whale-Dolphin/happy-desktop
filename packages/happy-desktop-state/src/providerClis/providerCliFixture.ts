import type { ChatProviderId } from "../chatActions/chatAction.js";
import type { ProviderCli, ProviderCliClient } from "./providerCli.js";

/**
 * A provider-CLI client that installs and signs in nothing: every CLI starts
 * missing, an install "downloads" for a moment, and a sign-in waits on a
 * pretend browser page, then reports a signed-in account. For the Blueprint
 * and for recordings, where a real vendor install or sign-in cannot run.
 * Nothing here touches the machine or the network.
 */
export type ProviderCliFixtureOptions = {
    /** How long a pretend install takes, in ms. */
    readonly installMs?: number;
    /** How long the pretend browser page stays open before the person "signs in". */
    readonly signInMs?: number;
    /** The account a sign-in reports. */
    readonly account?: { readonly email: string; readonly plan: string };
    /** CLIs already on the machine, and whether they are signed in. */
    readonly installed?: Partial<Record<ChatProviderId, "signed_in" | "signed_out">>;
};

const CATALOG: Record<
    ChatProviderId,
    Pick<ProviderCli, "name" | "vendor" | "commands"> & {
        readonly installer: NonNullable<ProviderCli["installer"]>;
        readonly signInUrl: string;
    }
> = {
    claude: {
        name: "Claude Code",
        vendor: "Anthropic",
        commands: { run: "claude", signIn: "claude auth login" },
        installer: {
            command: "curl -fsSL https://claude.ai/install.sh | bash",
            sourceHost: "claude.ai",
        },
        signInUrl: "https://claude.ai/oauth/authorize",
    },
    codex: {
        name: "Codex",
        vendor: "OpenAI",
        commands: { run: "codex", signIn: "codex login" },
        installer: {
            command: "curl -fsSL https://chatgpt.com/codex/install.sh | CODEX_NON_INTERACTIVE=1 sh",
            sourceHost: "chatgpt.com",
        },
        signInUrl: "https://auth.openai.com/authorize",
    },
    grok: {
        name: "Grok",
        vendor: "xAI",
        commands: { run: "grok", signIn: "grok login" },
        installer: { command: "curl -fsSL https://x.ai/cli/install.sh | bash", sourceHost: "x.ai" },
        signInUrl: "https://accounts.x.ai/device",
    },
    antigravity: {
        name: "Antigravity",
        vendor: "Google",
        commands: { run: "agy", signIn: "agy login" },
        installer: {
            command: "curl -fsSL https://antigravity.google/cli/install.sh | bash",
            sourceHost: "antigravity.google",
        },
        signInUrl: "https://accounts.google.com/o/oauth2/auth",
    },
};

const IDS: readonly ChatProviderId[] = ["claude", "codex", "grok", "antigravity"];

export function providerCliClientFixture(
    options: ProviderCliFixtureOptions = {},
): ProviderCliClient {
    const installMs = options.installMs ?? 2400;
    const signInMs = options.signInMs ?? 2200;
    const account = options.account ?? { email: "you@example.com", plan: "Pro" };
    const listeners = new Set<(cli: ProviderCli) => void>();
    let clock = 0;
    const version = () => (clock += 1).toString().padStart(12, "0");
    const clis = new Map<ChatProviderId, ProviderCli>(
        IDS.map((id) => {
            const entry = CATALOG[id];
            const installed = options.installed?.[id];
            return [
                id,
                {
                    id,
                    name: entry.name,
                    vendor: entry.vendor,
                    providerId: id,
                    commands: entry.commands,
                    installer: entry.installer,
                    installation: installed
                        ? {
                              status: "installed",
                              path: `/usr/local/bin/${entry.commands.run}`,
                              version: "2.1.0",
                          }
                        : { status: "missing" },
                    signIn:
                        installed === "signed_in"
                            ? { status: "signed_in", account }
                            : { status: "signed_out" },
                    version: version(),
                },
            ];
        }),
    );
    const set = (id: ChatProviderId, change: (cli: ProviderCli) => ProviderCli) => {
        const next = { ...change(clis.get(id)!), version: version() };
        clis.set(id, next);
        for (const listener of listeners) listener(next);
        return next;
    };
    const later = (ms: number, run: () => void) => void setTimeout(run, ms);
    return {
        availability: () => ({ supported: true }),
        list: () => Promise.resolve(IDS.map((id) => clis.get(id)!)),
        install(id) {
            const entry = CATALOG[id];
            const started = set(id, (cli) => ({
                ...cli,
                operation: {
                    kind: "install",
                    status: "running",
                    message: `Downloading ${entry.name}…`,
                },
            }));
            later(installMs * 0.6, () =>
                set(id, (cli) => ({
                    ...cli,
                    operation: {
                        kind: "install",
                        status: "running",
                        message: `Installing ${entry.name}…`,
                    },
                })),
            );
            later(installMs, () =>
                set(id, (cli) => ({
                    ...cli,
                    installation: {
                        status: "installed",
                        path: `~/.local/bin/${entry.commands.run}`,
                        version: "2.1.0",
                    },
                    operation: {
                        kind: "install",
                        status: "succeeded",
                        message: `${entry.name} 2.1.0 installed`,
                    },
                })),
            );
            return Promise.resolve(started);
        },
        signInStart(id) {
            const entry = CATALOG[id];
            const started = set(id, (cli) => ({
                ...cli,
                operation: {
                    kind: "sign_in",
                    status: "waiting",
                    message: `Waiting for you to sign in to ${entry.vendor}…`,
                    authorization: {
                        url: entry.signInUrl,
                        // Every one of these signs in through the browser, which
                        // the CLI itself opens.
                        openedByProgram: true,
                        acceptsCode: id === "claude" || id === "antigravity",
                        expiresAt: Date.now() + (id === "antigravity" ? 60_000 : 600_000),
                    },
                },
            }));
            later(signInMs, () =>
                set(id, (cli) => ({
                    ...cli,
                    signIn: { status: "signed_in", account },
                    operation: { kind: "sign_in", status: "succeeded", message: "Signed in" },
                })),
            );
            return Promise.resolve(started);
        },
        signInCode(id) {
            return Promise.resolve(
                set(id, (cli) => ({
                    ...cli,
                    signIn: { status: "signed_in", account },
                    operation: { kind: "sign_in", status: "succeeded", message: "Signed in" },
                })),
            );
        },
        cancel(id) {
            return Promise.resolve(set(id, (cli) => ({ ...cli, operation: undefined })));
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
}
