# Minimalist Selection Indicator

A tiny, system-agnostic Foundry VTT v14 module that replaces the heavy square token selection frame with a cleaner indicator.

## Features

- **Ring** selection indicator (default)
- **Corner brackets** alternative
- Uses Foundry's **native token disposition colors** (friendly, neutral, hostile, secret) by default
- Optional custom disposition colors via native Foundry **color pickers**; applies to selection and hover
- Adjustable thickness, opacity, and padding
- **Apply Preview** button: test unsaved settings directly on the canvas without closing the settings window
- English and Brazilian Portuguese localization, following Foundry's active language
- Works with square, rectangular, and gridless tokens
- No required dependencies
- Uses **libWrapper** automatically if it is installed and active

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

- Indicator style: Ring / Corner brackets
- Line thickness
- Opacity
- Indicator padding
- Use custom disposition colors (off by default)
- Friendly, neutral, hostile, and secret token colors
- Apply Preview

With custom colors disabled, the module reads the current Foundry disposition colors. Enable custom colors to override each disposition independently. The indicator uses the token's disposition even while selected.

Preview changes are temporary until **Save Changes** is used. Closing the settings window without saving restores the persisted appearance.

## Languages

- English
- Português (Brasil)

## Why?

Foundry's standard token selection frame is useful, but visually heavy for immersive, cinematic, or horror games. This module keeps token selection readable while reducing the "board game" look of the canvas.

## License

MIT.
