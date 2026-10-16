const MODULE_ID = "minimalist-selection-indicator";
const PREVIEW_KEYS = [
  "style",
  "thickness",
  "opacity",
  "padding",
  "customDispositionColors",
  "friendlyColor",
  "neutralColor",
  "hostileColor",
  "secretColor"
];

const previewSettings = new Map();
let previewActive = false;

function setting(key) {
  if (previewActive && previewSettings.has(key)) return previewSettings.get(key);
  return game.settings.get(MODULE_ID, key);
}

function toColorInt(value, fallback = "#FFFFFF") {
  for (const candidate of [value, fallback]) {
    try {
      return Number(foundry.utils.Color.from(candidate));
    } catch (_err) {
      // Try fallback.
    }
  }
  return 0xFFFFFF;
}

function refreshAllTokens() {
  if (!canvas?.ready) return;
  for (const token of canvas.tokens?.placeables ?? []) {
    token.renderFlags.set({
      refreshBorder: true,
      refreshState: true
    });
  }
}

function drawRing(graphics, token, lineWidth, color, alpha, paddingPct) {
  const pad = Math.min(token.w, token.h) * (paddingPct / 100);
  const cx = token.w / 2;
  const cy = token.h / 2;
  const rx = Math.max(1, (token.w / 2) + pad);
  const ry = Math.max(1, (token.h / 2) + pad);

  graphics.lineStyle(lineWidth, color, alpha);
  graphics.drawEllipse(cx, cy, rx, ry);
}

function drawCorners(graphics, token, lineWidth, color, alpha, paddingPct) {
  const pad = Math.min(token.w, token.h) * (paddingPct / 100);
  const left = -pad;
  const top = -pad;
  const right = token.w + pad;
  const bottom = token.h + pad;
  const length = Math.max(8, Math.min(token.w, token.h) * 0.18);

  graphics.lineStyle(lineWidth, color, alpha);

  graphics.moveTo(left, top + length);
  graphics.lineTo(left, top);
  graphics.lineTo(left + length, top);

  graphics.moveTo(right - length, top);
  graphics.lineTo(right, top);
  graphics.lineTo(right, top + length);

  graphics.moveTo(right, bottom - length);
  graphics.lineTo(right, bottom);
  graphics.lineTo(right - length, bottom);

  graphics.moveTo(left + length, bottom);
  graphics.lineTo(left, bottom);
  graphics.lineTo(left, bottom - length);
}

function drawIndicator(graphics, token, style, lineWidth, color, alpha, paddingPct) {
  if (style === "corners") {
    drawCorners(graphics, token, lineWidth, color, alpha, paddingPct);
  } else {
    drawRing(graphics, token, lineWidth, color, alpha, paddingPct);
  }
}

function refreshBorderOverride() {
  const border = this.border;
  border.clear();

  // Only draw a border while a token is selected, hovered, or highlighted.
  if (!this.visible || !(this.controlled || this.hover || this.layer?.highlightObjects)) return;

  const color = this._getBorderColor();
  if (color === null || color === undefined) return;

  const style = setting("style");
  const thickness = setting("thickness");
  const opacity = setting("opacity");
  const paddingPct = setting("padding");

  const baseThickness = Math.max(1, CONFIG.Canvas.objectBorderThickness ?? 4);
  const lineWidth = Math.max(1, baseThickness * thickness);

  // A subtle dark under-stroke keeps the indicator readable over bright maps
  // without recreating Foundry's heavy default selection box.
  drawIndicator(
    border,
    this,
    style,
    lineWidth + Math.max(1, baseThickness * 0.65),
    0x000000,
    opacity * 0.35,
    paddingPct
  );
  drawIndicator(border, this, style, lineWidth, color, opacity, paddingPct);
}

// Respect the TokenDocument's disposition, regardless of selection or hover.
const DISPOSITION_SETTINGS = Object.freeze({
  FRIENDLY: "friendlyColor",
  NEUTRAL: "neutralColor",
  HOSTILE: "hostileColor",
  SECRET: "secretColor"
});

function nativeDispositionColor(disposition) {
  return CONFIG.Canvas.dispositionColors[disposition]
    ?? CONFIG.Canvas.dispositionColors.NEUTRAL
    ?? 0xFFFFFF;
}

function colorToHex(color) {
  return `#${(Number(color) & 0xFFFFFF).toString(16).padStart(6, "0").toUpperCase()}`;
}

function getBorderColorOverride() {
  const disposition = Object.keys(DISPOSITION_SETTINGS).find(
    key => this.document?.disposition === CONST.TOKEN_DISPOSITIONS[key]
  ) ?? "NEUTRAL";
  const nativeColor = nativeDispositionColor(disposition);

  if (!setting("customDispositionColors")) return nativeColor;
  return toColorInt(setting(DISPOSITION_SETTINGS[disposition]), colorToHex(nativeColor));
}

function colorField(initial) {
  const ColorField = foundry.data?.fields?.ColorField;
  return ColorField
    ? new ColorField({ required: true, nullable: false, initial })
    : String;
}

