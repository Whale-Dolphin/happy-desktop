import * as world from "./world.mjs";
import { releaseCoordinatorName, releaseCoordinatorPrepare } from "../core/bots.mjs";
import { shipCommand, shippingPrepare, shippingVerify } from "../core/shipping.mjs";
import { execFile as exec } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readdir, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(exec);

/** The whole app, delivered as one static window: a narrow sidebar beside the main pane. */
const viewport = { width: 880, height: 600 };
const stemCellsSetting = "happy-desktop.experiments.stemCells";
const defaultModelSetting = "happy-desktop.model.default";
const astra = { providerId: "codex", modelId: "openai/gpt-6-astra" };

let recordedAgentId;
let recordedSpaceId;
let recordedTaskId;
/** Steve's own client into the team daemon: everything he does goes through it. */
let steve;
const loopInEvidence = {};
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

const spaceRead = async (client, id) =>
    (await client.listSpaces()).spaces.find((space) => space.id === id);

/** The native iOS sidebar's own row identities, top to bottom. */
const phoneRows = (screen) =>
    screen
        .filter((item) => item.id?.startsWith("stem-row:"))
        .map((item) => {
            const [, kind, label] = item.id.split(":");
            return { kind, label, top: Number(item.bounds?.match(/^\[\d+,(\d+)\]/)?.[1]) };
        });

/** Whether the phone's sidebar lists the row directly in its section's block. */
function phoneFiledUnder(screen, title, sectionLabel) {
    let current;
    for (const row of phoneRows(screen)) {
        if (row.kind !== "space") current = row.label;
        else if (row.label === title) return current === sectionLabel;
    }
    return false;
}

/** The paired phone is Steve's: his own filed work, none of the owner's rows. */
function phoneSteveHome(screen) {
    const labels = new Set(phoneRows(screen).map((row) => row.label));
    return (
        world.steveSeeds.every((seed) => {
            const section = world.steveSections.find((entry) => entry.id === seed.section).label;
            return phoneFiledUnder(screen, seed.title, section);
        }) &&
        !world.seeds.some((seed) => labels.has(seed.title)) &&
        !labels.has(world.sessionTitle)
    );
}

/** A phone accessibility rectangle, in points. */
const boundsRect = (item) => {
    const rectangle = item?.bounds?.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/);
    if (!rectangle) return undefined;
    const [, left, top, right, bottom] = rectangle.map(Number);
    return { x: left, y: top, width: right - left, height: bottom - top };
};

/**
 * A hint drawn inside the app itself, so it renders at the window's own
 * resolution and follows its target as the layout moves: a ring around the
 * element and, with `text`, a label whose notch points at it. It fades in
 * after `delay` and out after `seconds`, on the page's clock, while the take
 * carries on.
 */
async function highlight(locator, { text, side = "right", delay = 0, seconds }) {
    const target = await locator.elementHandle();
    await target.evaluate(highlightDraw, { text, side, delay, seconds, accent: "#e07aae" });
}

