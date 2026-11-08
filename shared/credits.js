/* Injects the credits bar into <footer id="credits"> on every page: a name line and the links in brackets. */
(function () {
  var el = document.getElementById("credits");
  if (!el) return;
  var LAST_UPDATE = "8 Nov 2026, 17:18 CET (Barcelona)";   // set by scripts/stamp.sh before each update of the site
  var L = [
    ["email", "mailto:ricardo.valera.garcia@gmail.com"],
    ["website", "https://ricardovaleragarcia.com"],
    ["instagram", "https://www.instagram.com/ricardovaleragarcia/"],
    ["linkedin", "https://www.linkedin.com/in/rvaleragarcia/"]
  ];
  var links = L.map(function (l) {
    var ext = l[1].indexOf("http") === 0 ? ' target="_blank" rel="noopener"' : "";
    return '<a href="' + l[1] + '"' + ext + '>(' + l[0] + ')</a>';
  }).join("");
  el.innerHTML = '<span>Made by Ricardo Jesús Valera García</span><span class="credits__links">' + links + '</span><span class="credits__upd">Last update: ' + LAST_UPDATE + '</span>';
})();
