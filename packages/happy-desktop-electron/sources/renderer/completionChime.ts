import {
    happyAgentAttentionConnection,
    type HappyAgentAttentionSnapshot,
    type ProjectsVisibilitySnapshot,
} from "happy-desktop-state";
import { LOCAL_HAPPY_AGENT_ID, type HappyAgentDirectorySnapshot } from "./happyAgentDirectoryStore";
import { happyAgentDirectoryNotifies } from "./happyAgentListed";

let completionChimeContext: AudioContext | undefined;
let completionChimeBuffer: AudioBuffer | undefined;
const completionChimeSources = new Set<AudioBufferSourceNode>();
let completionChimeSuspendTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Plays a short two-note completion chime. The samples are computed here, once,
 * and played from one shared context. An OscillatorNode would build its sine
 * table with an inverse FFT on the renderer's main thread in every new context,
 * and Accelerate runs that FFT in SME streaming mode on newer Apple Silicon,
 * where a signal arriving mid-FFT crashed the renderer with SIGILL.
 */
export function completionChimePlay(): void {
    try {
        completionChimeContext ??= new window.AudioContext();
        const context = completionChimeContext;
        completionChimeBuffer ??= completionChimeRender(context);
        clearTimeout(completionChimeSuspendTimer);
        completionChimeSuspendTimer = undefined;
        // Resume even if state is still "running": an idle suspend may be queued.
        void context.resume().catch(() => {});
        const source = context.createBufferSource();
        source.buffer = completionChimeBuffer;
        source.connect(context.destination);
        source.onended = () => {
            source.disconnect();
            completionChimeSources.delete(source);
            if (completionChimeSources.size > 0) return;
            // `ended` follows rendering, so allow the device's buffered output to
            // drain before releasing it. A new chime cancels this idle timer.
            const drainSeconds = context.baseLatency + context.outputLatency;
            completionChimeSuspendTimer = setTimeout(
                () => {
                    completionChimeSuspendTimer = undefined;
                    if (completionChimeSources.size === 0) {
                        void context.suspend().catch(() => {});
                    }
                },
                Math.max(250, drainSeconds * 1000 + 100),
            );
        };
        source.start();
        completionChimeSources.add(source);
    } catch {
        // A missing or policy-blocked audio device must not interrupt reconciliation.
    }
}

/** Renders the chime: two sine notes under a 15 ms attack and an exponential decay to 0.42 s. */
function completionChimeRender(context: AudioContext): AudioBuffer {
    const sampleRate = context.sampleRate;
    const buffer = context.createBuffer(1, Math.ceil(sampleRate * 0.42), sampleRate);
    const samples = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index += 1) {
        const time = index / sampleRate;
        const envelope =
            time < 0.015
                ? 0.0001 * Math.pow(0.12 / 0.0001, time / 0.015)
                : 0.12 * Math.pow(0.0001 / 0.12, (time - 0.015) / (0.42 - 0.015));
        let value = 0;
        for (const [frequency, delay] of [
            [659.25, 0],
            [880, 0.11],
        ] as const) {
            if (time >= delay && time < delay + 0.28) {
                value += Math.sin(2 * Math.PI * frequency * (time - delay));
            }
        }
        samples[index] = value * envelope;
    }
    return buffer;
}

/**
 * Whether one finished top-level conversation should chime, by the person's
 * choices for its connection and for the bot it belongs to, if any.
 *
 * `focused` means the reader is looking at that connection right now: it is
 * the one selected in the rail and the window has focus. A muted or hidden
 * bot never chimes, whatever its connection says.
 */
export function completionChimeWanted(input: {
    readonly attention: HappyAgentAttentionSnapshot;
    readonly projectsVisibility: ProjectsVisibilitySnapshot;
    readonly directory: HappyAgentDirectorySnapshot;
    readonly happyAgentId: string;
    readonly sessionId: string;
    readonly windowFocused: boolean;
}): boolean {
    const sound = happyAgentAttentionConnection(
        input.attention,
        input.happyAgentId,
    ).completionSound;
    if (sound === "never") return false;
    if (sound === "focused") {
        const selected = input.directory.activeHappyAgentId ?? LOCAL_HAPPY_AGENT_ID;
        if (!input.windowFocused || selected !== input.happyAgentId) return false;
    }
    return happyAgentDirectoryNotifies(
        input.directory,
        input.projectsVisibility,
        input.attention,
        input.happyAgentId,
        input.sessionId,
    );
}
