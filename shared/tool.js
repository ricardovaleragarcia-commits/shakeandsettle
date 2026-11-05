/* Tool page helper.
   - Title: the tool name (from <title>) sits on top of the card-colored stage.
   - Tools call window.setFrameBg(css) when their artwork background changes (kept for later use).
*/
(function () {
  var page = document.querySelector(".toolpage");
  if (!page) return;
  var menu = page.querySelector(".menu"), stage = page.querySelector(".stage");

  var title = page.querySelector(".toolhead__title");
  if (title) title.textContent = document.title.replace(/\s*[—-]\s*Shake (&|&amp;) Settle\s*$/, "");

  // Sections: a child of .menu with data-sec starts a collapsible section that runs until the next one.
  // data-open = open by default. The user's choice is remembered. A section titled "Export" sticks to the bottom.
  (function () {
    var kids = Array.prototype.slice.call(menu.children);
    if (!kids.some(function (k) { return k.hasAttribute("data-sec"); })) return;
    menu.classList.add("sectioned");
    var key = "sns-sec-" + location.pathname, saved = {};
    try { saved = JSON.parse(localStorage.getItem(key)) || {}; } catch (e) {}
    var cur = null, n = 0;
    var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Smooth open/close: animate height + opacity, then hide/restore.
    function slide(body, open) {
      if (body._a) body._a.cancel();
      if (reduce || !body.animate) { body.hidden = !open; return; }
      var ov = body.style.overflow; body.style.overflow = "hidden";
      var done = function () { body._a = null; body.style.overflow = ov; if (!open) body.hidden = true; };
      if (open) body.hidden = false;
      var full = body.scrollHeight, cs = getComputedStyle(body);
      var from = open ? { height: "0px", opacity: 0 } : { height: Math.min(body.offsetHeight, full) + "px", opacity: 1 };
      var to = open ? { height: Math.min(full, parseFloat(cs.maxHeight) || full) + "px", opacity: 1 } : { height: "0px", opacity: 0 };
      var a = body._a = body.animate([from, to], { duration: 260, easing: "cubic-bezier(.2,.7,.2,1)" });
      a.onfinish = done; a.oncancel = function () { body.style.overflow = ov; };
    }
    kids.forEach(function (k) {
      if (k.hasAttribute("data-sec")) {
        var title = k.getAttribute("data-sec"), open = title in saved ? !!saved[title] : k.hasAttribute("data-open");
        var sec = document.createElement("section"); sec.className = "sec" + (title === "Export" ? " sec--export" : "");
        var h = document.createElement("button"); h.type = "button"; h.className = "sec__h";
        var id = "sec" + (++n); h.setAttribute("aria-controls", id);
        var t = document.createElement("span"); t.innerHTML = title; h.appendChild(t);
        var c = document.createElement("span"); c.className = "sec__c"; c.setAttribute("aria-hidden", "true"); h.appendChild(c);
        var body = document.createElement("div"); body.className = "sec__body"; body.id = id;
        function set(o) { h.setAttribute("aria-expanded", o ? "true" : "false"); body.hidden = !o; }
        set(open);
        (function (title, h, body) {
          h.addEventListener("click", function () {
            var o = body.hidden; h.setAttribute("aria-expanded", o ? "true" : "false"); slide(body, o);
            saved[title] = o; try { localStorage.setItem(key, JSON.stringify(saved)); } catch (e) {}
          });
        })(title, h, body);
        sec.appendChild(h); sec.appendChild(body); menu.insertBefore(sec, k);
        cur = body;
      }
      if (cur) cur.appendChild(k);
    });
  })();

  // Entrance order: section titles and the blocks you can see, top to bottom (the stagger is capped so long menus don't keep you waiting).
  (function () {
    var n = 0;
    Array.prototype.forEach.call(menu.querySelectorAll(".sec__h, .block"), function (el) {
      var hid = el.closest("[hidden]");
      el.style.setProperty("--i", hid ? 0 : Math.min(n++, 14));
    });
  })();

  // Color fields: a flat rectangle of the color with its hex written on top, in black or white for contrast.
  var swatches = [];
  Array.prototype.forEach.call(menu.querySelectorAll('input[type="color"]'), function (inp) {
    if (!inp.parentElement || !inp.parentElement.matches(".block, .pair")) return;   // small inline pickers stay plain
    var w = document.createElement("span"); w.className = "swatch";
    var hx = document.createElement("span"); hx.className = "swatch__hex"; hx.setAttribute("aria-hidden", "true");
    inp.parentNode.insertBefore(w, inp); w.appendChild(inp); w.appendChild(hx);
    swatches.push([inp, hx, ""]);
  });
  function paintSwatches() {
    swatches.forEach(function (s) {
      var v = s[0].value; if (v === s[2]) return; s[2] = v;
      var r = parseInt(v.substr(1, 2), 16), g = parseInt(v.substr(3, 2), 16), b = parseInt(v.substr(5, 2), 16);
      s[1].textContent = v; s[1].style.color = (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#000" : "#fff";
    });
  }

  // File pickers: the browser's own "Choose File / No file chosen" gets cut in narrow columns, so each one
  // becomes a flat button plus the file name (the real input stays in the page, hidden, and does the work).
  var files = [];
  Array.prototype.forEach.call(menu.querySelectorAll('input[type="file"]'), function (inp) {
    if (inp.hidden) return;
    var row = document.createElement("span"); row.className = "filepick";
    var b = document.createElement("button"); b.type = "button"; b.className = "btn"; b.textContent = "Choose file";
    if (inp.getAttribute("aria-label")) b.setAttribute("aria-label", inp.getAttribute("aria-label"));
    var nm = document.createElement("span"); nm.className = "filepick__name";
    inp.parentNode.insertBefore(row, inp); row.appendChild(b); row.appendChild(nm); row.appendChild(inp);
    inp.classList.add("filepick__input"); inp.tabIndex = -1;
    b.addEventListener("click", function () { inp.click(); });
    files.push([inp, nm, null]);
  });
  function paintFiles() {
    files.forEach(function (f) {
      var n = f[0].files && f[0].files.length ? f[0].files[0].name : "", e = f[0].dataset.empty || "None", k = n + "|" + e; if (k === f[2]) return; f[2] = k;
      f[1].textContent = n || e; f[1].title = n; f[1].classList.toggle("is-empty", !n && e === "None");   // data-empty: what a tool restored without a file (e.g. "Saved image")
    });
  }
  paintFiles();

  // Short choices (format, quality, frame rate, direction): <select data-seg> is shown as a row of flat buttons, like the
  // format buttons of the other tools. The select stays in the page (hidden) and keeps doing the work: saved settings, tool code.
  var segs = [];
  Array.prototype.forEach.call(menu.querySelectorAll("select[data-seg]"), function (sel) {
    var row = document.createElement("div"); row.className = "btns fill seg"; row.setAttribute("role", "group");
    if (sel.getAttribute("aria-label")) row.setAttribute("aria-label", sel.getAttribute("aria-label"));
    sel.parentNode.insertBefore(row, sel.nextSibling); sel.classList.add("seg__src"); sel.tabIndex = -1;
    function label(o) {
      var s = (o.dataset.short || o.textContent).trim(), m = s.match(/\d+:\d+/);
      if (/custom/i.test(s)) return "Custom";
      if (m) return m[0];
      return s.replace(/\s*[·(].*$/, "");                        // "1080 · Full HD" → "1080", "60 fps · as preview" → "60 fps"
    }
    function paint() {
      Array.prototype.forEach.call(row.children, function (b) { var on = b.dataset.v === sel.value; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on ? "true" : "false"); b.disabled = sel.disabled; });
    }
    function build() {
      row.textContent = "";
      Array.prototype.forEach.call(sel.options, function (o) {
        var b = document.createElement("button"); b.type = "button"; b.textContent = label(o); b.dataset.v = o.value; b.title = o.textContent.trim();
        b.addEventListener("click", function () {
          if (sel.disabled || sel.value === o.value) return;
          sel.value = o.value;
          sel.dispatchEvent(new Event("input", { bubbles: true })); sel.dispatchEvent(new Event("change", { bubbles: true }));
          paint();
        });
        row.appendChild(b);
      });
      paint();
    }
    build();
    new MutationObserver(build).observe(sel, { childList: true });   // tools that fill their options from code
    new MutationObserver(paint).observe(sel, { attributes: true, attributeFilter: ["disabled"] });
    segs.push(paint);
  });
  function paintSegs() { segs.forEach(function (p) { p(); }); }

  // Sliders: the travelled part of the bar is drawn from --p.
  // A slider with data-unit and no value of its own in its title gets one. Double-click a slider to put it back to its default.
  var ranges = Array.prototype.slice.call(menu.querySelectorAll('input[type="range"]'));
  var outs = [];
  ranges.forEach(function (r) {
    if (!r.hasAttribute("data-unit")) return;
    var t = r.closest(".block") && r.closest(".block").querySelector(".t");
    if (!t || t.querySelector("output")) return;
    var o = document.createElement("output"); o.setAttribute("aria-hidden", "true"); t.appendChild(o); outs.push([r, o]);
  });
  function fmt(r) {
    var st = +r.step || 1, dec = st < 1 ? Math.min(2, String(st).split(".")[1].length) : 0, v = (+r.value).toFixed(dec);
    if (dec === 0 && st >= 1 && r.getAttribute("data-unit") === " s") v = (+r.value).toFixed(1);
    return String(v).replace("-", "−") + r.getAttribute("data-unit");
  }
  function paintRanges() {
    ranges.forEach(function (r) {
      var lo = +r.min || 0, hi = r.max === "" ? 100 : +r.max, p = hi > lo ? (r.value - lo) / (hi - lo) * 100 : 0;
      r.style.setProperty("--p", p.toFixed(2) + "%");
    });
    outs.forEach(function (x) { var s = fmt(x[0]); if (x[1].textContent !== s) x[1].textContent = s; });
  }
  ranges.forEach(function (r) {
    if (!r.hasAttribute("value")) return;                          // no default written in the page: nothing to go back to
    if (!r.title) r.title = "Double-click to reset";
    r.addEventListener("dblclick", function () {
      if (r.disabled || r.value === r.defaultValue) return;
      r.value = r.defaultValue;
      r.dispatchEvent(new Event("input", { bubbles: true })); r.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });
  menu.addEventListener("input", function () { paintRanges(); paintSwatches(); });
  menu.addEventListener("change", function () { paintRanges(); paintSwatches(); paintFiles(); paintSegs(); });
  paintRanges(); paintSwatches();
  setInterval(function () { paintRanges(); paintSwatches(); paintFiles(); paintSegs(); }, 400);   // values set from code (presets, random, saved settings)

  // Reset: puts the whole tool back to how it opens the first time (two taps, so it never happens by accident).
  (function () {
    var side = page.querySelector(".toolhead__side"), back = side && side.querySelector(".back");
    var m = location.pathname.match(/\/tools\/([^\/]+)/);
    if (!back || !m) return;
    var slug = m[1], b = document.createElement("button"); b.type = "button"; b.className = "reset"; b.textContent = "Reset";
    var row = document.createElement("div"); row.className = "toolhead__row"; back.parentNode.insertBefore(row, back); row.appendChild(back); row.appendChild(b);
    var armed = 0;
    b.addEventListener("click", function () {
      if (!armed) { b.textContent = "Reset all settings?"; b.classList.add("armed"); armed = setTimeout(function () { armed = 0; b.textContent = "Reset"; b.classList.remove("armed"); }, 3000); return; }
      if (window.ToolPersist && ToolPersist.off) ToolPersist.off();
      try {
        for (var i = localStorage.length - 1; i >= 0; i--) { var k = localStorage.key(i); if (k && k.indexOf("sns-") === 0 && (k.indexOf(slug) > -1 || k === "sns-sec-" + location.pathname)) localStorage.removeItem(k); }
      } catch (e) {}
      location.reload();
    });
  })();

  // Instructions: on phones they take three lines; "More" shows the rest.
  (function () {
    var p = page.querySelector(".toolhead .instructions"); if (!p) return;
    var b = document.createElement("button"); b.type = "button"; b.className = "instr__more"; b.hidden = true;
    p.parentNode.insertBefore(b, p.nextSibling);
    var mq = window.matchMedia ? matchMedia("(max-width: 640px)") : null, open = false;
    function fit() {
      var phone = !!(mq && mq.matches);
      p.classList.toggle("clamp", phone && !open);
      b.hidden = !phone || (!open && p.scrollHeight <= p.clientHeight + 2);
      b.textContent = open ? "Less" : "More"; b.setAttribute("aria-expanded", open ? "true" : "false");
    }
    b.addEventListener("click", function () { open = !open; fit(); });
    addEventListener("resize", fit); if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
    fit();
  })();

  // Two-column rows: a half-width block left alone in its row takes the whole row, so no holes appear in the grid.
  function balance() {
    Array.prototype.forEach.call(menu.querySelectorAll(".sec__body, .menu:not(.sectioned)"), function (body) {
      var col = 0, prev = null;
      var walk = function (parent) {
        Array.prototype.forEach.call(parent.children, function (el) {
          if (el.hidden) return;
          if (el.classList.contains("group")) { walk(el); return; }
          if (!el.classList.contains("block")) return;
          el.classList.remove("auto-full");
          if (el.classList.contains("full")) { if (col === 1 && prev) prev.classList.add("auto-full"); col = 0; prev = null; return; }
          if (col === 0) { col = 1; prev = el; } else { col = 0; prev = null; }
        });
      };
      walk(body);
      if (col === 1 && prev) prev.classList.add("auto-full");
    });
  }
  balance();
  window.ctBalance = balance;   // tools call it after switching a block between half and full width
  new MutationObserver(balance).observe(menu, { attributes: true, attributeFilter: ["hidden"], subtree: true });

  setTimeout(function () { page.classList.add("ready"); }, 1800);

  window.setFrameBg = function (css) { stage.style.setProperty("--frame-bg", css); };

})();

/* If a tool fails to start (older Safari, no WebGL...), say so on the stage instead of leaving it empty. */
(function () {
  function show(msg) {
    var st = document.querySelector(".stage");
    if (!st || st.querySelector(".stage__err")) return;
    var d = document.createElement("div"); d.className = "stage__err";
    d.style.cssText = "position:absolute;left:12px;right:12px;bottom:12px;padding:8px;background:rgba(0,0,0,.75);color:#fff;font:700 12px/1.3 system-ui,sans-serif;z-index:9";
    d.textContent = "This tool could not start in this browser (" + msg + "). Try updating it, or open the page in Chrome.";
    st.appendChild(d);
  }
  window.addEventListener("error", function (e) { show(String((e && e.message) || "error").slice(0, 120)); });
  window.addEventListener("unhandledrejection", function (e) { show(String((e && e.reason && e.reason.message) || "error").slice(0, 120)); });
})();

/* WebGL context lost (Safari does it when memory is low): say so while it comes back; the tool restores itself. */
(function () {
  var cv = document.querySelector(".artwork canvas"), note;
  if (!cv) return;
  cv.addEventListener("webglcontextlost", function () {
    var st = document.querySelector(".stage"); if (!st || note) return;
    note = document.createElement("div");
    note.style.cssText = "position:absolute;left:12px;right:12px;bottom:12px;padding:8px;background:rgba(0,0,0,.75);color:#fff;font:700 12px/1.3 system-ui,sans-serif;z-index:9";
    note.textContent = "The browser paused the graphics to save memory. Restoring… if the preview stays empty, reload the page.";
    st.appendChild(note);
  });
  cv.addEventListener("webglcontextrestored", function () { if (note) { note.remove(); note = null; } });
})();
