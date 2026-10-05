# AC12 anti-generic gate (§5.1) — self-check

Evidence: screenshots in `/opt/cursor/artifacts/ac12-*.png` (1440×900, light+dark).
`contrast-matrix.mjs` exit 0 for `:root` and `.dark`.

| # | Prohibido | Result |
|---|---|---|
| 1 | Inter/Roboto/Geist as UI font | **pass** — Schibsted Grotesk self-hosted (OFL); fallback documented Onest/Hanken/Figtree |
| 2 | Neutros zinc/slate default | **pass** — `--paper` `#FBFAF7` / `#141310` |
| 3 | More than one chromatic accent | **pass** — hue 258 only outside ok/warn/crit |
| 4 | Gradients, glow, glass, purple | **pass** — none in CSS |
| 5 | ✨, robots, chat bubbles, typing… | **pass** — ActorMark only |
| 6 | Whole row red/yellow for overdue/blocked | **pass** — date text color only |
| 7 | Round checkbox as primary gesture | **pass** — status glyph + ActorMark; complete via X/button |
| 8 | Badges on every rail view | **pass** — counter only on Atención |
| 9 | Toasts for agent/sync changes | **pass** — row flash only |
| 10 | Centered blank spinner | **pass** — skeleton rows |
| 11 | Empty with illustration/emoji/¡Nada! | **pass** — §4.8 copy |
| 12 | Exclamations / Ups / confetti | **pass** — grep-clean UI strings |
| 13 | Modal detail ≥1024 | **pass** — split panel |
| 14 | Stagger, count-up, bounce, `transition: all` | **pass** |
| 15 | Notes as item textarea | **pass** — first-class notes + roles |
| 16 | Status by color only | **pass** — 7 custom glyphs + labels |
| 17 | Same avatar shape for agent/human | **pass** — circle vs rounded square |
| 18 | Shadow cards in list | **pass** — flat rows, 1px separators |
| 19 | Lucide-only status set | **pass** — custom StatusGlyph SVGs |
| 20 | Chat/prompt box in app | **pass** — none |

North-star row audit: each Atención row shows witness (ActorMark), status+why (glyph+reason), next step (open/respond).
