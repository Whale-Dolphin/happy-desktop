# Stem demo: new work starts as a stem cell

This is the core demo's story, but it opens on a stem cell. Use today's UI with
Settings → Experimental → Spaces sidebar and Stem cells turned on. Framing,
traffic lights and phone treatment match core v21-r2. The `stem` composition is
more square than v21: the window is 20% smaller and the side margins are
tighter. `stem-captions` is the same take with a caption band and hints.
Everything on screen is real product behavior. Fixtures are disclosed in
`stem.evidence.json`.

## Recording

```sh
HAPPY_DESKTOP_AGENT_EXECUTABLE=<happy-agent with the waveform slug> STEM_DEMO_ICON=waveform \
  pnpm demo record stem --out scripts/demo/demos/stem/artifacts/<take> \
  --phone-udid <udid> --phone-direct
pnpm demo compose stem --desktop <take>/stem.mp4 \
  --phone <take>/phone-screen.mp4 --cues <take>/cues.json --out <take>/composed
pnpm demo compose stem-captions --desktop <take>/stem.mp4 \
  --phone <take>/phone-screen.mp4 --cues <take>/cues.json --out <take>/composed-captions
```

- `STEM_DEMO_ICON` picks the clay icon Focus gives the row. The default is
  `new-feature`. `waveform` needs a daemon whose icon library has it
  (happy-agent branch `worktree/space-icons-voice`) and an iOS build with
  `clay-waveform.png`.

- `--phone-direct` means the phone is the native Happy iOS app
  (`packages/happy-ios`, bundle `com.slopus.happy.dev`). It is paired to the
  demo daemon through the daemon's own direct mobile connector. The gym runs
  that connector on port 24963.
- Pair once, off camera, against the demo world in `.d`:
    1. Start the pairing with `startMobilePairing` and open its QR URL on the
       Simulator with `simctl openurl`.
    2. On the phone, turn on direct connection and use Emoji match.
    3. On the desktop side, call `confirmMobilePairing(id)`.
- The pairing is stored in `.d`, so `pnpm demo reset` removes it and you have
  to pair again.
- Recording needs execution outside the sandbox (Chromium, simctl, Maestro).

## Beats and cues (take `v23-stem-r4`, 60fps, 3,660 frames, 61.0s)

| s             | cue                              | what is on screen                                                                                                       |
| ------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 0             | —                                | An already-opened stem cell: the New row is selected, its composer empty, on GPT-6 Astra. The phone shows the same row. |
| 2.97          | picker-open                      | The model menu shows Claude, Codex and Grok side by side. GPT-6 Sol is absent.                                          |
| 5.85          | picker-chosen                    | Hover passes Grok 4.7 → Opus 5.5, and Opus 5.5 is chosen.                                                               |
| 6.75          | typing-started                   | "Add an animated waveform to the voice agent." The pointer hides while typing.                                          |
| 9.35 / 10.10  | phone-enter / work-started       | The phone comes forward; the message is sent.                                                                           |
| 11.33 / 11.45 | stem-named / phone-named         | The row names itself "Voice waveform", on both screens.                                                                 |
| 13.67 / 13.78 | stem-icon / phone-icon           | The stem cell grows into the clay waveform icon, on both screens (2.5s growth).                                         |
| 17.27 / 17.37 | stem-filed / phone-filed         | Focus files the row under Voice, on both screens.                                                                       |
| 19.37         | phone-exit                       | The phone returns to its parked position.                                                                               |
| 19.37–25.80   | first-read … artifact-shown      | The agent reads, edits `waveformActive.ts` (+3 −1) and shows an inline animated waveform artifact.                      |
| 29.53 / 34.55 | astra-spawned / response-settled | It spawns Astra to review and replies.                                                                                  |
| 36.17 / 37.77 | phone-enter / phone-session-open | Steve's phone; he taps Voice waveform and reads the reply.                                                              |
| 40.45 / 42.90 | phone-typing / phone-sent        | Steve types "ship it" on the real iOS keyboard and sends it.                                                            |
| 45.13 / 46.88 | phone-reply / phone-exit         | The phone shows the reply starting, then goes back to its sidebar.                                                      |
| 46.90–54.45   | steve-message … deployed         | The greeting, the Bash ship, Astra finishing (47.38) and Deployed.                                                      |
| 57.38 / 61.00 | outro / end                      |                                                                                                                         |

Each phone cue waits until the phone's own accessibility tree shows the change.
The sidebar updates arrive by live sync. The phone lags the desktop by about
0.1s. Cues that hints point at also record the target's rectangle (`rect` in
desktop CSS px, `phoneRect` in phone points).

## Verification the take enforces

- The starting model is Astra and there is no GPT-6 Sol row in the picker. The
  chosen model is Opus 5.5.
- The row's title, library icon and filing are read from the daemon (title and
  icon from `listSpaces`, filing from `getSpaceSidebar`).
- The phone opens on this take's own New row right under Happy, with every
  seeded row under its section. Its new-work composer is on Opus 5.5.
- The phone then shows the renamed row, its `clay-<STEM_DEMO_ICON>` icon and the
  row under Voice, each from a fresh inspect.
- The workspace has exactly one changed file before Astra launches.
- On the phone, the transcript shows the completed reply. The native keyboard
  is present. The composer's value is exactly `ship it` before Send.
- Steve's message is in Auto. Astra is idle before Deployed. There is no
  "Working in subagents" status at the end.
- The artifact renders inline with its title and real content before
  `artifact-shown`.
- `shippingVerify` confirms the fixture checkout was restored.

## Fixtures (disclosed in evidence)

- **Checkout.** Repository finding is on the roadmap, so off camera the stem
  cell's empty task folder gets a Git clone of the fixture happy repository.
- **Earlier work.** The section headings are the person's own sidebar edit.
  The earlier rows are stem cells filed by Focus's real tools. The screenplay
  chooses titles, icons and sections.
- **Picker.** The picker lists only today's models: the gym's per-provider
  `include_models`, plus a demo patch that hides the gym's own provider.
- **Artifact.** The page is real `create_artifact` and `write_artifact_file`
  output; the screenplay writes it. Browser-local mode has no artifact page
  host, so `patches/artifact-site.patch` serves the daemon's artifact files
  and renders them in an iframe, where Electron uses its own view.
- **Steve.** A fictional identity attached at the protocol proxy. Git, CI and
  the deploy are offline screenplay fixtures.

## Native iOS app compared with the v21 phone beat

- **No tool activity or diff in the transcript.** The iOS chat shows the
  messages, a "Working in subagents" row and the Astra subagent row. It shows
  no Explore/Edit calls and no syntax-highlighted diff, so Steve reads the
  reply instead of the diff.
- **No unread or working marker.** The finished row on the phone looks exactly
  like the rows next to it, in `phone-home.png` and in accessibility. v21 said
  "new results" here. The desktop does show an unread dot, but only on Happy,
  for Focus's own subtask.
- **Picker differences.** The phone's model picker lists "Codex account: Gym",
  with only a "Gym" model under Codex. The home composer started on "Gym · Off"
  until Opus 5.5 was chosen off camera.
- **Two phone focus windows.** This take focuses the phone twice.
  `lib/composition.mjs` now pairs repeated phone-enter/phone-exit cues; it used
  to read only the first pair. I have not checked whether the website's player
  handles more than one window.
