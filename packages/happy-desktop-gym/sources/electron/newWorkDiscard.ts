import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright";

import { gymElectronVideoRecord } from "./launch.js";
import type { GymHappyAgentClient } from "./happyAgentProtocol.js";

/*
 * New work nobody wrote in does not outlive the visit. The person presses
 * Create, presses it again — the same new work stays on screen, no second one
 * appears — and goes to another row: the new work's row is gone in the click,
 * and the daemon archives its chat. New work with a draft in its composer is
 * kept when it is left; emptied and left again, it goes too.
 */

const ROWS = '[data-happy-desktop-ui="sidebar-item"]';
const CREATE = `${ROWS}[data-item-id="create"]`;
const SELECTED = `${ROWS}[aria-current="page"]`;
const COMPOSER = '[data-happy-desktop-ui="composer-textarea"]:visible';

export interface NewWorkDiscardResult {
    /** New work rows before and after Create was pressed a second time. */
    readonly reused: { readonly before: number; readonly after: number };
    /** How long after the click on another row the empty new work's row was gone. */
    readonly emptyGoneMs: number;
    readonly emptyArchived: boolean;
    /** Whether new work with a draft was still listed after it was left. */
    readonly draftedKept: boolean;
    readonly draftedGoneOnceEmptied: boolean;
    /** Whether new work open when the page unloaded was taken out. */
    readonly unloadedGone: boolean;
    /** Two quick Creates and away: how much new work was made, and the rows left. */
    readonly quickLeft: { readonly made: number; readonly rows: number };
    readonly video: string;
}

