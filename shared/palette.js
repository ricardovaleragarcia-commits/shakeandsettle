/* Palette picked on the landing (the dots). Applied before first paint from <head>, so every page matches.
   Stored per browser; the landing and the tools read the same key.
   theme-color = a lighter tint of the palette's main color, so Safari's toolbar matches the page. */
(function () {
  // Storage keys were renamed (old prefix ct- -> sns-): carry over what this browser had saved under the old ones.
  try {
    var MOVE = { "ct-palette": "sns-palette", "ct-disc": "sns-disc-spin", "ct-text-reveal": "sns-line-draw", "ct-text-on-sphere": "sns-text-orbit", "shape-multiplier-settings-v1": "sns-shape-drop-v1" };
    for (var o in MOVE) { var v = localStorage.getItem(o); if (v !== null) { if (localStorage.getItem(MOVE[o]) === null) localStorage.setItem(MOVE[o], v); localStorage.removeItem(o); } }
    ["ct-tools"].concat(Object.keys(localStorage).filter(function (k) { return k.indexOf("ct-sec-") === 0; })).forEach(function (k) { localStorage.removeItem(k); });
  } catch (e) {}
  var KEY = "sns-palette";
  var LIST = ["red", "green", "purple", "orange", "blue", "white", "black", "pink", "yellow", "teal", "sand", "midnight"];
  var TINT = {          // main color mixed 35% with white
    red: "#ff5959", green: "#89eb99", purple: "#ad69e4", orange: "#fa9e59",
    blue: "#7175f2", white: "#ffffff", black: "#5e5e5e",
    pink: "#fb8abf", yellow: "#f5e45e", teal: "#68caca", sand: "#f5e2c3", midnight: "#6882ad"
  };
  function get() { try { var p = localStorage.getItem(KEY); return LIST.indexOf(p) >= 0 ? p : "red"; } catch (e) { return "red"; } }
  function themeColor(p) {
    var m = document.querySelector('meta[name="theme-color"]');
    if (!m) { m = document.createElement("meta"); m.name = "theme-color"; document.head.appendChild(m); }
    m.content = TINT[p];
  }
  function set(p) {
    document.documentElement.setAttribute("data-palette", p);
    try { localStorage.setItem(KEY, p); } catch (e) {}
    themeColor(p);
  }
  window.CTPalette = { list: LIST, get: get, set: set };
  // on reload / back-forward the entrance animations are skipped (they made everything flicker)
  try {
    var nav = performance.getEntriesByType("navigation")[0], root = document.documentElement;
    if (nav && nav.type !== "navigate") root.classList.add("no-intro");
    else if (!/\/tools\//.test(location.pathname) && !sessionStorage.getItem("sns-intro") && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      root.classList.add("intro");                    // landing, first visit of this session: dots orbit first (landing.js ends it)
      setTimeout(function () { root.classList.remove("intro"); root.classList.add("intro-played"); }, 9000);   // failsafe: never leave the page hidden
    }
  } catch (e) {}

  // Page transition (home <-> tool): the browser animates between the two documents (see theme.css). It needs to know which way we
  // are going, so the old page and the new one each get the same classes while the transition runs: vt-nav + vt-in (to a tool) / vt-out (to the home).
  try {
    var R = document.documentElement, DIRKEY = "sns-vt-dir";
    var isTool = function (u) { return /\/tools\//.test(new URL(u, location.href).pathname); };
    addEventListener("pageswap", function (e) {
      if (!e.viewTransition || !e.activation || !e.activation.entry) return;
      var dir = isTool(e.activation.entry.url) ? "in" : "out";
      if (isTool(e.activation.entry.url) === isTool(location.href)) { e.viewTransition.skipTransition(); return; }   // tool to tool: no scene change
      try { sessionStorage.setItem(DIRKEY, dir); } catch (x) {}
      R.classList.add("vt-nav", "vt-" + dir);
    });
    // Arriving from another page of the site: set the classes right now, in the head, so the new page never paints (or starts its own
    // entrance animations) before the transition takes over. pagereveal confirms it or takes the classes off again.
    var nav0 = performance.getEntriesByType && performance.getEntriesByType("navigation")[0], dir0 = null;
    if ("onpagereveal" in window && nav0 && nav0.type === "navigate" && document.referrer) {
      try {
        var ref = new URL(document.referrer);
        if (ref.origin === location.origin && isTool(ref.href) !== isTool(location.href)) dir0 = isTool(location.href) ? "in" : "out";
      } catch (x) {}
    }
    var clear = function () { R.classList.remove("vt-nav", "vt-in", "vt-out"); };
    if (dir0) R.classList.add("vt-nav", "vt-" + dir0);
    addEventListener("pagereveal", function (e) {
      if (!e.viewTransition) { clear(); return; }
      var dir = dir0;
      if (!dir) { try { dir = sessionStorage.getItem(DIRKEY); } catch (x) {} }
      if (dir !== "in" && dir !== "out") { e.viewTransition.skipTransition(); clear(); return; }
      R.classList.add("vt-nav", "vt-" + dir);
      e.viewTransition.finished.finally(function () { clear(); R.classList.add("vt-after"); });   // vt-after: entrance animations stay off, otherwise they would restart now
    });
    addEventListener("pageshow", function (e) { if (e.persisted) R.classList.remove("vt-nav", "vt-in", "vt-out", "vt-after"); });
  } catch (e) {}
  var cur = get();
  document.documentElement.setAttribute("data-palette", cur);
  themeColor(cur);
})();
