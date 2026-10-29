import { afterEach, expect, it, vi } from "vitest";
import { HappyAgentApiError } from "@slopus/happy-agent-client";
import {
    fakeHappyAgentDaemonCreate,
    type FakeHappyAgentDaemon,
} from "../testing/fakeHappyAgentDaemon.js";
import { connectHappyAgent } from "../happyAgentConnection/connectHappyAgent.js";
import { happyAgentSyncCreate } from "../happyAgentConnection/happyAgentSync.js";
import type { TaskGroup } from "../happyAgentConnection/types.js";
import {
    sidebarDocumentEdit,
    sidebarDocumentInsert,
    sidebarDocumentView,
} from "./spacesSidebarDocument.js";
import {
    happyAgentSpacesStoreCreate,
    type HappyAgentSpacesRead,
    type HappyAgentSpacesSnapshot,
} from "./spacesStore.js";

afterEach(() => vi.useRealTimers());

/** One window on one daemon: its connection, and the Spaces store beside it. */
async function windowOpen(daemon: FakeHappyAgentDaemon) {
    const connection = connectHappyAgent({
        endpoint: "http://happy-agent.test/",
        token: "token",
        client: daemon.client,
        wait: () => new Promise((resolve) => setTimeout(resolve, 0)),
        now: () => 1_000,
    });
    const listed: { tasks: readonly TaskGroup[] } = { tasks: [] };
    connection.connectGroups({
        onChange(_projects, _state, _bots, tasks) {
            listed.tasks = tasks;
        },
        onError: () => undefined,
    });
    const store = happyAgentSpacesStoreCreate({
        client: daemon.client,
        sync: connection.sync,
        stemCellTaskBegin: (identity, created) => connection.beginStemCellTask(identity, created),
    });
    const unsubscribe = store.subscribe(() => {});
    await vi.waitFor(() => expect(store.get().availability).toBe("available"));
    await vi.waitFor(() => expect(connection.config()).toBeDefined());
    return {
        connection,
        store,
        /** The reader's joined task at a workspace, as the task list shows it. */
        joined: (workspaceId: string) =>
            listed.tasks.find(
                (task) => task.workspaceId === workspaceId && task.membership !== undefined,
            ),
        close() {
            unsubscribe();
            store[Symbol.dispose]();
            connection.close();
        },
    };
}

it("makes new work in the click, and holds its first message until the daemon has made it", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.healthSet({ stemCellIdentities: true });
    const window = await windowOpen(daemon);
    try {
        const release = daemon.pause("createStemCell");
        const creation = window.store.stemCellCreate(null, null);
        // Before the daemon has answered anything: the row, its joined task,
        // and the chat the window opens, all under the names it chose.
        const cell = creation.cell!;
        expect(window.store.get().spaces.get(cell.space.id)?.icon).toEqual({ type: "stem_cell" });
        expect(window.joined(cell.workspaceId)?.session.id).toBe(cell.agentId);
        const sent = window.connection.sendMessage(cell.agentId, "Draft a release note");
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(daemon.callCount("sendMessage")).toBe(0);
        const [request] = daemon.calls.find((call) => call.method === "createStemCell")!.args;
        expect(request).toMatchObject({
            id: cell.space.id,
            taskId: cell.space.target.id,
            workspaceId: cell.workspaceId,
            agentId: cell.agentId,
        });

        release();
        await expect(creation.created).resolves.toMatchObject({
            agentId: cell.agentId,
            workspaceId: cell.workspaceId,
        });
        await vi.waitFor(() => expect(daemon.callCount("sendMessage")).toBe(1));
        expect(daemon.calls.find((call) => call.method === "sendMessage")?.args[0]).toBe(
            cell.agentId,
        );
        expect(sent).toEqual(expect.any(String));
        // The daemon's row replaces the window's, and the task stays listed.
        await vi.waitFor(() =>
            expect(window.store.get().spaces.get(cell.space.id)?.version).toBe(1),
        );
        expect(window.joined(cell.workspaceId)).toBeDefined();
        expect(window.store.get().stemCellError).toBeUndefined();
    } finally {
        window.close();
    }
});

