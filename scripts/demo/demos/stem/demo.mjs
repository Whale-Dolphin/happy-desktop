import * as world from "./world.mjs";
import { releaseCoordinatorName, releaseCoordinatorPrepare } from "../core/bots.mjs";
import { coreProtocolOpen, steve, stevePhoneMessage } from "../core/protocol.mjs";
import { shipCommand, shippingPrepare, shippingVerify } from "../core/shipping.mjs";
import { execFile as exec } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readdir, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(exec);

/** The whole app, delivered as one static window: a narrow sidebar beside a compact main pane. */
const viewport = { width: 668, height: 664 };
const stemCellsSetting = "happy-desktop.experiments.stemCells";
const defaultModelSetting = "happy-desktop.model.default";
const astra = { providerId: "codex", modelId: "openai/gpt-6-astra" };

let recordedAgentId;
let recordedSpaceId;
let framing;
let checkout;
let shippingFixture;
let shippingEvidence;
let releaseCoordinator;
const filing = {};
const cues = [];
/** `place` is what a captioned cut may point at: `{ rect }` in CSS pixels or `{ phoneRect }` in phone points. */
const cue = (name, demo, phone, place = {}) => {
    cues.push({ name, seconds: demo.timing.frames / demo.timing.fps, ...place });
    phone?.cue(name, demo);
};

async function until(demo, read, label, timeout = 30000) {
    const deadline = Date.now() + timeout;
    for (;;) {
        const value = await read();
        if (value) return value;
        if (Date.now() > deadline) throw new Error(`Stem demo: timed out waiting for ${label}.`);
        await demo.hold(200);
    }
}

/** Off-camera polling, before the take has a timeline. */
async function wait(read, label, timeout = 60000) {
    const deadline = Date.now() + timeout;
    for (;;) {
        const value = await read();
        if (value) return value;
        if (Date.now() > deadline) throw new Error(`Stem demo: timed out preparing ${label}.`);
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
}

const settled = (locator) =>
    locator.evaluate((element) =>
        element
            .getAnimations({ subtree: true })
            .every((animation) => animation.playState !== "running"),
    );

const spaceRead = async (gym, id) =>
    (await gym.client.listSpaces()).spaces.find((space) => space.id === id);

/** The native iOS sidebar's own row identities, top to bottom. */
const phoneRows = (screen) =>
    screen
        .filter((item) => item.id?.startsWith("stem-row:"))
        .map((item) => {
            const [, kind, label] = item.id.split(":");
            return { kind, label, top: Number(item.bounds?.match(/^\[\d+,(\d+)\]/)?.[1]) };
        });

/** The phone's home is up and lists `title` (when given). */
const phoneHome = (title) => (screen) =>
    phoneRows(screen).some((row) => row.kind === "space" && row.label === "Happy") &&
    (title === undefined ||
        phoneRows(screen).some((row) => row.kind === "space" && row.label === title));

/** Whether the phone's sidebar lists the row directly in its section's block. */
function phoneFiledUnder(screen, title, sectionLabel) {
    let current;
    for (const row of phoneRows(screen)) {
        if (row.kind !== "space") current = row.label;
        else if (row.label === title) return current === sectionLabel;
    }
    return false;
}

/** The clay icon the phone draws for a row, read from its row's image. */
function phoneIcon(screen, title) {
    const index = screen.findIndex((item) => item.id === `stem-row:space:${title}`);
    return index < 0 ? undefined : screen[index + 1]?.id?.match(/clay-([\w-]+)\.png$/u)?.[1];
}

/** A phone accessibility rectangle, in points. */
const boundsRect = (item) => {
    const rectangle = item?.bounds?.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/);
    if (!rectangle) return undefined;
    const [, left, top, right, bottom] = rectangle.map(Number);
    return { x: left, y: top, width: right - left, height: bottom - top };
};

/** Where a desktop element is, for a captioned cut's hint. */
async function rectOf(locator) {
    const box = await locator.boundingBox();
    if (!box) throw new Error("A hinted element is not on screen.");
    return { rect: box };
}

