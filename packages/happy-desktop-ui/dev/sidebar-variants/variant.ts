/**
 * The variant knobs, read from and written to the URL hash so a screenshot
 * names exactly what it shows, e.g. `#lines=2&hover=hide&hairlines=inset`.
 */
export const KNOBS = {
    lines: ["3", "2"],
    hover: ["none", "highlight", "hide"],
    hairlines: ["none", "full", "inset"],
    icon: ["bare", "disc"],
    dot: ["neutral", "state"],
    align: ["telegram", "baseline"],
    theme: ["light", "dark"],
} as const;

export type KnobName = keyof typeof KNOBS;
export type Variant = { [K in KnobName]: (typeof KNOBS)[K][number] } & {
    /** The selected row. */
    sel: string;
    /** "0" hides the floating panel, for screenshots. */
    panel: "0" | "1";
};

export const DEFAULT_VARIANT: Variant = {
    lines: "3",
    hover: "highlight",
    hairlines: "inset",
    icon: "disc",
    dot: "neutral",
    align: "telegram",
    theme: "dark",
    sel: "kmvrjzhv700vai7e81aysxue",
    panel: "1",
};

function knobValue<K extends KnobName>(name: K, value: string | null): Variant[K] | undefined {
    return (KNOBS[name] as readonly string[]).includes(value ?? "")
        ? (value as Variant[K])
        : undefined;
}

let cachedHash: string | undefined;
let cached: Variant = DEFAULT_VARIANT;

export function variantRead(): Variant {
    const hash = window.location.hash;
    if (hash === cachedHash) return cached;
    const params = new URLSearchParams(hash.replace(/^#/u, ""));
    const next: Variant = { ...DEFAULT_VARIANT };
    for (const name of Object.keys(KNOBS) as KnobName[]) {
        const value = knobValue(name, params.get(name));
        if (value !== undefined) (next as Record<KnobName, string>)[name] = value;
    }
    next.sel = params.get("sel") ?? DEFAULT_VARIANT.sel;
    next.panel = params.get("panel") === "0" ? "0" : "1";
    cachedHash = hash;
    cached = next;
    return next;
}

export function variantWrite(next: Variant): void {
    const params = new URLSearchParams();
    for (const name of Object.keys(KNOBS) as KnobName[]) params.set(name, next[name]);
    params.set("sel", next.sel);
    if (next.panel === "0") params.set("panel", "0");
    window.history.replaceState(null, "", `#${params.toString()}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
}

export function variantSubscribe(notify: () => void): () => void {
    window.addEventListener("hashchange", notify);
    return () => window.removeEventListener("hashchange", notify);
}
