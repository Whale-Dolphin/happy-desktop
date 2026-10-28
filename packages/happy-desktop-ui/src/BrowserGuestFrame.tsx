import { createContext, useCallback, useContext, type ReactNode } from "react";

/** Undefined in standalone previews; null until the connection host is mounted. */
export const BrowserGuestHostContext = createContext<HTMLElement | null | undefined>(undefined);

/** Native guest placement; the guest's DOM stays here while its slot comes and goes. */
export function BrowserGuestFrame(props: {
    children: ReactNode;
    bounds?: { x: number; y: number; width: number; height: number };
}) {
    return (
        <div
            className="happy-browser-guest-frame"
            hidden={!props.bounds}
            style={
                props.bounds
                    ? {
                          left: props.bounds.x,
                          top: props.bounds.y,
                          width: props.bounds.width,
                          height: props.bounds.height,
                      }
                    : undefined
            }
        >
            {props.children}
        </div>
    );
}

/** A place for a retained native guest, measured by the desktop adapter. */
export function BrowserGuestSlot(props: {
    onSlot(slot: HTMLDivElement | null, host: HTMLElement | null | undefined): void;
}) {
    const host = useContext(BrowserGuestHostContext);
    const onSlot = props.onSlot;
    const slotRef = useCallback(
        (slot: HTMLDivElement | null) => onSlot(slot, host),
        [onSlot, host],
    );
    return <div className="happy-browser-guest-slot" ref={slotRef} />;
}