const boundsCenter = (item) => {
    const rectangle = item?.bounds?.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/);
    if (!rectangle) return undefined;
    const [, left, top, right, bottom] = rectangle.map(Number);
    return { x: Math.round((left + right) / 2), y: Math.round((top + bottom) / 2) };
};

/** Whether the sidebar document has the row directly under its section's heading block. */
async function filedUnder(gym, spaceId, sectionId) {
    const { html } = await gym.client.getSpaceSidebar();
    const items = [...html.matchAll(/<happy-(section|separator|space) id="(\w[\w-]*)"/gu)].map(
        (match) => ({ kind: match[1], id: match[2] }),
    );
    let current;
    for (const item of items) {
        if (item.kind !== "space") current = item.id;
        else if (item.id === spaceId) return current === sectionId;
    }
    return false;
}

/**
 * The person's own sidebar, made off camera: their sections above the
 * default Bots and Tasks, and earlier new work Focus filed into them from
 * each first message. Every step uses the daemon's public API; Focus's
 * placement and icons are its real tools driven by the screenplay.
 */
async function sidebarPrepare(gym) {
    for (const [key, value] of [
        [stemCellsSetting, true],
        [defaultModelSetting, astra],
    ])
        await gym.client.saveUserSetting(key, { value, updatedAt: Date.now() });
    const sidebar = await gym.client.getSpaceSidebar();
    const missing = world.sections.filter(
        (section) => !sidebar.html.includes(`<happy-section id="${section.id}"`),
    );
    if (missing.length > 0) {
        const headings = missing
            .map((section) => `  <happy-section id="${section.id}" label="${section.label}"/>\n`)
            .join("");
        const html = sidebar.html.replace(
            /( *)<happy-section id="bots"/u,
            `${headings}$1<happy-section id="bots"`,
        );
        await gym.client.updateSpaceSidebar({
            html,
            baseVersion: sidebar.version,
            mutationId: randomUUID(),
        });
    }
    for (const seed of world.seeds) {
        const existing = (await gym.client.listSpaces()).spaces.find(
            (space) => space.title === seed.title,
        );
        if (existing) continue;
        const { space, agent } = await gym.client.createStemCell({ mutationId: randomUUID() });
        await gym.client.sendMessage(agent.id, {
            text: seed.message,
            mode: { ...world.seedMode, permissionMode: "auto" },
        });
        await wait(
            async () => {
                const row = await spaceRead(gym, space.id);
                return (
                    row?.title === seed.title &&
                    row.icon.type === "library" &&
                    (await filedUnder(gym, space.id, seed.section))
                );
            },
            `Focus to file ${seed.title}`,
            90000,
        );
        process.stdout.write(`    filed     ${seed.title} under ${seed.section}\n`);
    }
    // The person has read their earlier work; only the filmed row is new.
    for (const space of (await gym.client.listSpaces()).spaces)
        if (space.target?.agentId)
            await gym.client
                .markAgentRead(space.target.agentId, { mutationId: randomUUID() })
                .catch(() => undefined);
}

/** Archives earlier takes' filmed rows, so the next New row is the only one. */
async function rehearsalsArchive(gym) {
    const keep = new Set(world.seeds.map((seed) => seed.title));
    for (const space of (await gym.client.listSpaces()).spaces) {
        if (space.target?.kind !== "task" || keep.has(space.title)) continue;
        // Archiving an agent aborts a crashed rehearsal's run; archiving its
        // task takes the row out of the sidebar with it.
        await gym.client.archiveAgent(space.target.agentId).catch(() => undefined);
        const { task } = await gym.client.getTask(space.target.id);
        if (task.archivedAt === null)
            await gym.client.archiveTask(task.id, {
                ifMatch: task.version,
                mutationId: randomUUID(),
            });
    }
}

