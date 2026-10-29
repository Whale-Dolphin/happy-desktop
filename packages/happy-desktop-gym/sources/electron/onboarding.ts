/*
 * GYM SCENARIO — onboarding. Happy's first conversation on a fresh install, in
 * the gym's hidden window, screenshotted at each step, and optionally recorded
 * at natural pace. Happy Agent runs onboarding itself (`capabilities.onboarding`)
 * in Happy's own chat, in the ordinary window. The recording's mp4 carries a
 * "Gym data" label burnt into a corner of the video, never drawn by the app.
 *
 * Fixtures, all labelled as such, on the daemon's side in the run's throwaway
 * home:
 * - Codex inside a stand-in ChatGPT app (`ONBOARDING_AGENT_CODEX`), signed in
 *   by a made-up auth file, is the one way this computer reaches a model; no
 *   other assistant is on PATH, so nothing is installed or signed in to;
 * - the name from Git is a throwaway `.gitconfig`, and the work Happy
 *   discovers is made-up Codex sessions in made-up projects;
 * - every model reply, Happy's own and Focus's proposal among them, is
 *   `gymOnboardingInferenceScript`;
 * - the phone that scans the pairing code and says the emoji match is
 *   `onboardingPhoneScan`, dialing the daemon's connector on loopback
 *   through a stand-in Tailcat, so nothing leaves this computer;
 * - `security`, `open` and `xdg-open` on the daemon's PATH are stubs that only
 *   log, so nothing can reach the keychain or a browser;
 * - the window gets no Git checkout to name, so it shows no development
 *   branch, as an installed Happy does not.
 *
 * Real: the window, a fresh Happy Agent with nothing seeded, the flow, Focus
 * and its proposal, the chats Good to go starts and places,
 * their read-only first messages, and Create.
 *
 * Only a preview build runs this conversation (built with
 * `RELEASE_VERSION=X.Y.Z-preview.N`), and it turns Stem Cells and Stories on.
 * `stable` runs a stable build's first launch instead: the welcome, then
 * setup, with both settings never written.
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Page } from "playwright";

import { happyAgentClientCreate } from "./happyAgentProtocol.js";
import { gymInferenceServerCreate } from "./inferenceServer.js";
import {
    gymElectronInvisibleAssert,
    gymElectronLaunch,
    gymElectronVideoRecord,
    type GymElectronVideo,
} from "./launch.js";
import { gymManifestRead } from "./manifest.js";
import { gymOnboardingInferenceScript } from "./onboardingInference.js";
import { onboardingPhoneScan, onboardingPhoneStandIn } from "./onboardingPhone.js";
import {
    gymCursorClick,
    gymCursorInstall,
    gymReadHold,
    ONBOARDING_PACE,
} from "./onboardingPace.js";
import { electronEntrypointResolve, gymRunPathsCreate } from "./paths.js";
import { happyAgentRuntimeCreate } from "./happyAgentRuntime.js";

/** Commands that could reach the keychain or a browser; stubbed for the daemon. */
const STUBBED_COMMANDS = ["security", "open", "xdg-open"];

/**
 * The gym's Happy Agent: one Codex account,
 * served by the gym's scripted inference, for the Codex the stand-in ChatGPT
 * app carries.
 */
const ONBOARDING_AGENT_CONFIGURATION = [
    "[settings]",
    "happy_integration = false",
    // A released daemon would put its agents in the person's menu bar.
    "menu_bar = false",
    "",
    "[providers.codex]",
    'type = "codex"',
    "enabled = true",
    "credential_isolation = true",
    "",
].join("\n");

/** STAND-IN — Codex as the ChatGPT app carries it: it reports its version and a ChatGPT sign-in, nothing else. */
const ONBOARDING_AGENT_CODEX = `#!/bin/sh
case "$*" in
  "--version") echo "codex-cli 0.164.0" ;;
  "login status") echo "Logged in using ChatGPT" ;;
  *) exit 2 ;;
esac
`;

/** STAND-IN — what the person asked Codex lately, by project: what Happy discovers. */
const ONBOARDING_AGENT_SESSIONS: readonly { readonly project: string; readonly asked: string }[] = [
    { project: "happy-desktop", asked: "Finish the chat-first onboarding redesign" },
    { project: "happy-desktop", asked: "Windows sign-in loops back to the start screen" },
    { project: "happy-agent", asked: "Why does release CI keep retrying the notarize step?" },
];

