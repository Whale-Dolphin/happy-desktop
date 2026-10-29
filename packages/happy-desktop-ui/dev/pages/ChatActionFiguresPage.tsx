import type {
    ChatProviderId,
    HappyAgentDefaultModelSnapshot,
    ProviderCli,
    ProviderCliOperation,
} from "happy-desktop-state";
import { UserError } from "happy-desktop-state";
import { ChatActionBlock } from "../../src/ChatActionBlock";
import { ChatDefaultModelFigure, ChatProviderCliFigure } from "../../src/ChatActionFigures";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-330";

/*
 * Fixture data only: no CLI is installed or signed in to draw these, and the
 * account below is made up.
 */
const CODEX: ProviderCli = {
    id: "codex",
    name: "Codex",
    vendor: "OpenAI",
    installation: { status: "missing" },
    installer: {
        command: "curl -fsSL https://chatgpt.com/codex/install.sh | CODEX_NON_INTERACTIVE=1 sh",
        sourceHost: "chatgpt.com",
    },
    commands: { run: "codex", signIn: "codex login" },
    signIn: { status: "signed_out" },
    version: "000000000001",
};

const installed = (cli: ProviderCli, version = "0.61.0"): ProviderCli => ({
    ...cli,
    installation: { status: "installed", path: `/Users/you/.local/bin/${cli.id}`, version },
});

const operating = (cli: ProviderCli, operation: ProviderCliOperation): ProviderCli => ({
    ...cli,
    operation,
});

const signedIn = (cli: ProviderCli): ProviderCli => ({
    ...installed(cli),
    signIn: { status: "signed_in", account: { email: "you@example.com", plan: "Pro" } },
});

const GROK: ProviderCli = {
    ...CODEX,
    id: "grok",
    name: "Grok",
    vendor: "xAI",
    installer: { command: "curl -fsSL https://x.ai/cli/install.sh | bash", sourceHost: "x.ai" },
    commands: { run: "grok", signIn: "grok login" },
};

const CLI_STATES: readonly {
    readonly id: string;
    readonly label: string;
    readonly detail: string;
    readonly cliId: ChatProviderId;
    readonly cli?: ProviderCli;
    readonly requesting?: boolean;
    readonly error?: string;
}[] = [
    {
        id: "PC-01",
        label: "Reading",
        detail: "before the daemon has described the CLI",
        cliId: "codex",
    },
    {
        id: "PC-02",
        label: "Missing",
        detail: "the installer it runs and where from · Install and sign in",
        cliId: "codex",
        cli: CODEX,
    },
    {
        id: "PC-03",
        label: "Installing",
        detail: "the daemon's own sentence · Cancel",
        cliId: "codex",
        cli: operating(CODEX, {
            kind: "install",
            status: "running",
            message: "Downloading Codex from chatgpt.com…",
        }),
    },
    {
        id: "PC-04",
        label: "Signed out",
        detail: "installed, not signed in · Sign in",
        cliId: "codex",
        cli: installed(CODEX),
    },
    {
        id: "PC-05",
        label: "Waiting on the browser",
        detail: "the page to open again, and a code the page may show",
        cliId: "codex",
        cli: operating(installed(CODEX), {
            kind: "sign_in",
            status: "waiting",
            message: "Finish signing in to Codex in your browser.",
            authorization: {
                url: "https://auth.openai.com/authorize",
                openedByProgram: false,
                acceptsCode: true,
            },
        }),
    },
    {
        id: "PC-06",
        label: "Device sign-in",
        detail: "the code to confirm on the vendor's page",
        cliId: "grok",
        cli: operating(installed(GROK, "1.4.2"), {
            kind: "sign_in",
            status: "waiting",
            message: "Open the page and confirm the code.",
            authorization: {
                url: "https://accounts.x.ai/device",
                userCode: "WDJB-MJHT",
                openedByProgram: false,
                acceptsCode: false,
            },
        }),
    },
    {
        id: "PC-07",
        label: "Signed in",
        detail: "the account the CLI reports",
        cliId: "codex",
        cli: signedIn(CODEX),
    },
    {
        id: "PC-08",
        label: "Failed",
        detail: "the daemon's error · Try again",
        cliId: "codex",
        cli: operating(installed(CODEX), {
            kind: "sign_in",
            status: "failed",
            error: { code: "expired", message: "The sign-in page wasn't finished in time." },
        }),
    },
    {
        id: "PC-09",
        label: "Refused",
        detail: "a request the daemon turned down, over the state it left",
        cliId: "codex",
        cli: installed(CODEX),
        error: "Happy Agent is busy installing Codex.",
    },
];

