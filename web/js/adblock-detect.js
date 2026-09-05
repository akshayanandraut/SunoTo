// Bait element mirrors the real class names our own ad slots use (see ads.js: "ad-card", "ad-slot")
// plus common EasyList-style tokens ("adsbox", "ad-banner"), so this detects the same cosmetic-filter
// rules that would hide our real ad inventory -- not a separate synthetic check.
// Deliberately does NOT set data-ad-slot: mountAds() (ads.js) removes every element with that attribute
// on each render, which would delete this bait mid-check and produce a false "ad blocker" positive.
export async function detectAdBlock() {
  const bait = document.createElement("div");
  bait.className = "ad-card ad-slot ad-slot-top ads adsbox advertisement ad-banner";
  bait.style.cssText = "position:absolute;left:-9999px;top:0;width:40px;height:40px;pointer-events:none;";
  document.body.appendChild(bait);
  await new Promise((resolve) => setTimeout(resolve, 150));
  const stillPresent = document.body.contains(bait);
  const style = stillPresent ? getComputedStyle(bait) : null;
  const blocked = !stillPresent || bait.offsetHeight === 0 || bait.offsetParent === null || style.display === "none" || style.visibility === "hidden";
  bait.remove();
  return blocked;
}