/** A JWT with these claims and no signature: only Codex's auth file reads it, and nothing checks it. */
function jwtUnsigned(claims: object): string {
    const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
    return `${part({ alg: "none" })}.${part(claims)}.signature`;
}

/**
 * The daemon's stand-ins in the run's throwaway home: the ChatGPT app with
 * Codex inside, Codex's made-up sign-in and sessions, and a Git identity.
 * Returns what the daemon adds to its environment to find them, and to look
 * nowhere else.
 */
async function onboardingAgentStandIns(paths: {
    readonly root: string;
    readonly home: string;
}): Promise<Record<string, string>> {
    const applications = join(paths.root, "Applications");
    const codexBin = join(applications, "ChatGPT.app", "Contents", "Resources", "codex-cli", "bin");
    await mkdir(codexBin, { recursive: true });
    await writeFile(join(codexBin, "codex"), ONBOARDING_AGENT_CODEX);
    await chmod(join(codexBin, "codex"), 0o755);
    const codexHome = join(paths.home, ".codex");
    await mkdir(codexHome, { recursive: true });
    await writeFile(
        join(codexHome, "auth.json"),
        JSON.stringify({
            tokens: {
                id_token: jwtUnsigned({
                    email: "ada@example.com",
                    "https://api.openai.com/auth": { chatgpt_plan_type: "plus" },
                }),
            },
        }),
    );
    await writeFile(
        join(paths.home, ".gitconfig"),
        "[user]\n\tname = Ada Lovelace\n\temail = ada@example.com\n",
    );
    const sessions = join(codexHome, "sessions", "2026", "10", "27");
    await mkdir(sessions, { recursive: true });
    for (const [index, session] of ONBOARDING_AGENT_SESSIONS.entries()) {
        const project = join(paths.root, "projects", session.project);
        await mkdir(project, { recursive: true });
        await writeFile(
            join(sessions, `rollout-${String(index + 1)}.jsonl`),
            [
                { type: "session_meta", payload: { cwd: project } },
                {
                    type: "response_item",
                    payload: {
                        type: "message",
                        role: "user",
                        content: [{ type: "input_text", text: session.asked }],
                    },
                },
            ]
                .map((line) => JSON.stringify(line))
                .join("\n"),
        );
    }
    return {
        CODEX_HOME: codexHome,
        GROK_HOME: join(paths.home, ".grok"),
        HAPPY_AGENT_APPLICATIONS_DIRECTORY: applications,
        HAPPY_AGENT_PROGRAM_DIRECTORIES: "",
        HAPPY_AGENT_LOCAL_MODEL_PORTS: "",
    };
}

