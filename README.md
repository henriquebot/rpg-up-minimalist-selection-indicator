# Minimalist Selection Indicator

A tiny, system-agnostic Foundry VTT v14 module that replaces the heavy square token selection frame with a cleaner indicator.

## Features

- **Alpha-aware image silhouette** (new default): highlights the token artwork's visible shape, not its square or circular bounding box
- Double outline for contrast: thick main stroke + thin outer stroke, visible on both dark and light maps
- **PC defaults: white main outline and black outer outline** (editable); other tokens retain Foundry disposition colors with a dark outer edge
- **Ring** and **Corner brackets** as alternative modes
- Uses Foundry's **native token disposition colors** (friendly, neutral, hostile, secret) by default
- Optional custom disposition colors via native Foundry **color pickers**; applies to selection and hover
- Adjustable thickness, opacity, and padding
- **Apply Preview** button: test unsaved settings directly on the canvas without closing the settings window
- English and Brazilian Portuguese localization, following Foundry's active language
- Works with square, rectangular, and gridless tokens
- No required dependencies
- Uses **libWrapper** automatically if it is installed and active

## New in 0.4.0

- New silhouette-outline mode that respects transparent images and irregular shapes.
- White-and-black PC indicator defaults; disposition-aware non-PC outlines.
- Dedicated settings for both outline widths, colors, opacity, and preview.
- Ring and corners remain available.

## Fix in 0.3.1

- Removed the extra selection/hover gate that prevented some token borders from being drawn. Foundry controls when borders are visible.
- Keeps disposition-based colors and custom overrides from 0.3.0.

## Compatibility

- Foundry VTT **v14**
- Verified against the v14.368 API
- System agnostic

## Installation

In Foundry VTT, open **Add-on Modules → Install Module** and paste this manifest URL:

```
https://raw.githubusercontent.com/henriquebot/rpg-up-minimalist-selection-indicator/main/module.json
```

Then enable **Minimalist Selection Indicator** in your world.

## Configuration

Open **Game Settings → Configure Settings → Module Settings**.

Available settings:

- Indicator style: Image silhouette / Ring / Corner brackets
- Main silhouette width (default 4 px), outer contrast width (default 1.5 px), silhouette opacity (default 100%)
- PC-specific silhouette colors (white/black by default), adjustable separately
- Thickness, opacity and padding for the original ring/corner modes
- Use custom disposition colors (off by default)
- Friendly, neutral, hostile, and secret token colors
- Apply Preview

In image silhouette mode, the pixel shader follows the rendered alpha mask of the token artwork. It is only attached while a token is selected or hovered and is removed when no longer needed. If a filter cannot be installed, the token falls back to a normal ring.

Player characters are detected from a player-owned `character` actor (or an actor assigned as a user's character) and start with a white primary outline and a narrow black outer outline. Non-PC tokens use disposition colors for the primary outline and black for contrast. Both stroke widths and all colors are configurable.

**Upgrading:** New worlds use the image silhouette mode by default. Existing worlds that have explicitly saved another style retain their chosen style.

With custom colors disabled, the module reads the current Foundry disposition colors. Enable custom colors to override each disposition independently. The indicator uses the token's disposition even while selected.

Preview changes are temporary until **Save Changes** is used. Closing the settings window without saving restores the persisted appearance.

## Languages

- English
- Português (Brasil)

## Why?

Foundry's standard token selection frame is useful, but visually heavy for immersive, cinematic, or horror games. This module keeps token selection readable while reducing the "board game" look of the canvas.

## License

MIT.