it("takes new work the daemon refuses back out of the sidebar and the task list, and says so", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.healthSet({ stemCellIdentities: true });
    daemon.failOnce(
        "createStemCell",
        new HappyAgentApiError(409, "That name is taken.", "conflict", null),
    );
    const window = await windowOpen(daemon);
    try {
        const creation = window.store.stemCellCreate(null, null);
        const cell = creation.cell!;
        expect(window.store.get().spaces.has(cell.space.id)).toBe(true);
        expect(window.joined(cell.workspaceId)).toBeDefined();
        await expect(creation.created).rejects.toThrow("That name is taken.");
        expect(window.store.get().spaces.has(cell.space.id)).toBe(false);
        expect(window.joined(cell.workspaceId)).toBeUndefined();
        expect(window.store.get().stemCellError?.message).toBe(
            "New work could not be made. That name is taken.",
        );
        window.store.stemCellErrorDismiss();
        expect(window.store.get().stemCellError).toBeUndefined();
    } finally {
        window.close();
    }
});

it("leaves the naming to a daemon that does not take the window's names", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    const window = await windowOpen(daemon);
    try {
        const creation = window.store.stemCellCreate(null, null);
        expect(creation.cell).toBeUndefined();
        const cell = await creation.created;
        const [request] = daemon.calls.find((call) => call.method === "createStemCell")!.args;
        expect(request).not.toHaveProperty("taskId");
        expect(request).not.toHaveProperty("agentId");
        expect(window.store.get().spaces.get(cell.space.id)?.version).toBe(1);
    } finally {
        window.close();
    }
});

it("holds incoming sidebar versions through the saved drop", async () => {
    vi.useFakeTimers();
    const daemon = fakeHappyAgentDaemonCreate();
    let finish = () => {};
    daemon.client.updateSpaceSidebar = vi.fn(
        () =>
            new Promise<Awaited<ReturnType<typeof daemon.client.updateSpaceSidebar>>>((resolve) => {
                finish = () =>
                    resolve({
                        artifactId: "sidebar",
                        version: 2,
                        html: "<nav>\n</nav>",
                        spaces: [],
                    });
            }),
    );
    const sync = happyAgentSyncCreate();
    sync.writer.bootstrapReceived(await daemon.client.getDesktopBootstrap());
    const store = happyAgentSpacesStoreCreate({ client: daemon.client, sync: sync.source });
    const unsubscribe = store.subscribe(() => {});
    try {
        await vi.advanceTimersByTimeAsync(0);
        store.sidebarDragUpdate(true);
        await vi.advanceTimersByTimeAsync(0);
        const reads = daemon.callCount("getSpaceSidebar");
        const event = daemon.eventEmit("space.removed", { spaceId: "elsewhere" });
        sync.writer.updateReceived({ kind: "event", cursor: event.cursor, event });
        await vi.advanceTimersByTimeAsync(0);
        expect(daemon.callCount("getSpaceSidebar")).toBe(reads);
        store.sidebarWrite("<nav>\n</nav>");
        store.sidebarDragUpdate(false);
        await vi.advanceTimersByTimeAsync(0);
        expect(store.get().sidebar?.html).toBe("<nav>\n</nav>");
        finish();
        await vi.advanceTimersByTimeAsync(0);
        expect(store.get().sidebar?.html).toBe("<nav>\n</nav>");
        expect(store.get().sidebar?.version).toBe(2);
    } finally {
        unsubscribe();
        store[Symbol.dispose]();
        sync.writer.close();
    }
});

