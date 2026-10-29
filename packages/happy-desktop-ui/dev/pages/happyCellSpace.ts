import type { HappyCellShape } from "../../src/happyCellGeometry";

/**
 * An endless plane of Happy designs. Every number of the shape is its own
 * smooth noise field over the plane, each turned and offset differently and
 * equalised so every value is equally common: neighbours are close relatives,
 * and far-away cells reach every combination.
 */
type Key = keyof HappyCellShape;

interface Axis {
    readonly key: Key;
    readonly min: number;
    readonly max: number;
    /** How far it wanders from the centre at exploration 1. */
    readonly half: number;
    readonly whole?: boolean;
}

const AXES: readonly Axis[] = [
    { key: "elongation", min: 0.9, max: 1.9, half: 0.11 },
    { key: "spread", min: 0.3, max: 1.1, half: 0.1 },
    { key: "asymmetry", min: 0, max: 1, half: 0.21 },
    { key: "bumps", min: 0, max: 0.14, half: 0.033 },
    { key: "waist", min: 0.1, max: 0.7, half: 0.08 },
    { key: "lean", min: 0, max: 0.4, half: 0.15 },
    { key: "coreSize", min: 0.15, max: 0.4, half: 0.05 },
    { key: "coreAspect", min: 0.9, max: 2, half: 0.22 },
    { key: "coreTilt", min: 0, max: 1, half: 0.24 },
    { key: "coreLift", min: 0, max: 0.4, half: 0.1 },
    { key: "direction", min: -1, max: 1, half: 1 },
    { key: "tilt", min: -0.35, max: 0.35, half: 0.22 },
    { key: "seed", min: 1, max: 99, half: 20, whole: true },
];

function random(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function erf(x: number): number {
    const sign = Math.sign(x);
    const v = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * v);
    const y =
        1 -
        ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
            0.254829592) *
            t *
            Math.exp(-v * v);
    return sign * y;
}

/** Folds a value back into its range, so a wander past an end turns back. */
function reflect(value: number, min: number, max: number): number {
    const width = max - min;
    let t = (value - min) % (2 * width);
    if (t < 0) t += 2 * width;
    return min + (t > width ? 2 * width - t : t);
}

const GRADIENTS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [Math.SQRT1_2, Math.SQRT1_2],
    [-Math.SQRT1_2, Math.SQRT1_2],
    [Math.SQRT1_2, -Math.SQRT1_2],
    [-Math.SQRT1_2, -Math.SQRT1_2],
] as const;

/** How fast designs change from one cell of the plane to the next. */
const FREQUENCY = 0.14;

export interface HappyCellSpace {
    /** The design at cell (i, j) of the plane, wandering `amount` around `centre`. */
    at(i: number, j: number, centre: HappyCellShape, amount: number): HappyCellShape;
}

/** One plane per seed: the same seed is the same plane. */
export function happyCellSpace(seed: number): HappyCellSpace {
    const rand = random(seed);
    const order = [...Array(256).keys()];
    for (let i = 255; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [order[i], order[j]] = [order[j]!, order[i]!];
    }
    const perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) perm[i] = order[i & 255]!;
    const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
    const dot = (hash: number, x: number, y: number) => {
        const [gx, gy] = GRADIENTS[hash & 7]!;
        return gx * x + gy * y;
    };
    const noise = (x: number, y: number) => {
        const xi = Math.floor(x);
        const yi = Math.floor(y);
        const xf = x - xi;
        const yf = y - yi;
        const u = fade(xf);
        const v = fade(yf);
        const X = xi & 255;
        const Y = yi & 255;
        const aa = perm[X + perm[Y]!]!;
        const ab = perm[X + perm[Y + 1]!]!;
        const ba = perm[X + 1 + perm[Y]!]!;
        const bb = perm[X + 1 + perm[Y + 1]!]!;
        const top = dot(aa, xf, yf) + u * (dot(ba, xf - 1, yf) - dot(aa, xf, yf));
        const bottom = dot(ab, xf, yf - 1) + u * (dot(bb, xf - 1, yf - 1) - dot(ab, xf, yf - 1));
        return top + v * (bottom - top);
    };
    const fields = AXES.map((_, k) => ({
        angle: k * 2.399963 + rand() * 0.5,
        ox: rand() * 1000,
        oy: rand() * 1000,
        frequency: FREQUENCY * (0.8 + 0.4 * rand()),
    }));
    const raw = (k: number, i: number, j: number) => {
        const field = fields[k]!;
        const cos = Math.cos(field.angle);
        const sin = Math.sin(field.angle);
        const x = (i * cos - j * sin) * field.frequency + field.ox;
        const y = (i * sin + j * cos) * field.frequency + field.oy;
        return noise(x, y) + 0.5 * noise(2 * x + 17.3, 2 * y - 9.1);
    };
    let sum = 0;
    for (let n = 0; n < 4000; n++) sum += raw(0, rand() * 400, rand() * 400) ** 2;
    const spread = Math.sqrt(sum / 4000);
    // Equalised: the noise's bell curve mapped to an even 0–1.
    const even = (k: number, i: number, j: number) =>
        0.5 * (1 + erf(raw(k, i, j) / (spread * Math.SQRT2)));
    return {
        at(i, j, centre, amount) {
            const shape = { ...centre };
            AXES.forEach((axis, k) => {
                const value = reflect(
                    centre[axis.key] + (even(k, i, j) - 0.5) * 2 * axis.half * amount,
                    axis.min,
                    axis.max,
                );
                shape[axis.key] = axis.whole ? Math.max(1, Math.round(value)) : value;
            });
            return shape;
        },
    };
}
