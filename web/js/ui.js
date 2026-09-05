import { UI_THEMES } from "./ui-theme.js";

export function header(activeCount, inChat = false, weather = null, signedIn = false, walletBalanceCredits = null, uiTheme = "classic") {
  const activeBadge = Number.isFinite(activeCount) ? `<span class="active-users"><span class="active-dot"></span>${activeCount.toLocaleString("en-IN")} online</span>` : "";
  const actions = inChat ? "" : signedIn ? `<button class="btn btn-ghost" data-route="home">Home</button><button class="btn btn-ghost" data-route="account">Account</button><button class="btn btn-primary" data-route="onboarding">Start chatting</button>` : `<button class="btn btn-ghost" data-route="home">Home</button><button class="btn btn-ghost" data-route="account">Sign in</button><button class="btn btn-primary" data-route="onboarding">Start chatting</button>`;
  const weatherBadge = weather === "loading" ? `<span class="weather-badge muted">Loading weather…</span>` : weather ? `<span class="weather-badge" title="${weather.label}">${weather.temperatureC}°C ${weather.label}</span>` : "";
  const walletBadge = signedIn && Number.isFinite(walletBalanceCredits) ? `<button class="wallet-badge" data-route="account" title="Sparks balance">⚡ ${Math.floor(walletBalanceCredits / 100).toLocaleString("en-IN")}</button>` : "";
  const themeSwitch = inChat ? "" : themeSwitcher(uiTheme);
  return `<header class="site-header container"><a class="brand" href="#/" data-route="home"><span class="brand-mark"><img src="/assets/logo.png" alt="" width="34" height="34"></span> SunoTo</a><div class="header-actions">${weatherBadge}${activeBadge}${walletBadge}${themeSwitch}${actions}</div></header>`;
}

function themeSwitcher(uiTheme) {
  const options = UI_THEMES.map(theme => `<button type="button" class="ui-theme-option${theme.id === uiTheme ? " active" : ""}" data-ui-theme="${theme.id}">${theme.name}<small>${theme.blurb}</small></button>`).join("");
  return `<div class="ui-theme-switch"><button type="button" class="ui-theme-toggle" data-ui-theme-toggle title="Change theme" aria-label="Change theme">🎨</button><div class="ui-theme-menu" role="menu">${options}</div></div>`;
}

export function footer() {
  return `<footer class="footer container"><span class="brand">SunoTo</span><nav><a href="/community-guidelines.html">Guidelines</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a><a href="/grievance.html">Grievance</a><a href="/feedback.html">Feedback</a><a href="/admin.html">Admin</a></nav><small class="muted">18+ · Text only · Built for India</small></footer>`;
}

export function nav(active) {
  return `<nav class="bottom-nav" aria-label="Product sections">${[["home","Home"],["chat","Chat"],["party","Party"],["games","Games"],["forums","Forums"],["store","Store"],["history","History"],["favourites","Favourites"],["account","Account"]].map(([key,label])=>`<button class="${active===key?"active":""}" data-route="${key}">${label}</button>`).join("")}</nav>`;
}

export function exploreStrip(active) {
  const items = [["onboarding","💬","Start a chat"],["party","🎉","Party rooms"],["games","⚡","Games"],["history","🕑","History"],["favourites","♡","Favourites"],["account","👤","Account"]];
  return `<nav class="explore-strip" aria-label="Explore SunoTo">${items.map(([key,icon,label])=>`<button class="explore-chip${active===key?" active":""}" data-route="${key}"><span>${icon}</span>${label}</button>`).join("")}</nav>`;
}

export function escapeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[character]);
}
