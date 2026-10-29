import { stemCellModel, stemCellSmoothPath, type Point } from "./stemCellGeometry";

/** A shape's radius around its centre relative to its mean, so its mean is 1. */
export type CellProfile = (theta: number) => number;

/**
 * One rounded body of a cell: a centre, a mean radius, and an outline that
 * blends from one profile to another, so a lobe can turn into a stem cell.
 * Lengths are in whatever space the caller draws in.
 */
export interface CellLobe {
    x: number;
    y: number;
    size: number;
    from: CellProfile;
    to: CellProfile;
    /** 0 is `from`, 1 is `to`. */
    blend: number;
    /**
     * Height over width, keeping the area: above 1 the lobe stands taller, as
     * each half of a dividing cell does. 1 when left out.
     */
    stretch?: number;
    /** Lean in radians, clockwise on screen. 0 when left out. */
    tilt?: number;
    /**
     * Curve along its height: the middle sits this many sizes to the right of
     * its ends, so a long lobe bends like a bean. 0 when left out.
     */
    bend?: number;
    /**
     * A straight middle this many sizes tall on each side of the centre, so
     * the lobe is a capsule: the outline's top and bottom are its caps. 0 when
     * left out.
     */
    length?: number;
}

/** A field that is negative inside a shape and zero on its outline. */
export type CellField = (x: number, y: number) => number;

/** A stem cell's membrane or core as a centre, mean radius, and profile. */
export interface CellBody {
    readonly centre: Point;
    readonly size: number;
    readonly profile: CellProfile;
}

const MEAN_SAMPLES = 64;

function bodyOf(radial: { centre: Point; radius: (theta: number) => number }): CellBody {
    let sum = 0;
    for (let i = 0; i < MEAN_SAMPLES; i++) sum += radial.radius((i / MEAN_SAMPLES) * Math.PI * 2);
    const size = sum / MEAN_SAMPLES;
    return {
        centre: radial.centre,
        size,
        profile: profileSampled((theta) => radial.radius(theta) / size),
    };
}

/**
 * A seeded stem cell as bodies in the unit box. Its outlines are the ones
 * `StemCell` draws, so a lobe that ends on them ends on that stem cell.
 */
export function stemCellBodies(id: string, drift = 0): { membrane: CellBody; core: CellBody } {
    const model = stemCellModel(id, drift);
    return { membrane: bodyOf(model.membrane), core: bodyOf(model.core) };
}

/**
 * A profile sampled once at `count` angles and read back by linear
 * interpolation. Outlines are traced from thousands of field samples a frame,
 * and a stem cell's profile is a sum of harmonics; a table makes each read a
 * lookup without visibly changing the shape.
 */
export function profileSampled(profile: CellProfile, count = 512): CellProfile {
    const table = new Float64Array(count + 1);
    for (let i = 0; i <= count; i++) table[i] = profile((i / count) * Math.PI * 2);
    const scale = count / (Math.PI * 2);
    return (theta) => {
        let at = (theta % (Math.PI * 2)) * scale;
        if (at < 0) at += count;
        const i = Math.floor(at);
        const t = at - i;
        return table[i]! + (table[i + 1]! - table[i]!) * t;
    };
}

/** A profile brought `calm` of the way back to a circle. */
export function profileCalmed(profile: CellProfile, calm: number): CellProfile {
    return (theta) => 1 + (profile(theta) - 1) * (1 - calm);
}

