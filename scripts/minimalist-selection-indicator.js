const MODULE_ID = "minimalist-selection-indicator";
const PREVIEW_KEYS = [
  "style",
  "thickness",
  "opacity",
  "padding",
  "contourWidth",
  "contrastWidth",
  "contourOpacity",
  "playerCharacterColors",
  "playerMainColor",
  "playerContrastColor",
  "otherContrastColor",
  "customDispositionColors",
  "friendlyColor",
  "neutralColor",
  "hostileColor",
  "secretColor"
];

const previewSettings = new Map();
let previewActive = false;

// A single filter is attached only to hovered/controlled tokens. Keeping it
// on the token mesh (instead of its square/ellipse border graphics) lets the
// outline follow the actual rendered texture alpha, including transparent gaps.
const silhouetteFilters = new WeakMap();
const SILHOUETTE_FRAGMENT = `
  varying vec2 vTextureCoord;
  uniform sampler2D uSampler;
  uniform vec4 inputPixel;
  uniform vec4 inputClamp;
  uniform float uMainWidth;
  uniform float uContrastWidth;
  uniform float uOpacity;
  uniform vec3 uMainColor;
  uniform vec3 uContrastColor;

  void main(void) {
    vec4 source = texture2D(uSampler, vTextureCoord);
    float innerAlpha = 0.0;
    float outerAlpha = 0.0;
    const float TWO_PI = 6.28318530718;

    // Dilate the alpha mask at two different radii. Multiple distances avoid
    // gaps on thin images and silhouettes with holes between opaque areas.
    for (int i = 0; i < 16; i++) {
      float angle = TWO_PI * float(i) / 16.0;
      vec2 direction = vec2(cos(angle), sin(angle));
      for (int j = 1; j <= 3; j++) {
        float distanceFraction = float(j) / 3.0;
        vec2 insideUV = vTextureCoord + direction * (uMainWidth * distanceFraction) * inputPixel.zw;
        vec2 outsideUV = vTextureCoord + direction * ((uMainWidth + uContrastWidth) * distanceFraction) * inputPixel.zw;
        innerAlpha = max(innerAlpha, texture2D(uSampler, clamp(insideUV, inputClamp.xy, inputClamp.zw)).a);
        outerAlpha = max(outerAlpha, texture2D(uSampler, clamp(outsideUV, inputClamp.xy, inputClamp.zw)).a);
      }
    }

    float mainCoverage = smoothstep(0.03, 0.8, innerAlpha);
    float outerCoverage = smoothstep(0.03, 0.8, max(innerAlpha, outerAlpha));
    // Preserve existing art. Draw an outline only in empty/antialiased pixels.
    float freeAlpha = 1.0 - smoothstep(0.03, 0.35, source.a);
    float outlineAlpha = outerCoverage * freeAlpha * uOpacity;
    vec3 outlineColor = mix(uContrastColor, uMainColor, mainCoverage);

    // The input and output of Pixi v7 filters use premultiplied alpha.
    gl_FragColor = vec4(
      source.rgb + outlineColor * outlineAlpha,
      source.a + outlineAlpha
    );
  }
`;

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
    // A border render flag is not guaranteed to be applied immediately.
    // Update any already-attached outline so the settings preview is live.
    if (setting("style") === "silhouette") syncSilhouette(token);
    else removeSilhouette(token);
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


function isPlayerCharacter(token) {
  const actor = token.actor;
  if (!actor || actor.type !== "character") return false;
  return Boolean(actor.hasPlayerOwner)
    || Boolean(game.users?.some(user => user.character?.id === actor.id));
}

function colorComponents(value) {
  const number = toColorInt(value);
  return [
    ((number >> 16) & 255) / 255,
    ((number >> 8) & 255) / 255,
    (number & 255) / 255
  ];
}

function removeSilhouette(token) {
  const previous = silhouetteFilters.get(token);
  if (!previous) return;
  const mesh = previous.mesh;
  if (mesh && !mesh.destroyed) {
    const otherFilters = (mesh.filters ?? []).filter(filter => filter !== previous.filter);
    mesh.filters = otherFilters.length ? otherFilters : null;
  }
  previous.filter.destroy?.();
  silhouetteFilters.delete(token);
}