it("keeps one tree of rows open, replaces it with another top-level row's, drops removed rows, and never writes them", () => {
    const daemon = fakeHappyAgentDaemonCreate();
    const sync = happyAgentSyncCreate();
    const store = happyAgentSpacesStoreCreate({ client: daemon.client, sync: sync.source });
    const drawn = new Set(["space:release", "session:signing", "session:notes", "space:polish"]);
    const opened = () => {
        const rows = store.get().rowsOpened;
        return rows === null ? null : { top: rows.top, rows: [...rows.rows].sort() };
    };
    try {
        expect(opened()).toBeNull();
        store.rowsOpen(["space:release"], drawn);
        store.rowsOpen(["space:release", "session:signing"], drawn);
        store.rowsOpen(["space:release", "session:notes"], drawn);
        expect(opened()).toEqual({
            top: "space:release",
            rows: ["session:notes", "session:signing", "space:release"],
        });
        // The same selection again, or none, publishes nothing.
        const listener = vi.fn();
        const unsubscribe = store.subscribe(listener);
        store.rowsOpen(["space:release", "session:signing"], drawn);
        store.rowsOpen([], drawn);
        expect(listener).not.toHaveBeenCalled();
        unsubscribe();
        // An archived row leaves the tree; its top-level row leaving closes it.
        drawn.delete("session:notes");
        store.rowsOpen([], drawn);
        expect(opened()).toEqual({
            top: "space:release",
            rows: ["session:signing", "space:release"],
        });
        store.rowsOpen(["space:polish"], drawn);
        expect(opened()).toEqual({ top: "space:polish", rows: ["space:polish"] });
        drawn.delete("space:polish");
        store.rowsOpen([], drawn);
        expect(opened()).toBeNull();
        expect(daemon.callCount("updateSpaceSidebar")).toBe(0);
    } finally {
        store[Symbol.dispose]();
        sync.writer.close();
    }
});

it("keeps an open proposal unseen until Prioritizing's chat shows its latest version", async () => {
    vi.useFakeTimers();
    const daemon = fakeHappyAgentDaemonCreate();
    const proposal = (version: number, status: "open" | "accepted" | "declined" = "open") => ({
        artifactId: "proposal",
        version,
        baseVersion: 4,
        status,
        createdAt: 1,
        decidedAt: status === "open" ? null : 2,
        acceptedVersion: null,
    });
    daemon.client.getSpaceSidebar = vi.fn(async () => ({
        artifactId: "sidebar",
        version: 1,
        html: "<nav></nav>",
        spaces: [],
        proposal: proposal(2),
    }));
    const writes: { artifactId: string; version: number }[] = [];
    const memory = {
        read: () => writes.at(-1),
        write: (seen: { artifactId: string; version: number }) => void writes.push(seen),
    };
    const open = async () => {
        const sync = happyAgentSyncCreate();
        sync.writer.bootstrapReceived(await daemon.client.getDesktopBootstrap());
        const store = happyAgentSpacesStoreCreate({
            client: daemon.client,
            sync: sync.source,
            proposalSeenMemory: memory,
        });
        const unsubscribe = store.subscribe(() => {});
        await vi.advanceTimersByTimeAsync(0);
        const deliver = (status: "open" | "accepted" | "declined", version: number) => {
            const event = daemon.eventEmit("space.sidebar.proposal.changed", {
                proposal: proposal(version, status),
                previousVersion: version - 1,
                author: "prioritizing",
                operations: [],
            });
            sync.writer.updateReceived({ kind: "event", cursor: event.cursor, event });
        };
        const close = () => {
            unsubscribe();
            store[Symbol.dispose]();
            sync.writer.close();
        };
        return { store, deliver, close };
    };
    const first = await open();
    try {
        expect(first.store.get().proposal).toEqual({ artifactId: "proposal", version: 2 });
        expect(first.store.get().proposalSeen).toBe(false);
        first.store.proposalSeenRecord();
        expect(first.store.get().proposalSeen).toBe(true);
        expect(writes).toEqual([{ artifactId: "proposal", version: 2 }]);
        // Seen once, recording it again writes nothing.
        first.store.proposalSeenRecord();
        expect(writes).toHaveLength(1);
        // A revision waits again; an answer leaves nothing waiting.
        first.deliver("open", 3);
        await vi.advanceTimersByTimeAsync(0);
        expect(first.store.get().proposal).toEqual({ artifactId: "proposal", version: 3 });
        expect(first.store.get().proposalSeen).toBe(false);
        first.store.proposalSeenRecord();
        first.deliver("declined", 3);
        await vi.advanceTimersByTimeAsync(0);
        expect(first.store.get().proposal).toBeNull();
        expect(first.store.get().proposalSeen).toBe(false);
    } finally {
        first.close();
    }
    // The next window on this device remembers what was seen.
    daemon.client.getSpaceSidebar = vi.fn(async () => ({
        artifactId: "sidebar",
        version: 1,
        html: "<nav></nav>",
        spaces: [],
        proposal: proposal(3),
    }));
    const second = await open();
    try {
        expect(second.store.get().proposal).toEqual({ artifactId: "proposal", version: 3 });
        expect(second.store.get().proposalSeen).toBe(true);
    } finally {
        second.close();
    }
});

