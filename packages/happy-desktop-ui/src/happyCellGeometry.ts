import {
    fieldContours,
    lobeField,
    lobeReach,
    loopResample,
    loopsPath,
    profileSampled,
    smoothUnion,
    type CellField,
    type CellLobe,
    type CellProfile,
} from "./cellField";
import type { Point } from "./stemCellGeometry";

/** Happy at rest: one cell just starting to pull apart into two. */
export const HAPPY_CELL_REST = 0.18;

type Pair<T> = readonly [T, T];

/**
 * How Happy is drawn: two bumpy oval lobes, the right one a little smaller,
 * leaning apart and joined by a soft waist, each with an oval core. Lengths
 * are in lobe units: the left lobe is 1 wide.
 */
export interface HappyCellShape {
    /** Each lobe's height over its width. */
    readonly elongation: number;
    /** How far each lobe's centre sits from the middle. */
    readonly spread: number;
    /** How much smaller, lower and more turned the right lobe is, 0–1. */
    readonly asymmetry: number;
    /** How far the membrane bulges in and out, as a share of its radius. */
    readonly bumps: number;
    /** The fillet at the waist. */
    readonly waist: number;
    /** How far the lobes lean apart at the top, in radians. */
    readonly lean: number;
    /** A core's long radius, as a share of its lobe's height. */
    readonly coreSize: number;
    /** A core's length over its width. */
    readonly coreAspect: number;
    /** How far the cores turn and move off centre, 0–1. */
    readonly coreTilt: number;
    /** How far the cores sit above their lobes' centres, as a share of height. */
    readonly coreLift: number;
    /** Which way the cell and its cores lean: −1 left, 1 right, 0 level. */
    readonly direction: number;
    /** The whole cell's turn, in radians. */
    readonly tilt: number;
    /** The membrane's bumps: one seed, one outline. */
    readonly seed: number;
}

/** Happy's shape, chosen in the explorer. */
export const HAPPY_CELL_SHAPE: HappyCellShape = {
    elongation: 1.2788,
    spread: 0.3966,
    asymmetry: 0.367,
    bumps: 0.0296,
    waist: 0.2989,
    lean: 0.183,
    coreSize: 0.3071,
    coreAspect: 1.6673,
    coreTilt: 0.2904,
    coreLift: 0,
    direction: 1,
    tilt: 0,
    seed: 74,
};

/** The seed Happy forms again from after it divides: each division, a new membrane. */
export function happyCellNextSeed(seed: number): number {
    return ((Math.round(seed) * 37 + 11) % 99) + 1;
}

const seededShapes = new WeakMap<HappyCellShape, Map<number, HappyCellShape>>();
const seededFrom = new WeakMap<HappyCellShape, HappyCellShape>();

/**
 * `shape` with membrane seed `seed`: one object per shape and seed however
 * it is reached, so drawing it again finds its outlines already traced.
 */
export function happyCellSeeded(shape: HappyCellShape, seed: number): HappyCellShape {
    const origin = seededFrom.get(shape) ?? shape;
    if (origin.seed === seed) return origin;
    let bySeed = seededShapes.get(origin);
    if (!bySeed) seededShapes.set(origin, (bySeed = new Map()));
    let seeded = bySeed.get(seed);
    if (!seeded) {
        seeded = { ...origin, seed };
        bySeed.set(seed, seeded);
        seededFrom.set(seeded, origin);
    }
    return seeded;
}

/**
 * A lobe's outline: three, five and two bulges whose phases come from the
 * seed, so one seed is one membrane. The right lobe is shifted along, so the
 * two halves never match.
 */
function membraneProfile(bumps: number, seed: number, shift: number, drift: number): CellProfile {
    const p1 = 0.6 + seed + shift * 2.2 + drift;
    const p2 = 1.9 + seed * 0.7 + shift * 1.4 - drift;
    const p3 = 0.3 + seed * 0.4 + shift * 0.9 + drift * 0.5;
    return profileSampled(
        (theta) =>
            1 +
            bumps * (0.65 * Math.cos(3 * theta + p1) + 0.35 * Math.cos(5 * theta + p2)) +
            bumps * 0.5 * Math.cos(2 * theta + p3),
    );
}

