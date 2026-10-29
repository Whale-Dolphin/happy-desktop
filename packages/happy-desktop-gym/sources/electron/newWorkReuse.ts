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
    /** The space a section's `+` opened, and the section it stayed in. */
    readonly sectionPlus: {
        readonly opened: string;
        readonly sectionBefore: string | null;
        readonly sectionAfter: string | null;
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

        // A heading's `+` opens the empty new work where it stands.
        let sectionPlus: NewWorkReuseResult["sectionPlus"] = null;
        const heading = page.locator(`${ROWS}[data-kind="section"]:not([data-collapsed])`).first();
        if (await heading.isVisible().catch(() => false)) {
            await leave();
            const sectionOf = async (): Promise<string | null> => {
                const space = (await client.spaceSidebar()).spaces.find(
                    (entry) => entry.id === b,
                ) as { readonly sectionId?: string | null } | undefined;
                return space?.sectionId ?? null;
            };
            const sectionBefore = await sectionOf();
            await heading.hover();
            await page.waitForTimeout(400);
            await heading.locator(PLUS).click();
            await openAt(`space:${b}`);
            const sectionAfter = await sectionOf();
            sectionPlus = { opened: b, sectionBefore, sectionAfter };
            if ((await spacesMade()).length !== 2 || sectionAfter !== sectionBefore)
                throw new Error(
                    `A heading's + made or moved new work: ${JSON.stringify(sectionPlus)}.`,
                );
        }

        // Two quick Creates with nothing empty make one new work.
        await page.locator(COMPOSER).first().fill("Another draft");
        await page.waitForTimeout(1_000);
        await leave();
        await create();
        await create();
        const c = await until(async () => (await spacesMade())[2], "a third new work");
        await openAt(`space:${c}`);
        await page.waitForTimeout(1_000);
        if ((await spacesMade()).length !== 3)
            throw new Error(
                `Two quick Creates made ${String((await spacesMade()).length - 2)} new work.`,
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
