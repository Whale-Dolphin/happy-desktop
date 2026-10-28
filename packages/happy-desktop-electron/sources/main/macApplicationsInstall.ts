import { execFile, spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdir, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { app, shell } from "electron";
import koffi, { type LibraryHandle } from "koffi";
import { happyAgentVersionNewer } from "./happyAgentVersion";

/**
 * Installs Happy on macOS by opening it: no window asking to drag it anywhere.
 *
 * A first launch from the downloaded disk image, from Downloads, or from the
 * read-only copy Gatekeeper translocates a downloaded app to, copies the app to
 * `/Applications` (or `~/Applications` where that is not writable), reopens it
 * from there once this process has exited, and ejects the disk image. An
 * installed copy that is the same version or newer is simply opened instead;
 * an older one is replaced. Anywhere else, Happy runs where it is.
 *
 * A launch from the disk image first hands its mount point to
 * `diskImageOpened`, the one moment what the image carries beside the app can
 * be read.
 *
 * Every failure leaves this launch running from where it started, so nothing
 * here can keep Happy from opening.
 *
 * Returns whether this process is leaving for the installed copy; the caller
 * stops starting up when it is.
 */
export async function macApplicationsInstall(options: {
    /** A hidden launch reopens hidden, and keeps its Happy home. */
    readonly hidden: boolean;
    /** Reads what the disk image carries before it is ejected. Its failure is only logged. */
    readonly diskImageOpened: (mountPoint: string) => Promise<void>;
}): Promise<boolean> {
    if (process.platform !== "darwin" || !app.isPackaged || app.isInApplicationsFolder())
        return false;
    try {
        return await install(options.hidden, options.diskImageOpened);
    } catch (error) {
        console.warn("Happy could not install itself into Applications.", error);
        return false;
    }
}

interface BundleInfo {
    readonly identifier: string;
    readonly version: string;
}

async function install(
    hidden: boolean,
    diskImageOpened: (mountPoint: string) => Promise<void>,
): Promise<boolean> {
    const running = resolve(app.getPath("exe"), "..", "..", "..");
    if (!running.endsWith(".app")) return false;
    const original = translocatedOriginal(running);
    const translocated = original !== undefined || running.includes("/AppTranslocation/");
    const source = original ?? running;
    const volume = await diskImageMountPoint(source);
    const downloaded = pathInside(source, app.getPath("downloads"));
    if (!translocated && volume === undefined && !downloaded) return false;
    if (volume !== undefined)
        await diskImageOpened(volume).catch((error: unknown) =>
            console.warn(`Happy could not read what ${volume} carries.`, error),
        );

    const directory = await applicationsDirectory();
    if (directory === undefined) return false;
    const destination = join(directory, basename(source));
    const ours = await bundleInfo(running);
    const installed = await bundleInfo(destination).catch(() => undefined);
    if (installed !== undefined && installed.identifier !== ours.identifier) {
        console.warn(`${destination} is another application; Happy runs where it is.`);
        return false;
    }
    if (installed === undefined || versionNewer(ours.version, installed.version)) {
        if (!(await bundleInstall(running, destination))) return false;
    }
    // The download has done its job either way: the installed copy is the one to open.
    if (downloaded && original !== undefined)
        await shell.trashItem(original).catch(() => undefined);
    else if (downloaded && !translocated) await shell.trashItem(running).catch(() => undefined);
    relaunch(destination, volume, hidden);
    app.exit(0);
    return true;
}

/**
 * Puts a verified copy of `running` at `destination`, replacing an older one
 * only once the new one is complete. Returns false, having changed nothing,
 * when the copy cannot be trusted to open.
 */
async function bundleInstall(running: string, destination: string): Promise<boolean> {
    const staging = join(
        dirname(destination),
        `.${basename(destination, ".app")}-install-${process.pid}`,
    );
    const staged = join(staging, basename(destination));
    const replaced = join(staging, "replaced", basename(destination));
    await rm(staging, { force: true, recursive: true });
    await mkdir(join(staging, "replaced"), { recursive: true });
    try {
        // ditto keeps the bundle exactly: symlinks, extended attributes, and the
        // signature and notarization ticket sealed inside it.
        await run("/usr/bin/ditto", [running, staged]);
        await run("/usr/bin/codesign", ["--verify", "--deep", "--strict", staged]);
        if (await quarantined(staged)) {
            // Gatekeeper has already let this launch run. The copy carries the
            // download's quarantine without that approval, which would ask the
            // person a second time. It is lifted only from a copy Gatekeeper
            // itself accepts; otherwise the copy is not installed at all.
            try {
                await run("/usr/sbin/spctl", ["--assess", "--type", "execute", staged]);
            } catch (error) {
                console.warn("Gatekeeper does not accept this copy of Happy.", error);
                return false;
            }
            await run("/usr/bin/xattr", ["-d", "-r", "com.apple.quarantine", staged]);
        }
        const replacing = await exists(destination);
        if (replacing) await rename(destination, replaced);
        try {
            await rename(staged, destination);
        } catch (error) {
            if (replacing) await rename(replaced, destination);
            throw error;
        }
        if (replacing) await shell.trashItem(replaced).catch(() => undefined);
        return true;
    } finally {
        await rm(staging, { force: true, recursive: true }).catch(() => undefined);
    }
}

/**
 * Waits for this process to exit, so the reopened app is the one in front and
 * holds the single-instance lock, then opens it and ejects the disk image this
 * launch came from. A disk image something still holds stays mounted.
 */
function relaunch(destination: string, volume: string | undefined, hidden: boolean): void {
    // A hidden launch reopens hidden, with the Happy settings and user data it
    // was started with: an agent's run must not land in the person's own Happy.
    const openArguments = hidden
        ? [
              "-g",
              "-j",
              "--env",
              "HAPPY_DESKTOP_WINDOWS_HIDDEN=1",
              ...Object.entries(process.env)
                  .filter(([name]) => name === "HOME" || name.startsWith("HAPPY_"))
                  .flatMap(([name, value]) => ["--env", `${name}=${value ?? ""}`]),
              destination,
              "--args",
              ...process.argv.slice(1),
          ]
        : [destination];
    const script = [
        'pid="$1"; volume="$2"; shift 2',
        'while /bin/kill -0 "$pid" 2>/dev/null; do /bin/sleep 0.1; done',
        '/usr/bin/open "$@"',
        'if [ -n "$volume" ]; then',
        "    for attempt in 1 2 3 4 5; do",
        "        /bin/sleep 1",
        '        /usr/bin/hdiutil detach "$volume" -quiet && break',
        "    done",
        "fi",
    ].join("\n");
    spawn("/bin/sh", ["-c", script, "sh", String(process.pid), volume ?? "", ...openArguments], {
        detached: true,
        stdio: "ignore",
    }).unref();
}

/** `/Applications` when this user can write it, else `~/Applications`. */
async function applicationsDirectory(): Promise<string | undefined> {
    if (await writable("/Applications")) return "/Applications";
    const personal = join(homedir(), "Applications");
    await mkdir(personal, { recursive: true }).catch(() => undefined);
    return (await writable(personal)) ? personal : undefined;
}

async function bundleInfo(bundle: string): Promise<BundleInfo> {
    const plist = join(bundle, "Contents", "Info.plist");
    const read = async (key: string) =>
        (await run("/usr/bin/plutil", ["-extract", key, "raw", "-o", "-", plist])).trim();
    return {
        identifier: await read("CFBundleIdentifier"),
        version: await read("CFBundleShortVersionString"),
    };
}

/** An unreadable version is never treated as older: the installed copy is kept. */
function versionNewer(candidate: string, current: string): boolean {
    try {
        return happyAgentVersionNewer(candidate, current);
    } catch {
        return false;
    }
}

/**
 * Where the disk image holding `path` is mounted, if `path` is on one. macOS
 * is the only source for this, and `hdiutil info` is how it says it.
 */
async function diskImageMountPoint(path: string): Promise<string | undefined> {
    const output = await run("/bin/sh", [
        "-c",
        "/usr/bin/hdiutil info -plist | /usr/bin/plutil -convert json -o - -",
    ]).catch(() => undefined);
    if (output === undefined) return undefined;
    const info: unknown = JSON.parse(output);
    const images =
        typeof info === "object" && info !== null && "images" in info && Array.isArray(info.images)
            ? info.images
            : [];
    for (const image of images) {
        const entities: unknown =
            typeof image === "object" && image !== null && "system-entities" in image
                ? image["system-entities"]
                : undefined;
        if (!Array.isArray(entities)) continue;
        for (const entity of entities) {
            const mountPoint: unknown =
                typeof entity === "object" && entity !== null && "mount-point" in entity
                    ? entity["mount-point"]
                    : undefined;
            if (typeof mountPoint === "string" && pathInside(path, mountPoint)) return mountPoint;
        }
    }
    return undefined;
}

type NativeFunction = ReturnType<LibraryHandle["func"]>;
let translocation:
    | {
          readonly urlCreate: NativeFunction;
          readonly urlPath: NativeFunction;
          readonly isTranslocated: NativeFunction;
          readonly originalCreate: NativeFunction;
          readonly release: NativeFunction;
      }
    | undefined;

/**
 * The path a translocated app was opened from, through Security.framework's
 * own record of it, or nothing when this launch is not translocated.
 */
function translocatedOriginal(path: string): string | undefined {
    try {
        if (translocation === undefined) {
            const cf = koffi.load(
                "/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation",
            );
            const security = koffi.load("/System/Library/Frameworks/Security.framework/Security");
            translocation = {
                urlCreate: cf.func(
                    "void *CFURLCreateFromFileSystemRepresentation(void *allocator, void *buffer, intptr_t length, bool isDirectory)",
                ),
                urlPath: cf.func(
                    "bool CFURLGetFileSystemRepresentation(void *url, bool resolveAgainstBase, void *buffer, intptr_t length)",
                ),
                isTranslocated: security.func(
                    "bool SecTranslocateIsTranslocatedURL(void *path, _Out_ bool *isTranslocated, void *error)",
                ),
                originalCreate: security.func(
                    "void *SecTranslocateCreateOriginalPathForURL(void *translocatedPath, void *error)",
                ),
                release: cf.func("void CFRelease(void *object)"),
            };
        }
        const api = translocation;
        const bytes = Buffer.from(path, "utf8");
        const url = api.urlCreate(null, bytes, bytes.length, true);
        if (!url) return undefined;
        try {
            const result = [false];
            if (!api.isTranslocated(url, result, null) || result[0] !== true) return undefined;
            const originalUrl = api.originalCreate(url, null);
            if (!originalUrl) return undefined;
            try {
                const buffer = Buffer.alloc(4096);
                if (!api.urlPath(originalUrl, true, buffer, buffer.length)) return undefined;
                return buffer.subarray(0, buffer.indexOf(0)).toString("utf8");
            } finally {
                api.release(originalUrl);
            }
        } finally {
            api.release(url);
        }
    } catch (error) {
        console.warn("Happy could not ask macOS where it was opened from.", error);
        return undefined;
    }
}

async function quarantined(path: string): Promise<boolean> {
    return run("/usr/bin/xattr", ["-p", "com.apple.quarantine", path]).then(
        () => true,
        () => false,
    );
}

function pathInside(path: string, directory: string): boolean {
    const parent = resolve(directory);
    return resolve(path).startsWith(parent.endsWith(sep) ? parent : parent + sep);
}

async function writable(path: string): Promise<boolean> {
    return access(path, constants.W_OK).then(
        () => true,
        () => false,
    );
}

async function exists(path: string): Promise<boolean> {
    return access(path).then(
        () => true,
        () => false,
    );
}

function run(command: string, arguments_: readonly string[]): Promise<string> {
    return new Promise((resolvePromise, reject) => {
        execFile(
            command,
            [...arguments_],
            { encoding: "utf8", maxBuffer: 4 * 1024 * 1024, timeout: 120_000 },
            (error, stdout, stderr) => {
                if (error) reject(Object.assign(error, { stderr }));
                else resolvePromise(stdout);
            },
        );
    });
}