const round: CellProfile = () => 1;

/** An oval `width` by `height` radii, turned by `tilt`, with this outline. */
function oval(
    x: number,
    y: number,
    width: number,
    height: number,
    tilt: number,
    profile: CellProfile,
): CellLobe {
    return {
        x,
        y,
        size: Math.sqrt(width * height),
        stretch: height / width,
        tilt,
        from: profile,
        to: profile,
        blend: 1,
    };
}

/** The same outline seen in a mirror, left for right. */
function mirrored(profile: CellProfile): CellProfile {
    return (theta) => profile(Math.PI - theta);
}

interface Form {
    readonly lobes: Pair<CellLobe>;
    readonly cores: Pair<CellLobe>;
}

/** Happy at rest, in lobe units. */
function restForm(shape: HappyCellShape, drift: number): Form {
    const { elongation: e, asymmetry: a, coreTilt: t, coreLift: lift, direction: dir } = shape;
    const right = 1 - 0.22 * a;
    const left = oval(
        -shape.spread,
        -0.07 * a * e * dir,
        1,
        e,
        -shape.lean - 0.05 * a * dir,
        membraneProfile(shape.bumps, shape.seed, 0, drift),
    );
    // The right lobe is drawn as a mirror image, so it leans the other way.
    const rightLobe = oval(
        shape.spread * (1 - 0.12 * a),
        0.12 * a * e * dir,
        right,
        e * (1 - 0.12 * a),
        shape.lean + 0.09 * a * dir,
        mirrored(membraneProfile(shape.bumps, shape.seed, a, drift)),
    );
    const core = shape.coreSize * e;
    const smaller = core * (1 - 0.18 * a);
    return {
        lobes: [left, rightLobe],
        cores: [
            oval(
                left.x - 0.06 - 0.1 * t,
                left.y - lift * e - 0.16 * e * t * dir,
                core / shape.coreAspect,
                core,
                0.45 * t * dir,
                round,
            ),
            oval(
                rightLobe.x + 0.06 * right + 0.04 * t,
                rightLobe.y - lift * e * (1 - 0.12 * a) + 0.14 * e * t * dir,
                smaller / shape.coreAspect,
                smaller,
                -0.3 * t * dir,
                round,
            ),
        ],
    };
}

/** How much longer a single cell's core is than Happy's left one: their areas add up. */
function wholeCore(shape: HappyCellShape): number {
    return Math.sqrt(1 + (1 - 0.18 * shape.asymmetry) ** 2);
}

/**
 * Happy before it starts to divide: one cell, its core as big as both of
 * Happy's together, as every single cell's is.
 */
function wholeForm(shape: HappyCellShape, drift: number): Form {
    const { elongation: e, coreTilt: t, coreLift: lift, direction: dir } = shape;
    const height = 1.05 * (1 + (e - 1) * 0.5);
    const lobe = oval(
        0,
        0,
        1.05,
        height,
        -0.1 * t * dir,
        membraneProfile(Math.max(shape.bumps, 0.05), shape.seed, 0, drift),
    );
    const core = shape.coreSize * e * wholeCore(shape);
    const nucleus = oval(
        -0.08 * dir - 0.06 * t * dir,
        -lift * height - 0.08 * height * t,
        core / shape.coreAspect,
        core,
        0.4 * t * dir,
        round,
    );
    return { lobes: [lobe, lobe], cores: [nucleus, nucleus] };
}

/**
 * The fillet in field units. A lobe's field here is scaled by its mean
 * radius rather than its narrower one, so the same waist takes a wider one.
 */
