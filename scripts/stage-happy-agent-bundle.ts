import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import {
    HAPPY_AGENT_BINARY_FILE_NAME,
    happyDaemonPaths,
} from "../packages/happy-desktop-electron/sources/main/happyAgentBinaryPaths.js";
import {
    HAPPY_AGENT_BUNDLE_MANIFEST,
    happyAgentBundleManifestValid,
    type HappyAgentBundleManifest,
} from "../packages/happy-desktop-electron/sources/main/happyAgentBundled.js";
import {
    happyAgentReleaseDownload,
    happyAgentReleaseLatest,
    happyAgentReleaseVersion,
} from "../packages/happy-desktop-electron/sources/main/happyAgentRelease.js";

/**
 * Puts the Happy Agent release the first-install download carries into
 * `<out>/payload/happy-agent[.exe]` and its manifest into `<out>/happy-agent.json`.
 * The app carries only the manifest; the disk image or Setup installer carries
 * the payload beside it, and Happy's own updates carry neither binary.
 *
 * It fetches exactly what Desktop's own first-run download would: the latest
 * stable release for the target, or `HAPPY_AGENT_BUNDLE_VERSION` when a build
 * pins one, through the same checksum-verified installer. The bundle is a seed;
 * the installed app keeps the agent current through its update channel.
 *
 *   tsx scripts/stage-happy-agent-bundle.ts --arch arm64 --out <directory>
 */
const run = promisify(execFile);
const arch = argument("--arch");
if (arch !== "arm64" && arch !== "x64") throw new Error("--arch must be arm64 or x64.");
const out = resolve(argument("--out"));
const pinned = process.env.HAPPY_AGENT_BUNDLE_VERSION?.trim();
const token = (process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN)?.trim();
// Release lookups share one unauthenticated per-address budget on CI runners.
const fetch_: typeof globalThis.fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (!token || url.hostname !== "api.github.com") return globalThis.fetch(input, init);
    const headers = new Headers(init?.headers);
    headers.set("authorization", `Bearer ${token}`);
    return globalThis.fetch(input, { ...init, headers });
};
const options = { arch, fetch: fetch_, platform: process.platform } as const;
const release = pinned
    ? await happyAgentReleaseVersion(pinned, options)
    : await happyAgentReleaseLatest(options);

const temporary = await mkdtemp(join(tmpdir(), "happy-agent-bundle-"));
try {
    const paths = happyDaemonPaths({ HAPPY_HOME_DIR: join(temporary, ".happy") });
    const binary = await happyAgentReleaseDownload(release, paths, { fetch: fetch_ });
    if (process.platform === "darwin")
        // The release signs and notarizes the agent; the app ships it unaltered.
        await run("codesign", ["--verify", "--strict", "--verbose=2", binary.path]);
    await rm(out, { force: true, recursive: true });
    await mkdir(out, { recursive: true });
    await mkdir(join(out, "payload"));
    await copyFile(binary.path, join(out, "payload", HAPPY_AGENT_BINARY_FILE_NAME));
    const manifest: HappyAgentBundleManifest = {
        version: release.version,
        sha256: createHash("sha256")
            .update(await readFile(join(out, "payload", HAPPY_AGENT_BINARY_FILE_NAME)))
            .digest("hex"),
    };
    if (!happyAgentBundleManifestValid(manifest))
        throw new Error(`Happy Agent ${release.version} cannot be bundled.`);
    await writeFile(join(out, HAPPY_AGENT_BUNDLE_MANIFEST), `${JSON.stringify(manifest)}\n`);
    console.log(`Bundling Happy Agent ${release.version} for ${process.platform}-${arch}.`);
} finally {
    await rm(temporary, { force: true, recursive: true });
}

function argument(name: string): string {
    const index = process.argv.indexOf(name);
    const value = index >= 0 ? process.argv[index + 1] : undefined;
    if (!value) throw new Error(`${name} is required.`);
    return value;
}
