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
  function init(name, o) {
    key = "sns-" + name; opts = o || {};
    var st = null; try { st = JSON.parse(localStorage.getItem(key)); } catch (e) {}
    if (st && st.ver !== VER) st = null;
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
    var m = menu();
    ["input", "change", "click"].forEach(function (t) { m.addEventListener(t, save); });
    addEventListener("pagehide", function () { if (timer) { clearTimeout(timer); write(); } });
  }
  function off() { if (timer) clearTimeout(timer); timer = 0; key = null; }   // Reset: stop saving, the page reloads from the defaults
  window.ToolPersist = { init: init, save: save, off: off };
})();
