import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import type {
    HappyAgentClockStore,
    HappyAgentConnectionStore,
    HappyAgentModelStore,
    HappyAgentPanelStore,
    HappyAgentTask,
    HappyAgentTaskId,
    HappyAgentWorkspaceStore,
    HappyAgentWorktreeId,
} from "happy-desktop-state";
import {
    appearanceStoreCreate,
    happyAgentGroupAccessRefused,
    happyAgentHostNoop,
    HAPPY_AGENT_RETAINED_CONVERSATIONS_NONE,
    HAPPY_AGENT_TASK_ARCHIVED_REFUSAL,
} from "happy-desktop-state";
import {
    AppHappyAgentView,
    type AppHappyAgentDirectorySnapshot,
    type AppHappyAgentDirectoryStore,
} from "../../sources/AppHappyAgentView";

/* A task archived while the reader has it open — by an agent, a teammate, or
 * another window — leaves the sidebar, but its conversation stays where the
 * reader is: still selected, still readable, its input locked with the reason
 * rather than the window falling back to an empty pane. */

const CONNECTED = { connection: "connected", daemon: "ready", attempt: 0 } as const;
const PANEL_CLOSED = { open: false, tabs: [] } as const;
const MODELS_LOADING = { type: "loading" } as const;

const task = (id: string, name: string, archived: boolean): HappyAgentTask => ({
    id: id as HappyAgentTaskId,
    workspaceId: `ws_${id}` as HappyAgentWorktreeId,
    name,
    conversation: {
        id: `ses_${id}`,
        title: name,
        subtitle: "",
        updatedAt: 1_763_999_000_000,
        activity: "idle" as const,
        participants: [],
    },
    subtasks: [],
    owner: null,
    path: `/Users/happy/Tasks/${id}`,
    displayPath: `~/Tasks/${id}`,
    createdAt: 1,
    archived,
    canArchive: true,
    ...(archived ? {} : { membership: { orderKey: id } }),
});

const SHIPPED = task("voice", "Voice waveform", true);
const ACTIVE = task("billing", "Fix invoice rounding", false);

function workspace(): HappyAgentWorkspaceStore {
    const snapshot = {
        list: {
            bots: [],
            tasks: [ACTIVE],
            taskDirectory: [ACTIVE],
            tasksArchived: [SHIPPED],
            tasksJoining: new Set(),
            taskFailures: new Map(),
            projects: { type: "ready" as const, value: [] },
        },
        conversation: { type: "unloaded" as const },
        address: { groupId: SHIPPED.workspaceId, conversationId: SHIPPED.conversation.id },
        groupAccess: happyAgentGroupAccessRefused(HAPPY_AGENT_TASK_ARCHIVED_REFUSAL),
        fileTabs: [],
        tabOrder: [],
        openInTargets: [],
        fileViewMode: "unified" as const,
        fileScope: "changed" as const,
        fileLayout: "flat" as const,
        fileTreeExpanded: new Set<string>(),
        fileTreeCollapsed: new Set<string>(),
        fileSearch: { query: "", searching: false },
        workspaceFilesLoading: false,
        fileComments: { comments: [] },
        reviews: new Map(),
    };
    // Actions the surface calls while it lays out a conversation do nothing here.
    const store = {
        get: () => snapshot,
        deviceBridgeSupport: () => undefined,
        conversationsRetained: HAPPY_AGENT_RETAINED_CONVERSATIONS_NONE,
        panel: {
            get: () => PANEL_CLOSED,
            subscribe: () => () => undefined,
            [Symbol.dispose]: () => undefined,
        } as unknown as HappyAgentPanelStore,
        subscribe: () => () => undefined,
        [Symbol.dispose]: () => undefined,
    };
    return new Proxy(store, {
        get: (target, property) =>
            property in target ? target[property as keyof typeof target] : () => undefined,
    }) as unknown as HappyAgentWorkspaceStore;
}

function view() {
    const snapshot: AppHappyAgentDirectorySnapshot = {
        happyAgents: [
            {
                bots: [],
                tasks: [ACTIVE],
                version: "0.4.87-preview.5",
                id: "local",
                label: "local",
                projects: [],
                projectsStatus: "ready",
                session: {
                    clock: {
                        get: () => 1_764_000_000_000,
                        subscribe: () => () => undefined,
                        [Symbol.dispose]: () => undefined,
                    } as unknown as HappyAgentClockStore,
                    connection: {
                        get: () => CONNECTED,
                        subscribe: () => () => undefined,
                        [Symbol.dispose]: () => undefined,
                    } as unknown as HappyAgentConnectionStore,
                    host: happyAgentHostNoop,
                    models: {
                        get: () => MODELS_LOADING,
                        subscribe: () => () => undefined,
                        [Symbol.dispose]: () => undefined,
                    } as unknown as HappyAgentModelStore,
                    workspace: workspace(),
                },
                status: "connected",
            },
        ],
    };
    const directory: AppHappyAgentDirectoryStore = {
        get: () => snapshot,
        subscribe: () => () => undefined,
        happyAgentActivate: () => undefined,
    };
    return render(
        <AppHappyAgentView
            appearance={appearanceStoreCreate({ mode: "light" })}
            onChatSelect={() => undefined}
            onFileClose={() => undefined}
            onFileSelect={() => undefined}
            onSettingsOpen={() => undefined}
            happyAgentId="local"
            groupId={SHIPPED.workspaceId}
            chatId={SHIPPED.conversation.id}
            happyAgents={directory}
        />,
    );
}

it("keeps an archived task's conversation open where the reader is, without its row", () => {
    const { container } = view();
    const rowIds = [...container.querySelectorAll('[data-happy-desktop-ui="sidebar-item"]')].map(
        (row) => row.getAttribute("data-item-id"),
    );
    expect(rowIds).toContain("local/ws_billing");
    expect(rowIds).not.toContain("local/ws_voice");

    expect(container.textContent).not.toContain("No project open");
    expect(container.textContent).toContain("Voice waveform");
});