function syncSilhouette(token) {
  if (setting("style") !== "silhouette") {
    removeSilhouette(token);
    return false;
  }

  const mesh = token.mesh;
  if (!mesh || mesh.destroyed || !mesh.texture || typeof PIXI?.Filter !== "function") {
    removeSilhouette(token);
    return false;
  }

  // Selection/hover state is checked here, never while refreshing a token's
  // native border Graphics: Foundry may refresh those before interaction state.
  if (!token.visible || !(token.controlled || token.hover)) {
    removeSilhouette(token);
    return true;
  }

  const player = setting("playerCharacterColors") && isPlayerCharacter(token);
  const mainColor = player ? setting("playerMainColor") : token._getBorderColor();
  const contrastColor = player ? setting("playerContrastColor") : setting("otherContrastColor");
  const mainWidth = Math.max(0.5, Number(setting("contourWidth")) || 4);
  const contrastWidth = Math.max(0.5, Number(setting("contrastWidth")) || 1.5);

  let current = silhouetteFilters.get(token);
  if (current?.mesh !== mesh || !((mesh.filters ?? []).includes(current?.filter))) {
    removeSilhouette(token);
    try {
      const filter = new PIXI.Filter(undefined, SILHOUETTE_FRAGMENT, {
        uMainWidth: mainWidth,
        uContrastWidth: contrastWidth,
        uOpacity: Number(setting("contourOpacity")),
        uMainColor: colorComponents(mainColor),
        uContrastColor: colorComponents(contrastColor)
      });
      filter.padding = Math.ceil(mainWidth + contrastWidth + 2);
      mesh.filters = [...(mesh.filters ?? []), filter];
      current = { mesh, filter };
      silhouetteFilters.set(token, current);
    } catch (error) {
      console.warn(`${MODULE_ID} | Could not install silhouette filter; using ring fallback`, error);
      removeSilhouette(token);
      return false;
    }
  } else {
    Object.assign(current.filter.uniforms, {
      uMainWidth: mainWidth,
      uContrastWidth: contrastWidth,
      uOpacity: Number(setting("contourOpacity")),
      uMainColor: colorComponents(mainColor),
      uContrastColor: colorComponents(contrastColor)
    });
    current.filter.padding = Math.ceil(mainWidth + contrastWidth + 2);
  }

  return true;
}

function refreshBorderOverride() {
  const border = this.border;
  border.clear();

  // The silhouette lives on the mesh, not the border Graphics container.
  // For unsupported renderers, retain a visible ring as a safe fallback.
  if (syncSilhouette(this)) return;
  removeSilhouette(this);

  // Foundry v14 manages border visibility separately from the drawing logic.
  // Do not gate rendering on controlled/hover state here: a token border
  // may need to be populated before its interaction state changes.
  if (!this.visible) return;

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
      silhouette: game.i18n.localize("MSI.Settings.Style.Silhouette"),
      ring: game.i18n.localize("MSI.Settings.Style.Ring"),
      corners: game.i18n.localize("MSI.Settings.Style.Corners")
    },
    default: "silhouette",
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


  // The silhouette has dedicated widths and opacity, independent of the
  // legacy ring/corners thickness controls.
  for (const [key, min, max, step, fallback] of [
    ["contourWidth", 1, 12, 0.5, 4],
    ["contrastWidth", 0.5, 5, 0.5, 1.5],
    ["contourOpacity", 0.2, 1, 0.1, 1]
  ]) {
    game.settings.register(MODULE_ID, key, {
      name: `MSI.Settings.${key}.Name`,
      hint: `MSI.Settings.${key}.Hint`,
      scope: "world",
      config: true,
      type: Number,
      range: { min, max, step },
      default: fallback,
      onChange: refreshAllTokens
    });
  }

  game.settings.register(MODULE_ID, "playerCharacterColors", {
    name: "MSI.Settings.playerCharacterColors.Name",
    hint: "MSI.Settings.playerCharacterColors.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: refreshAllTokens
  });

  for (const [key, defaultColor] of [
    ["playerMainColor", "#FFFFFF"],
    ["playerContrastColor", "#000000"],
    ["otherContrastColor", "#000000"]
  ]) {
    game.settings.register(MODULE_ID, key, {
      name: `MSI.Settings.${key}.Name`,
      hint: `MSI.Settings.${key}.Hint`,
      scope: "world",
      config: true,
      type: colorField(defaultColor),
      default: defaultColor,
      onChange: refreshAllTokens
    });
  }

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

  if (["customDispositionColors", "playerCharacterColors"].includes(key)) return field.checked;

  const value = field.value;
  if (["thickness", "opacity", "padding", "contourWidth", "contrastWidth", "contourOpacity"].includes(key)) {
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

Hooks.on("hoverToken", token => syncSilhouette(token));
Hooks.on("controlToken", token => syncSilhouette(token));
Hooks.on("refreshToken", token => syncSilhouette(token));
Hooks.on("drawToken", token => syncSilhouette(token));
Hooks.on("destroyToken", token => removeSilhouette(token));

Hooks.on("updateToken", (document, changes) => {
  if (Object.hasOwn(changes, "disposition") || Object.hasOwn(changes, "texture") || Object.hasOwn(changes, "actorLink")) {
    document.object?.renderFlags.set({ refreshBorder: true });
    if (document.object) syncSilhouette(document.object);
  }
});

Hooks.on("updateActor", actor => {
  for (const token of canvas?.tokens?.placeables ?? []) {
    if (token.actor?.id === actor.id) syncSilhouette(token);
  }
});

Hooks.once("ready", refreshAllTokens);