/** Runs in the page: builds the hint's layer and keeps it on its target every frame. */
function highlightDraw(element, { text, side, delay, seconds, accent }) {
    const fade = 300;
    const pad = 4;
    const gap = 8;
    const margin = 6;
    const layer = document.createElement("div");
    layer.setAttribute("aria-hidden", "true");
    layer.style.cssText = `position:fixed;inset:0;pointer-events:none;z-index:2147483000;opacity:0;transition:opacity ${fade}ms linear`;
    const ring = document.createElement("div");
    ring.style.cssText = `position:absolute;box-sizing:border-box;border:2px solid ${accent};border-radius:10px;box-shadow:0 0 9px 1px ${accent}a6,inset 0 0 5px ${accent}59`;
    layer.append(ring);
    let pill;
    let notch;
    if (text) {
        pill = document.createElement("div");
        pill.textContent = text;
        pill.style.cssText = `position:absolute;white-space:nowrap;padding:7px 11px 8px;border-radius:9px;background:rgba(22,22,24,0.96);color:#fff;font:650 15px/20px ${getComputedStyle(document.body).fontFamily};-webkit-font-smoothing:antialiased;box-shadow:0 0 0 1px rgba(255,255,255,0.16),0 8px 22px rgba(0,0,0,0.45)`;
        notch = document.createElement("div");
        // Its two lit edges face out, continuing the label's outline.
        const turn = { right: 135, below: -135, left: -45, above: 45 }[side];
        notch.style.cssText = `position:absolute;width:10px;height:10px;background:rgba(22,22,24,0.96);box-shadow:1px 1px 0 0 rgba(255,255,255,0.16);transform:${side === "right" || side === "left" ? "translateY(-50%)" : "translateX(-50%)"} rotate(${turn}deg)`;
        pill.append(notch);
        layer.append(pill);
    }
    document.body.append(layer);
    let rect;
    let frame;
    const place = () => {
        if (element.isConnected) rect = element.getBoundingClientRect();
        ring.style.left = `${rect.left - pad}px`;
        ring.style.top = `${rect.top - pad}px`;
        ring.style.width = `${rect.width + pad * 2}px`;
        ring.style.height = `${rect.height + pad * 2}px`;
        if (pill) {
            const width = pill.offsetWidth;
            const height = pill.offsetHeight;
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            let left =
                side === "right"
                    ? rect.right + pad + gap
                    : side === "left"
                      ? rect.left - pad - gap - width
                      : centerX - width / 2;
            let top =
                side === "below"
                    ? rect.bottom + pad + gap
                    : side === "above"
                      ? rect.top - pad - gap - height
                      : centerY - height / 2;
            left = Math.max(margin, Math.min(innerWidth - width - margin, left));
            top = Math.max(margin, Math.min(innerHeight - height - margin, top));
            pill.style.left = `${Math.round(left)}px`;
            pill.style.top = `${Math.round(top)}px`;
            // The notch points at the target's centre wherever the label landed.
            if (side === "right" || side === "left") {
                notch.style.top = `${Math.max(12, Math.min(height - 12, centerY - top))}px`;
                notch.style[side === "right" ? "left" : "right"] = "-5px";
            } else {
                notch.style.left = `${Math.max(14, Math.min(width - 14, centerX - left))}px`;
                notch.style[side === "below" ? "top" : "bottom"] = "-5px";
            }
        }
        frame = requestAnimationFrame(place);
    };
    place();
    setTimeout(() => {
        layer.style.opacity = "1";
    }, delay * 1000);
    setTimeout(
        () => {
            layer.style.opacity = "0";
        },
        (delay + seconds) * 1000 - fade,
    );
    setTimeout(
        () => {
            cancelAnimationFrame(frame);
            layer.remove();
        },
        (delay + seconds) * 1000 + 50,
    );
}

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
async function filedUnder(client, spaceId, sectionId) {
    const { html } = await client.getSpaceSidebar();
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
 * A member's own sidebar, made off camera: their sections above the default
 * Bots and Tasks, and earlier new work Focus filed into them from each first
 * message. Every step uses the daemon's public API as that member; Focus's
 * placement and icons are its real tools driven by the screenplay.
 */
async function sidebarPrepare(client, { sections, seeds, settings, botsFirst = false }) {
    for (const [key, value] of settings)
        await client.saveUserSetting(key, { value, updatedAt: Date.now() });
    const sidebar = await client.getSpaceSidebar();
    let lines = sidebar.html.split("\n");
    // An empty section is only a heading; this member's sidebar has none.
    lines = lines.filter((line) => !line.includes('<happy-section id="tasks"'));
    if (botsFirst) {
        // Bots sit right under Happy, above the person's own sections.
        const start = lines.findIndex((line) => line.includes('<happy-section id="bots"'));
        let end = start + 1;
        while (end < lines.length && lines[end].includes("<happy-space ")) end += 1;
        const bots = lines.splice(start, end - start);
        const divider = lines.findIndex((line) => line.includes("<happy-separator"));
        lines.splice(divider + 1, 0, ...bots);
    }
    const missing = sections
        .filter((section) => !sidebar.html.includes(`<happy-section id="${section.id}"`))
        .map((section) => `  <happy-section id="${section.id}" label="${section.label}"/>`);
    const before = botsFirst
        ? lines.findIndex((line) => line.trim() === "</nav>")
        : lines.findIndex((line) => line.includes('<happy-section id="bots"'));
    lines.splice(before, 0, ...missing);
    const html = lines.join("\n");
    if (html !== sidebar.html)
        await client.updateSpaceSidebar({
            html,
            baseVersion: sidebar.version,
            mutationId: randomUUID(),
        });
    for (const seed of seeds) {
        const existing = (await client.listSpaces()).spaces.find(
            (space) => space.title === seed.title,
        );
        if (existing) continue;
        const { space, agent } = await client.createStemCell({ mutationId: randomUUID() });
        await client.sendMessage(agent.id, {
            text: seed.message,
            mode: { ...world.seedMode, permissionMode: "auto" },
        });
        await wait(
            async () => {
                const row = await spaceRead(client, space.id);
                return (
                    row?.title === seed.title &&
                    row.icon.type === "library" &&
                    (await filedUnder(client, space.id, seed.section))
                );
            },
            `Focus to file ${seed.title}`,
            90000,
        );
        process.stdout.write(`    filed     ${seed.title} under ${seed.section}\n`);
    }
    // The member has read their earlier work; only the filmed row is new.
    for (const space of (await client.listSpaces()).spaces)
        if (space.target?.agentId)
            await client
                .markAgentRead(space.target.agentId, { mutationId: randomUUID() })
                .catch(() => undefined);
}

/**
 * A real touch at a control's inspected bounds; Maestro's tapOn waits for the
 * app to idle, seconds on a live transcript.
 */
async function touch(phone, screen, id) {
    const point = boundsCenter(screen.find((item) => item.id === id));
    if (!point) throw new Error(`The phone has no ${id}.`);
    await phone.simulator.tapPoints([point]);
}

const keyboardStartId = "UIKeyboardLayoutStar Preview";

/** The keys of the keyboard on screen now, from iOS accessibility. */
function keyboardKeys(screen) {
    const start = screen.findIndex((item) => item.id === keyboardStartId);
    return start < 0 ? undefined : screen.slice(start);
}

/** The key that types `character` on this layout, if it has one. */
function keyFor(keys, character) {
    return keys.find((item) =>
        character === " "
            ? item.id === "space"
            : /\p{L}/u.test(character)
              ? item.text?.toLowerCase() === character.toLowerCase()
              : item.text === character || item.id === character,
    );
}

/** The layout switch: "more" to numbers and punctuation, back to letters. */
const layoutKey = (keys) => keys.find((item) => item.id === "more" || item.text === "more");

/**
 * Types `message` on the real native keyboard and taps Send. Letters go in
 * runs; punctuation switches layout, so the keyboard is re-read around it.
 * iOS capitalizes the first letter itself; the result must read exactly.
 */
async function phoneTypeAndSend(demo, phone, screen, message, phase) {
    await touch(phone, screen, "stem-composer");
    let keys = keyboardKeys(
        await until(
            demo,
            async () => {
                const next = await phone.inspect(`${phase}-keyboard`);
                return keyboardKeys(next) && next;
            },
            "the native keyboard",
            10000,
        ),
    );
    cue(`phone-typing-${phase}`, demo, phone);
    // Each touch plays the keyboard's own tick as it goes out, as fast as
    // the native driver performs touches.
    const taps = (points, sounds) =>
        phone.simulator.tapPoints(points, (index) => demo.sound(sounds[index]));
    let index = 0;
    const capitalized = keys.some((item) => item.text === "Q");
    if (capitalized !== /\p{Lu}/u.test(message[0])) {
        const shift = keys.find((item) => item.id === "shift");
        if (!shift) throw new Error("The native keyboard has no shift key.");
        await taps([boundsCenter(shift)], ["phone-modifier"]);
    }
    while (index < message.length) {
        const run = [];
        while (index < message.length && keyFor(keys, message[index])) {
            const character = message[index++];
            run.push({
                point: boundsCenter(keyFor(keys, character)),
                sound: character === " " ? "phone-modifier" : "phone-key",
            });
        }
        if (run.length > 0)
            await taps(
                run.map((entry) => entry.point),
                run.map((entry) => entry.sound),
            );
        if (index >= message.length) break;
        // The next character is on the other layout, or the layout just
        // changed under us after punctuation.
        keys = keyboardKeys(await phone.inspect(`${phase}-layout`));
        if (keyFor(keys, message[index])) continue;
        const toggle = layoutKey(keys);
        if (!toggle) throw new Error(`Native keyboard key is missing: ${message[index]}`);
        await taps([boundsCenter(toggle)], ["phone-modifier"]);
        keys = keyboardKeys(await phone.inspect(`${phase}-layout`));
        if (!keyFor(keys, message[index]))
            throw new Error(`Native keyboard key is missing: ${message[index]}`);
    }
    const typed = await phone.inspect(`${phase}-typed`);
    const composer = typed.find((item) => item.id === "stem-composer");
    if (composer?.value !== message)
        throw new Error(`The native keyboard typed "${composer?.value}", not "${message}".`);
    const send = boundsCenter(typed.find((item) => item.text === "Send"));
    if (!send) throw new Error("The actual native Send control is missing.");
    await taps([send], ["phone-modifier"]);
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
        // The window reserves macOS's traffic-light lane, as the packaged app does.
        { scope: "demo", source: "patches/window-controls.patch" },
    ],
    async run(demo, gym, { phone, output } = {}) {
        releaseCoordinator = await releaseCoordinatorPrepare(gym);
        await rehearsalsArchive(gym);
        await sidebarPrepare(gym.client, {
            botsFirst: true,
            sections: world.sections,
            seeds: world.seeds,
            settings: [
                [stemCellsSetting, true],
                [defaultModelSetting, astra],
            ],
        });
        steve = await gym.memberClient(world.steveKey);
        const steveProfile = (await steve.getProfile()).profile;
        world.steveUserIdSet(steveProfile.userId);
        await sidebarPrepare(steve, {
            sections: world.steveSections,
            seeds: world.steveSeeds,
            settings: [
                [stemCellsSetting, true],
                [defaultModelSetting, astra],
            ],
        });
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
        recordedTaskId = created.target.id;
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
            // The phone is paired as Steve. The relaunched app must load his
            // own sidebar from the live daemon: proof the connection is his.
            await phone.prepare({ relaunch: true, ready: phoneSteveHome });
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
        // Straight on to the composer, so the ripple never reads as a click on
        // the chip under the closed menu.
        await demo.click(opus, { after: 0 });
        cue("picker-chosen", demo, phone);
        await demo.click(composer, { after: 150 });
        // The pointer hides while typing, as macOS hides it, so it never sits on the words.
        await demo.pointerVisible(false);
        cue("typing-started", demo, phone);
        await demo.type(world.prompt, { perKey: 52, after: 0 });
        await demo.hold(500);
        await demo.press("Enter", { badge: 0, before: 0, after: 200 });
        cue("work-started", demo, phone);

        // The first message names the row; Focus grows its icon and files it.
        await until(demo, () => world.focusHasReached("name"), "the subject naming request");
        await demo.hold(1000);
        world.focusRelease("name");
        await until(
            demo,
            async () =>
                (await spaceRead(gym.client, recordedSpaceId))?.title === world.sessionTitle,
            "the stem cell to name itself",
        );
        const row = page
            .locator('[data-happy-desktop-ui="sidebar-item"]')
            .filter({ hasText: world.sessionTitle })
            .first();
        cue("stem-named", demo, phone, await rectOf(row));
        await highlight(row, { text: "Named from your message", seconds: 2 });
        await until(demo, () => world.focusHasReached("icon"), "Focus to read the sidebar");
        await demo.hold(700);
        world.focusRelease("icon");
        await until(
            demo,
            async () => (await spaceRead(gym.client, recordedSpaceId))?.icon.type === "library",
            "the stem cell's icon",
        );
        const growth = page
            .locator(
                '[data-happy-desktop-ui="make-stuff-intro"] [data-happy-desktop-ui="stem-cell-growth"]',
            )
            .first();
        cue("stem-icon", demo, phone, await rectOf(growth));
        // After the 2.5 s growth into the icon.
        await highlight(growth, { text: "Picked its own icon", delay: 2.4, seconds: 1.2 });
        // The mark takes 2.5 s to grow into its icon, and its hint reads after
        // that; nothing in the pane moves until both are done.
        await demo.hold(3700);
        world.focusRelease("work");
        // The work starts thinking while Focus files the row.
        const thinking = page
            .getByText("Thinking", { exact: true })
            .first()
            .waitFor()
            .then(() => cue("thinking-visible", demo, phone));
        thinking.catch(() => undefined);
        await until(demo, () => world.focusHasReached("file"), "Focus's queued placement");
        await demo.hold(400);
        world.focusRelease("file");
        await until(
            demo,
            () => filedUnder(gym.client, recordedSpaceId, world.section),
            "Focus to file the row",
        );
        await demo.hold(500);
        cue("stem-filed", demo, phone, await rectOf(row));
        await highlight(row, { text: "Filed under Voice", side: "below", seconds: 2.2 });
        // Steve is not part of this work yet: his phone has no row for it.
        if (phone && !phoneSteveHome(await phone.inspect("phone-before-loop-in")))
            throw new Error("Steve's phone shows the work before he is looped in.");
        Object.assign(filing, await spaceRead(gym.client, recordedSpaceId));

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
        // Rings only: a label would cover the chat, and the caption says it.
        await highlight(artifactContent, { seconds: 2 });
        await page.screenshot({ path: join(output, "artifact.png") });

        // ---- The agent finds who follows voice work and loops them in.
        await until(
            demo,
            () => world.hasReached("teammates", recordedAgentId),
            "the published artifact",
        );
        // The preview's ring is gone before the next row moves it.
        await demo.hold(2400);
        world.release("teammates", recordedAgentId);
        await until(
            demo,
            () => world.hasReached("notify", recordedAgentId),
            "the teammate directory read",
        );
        await demo.hold(700);
        world.release("notify", recordedAgentId);
        await until(
            demo,
            () => world.hasReached("loop-in", recordedAgentId),
            "the teammate notice",
        );
        world.release("loop-in", recordedAgentId);
        const loopIn = page.getByText(world.loopInLead.slice(0, 32)).last();
        await loopIn.waitFor({ timeout: 20000 });
        await until(
            demo,
            async () => (await loopIn.innerText()).includes(`@${world.steveName}`),
            "the mention to read as Steve's name",
        );
        await until(demo, () => settled(loopIn), "the loop-in reply to finish arriving");
        cue("looped-in", demo, phone, await rectOf(loopIn));
        await highlight(loopIn, { seconds: 2.4 });
        await page.screenshot({ path: join(output, "looped-in.png") });
        // Steve's own Focus was told; it adds the work to his sidebar.
        await until(demo, () => world.focusHasReached("join"), "Steve's Focus to be told");
        await demo.hold(900);
        world.focusRelease("join");
        await until(
            demo,
            async () =>
                (await steve.getTask(recordedTaskId).catch(() => undefined))?.membership?.unread
                    ?.reason === "looped_in",
            "Steve to be looped in",
        );
        cue("steve-joined", demo, phone);
        Object.assign(loopInEvidence, {
            membership: (await steve.getTask(recordedTaskId)).membership,
            teammate: (await steve.getProfile()).profile,
        });

        let steveSent;
        if (phone) {
            const highlighted = (screen) =>
                screen.find(
                    (item) =>
                        item.id === `stem-row:space:${world.sessionTitle}` &&
                        item.value?.startsWith("new"),
                );
            const home = await until(
                demo,
                async () => {
                    const screen = await phone.inspect("phone-looped-in");
                    return highlighted(screen) && screen;
                },
                "Steve's phone to show the new row",
                15000,
            );
            await phone.screenshot("phone-looped-in");
            cue("phone-enter", demo, phone);
            await demo.hold(900);
            cue("phone-row", demo, phone, { phoneRect: boundsRect(highlighted(home)) });
            await demo.hold(2200);
            await touch(phone, home, `stem-row:space:${world.sessionTitle}`);
            cue("phone-session-open", demo, phone);
            const transcript = await until(
                demo,
                async () => {
                    const screen = await phone.inspect("phone-session");
                    return (
                        screen.some(
                            (item) =>
                                item.id === "stem-message" &&
                                item.text?.includes(`@${world.steveName}`),
                        ) &&
                        // The preview draws inline on the phone too.
                        screen.some(
                            (item) => item.id === "stem-artifact-inline" && item.value === "loaded",
                        ) &&
                        screen
                    );
                },
                "Steve's phone to show the mention and the live preview",
                10000,
            );
            await demo.hold(1800);
            await phoneTypeAndSend(demo, phone, transcript, world.steveFeedback, "feedback");
            cue("phone-sent", demo, phone);
        } else {
            await steve.sendMessage(recordedAgentId, {
                text: world.steveFeedback,
                mode: { ...world.opusMode, permissionMode: "auto" },
            });
        }
        steveSent = page.getByText(world.steveFeedback, { exact: true }).last();
        await steveSent.waitFor({ timeout: 15000 });
        cue("steve-feedback-visible", demo, phone);
        const feedback = (await gym.client.getMessages(recordedAgentId, { limit: 64 })).runs
            .flatMap((run) => run.messages)
            .findLast((message) => message.role === "user");
        if (feedback?.metadata?.userId !== loopInEvidence.teammate.userId)
            throw new Error("Steve's feedback must arrive as Steve.");

        // ---- The agent narrows the waveform, ships, and tells Steve.
        await until(demo, () => world.hasReached("narrow", recordedAgentId), "the feedback run");
        await demo.hold(700);
        world.release("narrow", recordedAgentId);
        await until(demo, () => world.hasReached("ship", recordedAgentId), "the narrowed preview");
        const narrowedContent = page
            .locator('[data-happy-desktop-ui="inline-page"]')
            .filter({ hasText: world.narrowedTitle })
            .last()
            .locator('[data-happy-desktop-ui="inline-page-content"]');
        await until(
            demo,
            async () => ((await narrowedContent.boundingBox())?.height ?? 0) > 60,
            "the narrowed waveform to draw inline",
            20000,
        );
        await demo.hold(400);
        cue("narrowed", demo, phone, await rectOf(narrowedContent));
        await demo.hold(1800);
        world.release("ship", recordedAgentId);
        const shell = page
            .locator('[data-happy-desktop-ui="agent-activity-call"]')
            .filter({ hasText: "Bash" })
            .last();
        await shell.waitFor({ timeout: 20000 });
        cue("ship-running", demo, phone);
        await until(
            demo,
            async () => (await gym.client.getWorkspaceGit(workspace.id)).git.changedFiles === 0,
            "the staged fixture checkout to read clean",
            60000,
        );
        cue("changes-cleared", demo, phone);
        await until(
            demo,
            () => world.hasReached("shipped", recordedAgentId),
            "the completed shipping command",
        );
        world.release("shipped", recordedAgentId);
        const shipped = page.getByText(world.shippedLead.slice(0, 24)).last();
        await shipped.waitFor({ timeout: 60000 });
        await until(demo, () => settled(shipped), "the shipped reply to finish arriving");
        cue("deployed", demo, phone);

        if (phone) {
            const session = await until(
                demo,
                async () => {
                    const screen = await phone.inspect("phone-shipped");
                    return (
                        screen.some(
                            (item) =>
                                item.id === "stem-message" &&
                                item.text?.includes(world.shippedLead.slice(0, 24)),
                        ) && screen
                    );
                },
                "Steve's phone to show the shipped reply",
                15000,
            );
            await demo.hold(1200);
            // Simulator screenshots on each side of his reply: evidence the phone
            // kept drawing, apart from what the screen recording captured.
            await phone.screenshot("check-shipped");
            await phoneTypeAndSend(demo, phone, session, world.steveThanks, "thanks");
            await phone.screenshot("check-thanks-sent");
            cue("phone-thanks", demo, phone);
            await demo.hold(1400);
            cue("phone-exit", demo, phone);
            // Out of frame, Steve goes back to his sidebar.
            await demo.hold(1000);
            await touch(phone, await phone.inspect("phone-away"), "stem-chat-back");
        } else {
            await steve.sendMessage(recordedAgentId, {
                text: world.steveThanks,
                mode: { ...world.opusMode, permissionMode: "auto" },
            });
        }
        await page.getByText(world.steveThanks, { exact: true }).last().waitFor({ timeout: 15000 });
        cue("steve-thanks-visible", demo, phone);

        // ---- The owner's Focus hears Steve sign off and archives the shipped work.
        await until(
            demo,
            async () =>
                (await gym.client.getMessages(recordedAgentId, { limit: 64 })).runs.every(
                    (run) => run.status !== "running",
                ),
            "the agent's thanks",
        );
        // The shipped checkout, read before archiving takes its workspace away.
        shippingEvidence = await shippingVerify(gym, workspace.id, {
            origin: shippingFixture.origin,
            baseline: shippingFixture.baseline,
            path: world.logicPath,
            before: world.logicBefore,
        });
        loopInEvidence.history = await gym.client.getMessages(recordedAgentId, { limit: 64 });
        await until(demo, () => world.focusHasReached("archive"), "Focus to read Steve's reply");
        // The person moves on to their next voice work; the shipped row is
        // still in the sidebar beside it.
        const next = page
            .locator('[data-happy-desktop-ui="sidebar-item"]')
            .filter({ hasText: world.seeds[1].title })
            .first();
        await demo.pointerVisible(true);
        await demo.click(next, { after: 300 });
        await page.getByText(world.seeds[1].reply.slice(0, 40)).first().waitFor();
        // The pointer leaves the sidebar, so only the opened row is highlighted.
        await demo.moveTo({ x: framing.sidebarWidth + 220, y: viewport.height * 0.6 });
        await demo.pointerVisible(false);
        cue("moved-on", demo, phone);
        const rowPlace = await rectOf(row);
        await demo.hold(1000);
        cue("archiving", demo, phone, rowPlace);
        await highlight(row, { text: "Shipped, so Focus archives it", seconds: 1.5 });
        // The hint is read and gone before the row leaves.
        await demo.hold(1700);
        world.focusRelease("archive");
        await until(
            demo,
            async () => (await gym.client.getTask(recordedTaskId)).task.archivedAt !== null,
            "Focus to archive the shipped task",
        );
        await until(
            demo,
            async () => (await row.count()) === 0,
            "the archived row to leave the sidebar",
            15000,
        );
        cue("archived", demo, phone, rowPlace);
        await page.screenshot({ path: join(output, "archived.png") });
        await demo.hold(2400);
        cue("outro", demo, phone);
        await demo.hold(3600);
        cue("end", demo, phone);
        await demo.finish();
        await writeFile(
            join(output, "shipping-verified.json"),
            JSON.stringify(shippingEvidence, null, 2),
        );
        await writeFile(join(output, "cues.json"), JSON.stringify(cues, null, 2));
        // The take's sounds by frame, for a composition that re-times a stretch.
        await writeFile(join(output, "sounds.json"), JSON.stringify(demo.sounds));
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
                team: "A team daemon (feature.team) with two seeded members, Alex (the owner, at the desktop) and Steve (Designer, follows every voice feature). The gym signs each member's HS256 token and gives each a socket that speaks to the daemon as them.",
                collaborator:
                    "Fictional Steve is a real second member. The agent's real list_teammates and notify_teammate tools loop him in; his own Focus answers with its real join_task; his membership carries the looped_in unread mark. His messages are authored by his own token.",
                steveSidebar:
                    "Steve's Design section and two rows were made off camera through his own client, filed by his Focus the same way.",
                phone: "The native Happy iOS app in an iPhone 17 Pro Simulator, paired off camera as Steve to this team daemon through its real direct mobile connector. It shows the looped-in row by live sync; Steve opens it and types both replies on the real iOS keyboard.",
                archive:
                    "The owner's Focus hears Steve's reply in the owner's work and calls its real archive_shipped_task; the screenplay chooses to.",
                artifact:
                    "Real create_artifact and write_artifact_file through the daemon; the screenplay writes the page. Browser-local mode has no artifact page host, so the demo patch artifact-site.patch serves the daemon's own artifact files and renders them in an iframe, where Electron uses its own view.",
                shipping:
                    "Auto throughout. The Bash process executes offline Git and gh screenplay fixtures. The simulated push restores only the prepared waveform file to its baseline. No real commit, push, deployment, or permission-review verdict.",
                shipCommand,
            },
            framing,
            filing,
            loopIn: loopInEvidence,
            steveSpaces: (await steve.listSpaces()).spaces,
            checkout,
            releaseCoordinator: { id: releaseCoordinator.id, name: releaseCoordinatorName },
            viewport,
            cues,
            shipping: shippingEvidence,
            sidebar: await gym.client.getSpaceSidebar(),
            spaces: (await gym.client.listSpaces()).spaces,
            health: await gym.client.getHealth(),
            agentId: recordedAgentId,
            history: loopInEvidence.history,
            finalVisibleText: await page.locator("body").innerText(),
        };
    },
};
