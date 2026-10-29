import { useCallback, useSyncExternalStore } from "react";
import type {
    ChatActionChoice,
    ChatActionInvocation,
    ChatProviderId,
    HappyAgentClockStore,
    HappyAgentDefaultModelStore,
    HappyAgentMobileConnectorStore,
    HappyAgentProviderClisStore,
} from "happy-desktop-state";
import {
    ChatDefaultModelFigure,
    ChatProviderCliFigure,
    MobileDirectPairingPanel,
    type ChatActionFigures,
} from "happy-desktop-ui";

/**
 * The inline actions an agent writes into a chat, as every conversation on
 * one connection presses them: what is on its way to the daemon, the press
 * itself, and the live figures a block may ask for.
 */
export interface AppChatActions {
    /** Presses not recorded on their message yet, by `chatActionBlockKey`. */
    readonly pending: ReadonlyMap<string, ChatActionChoice>;
    /** One press in the conversation `agentId`. */
    readonly press: (agentId: string, invocation: ChatActionInvocation) => void;
    /** What the live figures show, where a block asks for them. */
    readonly figures?: ChatActionFigures;
}

/**
 * This computer's direct pairing with a phone, where a chat shows it: the code
 * to scan in Happy on the phone, then the emoji both screens approve. Shown,
 * it opens a pairing; gone, it closes it. It owns its subscriptions, so only
 * it repaints as the code counts down.
 */
export function HappyAgentChatPhonePairing(props: {
    readonly phone: HappyAgentMobileConnectorStore;
    readonly clock: HappyAgentClockStore;
}) {
    const phone = useSyncExternalStore(props.phone.subscribe, props.phone.get, props.phone.get);
    const now = useSyncExternalStore(props.clock.subscribe, props.clock.get, props.clock.get);
    const store = props.phone;
    // One ref for the store's lifetime: a new one each render would close
    // and reopen the pairing every time the code counts down.
    const pairingHold = useCallback(
        (node: HTMLDivElement | null) => {
            if (!node) return;
            store.pairingOpen();
            return () => store.pairingClose();
        },
        [store],
    );
    return (
        <div ref={pairingHold}>
            <MobileDirectPairingPanel
                cancelling={phone.cancelling}
                codePlain
                codeSize={204}
                confirming={phone.confirming}
                connector={phone.connector}
                density="compact"
                now={now}
                onConfirm={store.pairingConfirm}
                onReject={store.pairingReject}
                onStart={store.pairingStart}
                starting={phone.starting}
                {...(phone.actionError ? { actionError: phone.actionError } : {})}
            />
        </div>
    );
}

/**
 * One provider CLI where a chat shows it, live from the connection's provider
 * CLIs: its install and sign-in, each control calling the daemon's provider
 * CLI routes. Only it repaints as an install or sign-in goes on.
 */
export function HappyAgentChatProviderCli(props: {
    readonly store: HappyAgentProviderClisStore;
    readonly cliId: ChatProviderId;
    /** Opens a vendor's sign-in page in the person's browser. */
    readonly linkOpen?: (url: string) => void;
}) {
    const clis = useSyncExternalStore(props.store.subscribe, props.store.get, props.store.get);
    const { store, cliId } = props;
    const cli = clis.clis.get(cliId);
    const error = clis.errors.get(cliId);
    return (
        <ChatProviderCliFigure
            cliId={cliId}
            {...(cli ? { cli } : {})}
            {...(error ? { error: error.message } : {})}
            onCancel={() => store.cliCancel(cliId)}
            onCodeSend={(code) => store.cliSignInCodeSend(cliId, code)}
            onInstall={() => store.cliInstall(cliId)}
            {...(props.linkOpen ? { onPageOpen: props.linkOpen } : {})}
            onSignIn={() => store.cliSignInStart(cliId)}
            requesting={clis.requesting.has(cliId)}
        />
    );
}

/** The default model for new chats where a chat shows it, changed in place. */
export function HappyAgentChatDefaultModel(props: { readonly store: HappyAgentDefaultModelStore }) {
    const state = useSyncExternalStore(props.store.subscribe, props.store.get, props.store.get);
    return <ChatDefaultModelFigure onChange={props.store.defaultModelUpdate} state={state} />;
}
