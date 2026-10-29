import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright";

import { gymElectronVideoRecord } from "./launch.js";
import type { GymHappyAgentClient } from "./happyAgentProtocol.js";

/*
 * There is never more than one empty new work. The person presses Create and
 * gets new work; leaving it removes nothing. Create again, from anywhere, goes
 * back to that same new work. New work with a draft is kept and skipped: Create
 * then makes another, and from then on goes to that one. A section heading's
 * `+` opens the empty new work where it is rather than moving it. Two quick
 * Creates make one new work, and a reload keeps everything.
 */

const ROWS = '[data-happy-desktop-ui="sidebar-item"]';
const CREATE = `${ROWS}[data-item-id="create"]`;
const SELECTED = `${ROWS}[aria-current="page"]`;
const COMPOSER = '[data-happy-desktop-ui="composer-textarea"]:visible';
const PLUS = '[data-happy-desktop-ui="sidebar-item-action"]';

export interface NewWorkReuseResult {
    /** Space IDs of the new work made, in order. */
    readonly made: readonly string[];
    /** New work the daemon still lists at the end, which must be all of it. */
    readonly listedAtEnd: readonly string[];
    /** The heading whose `+` made new work under it while other new work stood empty. */
    readonly sectionPlus: {
        readonly heading: string;
        readonly made: string;
        readonly keptEmptyElsewhere: string;
    } | null;
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

export async function newWorkReuseRun(
    page: Page,
    client: GymHappyAgentClient,
    artifacts: string,
): Promise<NewWorkReuseResult> {
    // New work an earlier run left empty would be gone to; it is started first.
    for (const space of (await client.spaceSidebar()).spaces)
        if (space.title === null && space.icon?.type === "stem_cell" && space.target.agentId)
            await client.sendMessage(space.target.agentId, "Started by an earlier run");
    await page.waitForTimeout(2_000);
    const videoPath = join(artifacts, "new-work-reuse.webm");
    const video = await gymElectronVideoRecord(page, { path: videoPath, scale: 2 });
    /** Spaces the daemon has made since the run began, oldest first. */
    const journalStart = (await client.journalEvents()).length;
    const spacesMade = async (): Promise<string[]> =>
        (await client.journalEvents())
            .slice(journalStart)
            .flatMap((entry) =>
                entry.event.type === "space.created"
                    ? [(entry.event.payload as { space: { id: string } }).space.id]
                    : [],
            );
    const listed = async (spaceId: string): Promise<boolean> =>
        (await client.spaceSidebar()).spaces.some((space) => space.id === spaceId);
    const selected = async (): Promise<string> =>
        (await page.locator(SELECTED).first().getAttribute("data-item-id")) ?? "";
    /** Waits for the open row to be `rowId` and its composer to be there and read. */
    const openAt = async (rowId: string): Promise<void> => {
        await until(
            async () => ((await selected()) === rowId ? true : undefined),
            `${rowId} to open`,
        );
        await page.locator(COMPOSER).first().waitFor({ state: "visible", timeout: 30_000 });
        await page.waitForTimeout(1_200);
    };
    const create = async (): Promise<void> => {
        await page.locator(CREATE).first().click();
    };
    try {
        await page.waitForTimeout(800);
        const elsewhere = await until(async () => {
            const ids = await rowIds(page);
            return ids.find((id) => id.startsWith("space:"));
        }, "a row to leave for");
        const leave = async (): Promise<void> => {
            await page.locator(`${ROWS}[data-item-id="${elsewhere}"]`).first().click();
            await until(
                async () => ((await selected()) === elsewhere ? true : undefined),
                "the other row to open",
            );
            await page.waitForTimeout(800);
        };

        // Create, and Create again: the same new work.
        await create();
        const a = await until(async () => (await spacesMade())[0], "new work to be made");
        await openAt(`space:${a}`);
        await create();
        await page.waitForTimeout(1_200);
        if ((await selected()) !== `space:${a}` || (await spacesMade()).length !== 1)
            throw new Error("Create in empty new work made more.");

        // Leaving it removes nothing; Create from elsewhere goes back to it.
        await leave();
        await page.waitForTimeout(1_000);
        if (!(await rowIds(page)).includes(`space:${a}`) || !(await listed(a)))
            throw new Error("Leaving empty new work removed it.");
        await create();
        await openAt(`space:${a}`);
        if ((await spacesMade()).length !== 1)
            throw new Error("Create made new work while empty new work existed.");

        // A draft keeps it and makes it not empty: Create makes another.
        await page.locator(COMPOSER).first().fill("A draft worth keeping");
        await page.waitForTimeout(1_000);
        await leave();
        await create();
        const b = await until(async () => (await spacesMade())[1], "a second new work");
        await openAt(`space:${b}`);
        await leave();
        // And from then on Create goes to that one, not the drafted one.
        await create();
        await openAt(`space:${b}`);
        await page.screenshot({ path: join(artifacts, "new-work-reuse.png") });

        // A heading's `+` makes new work under that heading, whatever empty new
        // work stands elsewhere; pressed again, it goes to that one.
        let sectionPlus: NewWorkReuseResult["sectionPlus"] = null;
        const heading = page.locator(`${ROWS}[data-kind="section"]:not([data-collapsed])`).last();
        await heading.waitFor({ state: "visible", timeout: 30_000 });
        const headingId = (await heading.getAttribute("data-item-id")) ?? "";
        const plus = async (): Promise<void> => {
            await heading.hover();
            await page.waitForTimeout(400);
            await heading.locator(PLUS).click();
        };
        await leave();
        await plus();
        const d = await until(async () => (await spacesMade())[2], "new work under the heading");
        await openAt(`space:${d}`);
        const ids = await rowIds(page);
        const under = ids[ids.indexOf(headingId) + 1];
        if (under !== `space:${d}`)
            throw new Error(
                `The heading's + made new work at ${String(under)}, not under ${headingId}.`,
            );
        await leave();
        await plus();
        await openAt(`space:${d}`);
        if ((await spacesMade()).length !== 3)
            throw new Error("A heading's + made more while its empty new work stood there.");
        sectionPlus = { heading: headingId, made: d, keptEmptyElsewhere: b };
        await page.screenshot({ path: join(artifacts, "new-work-reuse-section.png") });

        // Create still goes to empty new work wherever it is.
        await leave();
        await create();
        await until(async () => {
            const open = await selected();
            return open === `space:${b}` || open === `space:${d}` ? true : undefined;
        }, "Create to go to empty new work");
        await page.waitForTimeout(1_200);
        if ((await spacesMade()).length !== 3)
            throw new Error("Create made new work while empty new work existed.");

        // Two quick Creates with nothing empty make one new work.
        for (const rowId of [`space:${b}`, `space:${d}`]) {
            await page.locator(`${ROWS}[data-item-id="${rowId}"]`).first().click();
            await openAt(rowId);
            await page.locator(COMPOSER).first().fill("Another draft");
            await page.waitForTimeout(1_000);
        }
        await leave();
        await create();
        await create();
        const c = await until(async () => (await spacesMade())[3], "a fourth new work");
        await openAt(`space:${c}`);
        await page.waitForTimeout(1_000);
        if ((await spacesMade()).length !== 4)
            throw new Error(
                `Two quick Creates made ${String((await spacesMade()).length - 3)} new work.`,
            );

        // Leaving and reloading keeps it all.
        await leave();
        await page.reload();
        await page.locator(CREATE).first().waitFor({ timeout: 45_000 });
        await page.waitForTimeout(1_500);
        const made = await spacesMade();
        const listedAtEnd: string[] = [];
        for (const id of made) if (await listed(id)) listedAtEnd.push(id);
        if (listedAtEnd.length !== made.length) throw new Error("New work went missing.");
        await page.screenshot({ path: join(artifacts, "new-work-reuse-reloaded.png") });

        const result: NewWorkReuseResult = { made, listedAtEnd, sectionPlus, video: videoPath };
        await writeFile(join(artifacts, "new-work-reuse.json"), JSON.stringify(result, null, 2));
        return result;
    } finally {
        await video.stop();
    }
}
