import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Session, WebContents } from "electron";
import { afterEach, expect, it, vi } from "vitest";
import { browserPermissionsInstall, type BrowserPermissionPrompt } from "./browserPermissions";

type Request = NonNullable<Parameters<Session["setPermissionRequestHandler"]>[0]>;
type Check = NonNullable<Parameters<Session["setPermissionCheckHandler"]>[0]>;
const directories: string[] = [];
afterEach(async () => {
    await Promise.all(
        directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
    );
});

async function profile() {
    const path = await mkdtemp(join(tmpdir(), "happy-permissions-"));
    directories.push(path);
    return path;
}

async function fixture(path: string | null, prompt: BrowserPermissionPrompt = async () => true) {
    let request!: Request;
    let check!: Check;
    const ask = vi.fn(prompt);
    const report = vi.fn();
    await browserPermissionsInstall(
        {
            storagePath: path,
            setPermissionRequestHandler: (handler) => {
                request = handler!;
            },
            setPermissionCheckHandler: (handler) => {
                check = handler!;
            },
        },
        ask,
        report,
    );
    const contents = (url: string) =>
        ({ getURL: () => url, isDestroyed: () => false }) as unknown as WebContents;
    return {
        ask,
        report,
        request: (
            url: string,
            permission: Parameters<Request>[1] = "geolocation",
            top = url,
            mediaTypes?: ("audio" | "video")[],
        ) =>
            new Promise<boolean>((resolve) =>
                request(contents(top), permission, resolve, {
                    requestingUrl: url,
                    isMainFrame: url === top,
                    ...(mediaTypes ? { mediaTypes } : {}),
                }),
            ),
        check: (
            origin: string,
            permission: Parameters<Check>[1] = "geolocation",
            embeddingOrigin = origin,
            mediaType?: "audio" | "video" | "unknown",
        ) =>
            check(contents(embeddingOrigin), permission, origin, {
                isMainFrame: origin === embeddingOrigin,
                embeddingOrigin,
                ...(mediaType ? { mediaType, securityOrigin: origin } : {}),
            }),
        workerCheck: (origin: string) =>
            check(null, "notifications", origin, { isMainFrame: false }),
    };
}

it.each([false, true])(
    "remembers %s after reopening the profile and answers checks without prompting",
    async (allowed) => {
        const path = await profile();
        const first = await fixture(path, async () => allowed);
        expect(first.check("https://x.com")).toBe(false);
        expect(await first.request("https://x.com/home")).toBe(allowed);
        expect(await first.request("https://x.com/notifications")).toBe(allowed);
        expect(first.ask).toHaveBeenCalledTimes(1);
        const reopened = await fixture(path);
        expect(reopened.check("https://x.com")).toBe(allowed);
        expect(await reopened.request("https://x.com/home")).toBe(allowed);
        expect(reopened.ask).not.toHaveBeenCalled();
        expect(
            JSON.parse(await readFile(join(path, "happy-website-permissions.json"), "utf8")),
        ).toEqual([
            {
                origin: "https://x.com",
                embeddingOrigin: "https://x.com",
                permission: "geolocation",
                allowed,
            },
        ]);
    },
);

it("isolates scheme, port, requesting frame, embedding origin and browser profile", async () => {
    const f = await fixture(await profile());
    await f.request("https://site.example/page");
    expect(f.check("http://site.example")).toBe(false);
    expect(f.check("https://site.example:444")).toBe(false);
    expect(f.check("https://other.example")).toBe(false);
    expect(f.check("https://site.example", "geolocation", "https://embed.example")).toBe(false);
    await f.request("https://frame.example/page", "geolocation", "https://embed.example/");
    expect(f.ask).toHaveBeenLastCalledWith(
        expect.objectContaining({
            origin: "https://frame.example",
            embeddingOrigin: "https://embed.example",
        }),
    );
    expect(f.check("https://frame.example", "geolocation", "https://embed.example")).toBe(true);
    expect(f.check("https://frame.example")).toBe(false);
    expect(f.check("https://frame.example", "geolocation", "https://different.example")).toBe(
        false,
    );
    expect((await fixture(await profile())).check("https://site.example")).toBe(false);
});

it("coalesces simultaneous requests into one prompt", async () => {
    let answer!: (allowed: boolean) => void;
    const f = await fixture(
        await profile(),
        () =>
            new Promise((resolve) => {
                answer = resolve;
            }),
    );
    const results = Array.from({ length: 12 }, () => f.request("https://x.com/home"));
    await vi.waitFor(() => expect(f.ask).toHaveBeenCalledTimes(1));
    answer(false);
    expect(await Promise.all(results)).toEqual(Array(12).fill(false));
    expect(f.ask).toHaveBeenCalledTimes(1);
});

it("keeps screen sharing consent per use", async () => {
    const f = await fixture(await profile());
    expect(await f.request("https://meet.example", "display-capture")).toBe(true);
    expect(await f.request("https://meet.example", "display-capture")).toBe(true);
    expect(f.check("https://meet.example", "display-capture")).toBe(false);
    expect(f.ask).toHaveBeenCalledTimes(2);
});

it("keeps microphone and camera decisions separate, including overlapping requests", async () => {
    const f = await fixture(await profile());
    expect(await f.request("https://meet.example/", "media", undefined, ["audio"])).toBe(true);
    expect(f.check("https://meet.example", "media", undefined, "audio")).toBe(true);
    expect(f.check("https://meet.example", "media", undefined, "video")).toBe(false);
    expect(f.check("https://meet.example", "media", undefined, "unknown")).toBe(false);
    expect(await f.request("https://meet.example/", "media", undefined, ["audio", "video"])).toBe(
        true,
    );
    expect(f.ask).toHaveBeenLastCalledWith(
        expect.objectContaining({ description: "use the camera" }),
    );
    expect(f.ask).toHaveBeenCalledTimes(2);
    const reopened = await fixture(await profile(), async () => false);
    expect(await reopened.request("https://meet.example/", "media", undefined, ["video"])).toBe(
        false,
    );
    expect(reopened.check("https://meet.example", "media", undefined, "audio")).toBe(false);
});

it("fails closed for unknown permissions, missing media types, opaque origins and corrupt persistence", async () => {
    const path = await profile();
    await writeFile(join(path, "happy-website-permissions.json"), "{broken");
    const f = await fixture(path);
    for (const url of ["data:text/html,test", "file:///tmp/example", "about:blank", "not a url"])
        expect(await f.request(url)).toBe(false);
    expect(await f.request("https://site.example", "unknown")).toBe(false);
    expect(await f.request("https://site.example", "media")).toBe(false);
    expect(f.check("https://site.example", "unknown")).toBe(false);
    expect(f.ask).not.toHaveBeenCalled();
    expect(f.workerCheck("https://site.example")).toBe(false);
    expect(await f.request("https://site.example", "notifications")).toBe(true);
    expect(f.workerCheck("https://site.example")).toBe(true);
});

it("does not grant on prompt or persistence failure and permits a later retry", async () => {
    const path = await profile();
    const f = await fixture(
        path,
        vi.fn().mockRejectedValueOnce(new Error("dialog failed")).mockResolvedValue(true),
    );
    expect(await f.request("https://site.example")).toBe(false);
    expect(f.report).toHaveBeenCalledTimes(1);
    expect(await f.request("https://site.example")).toBe(true);
    const missing = await profile();
    const broken = await fixture(missing);
    await rm(missing, { recursive: true });
    expect(await broken.request("https://site.example")).toBe(false);
    expect(broken.check("https://site.example")).toBe(false);
    expect(broken.report).toHaveBeenCalledTimes(1);
});
