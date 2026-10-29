import { useId, type ReactNode } from "react";

/** How many stories a ring stands for, and how many of them are new to the reader. */
export interface StoryRingSegments {
    readonly total: number;
    readonly unseen: number;
}

export interface StoryRingProps {
    /**
     * Sidebar rows use 58px: a 50px disc with its ring drawn outside it, so
     * the disc is the same size, in the same place, with a ring or without.
     */
    readonly size?: 48 | 58;
    /** One segment per story; absent draws no ring and keeps the box. */
    readonly segments?: StoryRingSegments;
    /** What the ring goes around, centred in it. */
    readonly children: ReactNode;
    /** Opens the stories; absent, the ring only reports. */
    onOpen?(): void;
    /** Read by assistive software when the ring opens something. */
    readonly label?: string;
    readonly className?: string;
}

/*
 * The geometry is the stories row's, in a 48px box: the ring's centre line
 * 22.75px from the middle, 2px wide while unseen and 1.5px once seen, one
 * segment per story with 3px between them, and the mark 38px across inside
 * it, so a row with no ring keeps the same box and its name never moves when
 * a story arrives. The sidebar's 58px box keeps 1.5px clear of its 50px disc:
 * the centre line 27.5px out, the same strokes and gaps.
 */
const STORY_RING_RADII = { 48: 22.75, 58: 27.5 } as const;
const STORY_RING_UNSEEN = 2;
const STORY_RING_SEEN = 1.5;
const STORY_RING_GAP = 3;
const STORY_RING_MAX_SEGMENTS = 30;

/**
 * StoryRing — a row's mark, enlarged, inside the ring of its stories: seen
 * segments first in grey, then the unseen ones in the stories gradient,
 * clockwise from the top. The ring only ever reports; it never spins.
 */
export function StoryRing(props: StoryRingProps) {
    const gradientId = `${useId().replace(/[^a-zA-Z0-9_-]/gu, "")}-story-ring`;
    const size = props.size ?? 48;
    const box = size;
    const radius = STORY_RING_RADII[size];
    const segments = props.segments;
    const total = segments ? Math.max(1, Math.min(STORY_RING_MAX_SEGMENTS, segments.total)) : 0;
    const unseen = segments ? Math.max(0, Math.min(total, segments.unseen)) : 0;
    const circumference = 2 * Math.PI * radius;
    const length = total <= 1 ? circumference : circumference / total - STORY_RING_GAP;
    const center = box / 2;
    const ring =
        total > 0 ? (
            <svg
                aria-hidden="true"
                className="happy-story-ring__ring"
                data-happy-desktop-ui="story-ring-ring"
                height={box}
                viewBox={`0 0 ${String(box)} ${String(box)}`}
                width={box}
            >
                <defs>
                    {/* The segments are turned a quarter left so they start at the
                        top; their x axis points up, so top to bottom runs along it
                        backwards. */}
                    <linearGradient id={gradientId} x1="1" x2="0" y1="0" y2="0">
                        <stop className="happy-story-ring__top" offset="0" />
                        <stop className="happy-story-ring__bottom" offset="1" />
                    </linearGradient>
                </defs>
                {Array.from({ length: total }, (_, index) => {
                    const isUnseen = index >= total - unseen;
                    return (
                        <circle
                            cx={center}
                            cy={center}
                            data-seen={isUnseen ? undefined : ""}
                            fill="none"
                            key={index}
                            r={radius}
                            stroke={isUnseen ? `url(#${gradientId})` : "var(--story-ring-seen)"}
                            strokeDasharray={
                                total === 1
                                    ? undefined
                                    : `${String(length)} ${String(circumference - length)}`
                            }
                            // From the top, clockwise, with a gap centred where two segments meet.
                            strokeDashoffset={
                                total === 1
                                    ? undefined
                                    : -(index * (length + STORY_RING_GAP) + STORY_RING_GAP / 2)
                            }
                            strokeLinecap="round"
                            strokeWidth={isUnseen ? STORY_RING_UNSEEN : STORY_RING_SEEN}
                            transform={`rotate(-90 ${String(center)} ${String(center)})`}
                        />
                    );
                })}
            </svg>
        ) : null;
    const mark = (
        <span className="happy-story-ring__mark" data-happy-desktop-ui="story-ring-mark">
            {props.children}
        </span>
    );
    const className = ["happy-story-ring", props.className].filter(Boolean).join(" ");
    // Only a ring with stories behind it opens anything.
    if (props.onOpen && total > 0) {
        const open = props.onOpen;
        return (
            /* A span, not a button: the ring sits inside a row that is already
               one. It takes the press for itself, so the row behind it does
               not open its chat as well. */
            <span
                aria-label={props.label ?? "Open stories"}
                className={className}
                data-happy-desktop-ui="story-ring"
                data-opens=""
                data-ring=""
                data-size={size}
                data-unseen={unseen > 0 ? "" : undefined}
                onClick={(event) => {
                    event.stopPropagation();
                    open();
                }}
                onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    event.stopPropagation();
                    open();
                }}
                onPointerDown={(event) => event.stopPropagation()}
                role="button"
                tabIndex={-1}
            >
                {ring}
                {mark}
            </span>
        );
    }
    return (
        <span
            className={className}
            data-happy-desktop-ui="story-ring"
            data-ring={total > 0 ? "" : undefined}
            data-size={size}
            data-unseen={unseen > 0 ? "" : undefined}
        >
            {ring}
            {mark}
        </span>
    );
}
