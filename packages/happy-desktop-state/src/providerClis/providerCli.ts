import type { ChatProviderId } from "../chatActions/chatAction.js";

/**
 * The coding-assistant CLIs Happy Agent can install and sign in, as its
 * `/v0/provider-clis` routes describe them (happy-agent API.md, "Provider CLIs").
 *
 * This is the client's own typed copy of that object. A host adapts the wire
 * shape into it once, so onboarding never reads a response body and a field
 * renamed on the wire changes one adapter.
 */
export type ProviderCli = {
    readonly id: ChatProviderId;
    /** "Claude Code", "Codex", "Grok", "Antigravity". */
    readonly name: string;
    /** "Anthropic", "OpenAI", "xAI", "Google". */
    readonly vendor: string;
    /** The Happy Agent provider this sign-in serves, as `GET /v0/config` names it; absent when none is configured. */
    readonly providerId?: string;
    readonly installation: {
        readonly status: "installed" | "missing";
        readonly path?: string;
        readonly version?: string;
        /** Found inside a vendor's desktop app, such as ChatGPT. */
        readonly desktopApp?: string;
    };
    /** What installing runs, said before it runs; absent when Happy cannot install it here. */
    readonly installer?: {
        readonly command: string;
        /** Where it downloads from, such as `claude.ai`. */
        readonly sourceHost: string;
    };
    /** How to use it from a terminal directly. */
    readonly commands: { readonly run: string; readonly signIn: string };
    readonly signIn: {
        readonly status: "signed_in" | "signed_out" | "unknown";
        readonly account?: { readonly email?: string; readonly plan?: string };
    };
    readonly operation?: ProviderCliOperation;
    /** UUIDv7: of two copies, the greater is newer. */
    readonly version: string;
};

export type ProviderCliOperation = {
    readonly kind: "install" | "sign_in";
    readonly status: "running" | "waiting" | "succeeded" | "failed" | "cancelled";
    /** A display sentence: "Downloading Claude Code…". */
    readonly message?: string;
    /** Present while a sign-in is `waiting` on the person. */
    readonly authorization?: {
        readonly url?: string;
        readonly userCode?: string;
        /** The CLI opened the browser itself; Happy must not open it again. */
        readonly openedByProgram: boolean;
        /** The vendor page shows a code the person may paste back (`signInCode`). */
        readonly acceptsCode: boolean;
        /** When the waiting sign-in gives up, in Unix ms; Antigravity's lasts about a minute. */
        readonly expiresAt?: number;
    };
    readonly error?: { readonly code: string; readonly message: string };
};

/**
 * What onboarding needs from Happy Agent's provider CLIs. Calls resolve with
 * the object as it stands once the daemon accepted them; every later change
 * arrives through `subscribe` as a complete replacement.
 */
export interface ProviderCliClient {
    /** Whether this Happy Agent can install and sign in CLIs; absent support says why. */
    readonly availability: () =>
        | { readonly supported: true }
        | { readonly supported: false; readonly reason: string };
    list(): Promise<readonly ProviderCli[]>;
    install(id: ChatProviderId): Promise<ProviderCli>;
    signInStart(id: ChatProviderId): Promise<ProviderCli>;
    /** Hands the CLI the code its sign-in page showed, for a sign-in that accepts one. */
    signInCode(id: ChatProviderId, code: string): Promise<ProviderCli>;
    cancel(id: ChatProviderId): Promise<ProviderCli>;
    /** Each update to one CLI, whoever caused it. */
    subscribe(listener: (cli: ProviderCli) => void): () => void;
}

/** Of two copies of one CLI, the newer. */
export function providerCliNewer(held: ProviderCli | undefined, next: ProviderCli): ProviderCli {
    return held !== undefined && held.version > next.version ? held : next;
}
