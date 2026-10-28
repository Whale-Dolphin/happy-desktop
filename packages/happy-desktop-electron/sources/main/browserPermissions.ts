import { randomUUID } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Session, WebContents } from "electron";

const labels = {
    "clipboard-read": "read the clipboard",
    "display-capture": "share the screen",
    geolocation: "use your location",
    microphone: "use the microphone",
    camera: "use the camera",
    midi: "use MIDI devices",
    notifications: "show notifications",
    pointerLock: "capture the pointer",
} as const;
type Permission = keyof typeof labels;
type Scope = { origin: string; embeddingOrigin: string };
type Decision = Scope & { permission: Permission; allowed: boolean };

function originOf(value: string | undefined): string | undefined {
    try {
        const url = new URL(value ?? "");
        return url.protocol === "https:" || url.protocol === "http:" ? url.origin : undefined;
    } catch {
        return undefined;
    }
}

function keyOf(scope: Scope, permission: Permission): string {
    return JSON.stringify([scope.origin, scope.embeddingOrigin, permission]);
}

function permissionOf(value: string): Permission | undefined {
    return Object.hasOwn(labels, value) ? (value as Permission) : undefined;
}

/** One file inside the Chromium profile; profiles never share site decisions. */
export class BrowserPermissionStore {
    private readonly decisions = new Map<string, Decision>();
    private operation = Promise.resolve();

    private constructor(private readonly path: string | undefined) {}

    static async open(storagePath: string | null): Promise<BrowserPermissionStore> {
        const store = new BrowserPermissionStore(
            storagePath ? join(storagePath, "happy-website-permissions.json") : undefined,
        );
        if (!store.path) return store;
        let raw: unknown;
        try {
            raw = JSON.parse(await readFile(store.path, "utf8"));
        } catch (error) {
            if (error instanceof SyntaxError || (error as NodeJS.ErrnoException).code === "ENOENT")
                return store;
            throw error;
        }
        if (!Array.isArray(raw)) return store;
        for (const item of raw) {
            if (
                typeof item !== "object" ||
                item === null ||
                typeof item.origin !== "string" ||
                originOf(item.origin) !== item.origin ||
                typeof item.embeddingOrigin !== "string" ||
                originOf(item.embeddingOrigin) !== item.embeddingOrigin ||
                typeof item.permission !== "string" ||
                !permissionOf(item.permission) ||
                item.permission === "display-capture" ||
                typeof item.allowed !== "boolean"
            )
                continue;
            const decision: Decision = {
                origin: item.origin,
                embeddingOrigin: item.embeddingOrigin,
                permission: permissionOf(item.permission)!,
                allowed: item.allowed,
            };
            store.decisions.set(keyOf(decision, decision.permission), decision);
        }
        return store;
    }

    get(scope: Scope, permission: Permission): boolean | undefined {
        return this.decisions.get(keyOf(scope, permission))?.allowed;
    }

    save(scope: Scope, permissions: readonly Permission[], allowed: boolean): Promise<void> {
        const save = async () => {
            const next = new Map(this.decisions);
            for (const permission of permissions)
                next.set(keyOf(scope, permission), { ...scope, permission, allowed });
            if (this.path) {
                const temporary = `${this.path}.${randomUUID()}.tmp`;
                try {
                    await writeFile(temporary, JSON.stringify([...next.values()]), { mode: 0o600 });
                    await rename(temporary, this.path);
                } finally {
                    await unlink(temporary).catch(() => undefined);
                }
            }
            this.decisions.clear();
            for (const [key, value] of next) this.decisions.set(key, value);
        };
        const operation = this.operation.then(save);
        this.operation = operation.catch(() => undefined);
        return operation;
    }
}

type RequestHandler = NonNullable<Parameters<Session["setPermissionRequestHandler"]>[0]>;
type CheckHandler = NonNullable<Parameters<Session["setPermissionCheckHandler"]>[0]>;
export type BrowserPermissionPrompt = (input: {
    contents: WebContents | null;
    origin: string;
    embeddingOrigin: string;
    description: string;
    remember: boolean;
}) => Promise<boolean>;

/** Install both Electron boundaries. Checks never prompt or invent a grant. */
export async function browserPermissionsInstall(
    session: Pick<
        Session,
        "storagePath" | "setPermissionRequestHandler" | "setPermissionCheckHandler"
    >,
    prompt: BrowserPermissionPrompt,
    report: (error: unknown) => void,
): Promise<void> {
    const store = await BrowserPermissionStore.open(session.storagePath);
    // Serialize overlapping media requests in the same origin pair, rechecking
    // saved decisions after the first answer. Unrelated sites remain independent.
    const pending = new Map<string, Promise<void>>();
    const request: RequestHandler = (contents, permission, callback, details) => {
        const origin = originOf(details.requestingUrl);
        const embeddingOrigin = details.isMainFrame
            ? origin
            : contents === null
              ? origin
              : originOf(!contents.isDestroyed() ? contents.getURL() : undefined);
        const mediaTypes = "mediaTypes" in details ? details.mediaTypes : undefined;
        const permissions: Permission[] =
            permission === "media"
                ? (mediaTypes ?? []).map((type) => (type === "audio" ? "microphone" : "camera"))
                : permissionOf(permission)
                  ? [permissionOf(permission)!]
                  : [];
        if (!origin || !embeddingOrigin || permissions.length === 0) {
            callback(false);
            return;
        }
        const scope = { origin, embeddingOrigin };
        const key = JSON.stringify([origin, embeddingOrigin]);
        const resolve = async () => {
            if (permissions.some((item) => store.get(scope, item) === false)) return false;
            const missing = permissions.filter((item) => store.get(scope, item) === undefined);
            if (missing.length === 0) return true;
            // A closed guest no longer has a person asking for access.
            if (contents?.isDestroyed()) return false;
            const allowed = await prompt({
                contents,
                ...scope,
                description: missing.map((item) => labels[item]).join(" and "),
                remember: permission !== "display-capture",
            });
            // Screen capture keeps its per-use consent, as in a normal browser.
            if (permission !== "display-capture") await store.save(scope, missing, allowed);
            return allowed;
        };
        const result = (pending.get(key) ?? Promise.resolve()).then(resolve);
        const completion = result.then(
            (allowed) => callback(allowed),
            (error: unknown) => {
                report(error);
                callback(false);
            },
        );
        pending.set(key, completion);
        void completion.finally(() => {
            if (pending.get(key) === completion) pending.delete(key);
        });
    };
    const check: CheckHandler = (contents, permission, requestingOrigin, details) => {
        const origin = originOf(
            permission === "media"
                ? (details.securityOrigin ?? requestingOrigin)
                : requestingOrigin,
        );
        const embeddingOrigin =
            details.embeddingOrigin === undefined
                ? ((details.isMainFrame
                      ? origin
                      : originOf(
                            contents && !contents.isDestroyed() ? contents.getURL() : undefined,
                        )) ??
                  (contents === null && details.requestingUrl === undefined ? origin : undefined))
                : originOf(details.embeddingOrigin);
        const item =
            permission === "media"
                ? details.mediaType === "audio"
                    ? "microphone"
                    : details.mediaType === "video"
                      ? "camera"
                      : undefined
                : permissionOf(permission);
        return (
            !!origin &&
            !!embeddingOrigin &&
            !!item &&
            item !== "display-capture" &&
            store.get({ origin, embeddingOrigin }, item) === true
        );
    };
    session.setPermissionCheckHandler(check);
    session.setPermissionRequestHandler(request);
}
