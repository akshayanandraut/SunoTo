const KEY = "random-chat.ui-theme.v1";

export const UI_THEMES = [
  { id: "classic", name: "Classic", blurb: "The original look" },
  { id: "compact", name: "Compact", blurb: "Tighter, denser layout" },
  { id: "rounded", name: "Rounded", blurb: "Soft corners, roomier" },
  { id: "editorial", name: "Editorial", blurb: "Serif headings, crisp lines" },
];

export const DEFAULT_UI_THEME_ID = "classic";

export function validUiThemeId(id) {
  return UI_THEMES.some(theme => theme.id === id);
}

export function loadUiTheme(storage = localStorage) {
  try {
    const value = storage.getItem(KEY);
    return validUiThemeId(value) ? value : DEFAULT_UI_THEME_ID;
  } catch {
    return DEFAULT_UI_THEME_ID;
  }
}

export function saveUiTheme(id, storage = localStorage) {
  const safe = validUiThemeId(id) ? id : DEFAULT_UI_THEME_ID;
  try { storage.setItem(KEY, safe); } catch {}
  return safe;
}

export function applyUiTheme(id) {
  document.documentElement.dataset.uiTheme = validUiThemeId(id) ? id : DEFAULT_UI_THEME_ID;
}
