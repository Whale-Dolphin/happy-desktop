import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { chmod, mkdir, mkdtemp, open, readFile, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import {
    executableFile,
    happyAgentBinarySelect,
    happyAgentBinarySelected,
    type HappyAgentBinary,
} from "./happyAgentBinaryConfig";
import {
    HAPPY_AGENT_BINARY_FILE_NAME,
    happyAgentBinaryPath,
    type HappyDaemonPaths,
} from "./happyAgentBinaryPaths";
import { happyAgentDataMinimumRead, happyAgentVersionBelowData } from "./happyAgentDataVersion";
import { happyAgentInstallLockAcquire } from "./happyAgentInstallLock";
import { happyAgentFileLockRetry } from "./happyAgentRelease";
import { happyAgentVersionKind } from "./happyAgentVersion";

/**
 * The Happy Agent release packed into the first-install download, so a first
 * launch has an agent without a second download.
 *
 * Only what installs Happy carries the agent binary, never Happy's own updates:
 * Happy and the agent update separately. The app itself carries just this
 * manifest, in `Resources/happy-agent`, naming the release its first-install
 * download was built with. On macOS the manifest is sealed by the app's
 * signature, so a binary found outside the app is used only when it matches.
 *
 * - macOS: the disk image holds the binary in a hidden `.happy-agent` folder
 *   beside the app, and the first launch from it installs the agent while the
 *   image is still mounted.
 * - Windows: the Setup installer lays the binary down beside the manifest. The
 *   update installer carries none and replaces the whole installation.
 *
 * The release build writes both from the published, checksum-verified archive;
 * nothing else does.
 */
export const HAPPY_AGENT_BUNDLE_DIRECTORY = "happy-agent";
export const HAPPY_AGENT_BUNDLE_MANIFEST = "happy-agent.json";
/** The disk image's hidden folder beside the app, holding the agent binary. */
export const HAPPY_AGENT_DISK_IMAGE_DIRECTORY = ".happy-agent";

export interface HappyAgentBundleManifest {
    /** A stable Happy Agent release version. */
    readonly version: string;
    /** Lowercase hex SHA-256 of the bundled binary. */
    readonly sha256: string;
}

/** The manifest the app carries, or nothing for a build without a bundled agent. */
export async function happyAgentBundleManifestRead(
    bundleDirectory: string,
): Promise<HappyAgentBundleManifest | undefined> {
    let text: string;
    try {
        text = await readFile(join(bundleDirectory, HAPPY_AGENT_BUNDLE_MANIFEST), "utf8");
    } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
        throw error;
    }
    const value: unknown = JSON.parse(text);
    if (!happyAgentBundleManifestValid(value))
        throw new Error("The bundled Happy Agent manifest is invalid.");
    return value;
}

export function happyAgentBundleManifestValid(value: unknown): value is HappyAgentBundleManifest {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    if (Object.keys(record).some((key) => key !== "version" && key !== "sha256")) return false;
    return (
        typeof record.version === "string" &&
        happyAgentVersionKind(record.version) === "stable" &&
        typeof record.sha256 === "string" &&
        /^[0-9a-f]{64}$/u.test(record.sha256)
    );
}

/**
 * Installs and selects the bundled release on a machine that has never
 * selected one, exactly as if it had just been downloaded: the same
 * `dist/version/<version>` layout, the same install lock, the same selection.
 * From then on it is an ordinary downloaded version, and the Happy Agent update
 * channel replaces it like any other.
 *
 * It is copied out rather than run in place, because the disk image is ejected
 * and a desktop update replaces the whole installation while the daemon keeps
 * running from its binary.
 *
 * `binaryPath` is where this launch found the binary that the manifest in
 * `bundleDirectory` names; beside the manifest unless given.
 *
 * Returns nothing when there is no bundled binary here, as after any update or
 * when Happy was not opened from what installed it, or when this machine's
 * data already needs a newer release than the bundled one; the first-run
 * download then fetches one as before.
 */
export async function happyAgentBundledInstall(
    paths: HappyDaemonPaths,
    bundleDirectory: string,
    binaryPath = join(bundleDirectory, HAPPY_AGENT_BINARY_FILE_NAME),
): Promise<HappyAgentBinary | undefined> {
    const manifest = await happyAgentBundleManifestRead(bundleDirectory);
    if (manifest === undefined || !(await fileExists(binaryPath))) return undefined;
    if (happyAgentVersionBelowData(manifest.version, await happyAgentDataMinimumRead(paths)))
        return undefined;
    await mkdir(paths.versionsDirectory, { mode: 0o700, recursive: true });
    await chmod(paths.distDirectory, 0o700);
    await chmod(paths.versionsDirectory, 0o700);
    const lock = await happyAgentInstallLockAcquire(paths.installLockPath, undefined);
    try {
        if (!(await executableFile(happyAgentBinaryPath(paths, manifest.version))))
            await bundledCopy(paths, binaryPath, manifest);
    } finally {
        await lock.release();
    }
    await happyAgentBinarySelect(paths, manifest.version);
    return { path: happyAgentBinaryPath(paths, manifest.version), version: manifest.version };
}

/**
 * Installs the agent a macOS disk image carries beside the app, from the
 * launch that opened Happy from that image, on a machine that has never
 * selected an agent. The image is ejected once this launch leaves for the
 * installed copy, so this is the one chance; the installed app never sees it.
 */
export async function happyAgentDiskImageInstall(
    paths: HappyDaemonPaths,
    mountPoint: string,
    resourcesPath: string,
): Promise<void> {
    if ((await happyAgentBinarySelected(paths)) !== undefined) return;
    await happyAgentBundledInstall(
        paths,
        join(resourcesPath, HAPPY_AGENT_BUNDLE_DIRECTORY),
        join(mountPoint, HAPPY_AGENT_DISK_IMAGE_DIRECTORY, HAPPY_AGENT_BINARY_FILE_NAME),
    );
}

/**
 * Copies the bytes alone, as a download writes them: the extended attributes
 * of what carried it, quarantine among them, do not belong to the agent.
 * Unlocked: the caller holds the install lock.
 */
async function bundledCopy(
    paths: HappyDaemonPaths,
    binaryPath: string,
    manifest: HappyAgentBundleManifest,
): Promise<void> {
    const staging = await mkdtemp(join(paths.versionsDirectory, ".install-"));
    const stagedPath = join(staging, HAPPY_AGENT_BINARY_FILE_NAME);
    try {
        const hash = createHash("sha256");
        const target = await open(stagedPath, "wx", 0o700);
        try {
            for await (const chunk of createReadStream(binaryPath)) {
                const bytes = chunk as Buffer;
                hash.update(bytes);
                await target.write(bytes);
            }
            await target.sync();
        } finally {
            await target.close();
        }
        if (hash.digest("hex") !== manifest.sha256)
            throw new Error("The bundled Happy Agent does not match its manifest.");
        await chmod(stagedPath, 0o700);
        await happyAgentFileLockRetry(() =>
            rm(join(paths.versionsDirectory, manifest.version), { force: true, recursive: true }),
        );
        await happyAgentFileLockRetry(() =>
            rename(staging, join(paths.versionsDirectory, manifest.version)),
        );
    } finally {
        await happyAgentFileLockRetry(() => rm(staging, { force: true, recursive: true })).catch(
            () => undefined,
        );
    }
}

async function fileExists(path: string): Promise<boolean> {
    return stat(path).then(
        (information) => information.isFile(),
        () => false,
    );
}
