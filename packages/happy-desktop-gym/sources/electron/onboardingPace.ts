/*
 * GYM SCENARIO — onboarding: how the recording breathes. Every hold, move and
 * reading rate the drive and the scripted model use is here, so the pace of
 * the whole video is tuned in one place.
 */
import type { Locator, Page } from "playwright";

export const ONBOARDING_PACE = {
    /** A reader's pace through what a message says once it has finished streaming. */
    wordsPerMinute: 220,
    /** The shortest and longest a finished message holds before the next click. */
    readMinMs: 1_500,
    readMaxMs: 6_000,
    /** What a table, a figure or a proposal adds to its message's reading time. */
    readExtraPerFigureMs: 1_500,
    /** How long a message must stop changing to count as finished streaming. */
    streamSettledMs: 400,
    /** The cursor travels to a control, eased, and rests on it before the click. */
    cursorMoveMs: 600,
    cursorHoverMs: 400,
    /** The chosen control and the person's bubble hold before the reply begins. */
    chosenHoldMs: 800,
    /** A change in the sidebar holds before anything else happens. */
    sidebarHoldMs: 1_500,
    /** The scripted model's wait before its first token, which covers `chosenHoldMs`. */
    modelFirstTokenMs: 1_000,
} as const;

/** The pointer the recording shows: the window's own cursor is not in a page capture. */
const CURSOR_ID = "gym-cursor";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Puts the recording's cursor in the window, resting at `x`, `y`. */
export async function gymCursorInstall(page: Page, x: number, y: number): Promise<void> {
    await page.evaluate(
        ({ id, x, y }) => {
            if (document.getElementById(id)) return;
            const cursor = document.createElement("div");
            cursor.id = id;
            cursor.setAttribute("aria-hidden", "true");
            cursor.style.cssText = [
                "position:fixed",
                "left:0",
                "top:0",
                "width:18px",
                "height:18px",
                "margin:-9px 0 0 -9px",
                "border-radius:50%",
                "background:rgba(20,20,20,0.55)",
                "box-shadow:0 0 0 2px rgba(255,255,255,0.95),0 1px 4px rgba(0,0,0,0.35)",
                "pointer-events:none",
                "z-index:2147483647",
                `transform:translate(${String(x)}px,${String(y)}px)`,
            ].join(";");
            document.body.append(cursor);
        },
        { id: CURSOR_ID, x, y },
    );
    await page.mouse.move(x, y);
}

/** Moves the recording's cursor to `x`, `y` at the pace above, the real pointer with it. */
async function cursorMove(page: Page, x: number, y: number): Promise<void> {
    await page.evaluate(
        ({ id, x, y, ms }) => {
            const cursor = document.getElementById(id);
            if (!cursor) return;
            cursor.style.transition = `transform ${String(ms)}ms cubic-bezier(0.4, 0, 0.2, 1)`;
            cursor.style.transform = `translate(${String(x)}px,${String(y)}px)`;
        },
        { id: CURSOR_ID, x, y, ms: ONBOARDING_PACE.cursorMoveMs },
    );
    await page.mouse.move(x, y, { steps: 12 });
    await sleep(ONBOARDING_PACE.cursorMoveMs);
}

/** The press: travel to the control, rest on it, click, and hold on what was chosen. */
export async function gymCursorClick(page: Page, target: Locator): Promise<void> {
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    if (!box) throw new Error("The control to press has no box on screen.");
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await cursorMove(page, x, y);
    await sleep(ONBOARDING_PACE.cursorHoverMs);
    await page.mouse.click(x, y);
    await sleep(ONBOARDING_PACE.chosenHoldMs);
}

/**
 * How long a message takes to read once it has stopped streaming: its words at
 * the reading pace, and each table, figure or proposal in it on top.
 */
export async function gymReadHold(message: Locator): Promise<number> {
    let text = await message.innerText();
    /* Still streaming: wait until it stops changing. */
    for (;;) {
        await sleep(ONBOARDING_PACE.streamSettledMs);
        const next = await message.innerText();
        if (next === text) break;
        text = next;
    }
    const words = text.split(/\s+/u).filter(Boolean).length;
    const figures = await message
        .locator(
            '[data-happy-desktop-ui="chat-action-table"], .happy-chat-action__figure, [data-happy-desktop-ui="sidebar-proposal"], [data-happy-desktop-ui="chat-action-tree"]',
        )
        .count();
    const ms =
        (words / ONBOARDING_PACE.wordsPerMinute) * 60_000 +
        figures * ONBOARDING_PACE.readExtraPerFigureMs;
    const hold = Math.round(
        Math.min(ONBOARDING_PACE.readMaxMs, Math.max(ONBOARDING_PACE.readMinMs, ms)),
    );
    await sleep(hold);
    return hold;
}