it("aborts offline read retries on last unsubscribe and reads again on resubscribe", async () => {
    vi.useFakeTimers();
    const daemon = fakeHappyAgentDaemonCreate();
    const sync = happyAgentSyncCreate();
    sync.writer.bootstrapReceived(await daemon.client.getDesktopBootstrap());
    const store = happyAgentSpacesStoreCreate({ client: daemon.client, sync: sync.source });
    daemon.failOnce("listSpaces");
    daemon.failOnce("listSpaces");
    const unsubscribe = store.subscribe(() => undefined);
    try {
        await vi.advanceTimersByTimeAsync(0);
        expect(daemon.callCount("listSpaces")).toBe(1);
        const signal = (
            daemon.calls.find((call) => call.method === "listSpaces")?.args[0] as {
                signal: AbortSignal;
            }
        ).signal;
        unsubscribe();
        expect(signal.aborted).toBe(true);
        await vi.advanceTimersByTimeAsync(20_000);
        expect(daemon.callCount("listSpaces")).toBe(1);
        const unsubscribeAgain = store.subscribe(() => undefined);
        await vi.advanceTimersByTimeAsync(0);
        expect(daemon.callCount("listSpaces")).toBe(2);
        await vi.advanceTimersByTimeAsync(1_000);
        expect(daemon.callCount("listSpaces")).toBe(3);
        expect(store.get().availability).toBe("available");
        unsubscribeAgain();
    } finally {
        unsubscribe();
        store[Symbol.dispose]();
        sync.writer.close();
    }
});

it("reads the sidebar document again when the daemon removes a row from it", async () => {
    vi.useFakeTimers();
    const daemon = fakeHappyAgentDaemonCreate();
    const sync = happyAgentSyncCreate();
    sync.writer.bootstrapReceived(await daemon.client.getDesktopBootstrap());
    const store = happyAgentSpacesStoreCreate({ client: daemon.client, sync: sync.source });
    const unsubscribe = store.subscribe(() => undefined);
    try {
        await vi.advanceTimersByTimeAsync(0);
        expect(daemon.callCount("getSpaceSidebar")).toBe(1);
        // An emptied stem cell goes away and the daemon writes the document
        // without it; a write against the old version would be refused.
        const event = daemon.eventEmit("space.removed", { spaceId: "space-stem" });
        sync.writer.updateReceived({ kind: "event", cursor: event.cursor, event });
        await vi.advanceTimersByTimeAsync(0);
        expect(daemon.callCount("getSpaceSidebar")).toBe(2);
    } finally {
        unsubscribe();
        store[Symbol.dispose]();
        sync.writer.close();
    }
});

/** One task's row as the daemon sends it, at a version and under a title. */
function taskRow(version: number, title: string | null, working = false) {
    return {
        createdAt: 1,
        icon: null,
        id: "space-release",
        orderKey: "a0",
        placement: "settled" as const,
        sectionId: null,
        target: {
            agentId: "agent-release",
            id: "task-release",
            kind: "task" as const,
            workspaceId: "ws-release",
        },
        title,
        updatedAt: version,
        version,
        visibility: "shown" as const,
        working,
    };
}