export async function gymOnboardingRun(options: {
    /** Screenshots, the run log and the recording go here. */
    readonly out: string;
    readonly record?: boolean;
    /** Where the labelled mp4 of the recording goes; `onboarding.mp4` in `out` by default. */
    readonly video?: string;
    /** The build is stable: expect the welcome and setup, not Happy's chat. */
    readonly stable?: boolean;
}): Promise<void> {
    await mkdir(options.out, { recursive: true });
    const { paths } = await gymRunPathsCreate("smoke");
    const log: string[] = [];
    const note = (line: string) => {
        console.log(line);
        log.push(line);
    };
    note(`root ${paths.root}`);
    await mkdir(paths.bin, { recursive: true });
    const stubLog = join(paths.root, "stub-calls.log");
    /* An assistant on PATH would be found as installed: only the openers are stubbed. */
    for (const command of STUBBED_COMMANDS) {
        const path = join(paths.bin, command);
        await writeFile(
            path,
            `#!/bin/sh\necho "${command} $*" >> ${JSON.stringify(stubLog)}\nexit ${command === "security" ? "44" : "1"}\n`,
        );
        await chmod(path, 0o755);
    }
    const requests = join(paths.root, "inference-requests");
    let requestCount = 0;
    const inference = gymInferenceServerCreate(
        gymManifestRead("smoke"),
        paths.inferenceLog,
        gymOnboardingInferenceScript((request) => {
            // Every request as the daemon sent it, for reading what a scripted turn answered.
            mkdirSync(requests, { recursive: true });
            writeFileSync(
                join(requests, `${String((requestCount += 1)).padStart(4, "0")}.json`),
                JSON.stringify(request, null, 1),
            );
        }),
    );
    await inference.start();
    const phone = await onboardingPhoneStandIn(paths.root);
    const runtime = await happyAgentRuntimeCreate(
        paths,
        inference,
        `${ONBOARDING_AGENT_CONFIGURATION}\n${phone.configuration}`,
        { ...(await onboardingAgentStandIns(paths)), ...phone.environment },
    );
    const daemon = happyAgentClientCreate(runtime.socketPath, runtime.token);
    const entry = electronEntrypointResolve(paths.workspaceRoot);
    const app = await gymElectronLaunch({
        args: [`--user-data-dir=${paths.electronUserData}`, entry.main],
        cwd: paths.workspaceRoot,
        env: {
            ...runtime.environment,
            HAPPY_DESKTOP_GYM_ELECTRON_USER_DATA: paths.electronUserData,
            // No checkout to name: the window shows no development branch.
            GIT_DIR: join(paths.root, "no-checkout"),
        },
        executablePath: entry.executable,
    });
    let video: GymElectronVideo | undefined;
    try {
        app.process().stderr?.on("data", (data: Buffer) =>
            log.push(`[main!] ${data.toString().trim()}`),
        );
        const page = await app.firstWindow();
        page.on("console", (message) => {
            if (message.type() === "error") log.push(`[renderer error] ${message.text()}`);
        });
        page.on("pageerror", (error) => log.push(`[pageerror] ${error.stack ?? error.message}`));
        await app.evaluate(({ BrowserWindow }) => {
            BrowserWindow.getAllWindows()[0]?.setBounds({ x: 0, y: 0, width: 1100, height: 760 });
        });
        if (options.stable) {
            await onboardingStableDrive(page, options.out, note);
            const settings = await experimentSettingsRead(daemon);
            note(`experiments ${JSON.stringify(settings)}`);
            if (settings.stemCells !== null || settings.stories !== null)
                throw new Error("A stable first launch wrote an experiment setting.");
            await gymElectronInvisibleAssert(app);
            return;
        }
        await page.locator('[data-happy-desktop-ui="sidebar"]').first().waitFor({
            state: "attached",
            timeout: 90_000,
        });
        if (options.record)
            video = await gymElectronVideoRecord(page, {
                path: join(paths.root, "onboarding.mkv"),
                codec: "h264",
                scale: 2,
            });
        await onboardingDrive(page, options.out, note, async () => {
            const scan = await onboardingPhoneScan(daemon, phone.portFile, 30_000).catch(
                (error: unknown) => {
                    note(`the phone could not scan: ${String(error)}`);
                    return undefined;
                },
            );
            if (!scan) return false;
            scan.paired.then(
                (deviceId) => note(`phone paired as ${deviceId}`),
                (error: unknown) => note(`the phone did not pair: ${String(error)}`),
            );
            return true;
        });
        if (video) {
            const recorded = await video.stop();
            video = undefined;
            note(`video ${JSON.stringify(recorded)}`);
            const mp4 = options.video ?? join(options.out, "onboarding.mp4");
            await gymVideoLabel(recorded.path, mp4);
            note(`video ${mp4}`);
        }
        note(
            `sidebar ${JSON.stringify(await page.locator('[data-happy-desktop-ui="sidebar-item"]').allInnerTexts())}`,
        );

        /* Onboarding told Happy each step read-only, one message at a time.
           The person's own next message to Happy runs in their normal mode. */
        await page
            .locator('[data-happy-desktop-ui="sidebar-item"]:visible')
            /* Its row carries its last activity time after the name. */
            .filter({ hasText: /^Happy/u })
            .first()
            .click();
        const composer = page
            .locator('[data-happy-desktop-ui="composer-textarea"]:visible')
            .first();
        await composer.waitFor({ state: "visible", timeout: 30_000 });
        await composer.fill("Thanks, that's all for now.");
        await composer.press("Enter");
        await page.getByText("Okay.").last().waitFor({ timeout: 60_000 });
        note("sent Happy a message of the person's own after onboarding");

        const settings = await experimentSettingsRead(daemon);
        note(`experiments ${JSON.stringify(settings)}`);
        if (settings.stemCells !== true || settings.stories !== true)
            throw new Error("Onboarding did not turn on Stem Cells and Stories.");

        const { spaces } = await daemon.listSpaces();
        for (const space of spaces) {
            const agentId = space.target.agentId as Parameters<typeof daemon.getAgentMode>[0];
            const [{ mode }, { draft }] = await Promise.all([
                daemon.getAgentMode(agentId),
                daemon.getAgentDraft(agentId),
            ]);
            note(
                `space ${JSON.stringify({ title: space.title, icon: space.icon, placement: space.placement, mode, draft: draft.value && { ...draft.value, text: draft.value.text.length } })}`,
            );
        }
        await gymElectronInvisibleAssert(app);
    } catch (error) {
        note(`FAILED ${error instanceof Error ? error.stack : String(error)}`);
        const [window] = app.windows();
        if (window)
            await window
                .screenshot({ path: join(options.out, "failure.png") })
                .catch(() => undefined);
        throw error;
    } finally {
        await writeFile(join(options.out, "run-log.txt"), `${log.join("\n")}\n`);
        // A drive that failed still stops its recorder, or it holds the run open.
        await video?.stop().catch(() => undefined);
        await app.close().catch(() => undefined);
        await runtime.stop().catch(() => undefined);
        await inference.stop().catch(() => undefined);
    }
}