function joinOf(shape: HappyCellShape): number {
    return shape.waist * Math.sqrt(shape.elongation);
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Part of the way from one lobe to another: its numbers in between, its outline blended. */
function between(from: CellLobe, to: CellLobe, t: number): CellLobe {
    return {
        x: mix(from.x, to.x, t),
        y: mix(from.y, to.y, t),
        size: mix(from.size, to.size, t),
        stretch: mix(from.stretch ?? 1, to.stretch ?? 1, t),
        tilt: mix(from.tilt ?? 0, to.tilt ?? 0, t),
        from: from.to,
        to: to.to,
        blend: t,
    };
}

/** Turned by `angle` about the origin. */
function turned(lobe: CellLobe, angle: number): CellLobe {
    if (!angle) return lobe;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
        ...lobe,
        x: lobe.x * cos - lobe.y * sin,
        y: lobe.x * sin + lobe.y * cos,
        tilt: (lobe.tilt ?? 0) - angle,
    };
}

/**
 * The pose in lobe units, `divide` of the way from one cell (0) through Happy
 * at rest to two separate cells (1).
 */
function poseInLobeUnits(shape: HappyCellShape, divide: number, drift: number): HappyCellPose {
    const d = Math.min(Math.max(divide, 0), 1);
    const rest = restForm(shape, drift);
    const join = joinOf(shape);
    let pose: HappyCellPose;
    if (d <= HAPPY_CELL_REST) {
        const whole = wholeForm(shape, drift);
        const t = d / HAPPY_CELL_REST;
        pose = {
            lobes: [
                between(whole.lobes[0], rest.lobes[0], t),
                between(whole.lobes[1], rest.lobes[1], t),
            ],
            // No fillet between two copies of one cell, or it would swell.
            join: join * t,
            cores: [
                between(whole.cores[0], rest.cores[0], t),
                between(whole.cores[1], rest.cores[1], t),
            ],
            coreJoin: 0,
        };
    } else {
        // Past rest the halves move apart and shrink to fit the mark, the
        // waist lets go, and each core grows to a single cell's.
        const t = (d - HAPPY_CELL_REST) / (1 - HAPPY_CELL_REST);
        const fit = 1 / (1 + 0.75 * t);
        const apart = (lobe: CellLobe, side: number): CellLobe => ({
            ...lobe,
            x: (lobe.x + side * 0.7 * t) * fit,
            y: lobe.y * fit,
            size: lobe.size * fit,
        });
        const grow = mix(1, wholeCore(shape), t);
        const core = (lobe: CellLobe, side: number): CellLobe => {
            const moved = apart(lobe, side);
            return { ...moved, size: moved.size * grow };
        };
        pose = {
            lobes: [apart(rest.lobes[0], -1), apart(rest.lobes[1], 1)],
            join: join * fit * (1 - t) ** 2,
            cores: [core(rest.cores[0], -1), core(rest.cores[1], 1)],
            coreJoin: 0,
        };
    }
    return {
        ...pose,
        lobes: [turned(pose.lobes[0], shape.tilt), turned(pose.lobes[1], shape.tilt)],
        cores: [turned(pose.cores[0], shape.tilt), turned(pose.cores[1], shape.tilt)],
    };
}

/**
 * Happy, `divide` of the way from one cell (0) to two separate cells (1), in
 * the unit box: two lobes, each with its core, joined by a smooth union.
 */
export interface HappyCellPose {
    readonly lobes: Pair<CellLobe>;
    /** The union's fillet between the halves. */
    readonly join: number;
    readonly cores: Pair<CellLobe>;
    readonly coreJoin: number;
}

export function lobePairField(lobes: readonly CellLobe[], join: number): CellField {
    const [a, b] = lobes.map(lobeField) as [CellField, CellField];
    return (x, y) => smoothUnion(a(x, y), b(x, y), join);
}

/** The box the lobes can reach, padded by `pad`. */
export function lobesBox(lobes: readonly CellLobe[], pad: number) {
    return {
        x0: Math.min(...lobes.map((l) => l.x - lobeReach(l))) - pad,
        y0: Math.min(...lobes.map((l) => l.y - lobeReach(l))) - pad,
        x1: Math.max(...lobes.map((l) => l.x + lobeReach(l))) + pad,
        y1: Math.max(...lobes.map((l) => l.y + lobeReach(l))) + pad,
    };
}