/** A store over a daemon whose sidebar lists one task, with every title it showed. */
async function renameWindowOpen() {
    const daemon = fakeHappyAgentDaemonCreate();
    let listed = taskRow(1, "Release");
    daemon.client.listSpaces = vi.fn(async () => ({ cursor: "0", sections: [], spaces: [listed] }));
    const sync = happyAgentSyncCreate();
    sync.writer.bootstrapReceived(await daemon.client.getDesktopBootstrap());
    const store = happyAgentSpacesStoreCreate({ client: daemon.client, sync: sync.source });
    const shown: (string | null)[] = [];
    const title = () => store.get().spaces.get("space-release" as never)?.title;
    const unsubscribe = store.subscribe(() => {
        const current = title();
        if (current !== undefined && current !== shown.at(-1)) shown.push(current);
    });
    await vi.waitFor(() => expect(title()).toBe("Release"));
    return {
        store,
        shown,
        title,
        spaceId: "space-release" as never,
        /** Delivers one `space.updated` as the journal would. */
        async echo(row: ReturnType<typeof taskRow>) {
            const event = daemon.eventEmit("space.updated", { space: row });
            sync.writer.updateReceived({ kind: "event", cursor: event.cursor, event });
            await new Promise((resolve) => setTimeout(resolve, 0));
        },
        /** Delivers the daemon's `space.removed` for the row. */
        async removed() {
            const event = daemon.eventEmit("space.removed", { spaceId: "space-release" });
            sync.writer.updateReceived({ kind: "event", cursor: event.cursor, event });
            await new Promise((resolve) => setTimeout(resolve, 0));
        },
        /** Has the next full read of the sidebar answer this row. */
        listedSet(row: ReturnType<typeof taskRow>) {
            listed = row;
        },
        /** Has the store read the whole sidebar again, as after a reconnect. */
        async reread() {
            const reads = vi.mocked(daemon.client.listSpaces).mock.calls.length;
            sync.writer.bootstrapReceived(await daemon.client.getDesktopBootstrap());
            await vi.waitFor(() =>
                expect(vi.mocked(daemon.client.listSpaces).mock.calls.length).toBe(reads + 1),
            );
            await new Promise((resolve) => setTimeout(resolve, 0));
        },
        close() {
            unsubscribe();
            store[Symbol.dispose]();
            sync.writer.close();
        },
    };
}

it("wears a hand-given name from the keystroke, through late and out-of-order echoes, until the daemon's own carries it", async () => {
    const window = await renameWindowOpen();
    try {
        // Enter: the name is the row's in the same call, before any reply.
        window.store.spaceTitleUpdate(window.spaceId, "Release train");
        expect(window.title()).toBe("Release train");

        // The daemon's reply is late. Meanwhile the journal delivers a change
        // it made before the rename landed — newer, under the old name — and
        // then an older one out of order, and a full read taken before it.
        await window.echo(taskRow(2, "Release", true));
        expect(window.title()).toBe("Release train");
        expect(window.store.get().spaces.get(window.spaceId)?.working).toBe(true);
        await window.echo(taskRow(1, "Release"));
        window.listedSet(taskRow(2, "Release", true));
        await window.reread();
        expect(window.title()).toBe("Release train");

        // The rename's own echo carries the name; from then on the daemon's
        // word is the row's again, so the next rename by anyone shows.
        await window.echo(taskRow(3, "Release train", true));
        await window.echo(taskRow(4, "Release train 2"));
        expect(window.title()).toBe("Release train 2");
        expect(window.shown).toEqual(["Release", "Release train", "Release train 2"]);
    } finally {
        window.close();
    }
});

it("puts the daemon's latest title back when it refuses a hand-given name", async () => {
    const window = await renameWindowOpen();
    try {
        window.store.spaceTitleUpdate(window.spaceId, "Release train");
        await window.echo(taskRow(2, "Release notes"));
        expect(window.title()).toBe("Release train");
        // A withdrawal of a name no longer shown changes nothing.
        window.store.spaceTitleWithdraw(window.spaceId, "Something else");
        expect(window.title()).toBe("Release train");
        window.store.spaceTitleWithdraw(window.spaceId, "Release train");
        expect(window.title()).toBe("Release notes");
        expect(window.shown).toEqual(["Release", "Release train", "Release notes"]);
    } finally {
        window.close();
    }
});

