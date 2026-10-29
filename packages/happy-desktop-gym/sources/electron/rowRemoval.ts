import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright";

import { GYM_STOP_SHIMMER_PARENT_PROMPT } from "./inferenceServer.js";
import { gymElectronVideoRecord } from "./launch.js";
import type { GymHappyAgentClient } from "./happyAgentProtocol.js";

/*
 * Archiving from a sidebar row removes the row in the click. The person makes
 * work that hands its turn to a subtask and a second piece of work, archives
 * the subtask from its row under the work, then archives the second work from
 * its own row. Each row must be gone within 100ms of the press, before any
 * daemon round trip, and must not come back while the daemon's sidebar
 * catches up.
 */

const ROWS = '[data-happy-desktop-ui="sidebar-item"]';
const COMPOSER = '[data-happy-desktop-ui="composer-textarea"]';
/** Opens new work that answers at once and names nothing else. */
const PLAIN_PROMPT = "Row removal. gym-row-removal";
/** How long a removed row is watched for coming back. */
const WATCH_MS = 4_000;
/** How soon after the press a removed row must be gone. */
const GONE_WITHIN_MS = 100;

export interface RowRemovalCheck {
    readonly rowId: string;
    /** How long after the press the row was gone, or `null` if it never went. */
    readonly goneAfterMs: number | null;
    /** How many times the row was drawn again within `WATCH_MS` of the daemon archiving it. */
    readonly timesBack: number;
}

export interface RowRemovalResult {
    readonly subtask: RowRemovalCheck;
    readonly task: RowRemovalCheck;
    readonly video: string;
}

const row = (page: Page, id: string) => page.locator(`${ROWS}[data-item-id="${id}"]`).first();

async function selectedAgentId(page: Page): Promise<string> {
    const tab = page.locator('[data-happy-desktop-ui="tab"][aria-selected="true"]').first();
    await tab.waitFor({ state: "attached", timeout: 30_000 });
    const id = await tab.getAttribute("data-tab-id");
    if (!id) throw new Error("The selected tab names no conversation.");
    return id;
}

async function workCreate(page: Page, prompt: string): Promise<string> {
    await row(page, "create").click();
    const composer = page.locator(`${COMPOSER}:visible`).first();
    await composer.waitFor({ state: "visible", timeout: 30_000 });
    await composer.fill(`${prompt}-${Date.now()}`);
    await composer.press("Enter");
    return selectedAgentId(page);
}

async function until<T>(read: () => Promise<T | undefined>, what: string): Promise<T> {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
        const value = await read();
        if (value !== undefined) return value;
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error(`Timed out waiting for ${what}.`);
}

/**
 * Picks a menu item on a row and watches the row from inside the page with a
 * mutation observer, whose callbacks name no inner functions (tsx would wrap
 * them in a `__name` helper the page lacks):
 * how long after the press it went, and how many times it was drawn again.
 */
async function removeAndWatch(
    page: Page,
    rowId: string,
    menuItem: string,
    archived: () => Promise<boolean>,
): Promise<RowRemovalCheck> {
    await row(page, rowId).click({ button: "right" });
    const item = page.getByRole("menuitem", { name: menuItem });
    await item.waitFor({ state: "visible", timeout: 10_000 });
    await page.waitForTimeout(400);
    const selector = `${ROWS}[data-item-id="${rowId}"]`;
    await page.evaluate((selector) => {
        const state = {
            pressedAt: undefined as number | undefined,
            goneAfterMs: undefined as number | undefined,
            timesBack: 0,
        };
        let present = document.querySelector(selector) !== null;
        const observer = new MutationObserver(() => {
            const now = document.querySelector(selector) !== null;
            if (now === present) return;
            present = now;
            if (!now && state.goneAfterMs === undefined && state.pressedAt !== undefined)
                state.goneAfterMs = performance.now() - state.pressedAt;
            if (now && state.goneAfterMs !== undefined) state.timesBack += 1;
        });
        observer.observe(document.body, { childList: true, subtree: true });
        window.addEventListener(
            "pointerdown",
            () => {
                state.pressedAt = performance.now();
            },
            { capture: true, once: true },
        );
        (window as unknown as { __rowRemoval: unknown }).__rowRemoval = { state, observer };
    }, selector);
    await item.click();
    await until(async () => ((await archived()) ? true : undefined), "the daemon to archive it");
    // The daemon's sidebar catches up meanwhile; the row must not come back.
    await page.waitForTimeout(WATCH_MS);
    const watched = await page.evaluate(() => {
        const watch = (
            window as unknown as {
                __rowRemoval: {
                    state: { goneAfterMs?: number; timesBack: number };
                    observer: MutationObserver;
                };
            }
        ).__rowRemoval;
        watch.observer.disconnect();
        return { goneAfterMs: watch.state.goneAfterMs ?? null, timesBack: watch.state.timesBack };
    });
    return { rowId, ...watched };
}