/** The person's Stem Cells and Stories settings as the daemon holds them; null is never set. */
async function experimentSettingsRead(daemon: ReturnType<typeof happyAgentClientCreate>) {
    const [stemCells, stories] = await Promise.all([
        daemon.getUserSetting("happy-desktop.experiments.stemCells"),
        daemon.getUserSetting("happy-desktop.experiments.stories"),
    ]);
    return { stemCells: stemCells.setting.value, stories: stories.setting.value };
}

/**
 * A stable build's first launch, as on main: the welcome, then setup, which
 * starts this machine's Happy Agent. Happy's chat never opens.
 */
async function onboardingStableDrive(
    page: Page,
    out: string,
    note: (line: string) => void,
): Promise<void> {
    const shot = async (name: string) => {
        await page.screenshot({ path: join(out, `${name}.png`) });
        note(`shot ${name}`);
    };
    const welcome = page.locator('[data-happy-desktop-ui="welcome-screen"]');
    await welcome.waitFor({ state: "visible", timeout: 90_000 });
    await shot("stable-01-welcome");
    await gymCursorInstall(page, 560, 700);
    await gymCursorClick(page, welcome.locator(".happy-welcome-screen__action").first());
    await page
        .locator('[data-happy-desktop-ui="setup-page"]')
        .first()
        .waitFor({ state: "visible", timeout: 90_000 });
    await shot("stable-02-setup");
    // Setup carries on as the machine answers; its later screens, then no chat.
    await new Promise((resolve) => setTimeout(resolve, 20_000));
    await shot("stable-03-setup-later");
    if ((await page.getByText("Hi, I'm Happy").count()) > 0)
        throw new Error("A stable first launch opened Happy's onboarding chat.");
}

/**
 * The recording as an H.264 mp4 with "Gym data" in its bottom-right corner, so
 * nobody takes the scripted replies and fixtures for a real run.
 */