interface Fitting {
    readonly scale: number;
    readonly cx: number;
    readonly cy: number;
}

/**
 * Lobe units to the unit box, from Happy at rest: the box around each lobe's
 * oval, widened for its bumps, fills 86% of the mark.
 */
const fittings = new WeakMap<HappyCellShape, Fitting>();
function fittingOf(shape: HappyCellShape): Fitting {
    const cached = fittings.get(shape);
    if (cached) return cached;
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const lobe of restForm(shape, 0).lobes) {
        const root = Math.sqrt(lobe.stretch ?? 1);
        const [width, height] = [lobe.size / root, lobe.size * root];
        const [cos, sin] = [Math.cos(lobe.tilt ?? 0), Math.sin(lobe.tilt ?? 0)];
        const grow = 1 + 1.6 * shape.bumps;
        const ex = Math.hypot(width * cos, height * sin) * grow;
        const ey = Math.hypot(width * sin, height * cos) * grow;
        [x0, x1] = [Math.min(x0, lobe.x - ex), Math.max(x1, lobe.x + ex)];
        [y0, y1] = [Math.min(y0, lobe.y - ey), Math.max(y1, lobe.y + ey)];
    }
    const made = {
        scale: 0.86 / Math.max(x1 - x0, y1 - y0) / (1 + 0.4 * Math.abs(shape.tilt)),
        cx: (x0 + x1) / 2,
        cy: (y0 + y1) / 2,
    };
    fittings.set(shape, made);
    return made;
}

/** Happy at `divide`, in the unit box. Deterministic: there is one Happy. */
export function happyCellPose(
    shape: HappyCellShape,
    divide = HAPPY_CELL_REST,
    drift = 0,
): HappyCellPose {
    const pose = poseInLobeUnits(shape, divide, drift);
    const fitting = fittingOf(shape);
    const placed = (lobe: CellLobe): CellLobe => ({
        ...lobe,
        x: 0.5 + (lobe.x - fitting.cx) * fitting.scale,
        y: 0.5 + (lobe.y - fitting.cy) * fitting.scale,
        size: lobe.size * fitting.scale,
    });
    return {
        lobes: [placed(pose.lobes[0]), placed(pose.lobes[1])],
        join: pose.join * fitting.scale,
        cores: [placed(pose.cores[0]), placed(pose.cores[1])],
        coreJoin: pose.coreJoin * fitting.scale,
    };
}

/** Outlines of a pair of lobes joined by `join`, each loop resampled to `count`. */
export function lobePairLoops(
    lobes: readonly CellLobe[],
    join: number,
    step: number,
    count: number,
): Point[][] {
    return fieldContours(lobePairField(lobes, join), lobesBox(lobes, step * 2), step).map((loop) =>
        loopResample(loop, count),
    );
}

export interface HappyCellPaths {
    readonly membrane: string;
    readonly core: string;
}

const pathCache = new WeakMap<HappyCellShape, Map<string, HappyCellPaths>>();

/** Happy's membrane and cores as SVG paths in a `size` box. */
export function happyCellPaths(
    shape: HappyCellShape,
    size: number,
    divide = HAPPY_CELL_REST,
    drift = 0,
): HappyCellPaths {
    let byKey = pathCache.get(shape);
    if (!byKey) pathCache.set(shape, (byKey = new Map()));
    const key = `${size}:${divide}:${drift}`;
    const cached = byKey.get(key);
    if (cached) return cached;
    const pose = happyCellPose(shape, divide, drift);
    const made = {
        membrane: loopsPath(lobePairLoops(pose.lobes, pose.join, 1 / 160, 64), size),
        core: loopsPath(lobePairLoops(pose.cores, pose.coreJoin, 1 / 320, 28), size),
    };
    byKey.set(key, made);
    return made;
}
