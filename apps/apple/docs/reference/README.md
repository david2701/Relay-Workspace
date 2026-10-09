# Reference renders (PR 2 — Atención)

Tablet is **out of scope** for this PR.

The Penpot / `apps-nativas` mockups from the task brief were the design source of
truth (Mac light/dark home, empty, offline; iPhone light/dark home, empty,
offline, detail). Copies below are the closest in-repo renders attached for PR
review when the original Penpot paths are not in this git tree.

## Desktop (Mac Attention)

| File | Notes |
| --- | --- |
| `mac-attention-light.png` | Web AC12 Atención light (list + detail grammar) |
| `mac-attention-dark.png` | Web AC12 Atención dark |

Implemented Mac UI also follows the task mockups: selected row = raised + 1 px
control border + r8 (+ light shadow); needs_you = accent-tint + 2 px rule;
yellow `#F8ED60` fill only with ink `#1F1D17`.

## Mobile (iPhone Attention)

| File | Notes |
| --- | --- |
| `iphone-attention-light.png` | Android Roborazzi phone light (needs_you) |
| `iphone-attention-dark.png` | Android Roborazzi phone dark (needs_you) |
| `iphone-attention-selected-light.png` | Android phone light selected row |

iPhone detail / empty / offline chrome follows the task mockups (NavigationStack,
floating tab bar, offline banner, pending-sync strip).
