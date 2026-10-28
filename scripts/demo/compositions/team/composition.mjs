/*
 * The team take: the desktop window is the stage, centred under a caption
 * band. The teammate's phone is not on screen until they are looped in; then
 * it rises from below the frame over the window's right side, its lower part
 * (the keyboard) left out of frame, and goes back down when they are done.
 *
 * Geometry is in output pixels. The desktop's corner radius is 14 recorded
 * CSS pixels of its 668-pixel-wide app, like the website's window.
 */
import stemCaptions from "../stem-captions/composition.mjs";

export default {
    ...stemCaptions,
    id: "team",
    title: "Team: the desktop, and a teammate's phone when they are looped in",
    output: { width: 1440, height: 1080, fps: 60 },
    desktop: { x: 260, y: 150, width: 920, height: 915, cssWidth: 668, cssRadius: 14 },
    phone: {
        ...stemCaptions.phone,
        width: 520,
        left: 880,
        bottom: 1500,
        focusScale: 1,
        clearOfDesktop: false,
        enter: "bottom",
        transition: { seconds: 0.7, easing: [0.22, 0.8, 0.24, 1] },
    },
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
        // After the 2.5 s growth into the icon.
        { cue: "stem-icon", side: "right", delay: 2.4, seconds: 1.3, text: "Picked its own icon" },
        { cue: "stem-filed", side: "below", seconds: 2.2, text: "Filed under Voice" },
        // Rings only: a label would cover the chat, and the caption says it.
        { cue: "artifact-shown", seconds: 2.6 },
        { cue: "looped-in", seconds: 2.4 },
        { cue: "phone-row", side: "below", seconds: 2, text: "New on Steve's phone" },
        { cue: "archiving", side: "right", seconds: 1.4, text: "Shipped, so Focus archives it" },
    ],
};
