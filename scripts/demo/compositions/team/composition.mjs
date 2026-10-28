/*
 * The team take: the desktop window is the stage, centred under a caption
 * band. The teammate's phone is not on screen until they are looped in; then
 * it rises from below the frame, whole, over the window's right side, with a
 * label naming whose phone it is, and goes back down when they are done. The
 * window carries macOS's own traffic lights, drawn over the app's lane.
 *
 * Geometry is in output pixels. The frame and the recorded 972×600 window are
 * both golden rectangles. The desktop's corner radius is in recorded CSS
 * pixels.
 */
import stemCaptions from "../stem-captions/composition.mjs";

export default {
    ...stemCaptions,
    id: "team",
    title: "Team: the desktop, and a teammate's phone when they are looped in",
    output: { width: 1618, height: 1000, fps: 60 },
    captionBand: { centerY: 62 },
    desktop: {
        x: 129,
        y: 125,
        width: 1360,
        height: 840,
        cssWidth: 972,
        cssRadius: 12,
        trafficLights: true,
    },
    phone: {
        ...stemCaptions.phone,
        width: 392,
        left: 1190,
        bottom: 985,
        focusScale: 1,
        clearOfDesktop: false,
        enter: "bottom",
        label: "*Steve’s* phone",
        transition: { seconds: 0.7, easing: [0.22, 0.8, 0.24, 1] },
    },
    // Steve's typing plays at 2×: the native driver performs one key touch
    // at a time, and the desktop waits, unchanged, while he types.
    speedUps: [
        { from: "phone-typing-feedback", to: "phone-sent", rate: 2 },
        { from: "phone-typing-thanks", to: "phone-thanks", rate: 2 },
    ],
    captions: [
        { from: 0, text: "Every new task starts as a *stem cell*" },
        { from: "picker-open", text: "Any model: Claude, Codex or Grok" },
        { from: "typing-started", text: "Just say what it is" },
        { from: "stem-named", text: "It *names itself*" },
        { from: "stem-icon", text: "grows *its own icon*" },
        { from: "stem-filed", text: "and *files itself* where it belongs" },
        { from: "first-read-visible", text: "Then it gets to work" },
        { from: "artifact-shown", text: "and *shows you* a live preview" },
        { from: "looped-in", text: "It loops in *Steve (designer)*, who reviews voice work" },
        {
            from: "phone-enter",
            text: "Happy supports *teams*: people join only the work they care about",
        },
        { from: "phone-typing-feedback", text: "Steve answers *from his phone*" },
        { from: "narrowed", text: "The agent *fixes it*" },
        { from: "ship-running", text: "and *ships it*" },
        { from: "phone-thanks", text: "Steve signs off" },
        { from: "archiving", text: "Focus *cleans up* when the work is done" },
        { from: "outro", text: "*Stem cells.* For you and your whole team." },
    ],
    hints: [
        { cue: "stem-named", side: "right", seconds: 2, text: "Named from your message" },
        // After the 2.5 s growth into the icon, and gone before the work's
        // first rows move anything.
        { cue: "stem-icon", side: "right", delay: 2.4, seconds: 1.2, text: "Picked its own icon" },
        { cue: "stem-filed", side: "below", seconds: 2.2, text: "Filed under Voice" },
        // Rings only: a label would cover the chat, and the caption says it.
        { cue: "artifact-shown", seconds: 2 },
        { cue: "looped-in", seconds: 2.4 },
        { cue: "phone-row", side: "below", seconds: 2, text: "New on Steve's phone" },
        // Gone before Focus's archive takes the row out.
        { cue: "archiving", side: "right", seconds: 1.5, text: "Shipped, so Focus archives it" },
    ],
};