async function until<T>(read: () => Promise<T | undefined>, what: string): Promise<T> {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
        const value = await read();
        if (value !== undefined) return value;
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out waiting for ${what}.`);
}

/** Every row drawn in the sidebar, by item ID. */
function rowIds(page: Page): Promise<readonly string[]> {
    return page.evaluate(
        (rows) =>
            [...document.querySelectorAll<HTMLElement>(rows)].map(
                (node) => node.dataset.itemId ?? "",
            ),
        ROWS,
    );
}

/** Presses Create and waits for the new work's chat to be open and read. */
async function workCreate(
    page: Page,
    client: GymHappyAgentClient,
): Promise<{ readonly rowId: string; readonly spaceId: string; readonly agentId: string }> {
    const before = await rowIds(page);
    await page.locator(CREATE).first().click();
    const rowId = await until(async () => {
        const id = await page.locator(SELECTED).first().getAttribute("data-item-id");
        return id?.startsWith("space:") && !before.includes(id) ? id : undefined;
    }, "new work to be made");
    const spaceId = rowId.slice("space:".length);
    const agentId = await until(
        async () =>
            (await client.spaceSidebar()).spaces.find((space) => space.id === spaceId)?.target
                .agentId ?? undefined,
        "the daemon to make the new work",
    );
    await page.waitForFunction(
        (id) =>
            document
                .querySelector('[data-happy-desktop-ui="tab"][aria-selected="true"]')
                ?.getAttribute("data-tab-id") === id,
        agentId,
        { timeout: 30_000 },
    );
    await page.locator(COMPOSER).first().waitFor({ state: "visible", timeout: 30_000 });
    // Long enough for its empty transcript to have been read.
    await page.waitForTimeout(1_500);
    return { rowId, spaceId, agentId };
}

async function daemonListed(client: GymHappyAgentClient, spaceId: string): Promise<boolean> {
    return (await client.spaceSidebar()).spaces.some((space) => space.id === spaceId);
}

export async function newWorkDiscardRun(
    page: Page,
    client: GymHappyAgentClient,
    artifacts: string,
): Promise<NewWorkDiscardResult> {
    const videoPath = join(artifacts, "new-work-discard.webm");
    const video = await gymElectronVideoRecord(page, { path: videoPath, scale: 2 });
    try {
        await page.waitForTimeout(800);
        // Somewhere else to go: the first row that is not new work.
        const elsewhere = await until(async () => {
            const ids = await rowIds(page);
            return ids.find((id) => id.startsWith("space:"));
        }, "a row to leave for");
        const leave = async (): Promise<void> => {
            await page.locator(`${ROWS}[data-item-id="${elsewhere}"]`).first().click();
        };

        // Create, and Create again: the same new work stays the one.
        const empty = await workCreate(page, client);
        const newWork = async () =>
            (await rowIds(page)).filter((id) => id.startsWith("space:")).length;
        const reusedBefore = await newWork();
        await page.waitForTimeout(600);
        await page.locator(CREATE).first().click();
        await page.waitForTimeout(1_500);
        const reusedAfter = await newWork();
        const stillOpen = await page.locator(SELECTED).first().getAttribute("data-item-id");
        if (reusedAfter !== reusedBefore || stillOpen !== empty.rowId)
            throw new Error(
                `Create made more new work: ${String(reusedBefore)} rows → ${String(reusedAfter)}, open ${String(stillOpen)}.`,
            );

        // Left with nothing in it: gone in the click, archived by the daemon.
        const clicked = Date.now();
        await leave();
        await until(
            async () => ((await rowIds(page)).includes(empty.rowId) ? undefined : true),
            "the empty new work's row to go",
        );
        const emptyGoneMs = Date.now() - clicked;
        await until(
            async () => ((await daemonListed(client, empty.spaceId)) ? undefined : true),
            "the daemon to take the empty new work out",
        );
        const emptyArchived = await client.agentArchived(empty.agentId);
        if (emptyGoneMs > 500)
            throw new Error(`The empty new work's row took ${String(emptyGoneMs)}ms to go.`);
        if (!emptyArchived) throw new Error("The daemon did not archive the empty new work.");
        await page.waitForTimeout(1_200);

        // A draft keeps it.
        const drafted = await workCreate(page, client);
        await page.locator(COMPOSER).first().fill("A draft worth keeping");
        await page.waitForTimeout(1_000);
        await leave();
        await page.waitForTimeout(2_000);
        const draftedKept =
            (await rowIds(page)).includes(drafted.rowId) &&
            (await daemonListed(client, drafted.spaceId));
        if (!draftedKept) throw new Error("New work with a draft went when it was left.");
        await page.screenshot({ path: join(artifacts, "new-work-discard-drafted.png") });

        // Emptied and left again, it goes too.
        await page.locator(`${ROWS}[data-item-id="${drafted.rowId}"]`).first().click();
        await page.locator(COMPOSER).first().waitFor({ state: "visible", timeout: 30_000 });
        await page.waitForTimeout(1_200);
        await page.locator(COMPOSER).first().fill("");
        await page.waitForTimeout(800);
        await leave();
        await until(
            async () => ((await rowIds(page)).includes(drafted.rowId) ? undefined : true),
            "the emptied new work's row to go",
        );
        const draftedGoneOnceEmptied = await until(
            async () => ((await daemonListed(client, drafted.spaceId)) ? undefined : true),
            "the daemon to take the emptied new work out",
        );
        await page.waitForTimeout(1_200);

        // Quick hands: Create twice and away before anything has loaded. One
        // new work is made, and it goes with the reader.
        const stemCells = async (): Promise<number> =>
            (await client.spaceSidebar()).spaces.filter(
                (space) => space.title === null && space.icon?.type === "stem_cell",
            ).length;
        const spacesMade = async (): Promise<number> =>
            (await client.journalEvents()).filter((entry) => entry.event.type === "space.created")
                .length;
        const quickBefore = await stemCells();
        const quickMadeBefore = await spacesMade();
        await page.locator(CREATE).first().click();
        await page.locator(CREATE).first().click();
        await page.waitForTimeout(150);
        await leave();
        await until(
            async () =>
                (await stemCells()) === quickBefore && (await spacesMade()) > quickMadeBefore
                    ? true
                    : undefined,
            "the quickly left new work to go",
        );
        await page.waitForTimeout(1_500);
        const quickLeft = {
            made: (await spacesMade()) - quickMadeBefore,
            rows: (await rowIds(page)).filter((id) => id.startsWith("space:")).length,
        };
        if (quickLeft.made !== 1)
            throw new Error(`Two quick Creates made ${String(quickLeft.made)} new work.`);
        if ((await stemCells()) !== quickBefore) throw new Error("New work left quickly stayed.");

        // The window going away leaves it too. A reload stands in for closing
        // it: the page is unloaded the same way, and the window stays to look at.
        const unloaded = await workCreate(page, client);
        await page.reload();
        const unloadedGone = await until(
            async () => ((await daemonListed(client, unloaded.spaceId)) ? undefined : true),
            "the daemon to take out the new work the window left",
        );
        await page.locator(CREATE).first().waitFor({ timeout: 45_000 });
        await page.waitForTimeout(2_000);
        await page.screenshot({ path: join(artifacts, "new-work-discard-unloaded.png") });

        const result: NewWorkDiscardResult = {
            quickLeft,
            unloadedGone,
            reused: { before: reusedBefore, after: reusedAfter },
            emptyGoneMs,
            emptyArchived,
            draftedKept,
            draftedGoneOnceEmptied,
            video: videoPath,
        };
        await writeFile(join(artifacts, "new-work-discard.json"), JSON.stringify(result, null, 2));
        return result;
    } finally {
        await video.stop();
    }
}
