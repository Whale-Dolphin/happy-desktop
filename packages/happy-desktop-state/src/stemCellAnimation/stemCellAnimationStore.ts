/**
 * Whether new work's stem cell grows into its icon when the icon arrives, or
 * the icon simply replaces it; and the membrane seed Happy formed again from
 * after it last divided, so Happy keeps its shape across reloads.
 *
 * It is the window's own visual choice, like the experiments switch, so it is
 * kept by the host's storage rather than by any machine the window connects
 * to. It is on until the reader turns it off.
 *
 * The constructor opens nothing: it reads the host's record once, and writes
 * back only when the reader changes the setting.
 */
export interface StemCellAnimationDocument {
    /** Absent until the reader has chosen, so the default can still change. */
    readonly stemCellAnimationEnabled?: boolean;
    readonly happySeed?: number;
}

/** Where the choice is kept. Omitting it keeps the choice for this window's lifetime only. */
export interface StemCellAnimationPersistence {
    read(): StemCellAnimationDocument | undefined;
    write(document: StemCellAnimationDocument): void;
}

export interface StemCellAnimationSnapshot {
    /** On until the reader turns it off. */
    readonly stemCellAnimationEnabled: boolean;
    /** Happy's membrane seed after its last division; absent, its shape's own. */
    readonly happySeed?: number;
}

export interface StemCellAnimationStore {
    get(): StemCellAnimationSnapshot;
    subscribe(listener: () => void): () => void;
    stemCellAnimationUpdate(enabled: boolean): void;
    /** Happy divided and formed again from `seed`. */
    happySeedUpdate(seed: number): void;
}

/**
 * A stored record read back as this window's own value. Anything that is not
 * the field this version knows is no record at all, since a person can edit the
 * host's storage by hand.
 */
function documentParse(value: unknown): StemCellAnimationDocument {
    if (typeof value !== "object" || value === null) return {};
    const record = value as { stemCellAnimationEnabled?: unknown; happySeed?: unknown };
    const enabled = record.stemCellAnimationEnabled;
    const seed = record.happySeed;
    return {
        ...(typeof enabled === "boolean" ? { stemCellAnimationEnabled: enabled } : {}),
        ...(typeof seed === "number" && Number.isFinite(seed) ? { happySeed: seed } : {}),
    };
}

const ENABLED: StemCellAnimationSnapshot = { stemCellAnimationEnabled: true };

/** Creates the window-lifetime store, hydrated from the host's storage when it has one. */
export function stemCellAnimationStoreCreate(
    persistence?: StemCellAnimationPersistence,
): StemCellAnimationStore {
    let stored: StemCellAnimationDocument = (() => {
        try {
            return documentParse(persistence?.read());
        } catch {
            // Storage the host refused is a window with no record.
            return {};
        }
    })();
    let snapshot: StemCellAnimationSnapshot = {
        stemCellAnimationEnabled: stored.stemCellAnimationEnabled ?? true,
        ...(stored.happySeed !== undefined ? { happySeed: stored.happySeed } : {}),
    };
    const listeners = new Set<() => void>();
    const store = (document: StemCellAnimationDocument) => {
        stored = document;
        try {
            persistence?.write(document);
        } catch {
            // Storage the host refused still keeps this window's value for as
            // long as it stays open.
        }
        for (const listener of listeners) listener();
    };

    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        stemCellAnimationUpdate(enabled) {
            if (snapshot.stemCellAnimationEnabled === enabled) return;
            snapshot = { ...snapshot, stemCellAnimationEnabled: enabled };
            store({ ...stored, stemCellAnimationEnabled: enabled });
        },
        happySeedUpdate(seed) {
            if (snapshot.happySeed === seed) return;
            snapshot = { ...snapshot, happySeed: seed };
            store({ ...stored, happySeed: seed });
        },
    };
}

/** The store a host that remembers nothing stands in: animated, never changing. */
export const stemCellAnimationStoreNoop: StemCellAnimationStore = {
    get: () => ENABLED,
    stemCellAnimationUpdate: () => {},
    happySeedUpdate: () => {},
    subscribe: () => () => {},
};