it("puts a row's daemon picture behind the endpoint this connection talks to", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    const row = (id: string, icon: { type: "image"; url: string } | null) => ({
        createdAt: 1,
        icon,
        id,
        orderKey: id,
        placement: "settled" as const,
        sectionId: null,
        target: {
            agentId: `agent-${id}`,
            id: `bot-${id}`,
            kind: "bot" as const,
            workspaceId: null,
        },
        title: id,
        updatedAt: 1,
        version: 1,
        visibility: "shown" as const,
        working: false,
    });
    daemon.client.listSpaces = vi.fn(async () => ({
        cursor: "0",
        sections: [],
        spaces: [
            row("uploaded", { type: "image", url: "/v0/bots/bot-uploaded/avatar" }),
            row("hosted", { type: "image", url: "https://cdn.test/face.png" }),
            row("bare", null),
        ],
    }));
    const sync = happyAgentSyncCreate();
    sync.writer.bootstrapReceived(await daemon.client.getDesktopBootstrap());
    const store = happyAgentSpacesStoreCreate({ client: daemon.client, sync: sync.source });
    const unsubscribe = store.subscribe(() => {});
    try {
        await vi.waitFor(() => expect(store.get().spaces.size).toBe(3));
        const icon = (id: string) => store.get().spaces.get(id as never)?.icon;
        // The same address the classic sidebar draws this bot's avatar from.
        expect(icon("uploaded")).toEqual({
            type: "image",
            url: "http://fake-happy-agent.test/v0/bots/bot-uploaded/avatar",
        });
        expect(icon("hosted")).toEqual({ type: "image", url: "https://cdn.test/face.png" });
        expect(icon("bare")).toBeNull();
    } finally {
        unsubscribe();
        store[Symbol.dispose]();
        sync.writer.close();
    }
});

it("reads the rows and their document together and shows them in one change", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    const html = sidebarDocumentEdit(
        ["<nav>", "<happy-search/>", "<happy-create/>", "</nav>"].join("\n"),
        (view) => sidebarDocumentInsert(view, "space-release", null, null),
    );
    expect(html).toContain("space-release");
    daemon.spacesSet([taskRow(1, "Release")]);
    daemon.spaceSidebarSet({ version: 3, html: html! });
    const rowsRelease = daemon.pause("listSpaces");
    const documentRelease = daemon.pause("getSpaceSidebar");
    const sync = happyAgentSyncCreate();
    sync.writer.bootstrapReceived(await daemon.client.getDesktopBootstrap());
    const reads: HappyAgentSpacesRead[] = [];
    const store = happyAgentSpacesStoreCreate({
        client: daemon.client,
        sync: sync.source,
        readObserve: (read) => reads.push(read),
    });
    const shown: HappyAgentSpacesSnapshot[] = [];
    const unsubscribe = store.subscribe(() => shown.push(store.get()));
    try {
        // Both are asked at once: one round trip to a remote daemon, not two.
        await vi.waitFor(() => {
            expect(daemon.callCount("listSpaces")).toBe(1);
            expect(daemon.callCount("getSpaceSidebar")).toBe(1);
        });
        // The document answers first; nothing shows until the rows do too.
        documentRelease();
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(shown).toEqual([]);
        // A change made while the read was out is held, then replayed onto it.
        const event = daemon.eventEmit("space.updated", { space: taskRow(2, "Release train") });
        sync.writer.updateReceived({ kind: "event", cursor: event.cursor, event });
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(shown).toEqual([]);
        rowsRelease();
        await vi.waitFor(() => expect(store.get().availability).toBe("available"));
        await new Promise((resolve) => setTimeout(resolve, 20));

        // One change carries the rows, the document that arranges them, and
        // the held event, so neither is ever on screen beside an older other.
        const [first] = shown;
        expect(first?.availability).toBe("available");
        expect(first?.sidebar).toMatchObject({ version: 3, html });
        expect(first?.spaces.get("space-release" as never)).toMatchObject({
            title: "Release train",
            version: 2,
        });
        expect(shown.filter((snapshot) => snapshot.sidebar !== first?.sidebar)).toEqual([]);
        expect(daemon.callCount("listSpaces")).toBe(1);
        expect(daemon.callCount("getSpaceSidebar")).toBe(1);
        expect(reads).toEqual([{ scope: "all", durationMs: expect.any(Number), attempts: 1 }]);
    } finally {
        unsubscribe();
        store[Symbol.dispose]();
        sync.writer.close();
    }
});

