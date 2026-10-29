import type { CSSProperties } from "react";

/**
 * How a cell is painted. `flat` fills each shape with its colour; `clay` lights
 * the same shapes like the clay icon library — a soft dome of light up and to
 * the left, an inner shade along the lower rim, and a soft contact shadow — so
 * a cell sits beside a clay icon as the same material.
 */
export type CellVariant = "flat" | "clay";

/** One closed shape of a cell, at rest and, when it wobbles, at both drift extremes. */
export interface CellShape {
    className: string;
    d: string;
    drift?: { forward: string; backward: string };
}

/** The `<defs>` id prefix for one mounted cell, safe inside `url(#…)`. */
export function cellPaintId(reactId: string): string {
    return `happy-cell-${reactId.replace(/[^\w-]/gu, "")}`;
}

/**
 * The clay lighting for cells drawn at `size` (a unit is 1/32 of it). All of
 * it is worked out from the shape's own alpha, never from its bounding box,
 * so a shape that stretches, splits, or pulls apart stays lit continuously.
 * The contact shadow reaches about 1.7 units below the shape, inside the
 * padding every cell geometry keeps, so no container clips it. A part that
 * sits on another shape, such as a core, uses the `-inset` filter: a tighter
 * shadow and a narrower roll-off, so it reads as a bulge in the clay rather
 * than a bead resting on it.
 */
export function CellClayDefs(props: { id: string; size: number }) {
    const unit = props.size / 32;
    return (
        <defs>
            <ClayFilter id={`${props.id}-body`} inset={false} unit={unit} />
            <ClayFilter id={`${props.id}-inset`} inset unit={unit} />
        </defs>
    );
}

/**
 * Keeps the shape's own fill and adds the contact shadow under it, a faint
 * grain, a broad dome of light, and a rim light and shade rolling off it.
 */
function ClayFilter(props: { id: string; inset: boolean; unit: number }) {
    const { inset, unit } = props;
    const roll = (inset ? 0.5 : 1) * unit;
    return (
        <filter
            colorInterpolationFilters="sRGB"
            height="170%"
            id={props.id}
            width="150%"
            x="-25%"
            y="-25%"
        >
            <feGaussianBlur
                in="SourceAlpha"
                result="drop-blur"
                stdDeviation={(inset ? 0.4 : 0.6) * unit}
            />
            <feOffset dy={(inset ? 0.3 : 0.55) * unit} in="drop-blur" result="drop" />
            <feFlood className="happy-cell-clay__shadow" />
            <feComposite in2="drop" operator="in" result="shadow" />
            {/* The dome: the shape blurred and lifted toward the light, sharpened
                to a soft peak inside the body, up and to the left. */}
            <feGaussianBlur in="SourceAlpha" result="dome-blur" stdDeviation={4 * roll} />
            <feOffset dx={-1.8 * roll} dy={-2.6 * roll} in="dome-blur" result="dome-lifted" />
            <feComponentTransfer in="dome-lifted" result="dome">
                <feFuncA exponent={3} type="gamma" />
            </feComponentTransfer>
            <feFlood className="happy-cell-clay__sheen" />
            <feComposite in2="dome" operator="in" result="sheen-wide" />
            <feComposite in="sheen-wide" in2="SourceAlpha" operator="in" result="sheen" />
            <feGaussianBlur in="SourceAlpha" result="soft" stdDeviation={2.2 * roll} />
            <feOffset dx={-1.1 * roll} dy={-1.6 * roll} in="soft" result="raised" />
            <feComposite in="SourceAlpha" in2="raised" operator="out" result="lower-rim" />
            <feFlood className="happy-cell-clay__shade" />
            <feComposite in2="lower-rim" operator="in" result="shade" />
            <feOffset dx={0.9 * roll} dy={1.3 * roll} in="soft" result="lowered" />
            <feComposite in="SourceAlpha" in2="lowered" operator="out" result="upper-rim" />
            <feFlood className="happy-cell-clay__light" />
            <feComposite in2="upper-rim" operator="in" result="light" />
            {/* The clay's matte grain: fixed noise, so every capture is the same. */}
            <feTurbulence
                baseFrequency={0.8 / Math.sqrt(Math.max(unit, 1))}
                numOctaves={2}
                result="noise"
                seed={7}
                type="fractalNoise"
            />
            <feColorMatrix
                in="noise"
                result="speckle"
                type="matrix"
                values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.6 0 0 0 -0.7"
            />
            <feFlood className="happy-cell-clay__grain" />
            <feComposite in2="speckle" operator="in" result="grain-wide" />
            <feComposite in="grain-wide" in2="SourceAlpha" operator="in" result="grain" />
            <feMerge>
                <feMergeNode in="shadow" />
                <feMergeNode in="SourceGraphic" />
                <feMergeNode in="grain" />
                <feMergeNode in="sheen" />
                <feMergeNode in="light" />
                <feMergeNode in="shade" />
            </feMerge>
        </filter>
    );
}

/** The filter a cell part wears in clay. */
export function cellClayFilter(clay: string, inset: boolean): string {
    return `url(#${clay}-${inset ? "inset" : "body"})`;
}

/** A shape painted flat, or as clay against the `CellClayDefs` with this id. */
export function CellShapePaint(props: { shape: CellShape; clay?: string; inset?: boolean }) {
    const { shape, clay } = props;
    const style = shape.drift
        ? ({
              "--happy-cell-rest": `path("${shape.d}")`,
              "--happy-cell-forward": `path("${shape.drift.forward}")`,
              "--happy-cell-backward": `path("${shape.drift.backward}")`,
          } as CSSProperties)
        : undefined;
    return (
        <path
            className={shape.className}
            d={shape.d}
            filter={clay ? cellClayFilter(clay, props.inset ?? false) : undefined}
            style={style}
        />
    );
}
