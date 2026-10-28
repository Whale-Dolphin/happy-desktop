import { Activity, useState, type ReactNode } from "react";
import { BrowserGuestHostContext } from "./BrowserGuestFrame";

/** Activity retains DOM/local state while suspending hidden window listeners. */
export function ConnectionSurface(props: {
    readonly active: boolean;
    readonly children: ReactNode;
}) {
    const [host, hostSet] = useState<HTMLDivElement | null>(null);
    return (
        <Activity mode={props.active ? "visible" : "hidden"}>
            <div
                className="happy-connections__surface"
                data-happy-desktop-ui="connection-surface"
                ref={hostSet}
            >
                <BrowserGuestHostContext.Provider value={host}>
                    {props.children}
                </BrowserGuestHostContext.Provider>
            </div>
        </Activity>
    );
}