const MODELS: HappyAgentDefaultModelSnapshot = {
    loading: false,
    current: { providerId: "codex", modelId: "openai/gpt-6.1-sol", effort: "medium" },
    choices: [
        {
            providerId: "codex",
            providerName: "Codex",
            modelId: "openai/gpt-6.1-sol",
            modelName: "GPT-6.1 Sol",
            efforts: ["low", "medium", "high", "xhigh"],
            defaultEffort: "medium",
        },
        {
            providerId: "claude",
            providerName: "Claude",
            modelId: "anthropic/opus-5-5",
            modelName: "Opus 5.5",
            efforts: ["low", "medium", "high", "max"],
            defaultEffort: "high",
        },
    ],
};

const SETTING_STATES: readonly {
    readonly id: string;
    readonly label: string;
    readonly detail: string;
    readonly state: HappyAgentDefaultModelSnapshot;
}[] = [
    {
        id: "DM-01",
        label: "Reading",
        detail: "before the catalog is read",
        state: { loading: true, choices: [] },
    },
    { id: "DM-02", label: "Current", detail: "the model and its effort", state: MODELS },
    {
        id: "DM-03",
        label: "Saving",
        detail: "the change asked for, until the daemon answers",
        state: {
            ...MODELS,
            saving: { providerId: "claude", modelId: "anthropic/opus-5-5" },
        },
    },
    {
        id: "DM-04",
        label: "Refused",
        detail: "the daemon's reason, over what it still holds",
        state: {
            ...MODELS,
            saveError: new UserError("That model isn't offered by an enabled account."),
        },
    },
];

export function ChatActionFiguresPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="The live figures an agent may put in a reply: one provider CLI with its install and sign-in, and the default model for new chats. Each is one fixed box whatever state it is in, so the height the transcript reserved never changes. Every specimen here is fixture data; nothing is installed or signed in to draw it."
            title="Chat action figures"
        >
            <div className="specimen-grid">
                {CLI_STATES.map((state) => (
                    <Specimen
                        detail={`${state.detail} · fixture data`}
                        key={state.id}
                        label={state.label}
                        number={state.id}
                        stage="app"
                    >
                        <div
                            data-screen={state.id.toLowerCase()}
                            style={{ display: "flex", flexDirection: "column", gap: "10px" }}
                        >
                            <DimensionRule label="560px wide · 112px fixed" />
                            <ChatActionBlock
                                block={{ kind: "providerCli", cliId: state.cliId }}
                                figures={{
                                    providerCli: (cliId) => (
                                        <ChatProviderCliFigure
                                            cliId={cliId}
                                            {...(state.cli ? { cli: state.cli } : {})}
                                            {...(state.error ? { error: state.error } : {})}
                                            onCancel={() => undefined}
                                            onCodeSend={() => undefined}
                                            onInstall={() => undefined}
                                            onPageOpen={() => undefined}
                                            onSignIn={() => undefined}
                                            spinnerFrame={0}
                                        />
                                    ),
                                }}
                            />
                        </div>
                    </Specimen>
                ))}
            </div>

            <div className="specimen-grid">
                {SETTING_STATES.map((state) => (
                    <Specimen
                        detail={`${state.detail} · fixture data`}
                        key={state.id}
                        label={state.label}
                        number={state.id}
                        stage="app"
                    >
                        <div
                            data-screen={state.id.toLowerCase()}
                            style={{ display: "flex", flexDirection: "column", gap: "10px" }}
                        >
                            <DimensionRule label="560px wide · 96px fixed" />
                            <ChatActionBlock
                                block={{ kind: "setting", setting: "default-model" }}
                                figures={{
                                    setting: () => (
                                        <ChatDefaultModelFigure
                                            onChange={() => undefined}
                                            spinnerFrame={0}
                                            state={state.state}
                                        />
                                    ),
                                }}
                            />
                        </div>
                    </Specimen>
                ))}
            </div>
        </ComponentPage>
    );
}
