export function header(activeCount, inChat = false) {
  const activeBadge = Number.isFinite(activeCount) ? `<span class="active-users"><span class="active-dot"></span>${activeCount.toLocaleString("en-IN")} online</span>` : "";
  const actions = inChat ? "" : `<button class="btn btn-ghost" data-route="account">Sign in</button><button class="btn btn-primary" data-route="onboarding">Start chatting</button>`;
  return `<header class="site-header container"><a class="brand" href="#/" data-route="home"><span class="brand-mark"><img src="/assets/logo.png" alt="" width="34" height="34"></span> SunoTo</a><div class="header-actions">${activeBadge}${actions}</div></header>`;
}

export function footer() {
  return `<footer class="footer container"><span class="brand">SunoTo</span><nav><a href="/community-guidelines.html">Guidelines</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a><a href="/grievance.html">Grievance</a><a href="/feedback.html">Feedback</a><a href="/admin.html">Admin</a></nav><small class="muted">18+ · Text only · Built for India</small></footer>`;
}

export function nav(active) {
  return `<nav class="bottom-nav" aria-label="Product sections">${[["home","Home"],["chat","Chat"],["party","Party"],["games","Games"],["history","History"],["favourites","Favourites"],["account","Account"]].map(([key,label])=>`<button class="${active===key?"active":""}" data-route="${key}">${label}</button>`).join("")}</nav>`;
}

export function exploreStrip(active) {
  const items = [["onboarding","💬","Start a chat"],["party","🎉","Party rooms"],["games","⚡","Games"],["history","🕑","History"],["favourites","♡","Favourites"],["account","👤","Account"]];
  return `<nav class="explore-strip" aria-label="Explore SunoTo">${items.map(([key,icon,label])=>`<button class="explore-chip${active===key?" active":""}" data-route="${key}"><span>${icon}</span>${label}</button>`).join("")}</nav>`;
}

export function escapeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[character]);
}
