# Light Mode Cinematic Texture Options

These are vetted dependencies that can add cinematic streaks/textures while keeping the product in light mode.

## Best Candidates

1. `vanta` + `three`
- Purpose: animated hero-style backgrounds (fog, clouds, cells, waves)
- Why use it: fast visual impact on landing/auth surfaces
- Tradeoff: larger runtime cost; best for a few pages only

2. `@tsparticles/react` + `@tsparticles/slim`
- Purpose: configurable particle streaks and light trails
- Why use it: strong control over color, motion, density, interactivity
- Tradeoff: config-heavy; can be overdone if density is high

3. `simplex-noise`
- Purpose: procedural texture values for custom CSS/canvas overlays
- Why use it: very lightweight way to generate unique textures per page
- Tradeoff: requires custom implementation effort

## Recommendation

Use a hybrid stack:
- Default throughout app: CSS-based `LightCinematicTexture` overlays (already integrated in Dashboard + Projects)
- Optional accent layer on landing/preview: `vanta` for one hero section
- Optional interactive layer for marketing states: `@tsparticles/react` with low density and low velocity

## Guardrails

- Keep opacity low (generally <= 0.22)
- Never place moving effects behind dense text blocks
- Prefer accent colors from brand tokens (`--flux-amber`, `--flux-teal`)
- Disable heavy animated layers on low-power devices
