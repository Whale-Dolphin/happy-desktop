import { expect, it } from "vitest";
import type { ChatProviderId } from "../chatActions/chatAction.js";
import type { ProviderCli, ProviderCliClient } from "./providerCli.js";
import { happyAgentProviderClisStoreCreate } from "./providerClisStore.js";

/**
 * The daemon's Claude, behind a client that hears only what it asked for, as
 * the HTTP client does until it can decode `provider_cli.updated`: a sign-in
 * the daemon starts for a chat press reaches it only by reading again.
 */
function daemonClaude() {
    let clock = 0;
    let claude: ProviderCli = {
        id: "claude",
        name: "Claude Code",
        vendor: "Anthropic",
        providerId: "claude",
        commands: { run: "claude", signIn: "claude auth login" },
        installation: { status: "installed", path: "/usr/local/bin/claude" },
        signIn: { status: "signed_out" },
        version: "0",
    };
    const change = (operation: ProviderCli["operation"]) => {
        clock += 1;
        claude = { ...claude, operation, version: String(clock).padStart(12, "0") };
        return claude;
    };
    const waiting = (url: string): ProviderCli["operation"] => ({
        kind: "sign_in",
        status: "waiting",
        authorization: { url, acceptsCode: true, openedByProgram: false },
    });
    const client: ProviderCliClient = {
        availability: () => ({ supported: true }),
        list: () => Promise.resolve([claude]),
        install: () => Promise.reject(new Error("installed")),
        signInStart: () => Promise.resolve(change(waiting("https://claude.ai/oauth/first"))),
        signInCode: () => Promise.reject(new Error("unused")),
        cancel: () => Promise.resolve(change({ kind: "sign_in", status: "cancelled" })),
        subscribe: () => () => undefined,
    };
    /** A chat press the daemon runs itself: a new sign-in this window never asked for. */
    const pressSignIn = () => void change(waiting("https://claude.ai/oauth/second"));
    return { client, pressSignIn };
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));
const operationOf = (
    store: ReturnType<typeof happyAgentProviderClisStoreCreate>,
    id: ChatProviderId,
) => store.get().clis.get(id)?.operation;

it("a figure after a cancel draws the sign-in the daemon started since, not the cancelled one", async () => {
    const daemon = daemonClaude();
    const store = happyAgentProviderClisStoreCreate({ client: daemon.client });
    // The first figure: Sign in, then Cancel.
    store.subscribe(() => undefined);
    store.cliSignInStart("claude");
    await settled();
    store.cliCancel("claude");
    await settled();
    expect(operationOf(store, "claude")?.status).toBe("cancelled");
    // Choose another AI → Claude → Sign in to Claude: the daemon starts a new
    // sign-in, and Happy's reply draws a second figure while the first stays.
    daemon.pressSignIn();
    store.subscribe(() => undefined);
    await settled();
    expect(operationOf(store, "claude")).toMatchObject({
        status: "waiting",
        authorization: { url: "https://claude.ai/oauth/second", acceptsCode: true },
    });
});