export default {
    id: "stem",
    title: "New work starts as a stem cell",
    subtitle: "New work starts as a stem cell",
    transitions: "none",
    rawWindow: true,
    inferenceModes: ["screenplay"],
    world,
    protocolOpen: coreProtocolOpen,
    phoneFrame: {
        frame: "../core/assets/device/iphone-16-pro-black.png",
        alpha: "../core/assets/device/screen-alpha.png",
        framing:
            "Apple iPhone 16 Pro Black Titanium frame via Device Mockups; original 1406×2822 geometry",
        width: 1406,
        height: 2822,
        screen: { x: 102, y: 100, width: 1206, height: 2622 },
    },
    patches: [
        { scope: "shared", source: "browser-daemon.patch" },
        { scope: "demo", source: "patches/gym-provider.patch" },
        { scope: "demo", source: "patches/artifact-site.patch" },
    ],
    async run(demo, gym, { phone, output } = {}) {
        releaseCoordinator = await releaseCoordinatorPrepare(gym);
        await rehearsalsArchive(gym);
        await sidebarPrepare(gym);
        const page = demo.page;
        await page.setViewportSize(viewport);
        await page.reload({ waitUntil: "domcontentloaded" });
        const onboarding = page.getByText("Go Happy", { exact: true });
        await page.locator('[data-happy-desktop-ui="sidebar"]').or(onboarding).first().waitFor();
        if (await onboarding.isVisible()) await onboarding.click();
        await page.locator('[data-happy-desktop-ui="sidebar"]').waitFor();
        await page.getByText(world.seeds[0].title, { exact: true }).first().waitFor();
        await page.waitForTimeout(1200);

        // New work, made through the real Create row, off camera.
        await page.getByText("Create", { exact: true }).first().click();
        await page.locator('[data-happy-desktop-ui="composer-textarea"]').first().waitFor();
        const created = await wait(
            async () =>
                (await gym.client.listSpaces()).spaces.find(
                    (space) =>
                        space.icon.type === "stem_cell" &&
                        space.title === null &&
                        space.target?.kind === "task",
                ),
            "the new stem cell",
        );
        recordedSpaceId = created.id;
        recordedAgentId = created.target.agentId;
        const { workspace } = await gym.client.getWorkspace(created.target.workspaceId);
        checkout = await realpath(workspace.compute.path);
        if ((await readdir(checkout)).length > 0)
            throw new Error("The new stem cell's folder is not empty.");
        // Disclosed fixture: repository finding is roadmap, so the stem cell's
        // own empty folder is given a checkout of the fixture repository here.
        shippingFixture = await shippingPrepare(gym, {
            path: world.logicPath,
            before: world.logicBefore,
            after: world.logicAfter,
            checkouts: await realpath(join(checkout, "..")),
        });
        await execFile("git", ["clone", "--quiet", shippingFixture.origin, "."], {
            cwd: checkout,
            env: {
                PATH: "/usr/bin:/bin",
                GIT_CONFIG_NOSYSTEM: "1",
                GIT_CONFIG_GLOBAL: "/dev/null",
            },
        });
        await wait(
            async () =>
                (await gym.client.getWorkspaceGit(workspace.id)).git.facts?.branch === "main",
            "the checkout's Git state",
        );
        // A fresh catalog bootstrap registers the checkout's Git watch.
        await page.reload({ waitUntil: "domcontentloaded" });
        const composer = page.locator('[data-happy-desktop-ui="composer-textarea"]').first();
        await composer.waitFor();
        await page.getByText("New", { exact: true }).first().waitFor();
        await page.waitForTimeout(1500);
        const hidePanel = page.getByRole("button", { name: "Hide panel", exact: true });
        if (await hidePanel.isVisible()) await hidePanel.click();
        const splitter = page.getByRole("separator", { name: "Resize sidebar", exact: true });
        await splitter.focus();
        await page.keyboard.press("Home");
        await page.waitForTimeout(400);
        const sidebarWidth = (await page.locator('[data-happy-desktop-ui="sidebar"]').boundingBox())
            .width;
        if (sidebarWidth !== Number(await splitter.getAttribute("aria-valuemin")))
            throw new Error("The sidebar is not at the product's minimum width.");
        // Set the opening choice through the real control, still off camera.
        await page
            .locator('[data-happy-desktop-ui="composer-model-control-trigger"]')
            .first()
            .click();
        await page
            .locator('[data-happy-desktop-ui="composer-model-control-model-setting"]')
            .first()
            .click();
        await page
            .locator('[data-happy-desktop-ui="composer-model-control-row"]')
            .filter({ hasText: "GPT-6 Astra" })
            .first()
            .click();
        await page.waitForTimeout(400);
        const menu = page.locator('[data-happy-desktop-ui="composer-model-control-menu"]').first();
        if (await menu.isVisible()) await page.keyboard.press("Escape");
        await menu.waitFor({ state: "hidden" });
        await composer.click();
        await page.waitForTimeout(650);
        framing = await demo.framingPrepare(
            page.locator('[data-happy-desktop-ui="conversation-view"]').first(),
            { rawWindow: true },
        );
        framing.sidebarWidth = sidebarWidth;
        await writeFile(join(output, "framing.json"), JSON.stringify(framing, null, 2));
        await mkdir(output, { recursive: true });
        await page.screenshot({ path: join(output, "opening.png") });
        if (phone) {
            // Apple's own recording status bar; a relaunched Simulator forgets it.
            await execFile("xcrun", [
                "simctl",
                "status_bar",
                phone.simulator.udid,
                "override",
                "--time",
                "9:41",
                "--dataNetwork",
                "wifi",
                "--wifiMode",
                "active",
                "--wifiBars",
                "3",
                "--batteryState",
                "charged",
                "--batteryLevel",
                "100",
            ]);
            // The relaunched app must load this take's own New row from the
            // live daemon: proof the direct connection is current.
            await phone.prepare({ relaunch: true, ready: phoneHome("New") });
            // The home composer starts new work on the same Opus, set through
            // its real model menu, off camera.
            const onOpus = (screen) =>
                screen.some((item) => item.text?.startsWith("Model: Opus 5.5"));
            if (!onOpus(await phone.inspect("home-composer"))) {
                await phone.simulator.run("- tapOn:\n    text: 'Model: .*'");
                await page.waitForTimeout(650);
                await phone.simulator.run("- tapOn:\n    text: 'Opus 5.5.*'");
                await page.waitForTimeout(650);
            }
            const opening = await phone.inspect("phone-opening");
            if (!onOpus(opening))
                throw new Error("The phone's new-work composer is not on Opus 5.5.");
            const rows = phoneRows(opening).filter((row) => row.kind === "space");
            if (rows[0]?.label !== "Happy" || rows[1]?.label !== "New")
                throw new Error("The phone must open on the same New row, right under Happy.");
            for (const seed of world.seeds) {
                const section = world.sections.find((entry) => entry.id === seed.section).label;
                if (!phoneFiledUnder(opening, seed.title, section))
                    throw new Error(`The phone does not list ${seed.title} under ${section}.`);
            }
            await phone.screenshot("phone-opening");
            await phone.start();
        }

        // ---- On camera: the opened stem cell, its empty composer.
        await demo.hold(1000);
        const model = page
            .locator('[data-happy-desktop-ui="composer-model-control-trigger"]')
            .first();
        if (!(await model.innerText()).includes("Astra"))
            throw new Error("The new work does not start on the default GPT-6 Astra.");
        await demo.click(model);
        await demo.click(
            page.locator('[data-happy-desktop-ui="composer-model-control-model-setting"]').first(),
        );
        cue("picker-open", demo, phone);
        const choices = page.locator('[data-happy-desktop-ui="composer-model-control-row"]');
        const choice = (name) => choices.filter({ hasText: name }).first();
        const opus = choice("Opus 5.5");
        if ((await choices.filter({ hasText: "GPT-6 Sol" }).count()) > 0)
            throw new Error("GPT-6 Sol must not be offered in the cleaned-up picker.");
        await demo.moveTo(choice("Grok 4.7"), { duration: 600 });
        await demo.hold(350);
        await demo.moveTo(opus, { duration: 650 });
        await demo.hold(600);
        await page.screenshot({ path: join(output, "picker-hover.png") });
        await demo.click(opus, { after: 300 });
        cue("picker-chosen", demo, phone);
        await demo.click(composer, { after: 150 });
        // The pointer hides while typing, as macOS hides it, so it never sits on the words.
        await demo.pointerVisible(false);
        cue("typing-started", demo, phone);
        await demo.type(world.prompt, { perKey: 52, after: 0 });
        // The phone comes forward for the sidebar's live sync.
        if (phone) cue("phone-enter", demo, phone);
        await demo.hold(500);
        await demo.press("Enter", { badge: 0, before: 0, after: 200 });
        cue("work-started", demo, phone);

        // The first message names the row; Focus grows its icon and files it.
        // Each step waits for the paired phone to draw the previous one.
        const sectionLabel = world.sections.find((entry) => entry.id === world.section).label;
        const phoneShows = (phase, read, label) =>
            phone ? until(demo, async () => read(await phone.inspect(phase)), label) : undefined;
        await until(demo, () => world.focusHasReached("name"), "the subject naming request");
        await demo.hold(1000);
        world.focusRelease("name");
        await until(
            demo,
            async () => (await spaceRead(gym, recordedSpaceId))?.title === world.sessionTitle,
            "the stem cell to name itself",
        );
        const row = page
            .locator('[data-happy-desktop-ui="sidebar-item"]')
            .filter({ hasText: world.sessionTitle })
            .first();
        cue("stem-named", demo, phone, await rectOf(row));
        await phoneShows("phone-named", phoneHome(world.sessionTitle), "the phone's renamed row");
        if (phone) cue("phone-named", demo, phone);
        await until(demo, () => world.focusHasReached("icon"), "Focus to read the sidebar");
        await demo.hold(phone ? 700 : 300);
        world.focusRelease("icon");
        await until(
            demo,
            async () => (await spaceRead(gym, recordedSpaceId))?.icon.type === "library",
            "the stem cell's icon",
        );
        cue(
            "stem-icon",
            demo,
            phone,
            await rectOf(
                page
                    .locator(
                        '[data-happy-desktop-ui="make-stuff-intro"] [data-happy-desktop-ui="stem-cell-growth"]',
                    )
                    .first(),
            ),
        );
        await phoneShows(
            "phone-icon",
            (screen) => phoneIcon(screen, world.sessionTitle) === world.icon,
            "the phone's grown icon",
        );
        if (phone) cue("phone-icon", demo, phone);
        world.focusRelease("work");
        // The work starts thinking while Focus files the row.
        const thinking = page
            .getByText("Thinking", { exact: true })
            .first()
            .waitFor()
            .then(() => cue("thinking-visible", demo, phone));
        thinking.catch(() => undefined);
        await until(demo, () => world.focusHasReached("file"), "Focus's queued placement");
        // The mark takes 2.5 s to grow into its icon; it settles before the row moves.
        await demo.hold(2500);
        world.focusRelease("file");
        await until(
            demo,
            () => filedUnder(gym, recordedSpaceId, world.section),
            "Focus to file the row",
        );
        await demo.hold(500);
        cue("stem-filed", demo, phone, await rectOf(row));
        const phoneFiled = await phoneShows(
            "phone-filed",
            (screen) => phoneFiledUnder(screen, world.sessionTitle, sectionLabel) && screen,
            "the phone to file the row",
        );
        if (phone) {
            cue("phone-filed", demo, phone, {
                phoneRect: boundsRect(
                    phoneFiled.find((item) => item.id === `stem-row:space:${world.sessionTitle}`),
                ),
            });
            await phone.screenshot("phone-filed");
            await demo.hold(1800);
            cue("phone-exit", demo, phone);
        }
        Object.assign(filing, await spaceRead(gym, recordedSpaceId));

        await thinking;
        await until(
            demo,
            () => world.hasReached("reading", recordedAgentId),
            "the first file read",
        );
        cue("first-read-visible", demo, phone);
        await demo.hold(1000);
        world.release("reading", recordedAgentId);
        await until(
            demo,
            () => world.hasReached("implementation", recordedAgentId),
            "the second file read",
        );
        await demo.hold(900);
        world.release("implementation", recordedAgentId);
        await until(demo, () => world.hasReached("artifact", recordedAgentId), "the file edit");
        cue("logic-edited", demo, phone);
        await until(
            demo,
            async () => {
                const { git } = await gym.client.getWorkspaceGit(workspace.id);
                if (
                    git.changedFiles > 1 ||
                    (git.files ?? []).some((f) => f.path !== world.logicPath)
                )
                    throw new Error(
                        `Unexpected changes in the checkout: ${JSON.stringify(git.files)}`,
                    );
                return git.changedFiles === 1;
            },
            "the edit to reach the checkout's Git state",
            15000,
        );
        await demo.hold(1600);
        world.release("artifact", recordedAgentId);
        const artifact = page
            .locator('[data-happy-desktop-ui="inline-page"]')
            .filter({ hasText: world.artifactTitle })
            .last();
        await artifact.waitFor({ timeout: 20000 });
        const artifactContent = artifact.locator('[data-happy-desktop-ui="inline-page-content"]');
        await until(
            demo,
            async () => ((await artifactContent.boundingBox())?.height ?? 0) > 60,
            "the waveform artifact to draw inline",
            20000,
        );
        await demo.hold(400);
        cue("artifact-shown", demo, phone, await rectOf(artifactContent));
        await page.screenshot({ path: join(output, "artifact.png") });
        await until(
            demo,
            () => world.hasReached("astra-launch", recordedAgentId),
            "the published artifact",
        );
        await demo.hold(2800);
        world.release("astra-launch", recordedAgentId);
        await until(
            demo,
            () => world.hasReached("finishing", recordedAgentId),
            "Astra’s delegation",
        );
        const spawned = page.getByText(world.astraTask, { exact: true }).first();
        await spawned.waitFor();
        await until(demo, () => settled(spawned), "the complete Astra spawn label");
        cue("astra-spawned", demo, phone, await rectOf(spawned));
        await demo.hold(2800);
        world.release("finishing", recordedAgentId);
        await page.getByText(world.completionText.slice(0, 48)).first().waitFor();
        await until(
            demo,
            async () =>
                (await gym.client.getMessages(recordedAgentId, { limit: 64 })).runs.every(
                    (run) => run.status !== "running",
                ),
            "the completed first turn",
        );
        cue("response-settled", demo, phone);
        await demo.hold(1200);

        let phoneReturned = Promise.resolve();
        if (phone) {
            const home = await phone.inspect("completed-home");
            if (!phoneFiledUnder(home, world.sessionTitle, sectionLabel))
                throw new Error("The phone lost the filed row before Steve opens it.");
            await phone.screenshot("phone-home");
            // Real touches at the controls' inspected bounds; Maestro's
            // tapOn waits for the app to idle, seconds on a live transcript.
            const touch = async (screen, id) => {
                const point = boundsCenter(screen.find((item) => item.id === id));
                if (!point) throw new Error(`The phone has no ${id}.`);
                await phone.simulator.tapPoints([point]);
            };
            cue("phone-enter", demo, phone);
            await demo.hold(1200);
            await touch(home, `stem-row:space:${world.sessionTitle}`);
            cue("phone-session-open", demo, phone);
            const transcript = await until(
                demo,
                async () => {
                    const screen = await phone.inspect("phone-session");
                    return screen.some((item) => item.text === world.completionText) && screen;
                },
                "the phone's session to show the completed reply",
                10000,
            );
            await demo.hold(2000);
            await touch(transcript, "stem-composer");
            const keyboard = await until(
                demo,
                async () => {
                    const screen = await phone.inspect("native-keyboard-visible");
                    return (
                        screen.some((item) => item.id === "UIKeyboardLayoutStar Preview") && screen
                    );
                },
                "the native keyboard",
                10000,
            );
            const keyboardStart = keyboard.findIndex(
                (item) => item.id === "UIKeyboardLayoutStar Preview",
            );
            if (keyboardStart < 0) throw new Error("The actual iPhone keyboard is missing.");
            const keys = keyboard.slice(keyboardStart);
            cue("phone-typing", demo, phone);
            // Tap the actual native keys, resolved from iOS accessibility.
            const characters = [
                ...(keys.some((item) => item.text === "S") ? ["shift"] : []),
                ...stevePhoneMessage,
            ];
            const points = characters.map((character) => {
                const point = boundsCenter(
                    keys.find((item) =>
                        character === "shift"
                            ? item.id === "shift"
                            : character === " "
                              ? item.id === "space"
                              : item.text?.toLowerCase() === character,
                    ),
                );
                if (!point) throw new Error(`Native keyboard key is missing: ${character}`);
                return point;
            });
            const taps = await phone.simulator.tapPoints(points);
            await writeFile(join(output, "native-key-taps.json"), JSON.stringify(taps, null, 2));
            const typed = await phone.inspect("native-ship-it-typed");
            if (
                !typed.some(
                    (item) => item.id === "stem-composer" && item.value === stevePhoneMessage,
                )
            )
                throw new Error("The native keyboard did not type the exact requested message.");
            const send = boundsCenter(typed.find((item) => item.text === "Send"));
            if (!send) throw new Error("The actual native Send control is missing.");
            await phone.simulator.tapPoints([send]);
            cue("phone-sent", demo, phone);
            // Steve sees the reply start on the phone before putting it away.
            await until(
                demo,
                async () =>
                    (await phone.inspect("phone-reply")).some((item) =>
                        item.text?.includes("Pushing to main"),
                    ),
                "the phone to show the reply to ship it",
                15000,
            );
            cue("phone-reply", demo, phone);
            await demo.hold(1400);
            // Steve returns to the sidebar while the desktop carries on.
            await touch(typed, "stem-chat-back");
            cue("phone-exit", demo, phone);
            phoneReturned = phone.prepare({ ready: phoneHome(world.sessionTitle) });
            phoneReturned.catch(() => undefined);
        } else {
            await gym.client.sendMessage(recordedAgentId, {
                text: stevePhoneMessage,
                // The session's own model and effort, so no mode change is announced.
                mode: { ...world.opusMode, permissionMode: "auto" },
            });
        }
        await page.getByText(steve.name, { exact: true }).first().waitFor({ timeout: 15000 });
        cue("steve-message-visible", demo, phone);
        const steveMessage = (await gym.client.getMessages(recordedAgentId, { limit: 64 })).runs
            .flatMap((run) => run.messages)
            .findLast((message) => message.role === "user");
        if (steveMessage?.mode?.permissionMode !== "auto")
            throw new Error("Steve's message must stay in Auto.");
        const greeting = page.getByText(world.shipGreeting.slice(0, 32)).first();
        await greeting.waitFor({ timeout: 20000 });
        await until(demo, () => settled(greeting), "the greeting to finish arriving");
        cue("greeting", demo, phone);
        const shell = page
            .locator('[data-happy-desktop-ui="agent-activity-call"][data-status="running"]')
            .filter({ hasText: "Bash" })
            .last();
        await shell.waitFor({ timeout: 20000 });
        cue("ship-running", demo, phone);
        await until(demo, () => world.hasReached("astra-running"), "Astra's review");
        world.release("astra-running");
        await until(
            demo,
            async () => {
                const { subagents } = await gym.client.getAgentActivity(recordedAgentId);
                return (
                    subagents.length > 0 &&
                    subagents.every(
                        (child) =>
                            child.status === "idle" &&
                            child.subagents.running === 0 &&
                            child.processes.running === 0,
                    )
                );
            },
            "Astra's completed review",
        );
        cue("astra-completed", demo, phone);
        await until(
            demo,
            async () => (await gym.client.getWorkspaceGit(workspace.id)).git.changedFiles === 0,
            "the staged fixture checkout to read clean",
            60000,
        );
        cue("changes-cleared", demo, phone);
        await until(
            demo,
            () => world.hasReached("review-finished", recordedAgentId),
            "the completed shipping command",
        );
        world.release("review-finished", recordedAgentId);
        const deployed = page.getByText(world.shipResult.slice(0, 24)).first();
        await deployed.waitFor({ timeout: 60000 });
        await until(demo, () => settled(deployed), "the deploy result to finish arriving");
        cue("deployed", demo, phone);
        demo.confetti({ duration: 3200 });
        await until(
            demo,
            async () =>
                (await gym.client.getMessages(recordedAgentId, { limit: 64 })).runs.every(
                    (run) => run.status !== "running",
                ),
            "the completed shipping turn",
        );
        await until(
            demo,
            async () => !(await page.getByText("Working in subagents", { exact: true }).count()),
            "the completed collaborator status to reach the UI",
        );
        await demo.hold(1400);
        cue("outro", demo, phone);
        await demo.hold(3600);
        cue("end", demo, phone);
        await phoneReturned;
        await demo.finish();
        shippingEvidence = await shippingVerify(gym, workspace.id, {
            origin: shippingFixture.origin,
            baseline: shippingFixture.baseline,
            path: world.logicPath,
            before: world.logicBefore,
        });
        await writeFile(
            join(output, "shipping-verified.json"),
            JSON.stringify(shippingEvidence, null, 2),
        );
        await writeFile(join(output, "cues.json"), JSON.stringify(cues, null, 2));
    },
    async evidence(page, gym) {
        return {
            fixture: {
                inference: "screenplay",
                stemCell:
                    "Real Create row, real stem cell and task. Its subject title is the daemon's own subject naming, answered by the screenplay. Focus (Prioritizing in this release) runs its real list_sidebar, set_space_icon and edit_sidebar tools; the screenplay chooses the icon and section.",
                checkout:
                    "Repository finding is roadmap. Off camera, the stem cell's own empty task folder received a Git clone of the fixture happy repository.",
                sidebar:
                    "Sections were made off camera as the person's own sidebar edit. Earlier rows are stem cells made through the API and filed by Focus the same way.",
                picker: "The gym enables today's models through per-provider include_models; GPT-6 Sol is not included.",
                collaborator:
                    "Fictional Steve, one explicit protocol-fixture identity attached to the real ship-it message",
                phone: "The native Happy iOS app in an iPhone 17 Pro Simulator, paired off camera to this demo daemon through its real direct mobile connector. Its sidebar updates arrive by live sync; each opening step waits until the phone has drawn the previous one. Steve types ship it on the real iOS keyboard. Its new-work composer was set to Opus 5.5 off camera.",
                spawn: "Real create_agent; Astra's review completes during shipping, before Deployed.",
                artifact:
                    "Real create_artifact and write_artifact_file through the daemon; the screenplay writes the page. Browser-local mode has no artifact page host, so the demo patch artifact-site.patch serves the daemon's own artifact files and renders them in an iframe, where Electron uses its own view.",
                shipping:
                    "Auto throughout. The Bash process executes offline Git and gh screenplay fixtures. The simulated push restores only the prepared waveform file to its baseline. No real commit, push, deployment, or permission-review verdict.",
                shipCommand,
            },
            framing,
            filing,
            checkout,
            releaseCoordinator: { id: releaseCoordinator.id, name: releaseCoordinatorName },
            viewport,
            cues,
            shipping: shippingEvidence,
            sidebar: await gym.client.getSpaceSidebar(),
            spaces: (await gym.client.listSpaces()).spaces,
            health: await gym.client.getHealth(),
            agentId: recordedAgentId,
            history: await gym.client.getMessages(recordedAgentId, { limit: 64 }),
            activity: await gym.client.getAgentActivity(recordedAgentId),
            finalVisibleText: await page.locator("body").innerText(),
        };
    },
};
