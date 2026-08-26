export function header() {
  return `<header class="site-header container"><a class="brand" href="#/"><span class="brand-mark">R</span> Random Chat</a><div class="header-actions"><button class="btn btn-ghost" data-route="account">Sign in</button><button class="btn btn-primary" data-route="onboarding">Start chatting</button></div></header>`;
}

export function footer() {
  return `<footer class="footer container"><span class="brand">Random Chat India</span><nav><a href="/community-guidelines.html">Guidelines</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a><a href="/grievance.html">Grievance</a><a href="/feedback.html">Feedback</a><a href="/admin.html">Admin</a></nav><small class="muted">18+ · Text only · Built for India</small></footer>`;
}

export function nav(active) {
  return `<nav class="bottom-nav" aria-label="Product sections">${[["chat","Chat"],["history","History"],["favourites","Favourites"],["account","Account"]].map(([key,label])=>`<button class="${active===key?"active":""}" data-route="${key}">${label}</button>`).join("")}</nav>`;
}

export function escapeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[character]);
}