export function lobeField(lobe: CellLobe): CellField {
    const { x, y, size, from, to, blend } = lobe;
    const root = Math.sqrt(lobe.stretch ?? 1);
    const cos = Math.cos(lobe.tilt ?? 0);
    const sin = Math.sin(lobe.tilt ?? 0);
    const bend = (lobe.bend ?? 0) * size;
    const straight = (lobe.length ?? 0) * size;
    const reach = size * root + straight;
    return (px, py) => {
        // Into the lobe's own frame: unrotated, unbent, then unstretched.
        const ux = (px - x) * cos + (py - y) * sin;
        const uy = -(px - x) * sin + (py - y) * cos;
        const dx = (ux - bend * (1 - (uy / reach) ** 2)) * root;
        const dy = (Math.sign(uy) * Math.max(Math.abs(uy) - straight, 0)) / root;
        const theta = Math.atan2(dy, dx);
        const shape =
            blend <= 0
                ? from(theta)
                : blend >= 1
                  ? to(theta)
                  : from(theta) * (1 - blend) + to(theta) * blend;
        return Math.hypot(dx, dy) - size * shape;
    };
}

/** How far a lobe can reach from its centre, for bounding the contour grid. */
export function lobeReach(lobe: CellLobe): number {
    const stretch = lobe.stretch ?? 1;
    return (
        lobe.size * 1.5 * Math.sqrt(Math.max(stretch, 1 / stretch)) +
        Math.abs(lobe.bend ?? 0) * lobe.size +
        (lobe.length ?? 0) * lobe.size
    );
}

/**
 * Polynomial smooth minimum: two shapes as one, their seam rounded into a
 * fillet of width `k`. Two shapes closer than k/2 are joined by a neck that
 * thins as they part and lets go when the gap reaches k/2. At k = 0 it is the
 * plain union.
 */
export function smoothUnion(left: number, right: number, k: number): number {
    if (k <= 0) return Math.min(left, right);
    const h = Math.max(k - Math.abs(left - right), 0) / k;
    return Math.min(left, right) - (h * h * k) / 4;
}

/**
 * Every closed zero contour of `field` inside the box, traced with marching
 * squares at `step` and linked into loops. The box must hold the whole shape.
 */
export function fieldContours(
    field: CellField,
    box: { x0: number; y0: number; x1: number; y1: number },
    step: number,
): Point[][] {
    const nx = Math.max(2, Math.ceil((box.x1 - box.x0) / step));
    const ny = Math.max(2, Math.ceil((box.y1 - box.y0) / step));
    const stride = nx + 1;
    const values = new Float64Array(stride * (ny + 1));
    for (let j = 0; j <= ny; j++)
        for (let i = 0; i <= nx; i++)
            values[j * stride + i] = field(box.x0 + i * step, box.y0 + j * step);
    // A crossing lives on one grid edge: horizontal edges first, then vertical.
    const vertical = stride * (ny + 1);
    const crossings = new Map<number, Point>();
    const links = new Map<number, number[]>();
    const crossing = (edge: number) => {
        if (!crossings.has(edge)) {
            let i0: number, j0: number, i1: number, j1: number;
            if (edge < vertical) {
                j0 = j1 = Math.floor(edge / stride);
                i0 = edge % stride;
                i1 = i0 + 1;
            } else {
                const e = edge - vertical;
                j0 = Math.floor(e / stride);
                i0 = i1 = e % stride;
                j1 = j0 + 1;
            }
            const v0 = values[j0 * stride + i0]!;
            const v1 = values[j1 * stride + i1]!;
            const t = v0 / (v0 - v1);
            crossings.set(edge, [
                box.x0 + (i0 + (i1 - i0) * t) * step,
                box.y0 + (j0 + (j1 - j0) * t) * step,
            ]);
        }
        return edge;
    };
    const link = (a: number, b: number) => {
        const la = links.get(a);
        if (la) la.push(b);
        else links.set(a, [b]);
        const lb = links.get(b);
        if (lb) lb.push(a);
        else links.set(b, [a]);
    };
    for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
            const tl = values[j * stride + i]!;
            const tr = values[j * stride + i + 1]!;
            const br = values[(j + 1) * stride + i + 1]!;
            const bl = values[(j + 1) * stride + i]!;
            const inside =
                (tl < 0 ? 8 : 0) | (tr < 0 ? 4 : 0) | (br < 0 ? 2 : 0) | (bl < 0 ? 1 : 0);
            if (inside === 0 || inside === 15) continue;
            const top = () => crossing(j * stride + i);
            const bottom = () => crossing((j + 1) * stride + i);
            const left = () => crossing(vertical + j * stride + i);
            const right = () => crossing(vertical + j * stride + i + 1);
            switch (inside) {
                case 1:
                case 14:
                    link(left(), bottom());
                    break;
                case 2:
                case 13:
                    link(bottom(), right());
                    break;
                case 3:
                case 12:
                    link(left(), right());
                    break;
                case 4:
                case 11:
                    link(top(), right());
                    break;
                case 6:
                case 9:
                    link(top(), bottom());
                    break;
                case 7:
                case 8:
                    link(left(), top());
                    break;
                case 5:
                case 10: {
                    // A saddle: the cell centre decides which corners connect.
                    const centreInside = (tl + tr + br + bl) / 4 < 0;
                    if ((inside === 5) === centreInside) {
                        link(left(), top());
                        link(bottom(), right());
                    } else {
                        link(left(), bottom());
                        link(top(), right());
                    }
                    break;
                }
            }
        }
    }
    const visited = new Set<number>();
    const loops: Point[][] = [];
    for (const start of links.keys()) {
        if (visited.has(start)) continue;
        const loop: Point[] = [];
        let previous = -1;
        let current = start;
        while (!visited.has(current)) {
            visited.add(current);
            loop.push(crossings.get(current)!);
            const next = links.get(current)!.find((key) => key !== previous && !visited.has(key));
            if (next === undefined) break;
            previous = current;
            current = next;
        }
        if (loop.length >= 3) loops.push(loop);
    }
    return loops;
}

