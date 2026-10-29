import { HappyCell, type HappyCellSize } from "./HappyCell";

/** 16 in a chat's author line, 20 in a sidebar row, 64 atop Happy's first conversation. */
export type HappyMarkSize = HappyCellSize;

/**
 * Happy's mark wherever Happy shows itself: atop its first conversation, on
 * its sidebar row, and beside its name on what it says. The one place the
 * mark is chosen: the #7 cell (C-319). `seed` is the membrane Happy formed
 * again from after it last divided; absent, the shape's own.
 */
export function HappyMark(props: { readonly size: HappyMarkSize; readonly seed?: number }) {
    return (
        <HappyCell size={props.size} {...(props.seed !== undefined ? { seed: props.seed } : {})} />
    );
}
