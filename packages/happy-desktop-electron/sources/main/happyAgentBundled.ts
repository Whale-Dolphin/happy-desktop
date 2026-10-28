import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { chmod, mkdir, mkdtemp, open, readFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import {
    executableFile,
    happyAgentBinarySelect,
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
 * The Happy Agent release packed into the desktop download, so a first launch
 * has an agent without a second download.
 *
 * The packaged app carries one directory, `Resources/happy-agent`, holding the
 * release's own binary next to this manifest. The release build writes both
 * from the published, checksum-verified archive; nothing else does.
 */
export const HAPPY_AGENT_BUNDLE_DIRECTORY = "happy-agent";
export const HAPPY_AGENT_BUNDLE_MANIFEST = "happy-agent.json";

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
 * It is copied out of the app rather than run in place, because a desktop
 * update replaces the whole app while the daemon keeps running from its binary.
 *
 * Returns nothing when the app carries no agent, or when this machine's data
 * already needs a newer release than the bundled one; the first-run download
 * then fetches one as before.
 */
export async function happyAgentBundledInstall(
    paths: HappyDaemonPaths,
    bundleDirectory: string,
): Promise<HappyAgentBinary | undefined> {
    const manifest = await happyAgentBundleManifestRead(bundleDirectory);
    if (manifest === undefined) return undefined;
    if (happyAgentVersionBelowData(manifest.version, await happyAgentDataMinimumRead(paths)))
        return undefined;
    await mkdir(paths.versionsDirectory, { mode: 0o700, recursive: true });
    await chmod(paths.distDirectory, 0o700);
    await chmod(paths.versionsDirectory, 0o700);
    const lock = await happyAgentInstallLockAcquire(paths.installLockPath, undefined);
    try {
        if (!(await executableFile(happyAgentBinaryPath(paths, manifest.version))))
            await bundledCopy(paths, bundleDirectory, manifest);
    } finally {
        await lock.release();
    }
    await happyAgentBinarySelect(paths, manifest.version);
    return { path: happyAgentBinaryPath(paths, manifest.version), version: manifest.version };
}

/**
 * Copies the bytes alone, as a download writes them: the app's extended
 * attributes, quarantine among them, belong to the app and not to the agent.
 * Unlocked: the caller holds the install lock.
 */
async function bundledCopy(
    paths: HappyDaemonPaths,
    bundleDirectory: string,
    manifest: HappyAgentBundleManifest,
): Promise<void> {
    const staging = await mkdtemp(join(paths.versionsDirectory, ".install-"));
    const stagedPath = join(staging, HAPPY_AGENT_BINARY_FILE_NAME);
    try {
        const hash = createHash("sha256");
        const target = await open(stagedPath, "wx", 0o700);
        try {
            for await (const chunk of createReadStream(
                join(bundleDirectory, HAPPY_AGENT_BINARY_FILE_NAME),
            )) {
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