/** A sidebar with two headings, for new work made under one of them. */
function sidebarWithSections(daemon: FakeHappyAgentDaemon): void {
    daemon.spaceSidebarSet({
        version: 1,
        html: [
            "<nav>",
            "<happy-search/>",
            "<happy-create/>",
            '<happy-section id="section-a" label="A"/>',
            '<happy-section id="section-b" label="B"/>',
            "</nav>",
        ].join("\n"),
    });
}

it("takes an archived or left row out at once, through late echoes and reads, until the daemon removes it", async () => {
    const window = await renameWindowOpen();
    const has = () => window.store.get().spaces.has(window.spaceId);
    try {
        window.store.spaceRemove(window.spaceId);
        expect(has()).toBe(false);
        // The daemon took the archive, but its sidebar still lists the row.
        await window.echo(taskRow(2, "Release notes", true));
        window.listedSet(taskRow(2, "Release notes", true));
        await window.reread();
        expect(has()).toBe(false);

        // A refusal puts the row back as the daemon last said it.
        window.store.spaceRemoveWithdraw(window.spaceId);
        expect(window.store.get().spaces.get(window.spaceId)).toMatchObject({
            title: "Release notes",
            version: 2,
        });

        // Removed by the daemon, the row stays gone and nothing is left to put back.
        window.store.spaceRemove(window.spaceId);
        await window.removed();
        window.store.spaceRemoveWithdraw(window.spaceId);
        expect(has()).toBe(false);
    } finally {
        window.close();
    }
});

it("forgets a removal once a full read no longer lists the row", async () => {
    const window = await renameWindowOpen();
    try {
        window.store.spaceRemove(window.spaceId);
        window.listedSet({ ...taskRow(2, "Other"), id: "space-other" });
        await window.reread();
        window.store.spaceRemoveWithdraw(window.spaceId);
        expect(window.store.get().spaces.has(window.spaceId)).toBe(false);
    } finally {
        window.close();
    }
});

it("closes new work at once, and puts it back when the daemon refuses because it has a message", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.healthSet({ stemCellIdentities: true });
    const window = await windowOpen(daemon);
    try {
        const cell = await window.store.stemCellCreate(null, null).created;
        await vi.waitFor(() =>
            expect(window.store.get().spaces.get(cell.space.id)?.version).toBe(1),
        );
        await window.connection.sendMessageConfirmed(cell.agentId, "Plan the trip.");
        window.store.stemCellDiscard(cell.space.id);
        expect(window.store.get().spaces.has(cell.space.id)).toBe(false);
        await vi.waitFor(() => expect(window.store.get().spaces.has(cell.space.id)).toBe(true));
        expect(daemon.callCount("removeSpace")).toBe(1);
    } finally {
        window.close();
    }
});

it("goes to empty new work wherever it is on Create, and leaves it in place", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.healthSet({ stemCellIdentities: true });
    sidebarWithSections(daemon);
    const window = await windowOpen(daemon);
    try {
        const first = await window.store.stemCellCreate("section-a", null).created;
        await vi.waitFor(() =>
            expect(window.store.get().spaces.get(first.space.id)?.version).toBe(1),
        );
        // Left with nothing in it: it stays, and nothing asks the daemon to remove it.
        window.store.stemCellContentUpdate(first.agentId, "empty");
        expect(window.store.get().spaces.has(first.space.id)).toBe(true);
        // Create goes to it, under its heading, as it is.
        const again = window.store.stemCellCreate(null, null);
        expect(again.cell).toBeUndefined();
        await expect(again.created).resolves.toMatchObject({
            agentId: first.agentId,
            space: { id: first.space.id },
        });
        expect(daemon.callCount("createStemCell")).toBe(1);
        expect(daemon.callCount("removeSpace")).toBe(0);
    } finally {
        window.close();
    }
});