/**
 * `count` points evenly spaced along a closed polyline, clockwise on screen,
 * starting straight above its centroid so that nearby shapes line up point
 * for point.
 */
export function loopResample(loop: readonly Point[], count: number): Point[] {
    let area = 0;
    let gx = 0;
    let gy = 0;
    for (let i = 0; i < loop.length; i++) {
        const [x0, y0] = loop[i]!;
        const [x1, y1] = loop[(i + 1) % loop.length]!;
        area += x0 * y1 - x1 * y0;
        gx += x0;
        gy += y0;
    }
    gx /= loop.length;
    gy /= loop.length;
    const ordered = area < 0 ? [...loop].reverse() : [...loop];
    // The crossing of the upward ray from the centroid.
    let first = 0;
    let best = Infinity;
    for (let i = 0; i < ordered.length; i++) {
        const [x, y] = ordered[i]!;
        if (y > gy) continue;
        const off = Math.abs(Math.atan2(x - gx, gy - y));
        if (off < best) {
            best = off;
            first = i;
        }
    }
    const ring = [...ordered.slice(first), ...ordered.slice(0, first)];
    const lengths = [0];
    for (let i = 1; i <= ring.length; i++) {
        const [x0, y0] = ring[i - 1]!;
        const [x1, y1] = ring[i % ring.length]!;
        lengths.push(lengths[i - 1]! + Math.hypot(x1 - x0, y1 - y0));
    }
    const total = lengths[ring.length]!;
    const points: Point[] = [];
    let segment = 0;
    for (let n = 0; n < count; n++) {
        const target = (n / count) * total;
        while (lengths[segment + 1]! < target) segment++;
        const [x0, y0] = ring[segment]!;
        const [x1, y1] = ring[(segment + 1) % ring.length]!;
        const t = (target - lengths[segment]!) / (lengths[segment + 1]! - lengths[segment]! || 1);
        points.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
    }
    return points;
}

/** Loops, left to right, as one smoothed SVG path in the stem cell's spline. */
export function loopsPath(loops: readonly (readonly Point[])[], scale = 1): string {
    return [...loops]
        .sort((a, b) => a[0]![0] - b[0]![0])
        .map((loop) => stemCellSmoothPath(loop, scale))
        .join("");
}
