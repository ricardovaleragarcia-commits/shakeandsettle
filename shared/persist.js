/* Remembers a tool's settings between visits (localStorage, per tool).
   Saves every input / select / checkbox of the controls menu that has an id (files excluded),
   plus whatever the tool wants in `extra`.
     ToolPersist.init("disc-spin", { get: () => ({...}), set: obj => {...} });   // call once, after the controls are wired
     ToolPersist.save();                                                  // call after a change that is not an input event (button, image) */
(function () {
  var VER = 3;   // bump to make every tool start from its (new) defaults once
  var key = null, opts = {}, timer = 0;
  function menu() { return document.querySelector(".menu"); }
  function fields() { return Array.prototype.filter.call(menu().querySelectorAll("input[id], select[id], textarea[id]"), function (e) { return e.type !== "file"; }); }
  function write() {
    timer = 0;
    if (!key) return;
    var v = {};
    fields().forEach(function (e) { v[e.id] = e.type === "checkbox" ? e.checked : e.value; });
    var x = opts.get ? opts.get() : {};
    try { localStorage.setItem(key, JSON.stringify({ ver: VER, v: v, x: x })); }
    catch (err) {                                    // quota: keep the settings, drop what is too big
      try { localStorage.setItem(key, JSON.stringify({ ver: VER, v: v, x: Object.assign({}, x, { imgs: {} }) })); } catch (e2) {}
    }
  }
  function save() { if (key && !timer) timer = setTimeout(function () { if (key) write(); else timer = 0; }, 250); }
  function apply(st) {   // puts the saved values back into the controls (same path for a visit and for a settings file)
    if (st && st.v) {
      fields().forEach(function (e) {
        if (!(e.id in st.v)) return;
        if (e.type === "checkbox") e.checked = !!st.v[e.id];
        else if (e.tagName === "SELECT") { var ok = Array.prototype.some.call(e.options, function (o) { return o.value === String(st.v[e.id]); }); if (!ok) return; e.value = st.v[e.id]; }   // option removed since: keep the default
        else e.value = st.v[e.id];
        e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true }));
      });
      if (opts.set && st.x) { try { opts.set(st.x); } catch (e) {} }
    }
  }
  // Settings file: everything the controls hold, without the images (they stay with whoever loads it).
  function download(name) {
    var v = {}; fields().forEach(function (e) { v[e.id] = e.type === "checkbox" ? e.checked : e.value; });
    var x = opts.get ? Object.assign({}, opts.get()) : {}; delete x.imgs;
    var blob = new Blob([JSON.stringify({ app: "shake-and-settle", tool: key, ver: VER, v: v, x: x }, null, 1)], { type: "application/json" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name || (key.replace(/^sns-/, "") + "-settings.json");
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }
  function load(file) {   // resolves to "" when it worked, or a short message for the person
    return file.text().then(function (t) {
      var st; try { st = JSON.parse(t); } catch (e) { return "That file is not a settings file."; }
      if (!st || st.app !== "shake-and-settle" || !st.v) return "That file is not a settings file.";
      if (st.tool !== key) return "Those settings are from another tool (" + String(st.tool || "").replace(/^sns-/, "") + ").";
      apply(st); save(); return "";
    });
  }
  // The "Settings" block (Save / Load a settings file). Added by init() to every tool that has none of its own; a tool with
  // its own storage can call ToolPersist.ui({ name, get: () => object, set: object => {...} }) instead.
  function ui(o) {
    var m = menu(); if (!m || document.getElementById("saveSet")) return;
    var host = m.querySelector(".sec__body") || m, b = document.createElement("div");
    b.className = "block full";
    b.innerHTML = '<div class="t">Settings <span>save a look, load it anywhere</span></div>' +
      '<div class="btns fill"><button type="button" id="saveSet">Save settings</button><button type="button" id="loadSet">Load settings</button></div>' +
      '<div class="note" id="setNote" role="status"></div><input type="file" id="setFile" accept=".json,application/json" hidden aria-label="Settings file">';
    host.appendChild(b);
    var note = b.querySelector("#setNote"), file = b.querySelector("#setFile"), tm = 0;
    function say(t) { note.textContent = t; clearTimeout(tm); tm = setTimeout(function () { note.textContent = ""; }, 4000); }
    function name() { return (o && o.name) || (key || "tool").replace(/^sns-/, ""); }
    b.querySelector("#saveSet").onclick = function () {
      if (o && o.get) {
        var blob = new Blob([JSON.stringify({ app: "shake-and-settle", tool: "sns-" + name(), ver: VER, store: o.get() }, null, 1)], { type: "application/json" });
        var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name() + "-settings.json";
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
      } else download();
      say("Settings saved as a file.");
    };
    b.querySelector("#loadSet").onclick = function () { file.click(); };
    file.addEventListener("change", function () {
      var f = file.files[0]; file.value = ""; if (!f) return;
      if (o && o.set) {
        f.text().then(function (t) {
          var st; try { st = JSON.parse(t); } catch (e) { st = null; }
          if (!st || st.app !== "shake-and-settle" || st.store === undefined) return say("That file is not a settings file.");
          if (st.tool !== "sns-" + name()) return say("Those settings are from another tool (" + String(st.tool || "").replace(/^sns-/, "") + ").");
          o.set(st.store); say("Settings loaded.");
        });
      } else load(f).then(function (msg) { say(msg || "Settings loaded."); });
    });
  }
  function init(name, o) {
    key = "sns-" + name; opts = o || {};
    var st = null; try { st = JSON.parse(localStorage.getItem(key)); } catch (e) {}
    if (st && st.ver !== VER) st = null;
    if (st) apply(st);
    ui();
    var m = menu();
    ["input", "change", "click"].forEach(function (t) { m.addEventListener(t, save); });
    addEventListener("pagehide", function () { if (timer) { clearTimeout(timer); write(); } });
  }
  function off() { if (timer) clearTimeout(timer); timer = 0; key = null; }   // Reset: stop saving, the page reloads from the defaults
  window.ToolPersist = { init: init, save: save, off: off, download: download, load: load, ui: ui };
})();