it("makes new work under a heading's + there, whatever empty new work stands elsewhere", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.healthSet({ stemCellIdentities: true });
    sidebarWithSections(daemon);
    const window = await windowOpen(daemon);
    try {
        const top = await window.store.stemCellCreate(null, null).created;
        const inA = await window.store.stemCellCreate("section-a", null).created;
        await vi.waitFor(() =>
            expect(window.store.get().spaces.get(inA.space.id)?.version).toBe(1),
        );
        // Empty new work at the top and under A: B's + still makes its own.
        const inB = window.store.stemCellCreate("section-b", null);
        expect(inB.cell).toBeDefined();
        const made = await inB.created;
        expect([top.agentId, inA.agentId]).not.toContain(made.agentId);
        const items = sidebarDocumentView(window.store.get().sidebar?.html ?? "").items;
        const heading = items.findIndex(
            (item) => item.kind === "section" && item.id === "section-b",
        );
        expect(items[heading + 1]).toMatchObject({ kind: "space", id: made.space.id });
        expect(daemon.callCount("createStemCell")).toBe(3);
    } finally {
        window.close();
    }
});

it("goes to the empty new work already under a heading on its +", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.healthSet({ stemCellIdentities: true });
    sidebarWithSections(daemon);
    const window = await windowOpen(daemon);
    try {
        const inA = await window.store.stemCellCreate("section-a", null).created;
        await vi.waitFor(() =>
            expect(window.store.get().spaces.get(inA.space.id)?.version).toBe(1),
        );
        await expect(window.store.stemCellCreate("section-a", null).created).resolves.toMatchObject(
            { agentId: inA.agentId },
        );
        expect(daemon.callCount("createStemCell")).toBe(1);
    } finally {
        window.close();
    }
});

it("makes new work when the existing one holds a message or drafted words", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.healthSet({ stemCellIdentities: true });
    const window = await windowOpen(daemon);
    try {
        const sent = await window.store.stemCellCreate(null, null).created;
        await vi.waitFor(() =>
            expect(window.store.get().spaces.get(sent.space.id)?.version).toBe(1),
        );
        window.connection.sendMessage(sent.agentId, "Hello");
        await vi.waitFor(() => expect(daemon.callCount("sendMessage")).toBe(1));
        const drafted = await window.store.stemCellCreate(null, null).created;
        expect(drafted.agentId).not.toBe(sent.agentId);
        await vi.waitFor(() =>
            expect(window.store.get().spaces.get(drafted.space.id)?.version).toBe(1),
        );
        await daemon.client.saveAgentDraft(drafted.agentId, {
            draft: {
                text: "A draft",
                providerId: "p",
                modelId: "m",
                effort: "medium",
                serviceTier: null,
                permissionMode: "auto",
            },
            updatedAt: 5,
        });
        const third = await window.store.stemCellCreate(null, null).created;
        expect([sent.agentId, drafted.agentId]).not.toContain(third.agentId);
        expect(daemon.callCount("createStemCell")).toBe(3);
    } finally {
        window.close();
    }
});

it("does not go back to new work this window last saw holding something", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.healthSet({ stemCellIdentities: true });
    const window = await windowOpen(daemon);
    try {
        const first = await window.store.stemCellCreate(null, null).created;
        await vi.waitFor(() =>
            expect(window.store.get().spaces.get(first.space.id)?.version).toBe(1),
        );
        // An attachment, or words still on their way to the daemon.
        window.store.stemCellContentUpdate(first.agentId, "started");
        const second = await window.store.stemCellCreate(null, null).created;
        expect(second.agentId).not.toBe(first.agentId);
        expect(window.store.get().spaces.has(first.space.id)).toBe(true);
    } finally {
        window.close();
    }
});

it("answers Create again with the new work still being made", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.healthSet({ stemCellIdentities: true });
    const window = await windowOpen(daemon);
    try {
        const release = daemon.pause("createStemCell");
        const first = window.store.stemCellCreate(null, null);
        expect(window.store.stemCellCreate(null, null)).toBe(first);
        release();
        await first.created;
        expect(daemon.callCount("createStemCell")).toBe(1);
    } finally {
        window.close();
    }
});