export async function rowRemovalRun(
    page: Page,
    client: GymHappyAgentClient,
    artifacts: string,
): Promise<RowRemovalResult> {
    try {
        return await rowRemovalScenario(page, client, artifacts);
    } catch (error) {
        await page
            .screenshot({ path: join(artifacts, "row-removal-failure.png") })
            .catch(() => undefined);
        throw error;
    }
}

async function rowRemovalScenario(
    page: Page,
    client: GymHappyAgentClient,
    artifacts: string,
): Promise<RowRemovalResult> {
    // New work an earlier run left empty would be gone to; it is started first.
    for (const space of (await client.spaceSidebar()).spaces)
        if (space.title === null && space.icon?.type === "stem_cell" && space.target.agentId)
            await client.sendMessage(space.target.agentId, "Started by an earlier run");
    await page.waitForTimeout(2_000);
    const parentAgentId = await workCreate(page, GYM_STOP_SHIMMER_PARENT_PROMPT);
    const subtaskId = await until(
        async () => (await client.subtaskIds(parentAgentId))[0],
        "the work's subtask",
    );
    const plainAgentId = await workCreate(page, PLAIN_PROMPT);
    const spaceOf = async (agentId: string) =>
        (await client.spaceSidebar()).spaces.find((space) => space.target.agentId === agentId);
    const parentSpace = await until(() => spaceOf(parentAgentId), "the work's row");
    const plainSpace = await until(() => spaceOf(plainAgentId), "the second work's row");
    if (plainSpace.target.kind !== "task")
        throw new Error(`New work is a ${plainSpace.target.kind}, not a task.`);
    // Carried under the first work, as the person might keep related work.
    await client.spaceAttach(plainSpace.id, parentSpace.id);
    const subtaskRow = row(page, `session:${subtaskId}`);
    // The work's menu offers its subtasks once the window's lists carry them.
    await until(async () => {
        if (await subtaskRow.isVisible()) return true;
        await row(page, `space:${parentSpace.id}`).click({ button: "right" });
        await page.waitForTimeout(400);
        const show = page.getByRole("menuitem", { name: "Show subtasks" });
        if (await show.isVisible()) await show.click();
        else await page.keyboard.press("Escape");
        await page.waitForTimeout(1_000);
        return (await subtaskRow.isVisible()) ? true : undefined;
    }, "the subtask's row");
    await row(page, `space:${plainSpace.id}`).waitFor({ state: "visible", timeout: 30_000 });
    await page.mouse.move(0, 0);
    await page.waitForTimeout(500);

    const videoPath = join(artifacts, "row-removal.webm");
    const video = await gymElectronVideoRecord(page, { path: videoPath, scale: 2 });
    try {
        await page.waitForTimeout(600);
        const subtask = await removeAndWatch(page, `session:${subtaskId}`, "Archive subtask", () =>
            client.agentArchived(subtaskId),
        );
        await page.waitForTimeout(600);
        const taskId = plainSpace.target.id;
        const task = await removeAndWatch(page, `space:${plainSpace.id}`, "Archive task", () =>
            client.taskArchived(taskId),
        );
        await page.waitForTimeout(800);
        await page.screenshot({ path: join(artifacts, "row-removal.png") });
        for (const check of [subtask, task]) {
            // Within a frame or two of the press, long before any daemon round trip.
            if (check.goneAfterMs === null || check.goneAfterMs > GONE_WITHIN_MS)
                throw new Error(
                    `${check.rowId} went ${String(check.goneAfterMs)}ms after the press.`,
                );
            if (check.timesBack > 0)
                throw new Error(`${check.rowId} came back ${String(check.timesBack)} times.`);
        }
        const result: RowRemovalResult = { subtask, task, video: videoPath };
        await writeFile(join(artifacts, "row-removal.json"), JSON.stringify(result, null, 2));
        return result;
    } finally {
        await video.stop();
    }
}