function registerSettings() {
  game.settings.register(MODULE_ID, "style", {
    name: "MSI.Settings.Style.Name",
    hint: "MSI.Settings.Style.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      ring: game.i18n.localize("MSI.Settings.Style.Ring"),
      corners: game.i18n.localize("MSI.Settings.Style.Corners")
    },
    default: "ring",
    onChange: refreshAllTokens
  });

  game.settings.register(MODULE_ID, "thickness", {
    name: "MSI.Settings.Thickness.Name",
    hint: "MSI.Settings.Thickness.Hint",
    scope: "world",
    config: true,
    type: Number,
    range: {
      min: 0.25,
      max: 2,
      step: 0.25
    },
    default: 0.5,
    onChange: refreshAllTokens
  });

  game.settings.register(MODULE_ID, "opacity", {
    name: "MSI.Settings.Opacity.Name",
    hint: "MSI.Settings.Opacity.Hint",
    scope: "world",
    config: true,
    type: Number,
    range: {
      min: 0.2,
      max: 1,
      step: 0.1
    },
    default: 0.8,
    onChange: refreshAllTokens
  });

  game.settings.register(MODULE_ID, "padding", {
    name: "MSI.Settings.Padding.Name",
    hint: "MSI.Settings.Padding.Hint",
    scope: "world",
    config: true,
    type: Number,
    range: {
      min: -8,
      max: 20,
      step: 1
    },
    default: 4,
    onChange: refreshAllTokens
  });

  game.settings.register(MODULE_ID, "customDispositionColors", {
    name: "MSI.Settings.CustomDispositionColors.Name",
    hint: "MSI.Settings.CustomDispositionColors.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: refreshAllTokens
  });

  for (const [disposition, key] of Object.entries(DISPOSITION_SETTINGS)) {
    const defaultColor = colorToHex(nativeDispositionColor(disposition));
    game.settings.register(MODULE_ID, key, {
      name: `MSI.Settings.${disposition}.Name`,
      hint: `MSI.Settings.${disposition}.Hint`,
      scope: "world",
      config: true,
      type: colorField(defaultColor),
      default: defaultColor,
      onChange: refreshAllTokens
    });
  }
}

function normalizeSettingsRoot(html) {
  if (html instanceof HTMLElement) return html;
  if (globalThis.jQuery && html instanceof jQuery) return html.get(0);
  if (html?.[0] instanceof HTMLElement) return html[0];
  return null;
}

function fieldValue(root, key) {
  const field = root.querySelector(`[name="${MODULE_ID}.${key}"]`);
  if (!field) return undefined;

  if (key === "customDispositionColors") return field.checked;

  const value = field.value;
  if (["thickness", "opacity", "padding"].includes(key)) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : undefined;
  }
  return value;
}

function applyPreview(root) {
  previewSettings.clear();

  for (const key of PREVIEW_KEYS) {
    const value = fieldValue(root, key);
    if (value !== undefined) previewSettings.set(key, value);
  }

  previewActive = true;
  refreshAllTokens();
  ui.notifications.info(game.i18n.localize("MSI.Preview.Applied"));
}

function clearPreview() {
  if (!previewActive) return;
  previewActive = false;
  previewSettings.clear();
  refreshAllTokens();
}

function addPreviewButton(html) {
  const root = normalizeSettingsRoot(html);
  if (!root) return;

  const lastField = root.querySelector(`[name="${MODULE_ID}.secretColor"]`);
  if (!lastField) return;

  const lastGroup = lastField.closest(".form-group") ?? lastField.parentElement;
  if (!lastGroup || lastGroup.parentElement?.querySelector(".msi-preview-button")) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "msi-preview-button";
  button.innerHTML = `<i class="fa-solid fa-eye"></i> ${game.i18n.localize("MSI.Preview.Button")}`;
  button.title = game.i18n.localize("MSI.Preview.Hint");
  button.addEventListener("click", () => applyPreview(root));

  lastGroup.insertAdjacentElement("afterend", button);
}

Hooks.once("init", () => {
  registerSettings();
});

Hooks.once("setup", () => {
  const libWrapperActive = game.modules.get("lib-wrapper")?.active && globalThis.libWrapper;

  if (libWrapperActive) {
    libWrapper.register(MODULE_ID, "Token.prototype._refreshBorder", refreshBorderOverride, "OVERRIDE");
    libWrapper.register(MODULE_ID, "Token.prototype._getBorderColor", getBorderColorOverride, "OVERRIDE");
    console.log(`${MODULE_ID} | Initialized with libWrapper`);
    return;
  }

  // No dependency is required. When libWrapper is present we use it for better
  // interoperability; otherwise a small direct override keeps the module standalone.
  const TokenClass = CONFIG.Token.objectClass;
  TokenClass.prototype._refreshBorder = refreshBorderOverride;
  TokenClass.prototype._getBorderColor = getBorderColorOverride;
  console.log(`${MODULE_ID} | Initialized without libWrapper`);
});

Hooks.on("renderSettingsConfig", (_app, html) => {
  addPreviewButton(html);
});

Hooks.on("closeSettingsConfig", () => {
  // If the window is closed without saving, return the canvas to persisted values.
  // If it was saved, persisted values are already the source of truth after this reset.
  clearPreview();
});

Hooks.on("updateToken", (document, changes) => {
  if (Object.hasOwn(changes, "disposition")) {
    document.object?.renderFlags.set({ refreshBorder: true });
  }
});

Hooks.once("ready", refreshAllTokens);
