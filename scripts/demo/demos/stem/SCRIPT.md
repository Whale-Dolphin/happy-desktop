# Stem demo: new work starts as a stem cell, and the team joins in

New work opens as a stem cell, names itself, grows its icon and files itself.
The agent does the work and shows a live preview. It then finds the teammate who
reviews voice work and loops him in. Steve (designer) answers from his phone, the
agent fixes and ships, and once Steve signs off, Focus archives the task. Use
today's UI with Settings → Experimental → Spaces sidebar and Stem cells turned
on. Everything on screen is real product behavior. Fixtures are disclosed in
`stem.evidence.json`.

The daemon runs in team mode (`feature.team`) with two seeded members: Alex,
the owner at the desktop, and Steve, a designer who follows "Every voice
feature". The gym signs each member's HS256 token and gives each a Unix socket
that speaks to the daemon as them (`scenario/team.mjs`). The phone is paired
as Steve, so it shows his own sidebar.

The `team` composition keeps the desktop centre stage. The phone is off screen
until Steve is looped in. It then rises from below over the window's right side,
cut off at the bottom, and drops away once he signs off.

## Recording

```sh
HAPPY_DESKTOP_AGENT_EXECUTABLE=<happy-agent with loop-in and the waveform slug> STEM_DEMO_ICON=waveform \
  pnpm demo record stem --out scripts/demo/demos/stem/artifacts/<take> \
  --phone-udid <udid> --phone-direct
pnpm demo compose team --desktop <take>/stem.mp4 \
  --phone <take>/phone-screen.mp4 --cues <take>/cues.json --out <take>/composed
```

- The daemon needs the loop-in work: `list_teammates`, `notify_teammate`,
  Focus's `join_task` and `archive_shipped_task`, and the `looped_in`
  unread mark. That is happy-agent branch `worktree/loop-in-teammate`, which
  also has the space icons.
- `STEM_DEMO_ICON` picks the clay icon Focus gives the row. The default is
  `new-feature`. `waveform` needs a daemon whose icon library has it and an
  iOS build with `clay-waveform.png`.
- `--phone-direct` means the phone is the native Happy iOS app
  (`packages/happy-ios`, bundle `com.slopus.happy.dev`). It needs the build
  that shows a looped-in row as new (`stem-row` value `new…`) and renders
  `<happy-user>` mentions.
- Pair once, off camera, as Steve. The connector is per member, so pairing goes
  through Steve's own client (`gym.memberClient("steve")`):
    1. Start the pairing with `startMobilePairing` and open its QR URL on the
       Simulator with `simctl openurl`.
    2. Check the emoji match the daemon's and tap Emoji match on the phone.
    3. Call `confirmMobilePairing(id)` with Steve's client.
- The pairing is stored in `.d`, so `pnpm demo reset` removes it and you have
  to pair again.
- Recording needs execution outside the sandbox (Chromium, simctl, Maestro).

## Beats and cues (take `v25-team-r7`, 60fps, 4,625 frames, 77.1s)

| s             | cue                                | what is on screen                                                                                       |
| ------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 0             | —                                  | An already-opened stem cell: the New row is selected, its composer empty, on GPT-6 Astra. No phone yet. |
| 2.97 / 5.53   | picker-open / picker-chosen        | Claude, Codex and Grok side by side; Opus 5.5 is chosen. GPT-6 Sol is absent.                           |
| 6.45 / 9.82   | typing-started / work-started      | "Add an animated waveform to the voice agent." The pointer hides while typing.                          |
| 10.85         | stem-named                         | The row names itself "Voice waveform".                                                                  |
| 13.52         | stem-icon                          | The stem cell grows into the clay waveform icon (2.5s growth).                                          |
| 16.98         | stem-filed                         | Focus files the row under Voice.                                                                        |
| 17.12–23.55   | first-read … artifact-shown        | The agent reads, edits `waveformActive.ts` (+3 −1) and shows an inline animated waveform (28 bars).     |
| 28.13         | looped-in                          | List teammates, Notify teammate, then "Looping in @Steve (designer), who reviews every voice feature."  |
| 31.52         | steve-joined                       | Steve's own Focus answered with `join_task`; his membership carries the `looped_in` mark.               |
| 32.95 / 33.92 | phone-enter / phone-row            | Steve's phone rises: his Design rows, and Voice waveform highlighted as new.                            |
| 36.70         | phone-session-open                 | He opens it and sees the mention.                                                                       |
| 39.45 / 46.35 | phone-typing-feedback / phone-sent | He types "Good, just a bit wide" on the real iOS keyboard. It arrives on the desktop as Steve.          |
| 49.45         | narrowed                           | "Narrowing it to five bars." and a new inline preview with five bars.                                   |
| 51.28 / 59.38 | ship-running / deployed            | The Bash ship, the checkout reads clean, then "Shipped: five bars at most, live on main. @Steve".       |
| 61.37 / 64.28 | phone-typing-thanks / phone-thanks | Steve types "Great!".                                                                                   |
| 65.72 / 67.28 | phone-exit / steve-thanks-visible  | The phone drops away; the agent thanks him.                                                             |
| 68.63         | moved-on                           | The person opens Voice notes, their next voice work.                                                    |
| 69.65 / 71.00 | archiving / archived               | The owner's Focus hears Steve sign off and calls `archive_shipped_task`; Voice waveform leaves.         |
| 73.47 / 77.08 | outro / end                        |                                                                                                         |

Cues that hints point at also record the target's rectangle (`rect` in
desktop CSS px, `phoneRect` in phone points).

## Verification the take enforces

- The starting model is Astra and there is no GPT-6 Sol row in the picker. The
  chosen model is Opus 5.5.
- The row's title, library icon and filing are read from the daemon.
- The phone opens on Steve's own sidebar: his Design rows, none of the owner's,
  and no Voice waveform until he is looped in.
- The workspace has exactly one changed file before the preview.
- The loop-in reply reads "@Steve" on the desktop and on the phone; Steve's
  task membership has `unread.reason === "looped_in"`; the phone row's value
  starts with "new".
- Both of Steve's messages are typed on the native keyboard and read back
  exactly from the composer. His feedback arrives with his own user ID.
- `shippingVerify` confirms the fixture checkout was restored, read before
  the archive takes the workspace away.
- The task is archived and its row is gone from the desktop sidebar.

## Fixtures (disclosed in evidence)

- **Checkout.** Repository finding is on the roadmap, so off camera the stem
  cell's empty task folder gets a Git clone of the fixture happy repository.
- **Earlier work.** Both members' sections are their own sidebar edits. Their
  earlier rows are stem cells filed by their Focus's real tools. The screenplay
  chooses titles, icons and sections.
- **Team.** Alex and Steve are seeded in the daemon's machine configuration;
  the gym mints their tokens. Steve's mind is the screenplay's: his Focus joins,
  and the owner's Focus archives, because the screenplay answers with those
  tools.
- **Picker.** The picker lists only today's models: the gym's per-provider
  `include_models`, plus a demo patch that hides the gym's own provider.
- **Artifacts.** Both previews are real `create_artifact` and
  `write_artifact_file` output; the screenplay writes them. Browser-local mode
  has no artifact page host, so `patches/artifact-site.patch` serves the
  daemon's artifact files and renders them in an iframe.
- **Shipping.** Git, CI and the deploy are offline screenplay fixtures.

## Known differences

- **Steve's row icon.** On his phone the looped-in row has the default task
  icon: the waveform icon is the owner's own space, and Steve's Focus does not
  set one.
- **Home composer.** Steve's phone composer reads "Gym · Off". It sits in the
  part of the phone that is out of frame.
