/* Soft exit: on a click to another page of the site, fade the page out for a moment (on the home the palette dots fall first), then navigate. */
(function () {
  var root = document.documentElement;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if ("onpageswap" in window && "onpagereveal" in window) return;   // this browser animates the change of page itself (theme.css, palette.js)
  addEventListener("pageshow", function (e) { if (e.persisted) root.classList.remove("leaving"); });
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[href]");
    if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target && a.target !== "_self") return;
    var u = new URL(a.href, location.href);
    if (u.origin !== location.origin || u.pathname === location.pathname || a.hasAttribute("download")) return;
    e.preventDefault(); root.classList.add("leaving");
    setTimeout(function () { location.href = a.href; }, document.querySelector(".dot") ? 700 : 280);
  });
})();