async function gymVideoLabel(recording: string, mp4: string): Promise<void> {
    await mkdir(dirname(mp4), { recursive: true });
    const label =
        "drawtext=text='Gym data':font='Helvetica Neue':fontsize=24:fontcolor=white@0.95:" +
        "box=1:boxcolor=black@0.55:boxborderw=12:x=w-tw-32:y=h-th-32";
    const ffmpeg = process.env.HAPPY_DESKTOP_GYM_FFMPEG?.trim() || "ffmpeg";
    await new Promise<void>((resolve, reject) => {
        const encoder = spawn(
            ffmpeg,
            [
                "-loglevel",
                "error",
                "-y",
                "-i",
                recording,
                "-vf",
                label,
                "-c:v",
                "libx264",
                "-crf",
                "16",
                "-preset",
                "fast",
                "-pix_fmt",
                "yuv420p",
                "-movflags",
                "+faststart",
                mp4,
            ],
            { stdio: ["ignore", "ignore", "pipe"] },
        );
        let error = "";
        encoder.stderr.on("data", (chunk: Buffer) => (error += chunk.toString()));
        encoder.on("error", reject);
        encoder.on("close", (code) =>
            code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${String(code)}: ${error}`)),
        );
    });
}

/**
 * The path through onboarding as review/video-script-v9.md writes it, each
 * step screenshotted. Every press is the visible cursor travelling to the
 * control, resting, clicking, and holding on what was chosen; every finished
 * message holds long enough to read (`ONBOARDING_PACE`).
 */
async function onboardingDrive(
    page: Page,
    out: string,
    note: (line: string) => void,
    phone: () => Promise<boolean>,
): Promise<void> {
    const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const shot = async (name: string) => {
        await page.screenshot({ path: join(out, `${name}.png`) });
        note(`shot ${name}`);
    };
    const visible = (text: string) => page.getByText(text).last().waitFor({ timeout: 90_000 });
    const rows = '[data-happy-desktop-ui="sidebar-item"]';
    /*
     * One step: the newest live button with this label appears, its message
     * holds to be read, the screen is shot, and the cursor presses it.
     */
    const step = async (label: RegExp, name: string) => {
        const button = page
            .locator(".happy-chat-action__button:not(:disabled)")
            .filter({ hasText: label })
            .last();
        await button.waitFor({ state: "visible", timeout: 90_000 });
        const message = button.locator('xpath=ancestor::*[@data-happy-desktop-ui="message"][1]');
        const held = await gymReadHold(message);
        await shot(name);
        note(`press ${String(label)} after ${String(held)} ms`);
        await gymCursorClick(page, button);
    };
    /* Every accepted chat placed under its topic, as the sidebar shows it, or a minute without it. */
    const filed = async () => {
        const topics: readonly (readonly [string, readonly string[]])[] = [
            ["SIGN-IN AND ONBOARDING", ["Onboarding redesign", "Windows sign-in"]],
            ["RELEASE PIPELINE", ["Release CI", "Release check-in"]],
        ];
        const deadline = Date.now() + 60_000;
        while (Date.now() < deadline) {
            const texts = (await page.locator(rows).allInnerTexts())
                /* A heading's fold chevron is a glyph after its label: read the label line. */
                .map((text) => (text.trim().split("\n")[0] ?? "").trim().toUpperCase());
            const under = (heading: string, title: string) => {
                const at = texts.indexOf(heading);
                const row = texts.indexOf(title.toUpperCase());
                return (
                    at !== -1 &&
                    row > at &&
                    !texts
                        .slice(at + 1, row)
                        .some((each) => topics.some(([other]) => other === each))
                );
            };
            if (topics.every(([heading, titles]) => titles.every((title) => under(heading, title))))
                return true;
            await pause(200);
        }
        return false;
    };
    /* Every division the window plays, counted as it mounts: a fast one can
       start and end while the press is still holding on what was chosen. */
    const divisions = () =>
        page.evaluate(() => {
            const window_ = window as unknown as { gymDivisions?: number };
            if (window_.gymDivisions === undefined) {
                window_.gymDivisions = 0;
                new MutationObserver((records) => {
                    for (const record of records)
                        for (const node of record.addedNodes)
                            if (
                                node instanceof Element &&
                                (node.matches('[data-happy-desktop-ui="happy-cell-division"]') ||
                                    node.querySelector(
                                        '[data-happy-desktop-ui="happy-cell-division"]',
                                    ))
                            )
                                window_.gymDivisions = (window_.gymDivisions ?? 0) + 1;
                }).observe(document.body, { childList: true, subtree: true });
            }
            return window_.gymDivisions;
        });
    /** Waits for a division after `since` of them; its still while it plays, if it still is. */
    const division = async (name: string, missing: string, since: number) => {
        const deadline = Date.now() + 30_000;
        while ((await divisions()) <= since && Date.now() < deadline) await pause(50);
        if ((await divisions()) <= since) return note(missing);
        const playing = page.locator('[data-happy-desktop-ui="happy-cell-division"]');
        if ((await playing.count()) > 0) {
            await pause(220);
            await shot(name);
        } else note(`${name}: the division played during the press`);
    };

    // 1. First launch: Happy's mark at the top, its first words streaming under it.
    await page.getByText("Hi, I'm Happy").first().waitFor({ timeout: 90_000 });
    await gymCursorInstall(page, 560, 700);
    await pause(400);
    await shot("01a-opening");
    await step(/^Start onboarding$/, "01-first-launch");
    // The example leaves the sidebar.
    await pause(ONBOARDING_PACE.sidebarHoldMs);
    // 2. Subscriptions: the stand-in Codex, the one way this computer reaches a model.
    await step(/^Use selected$/, "02-subscriptions");
    // 3. Connected, the default model, and the profile: Happy's first model turn.
    await step(/^That's me$/, "03-connected");
    // 4. Your work.
    const beforeFocus = await divisions();
    await step(/^Discover what I've been working on$/, "04-your-work");
    // 5. Focus: it peels off from Happy and settles under it while it works.
    const focus = await page
        .locator(rows)
        .filter({ hasText: /^Focus( Agent)?$/u })
        .first()
        .waitFor({ timeout: 60_000 })
        .then(() => true)
        .catch(() => false);
    if (focus) await division("05a-focus-dividing", "Focus did not divide from Happy", beforeFocus);
    else note("Focus did not appear under Happy within 60 s");
    // The script holds about 3.5 s while Focus works.
    await pause(3_500);
    await shot("05-focus");
    // 6. The proposal, decided in the chat.
    await step(/^Good to go$/, "06-proposal");
    // 7. Placed: each row with its final name and icon, then Happy says so.
    if (await filed()) await pause(ONBOARDING_PACE.sidebarHoldMs);
    else note("not every chat was placed within a minute");
    await shot("07a-placed");
    const beforeCreate = await divisions();
    await step(/^Try Create$/, "07-placed");
    // 8. Create: Happy divides into the new row right below it.
    await division("08a-create-dividing", "Happy did not divide within 30 s", beforeCreate);
    await pause(2_000);
    await shot("08-create");
    // 9. The phone: the gym's fixture phone pairs, the emoji match.
    await step(/^I've downloaded and opened Happy$/, "09-phone");
    const pairButton = page
        .locator(".happy-chat-action__button")
        .filter({ hasText: /^Pair later$/u });
    await pairButton
        .last()
        .waitFor({ state: "visible", timeout: 60_000 })
        .catch(() => undefined);
    await pause(3_000);
    await shot("09b-pair");
    if (await phone()) {
        const match = page.getByRole("button", { name: "Emoji match" }).last();
        const shown = await match
            .waitFor({ state: "visible", timeout: 30_000 })
            .then(() => true)
            .catch(() => false);
        if (shown) {
            await pause(2_500);
            await shot("09c-emoji");
            await gymCursorClick(page, match);
            await visible("iPhone is paired").catch(() => note("the pairing did not settle"));
            await pause(ONBOARDING_PACE.sidebarHoldMs);
            await shot("09d-paired");
        } else note("the emoji never showed");
    } else {
        note("no fixture phone: pressing Pair later");
        await gymCursorClick(page, pairButton.last());
    }
    // 10. Ready: the first chat Good to go started.
    await step(/^Onboarding redesign$/, "10-ready");
    // 11. That chat, on its read-only plan.
    const opened = await page
        .getByText("Want me to go ahead?")
        .first()
        .waitFor({ timeout: 60_000 })
        .then(() => true)
        .catch(() => false);
    if (!opened) note("the chat did not open within 60 s");
    await pause(4_000);
    await shot("11-first-chat");
    // Happy's seed after both divisions, as the window keeps it for the next launch.
    note(
        `cells ${await page.evaluate(() => localStorage.getItem("happy.stem-cell-animation.v1"))}`,
    );
    note(
        `desktop setup ${JSON.stringify(
            await page.evaluate(() =>
                (
                    globalThis as unknown as {
                        happyDesktop?: { onboardingGet(): Promise<unknown> };
                    }
                ).happyDesktop?.onboardingGet(),
            ),
        )}`,
    );
}
