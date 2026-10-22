(function () {
  "use strict";

  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.getElementById("year").textContent = new Date().getFullYear();

  /* --- opening signal: Rainier raster resolving into data ------------- */

  var signalText = [
    "WASHINGTON / 46.8523 N / 121.7603 W",
    "",
    "          /\\",
    "     ____/  \\____",
    "  __/  RAINIER 4,392M \\__",
    "_/________________________\\_",
    "",
    "$ python3 wikiscraper.py --source structured",
    "[*] fetching page",
    "[*] parsing tables",
    "[+] 592 entries written",
    "$ hashcat hashes.txt targeted.txt",
    "[+] 6/6 recovered",
    "",
    "SIGNAL / SOURCE / OUTPUT / EVIDENCE"
  ].join("\n");

  var signal = document.querySelector(".signal");
  var control = document.querySelector(".signal-control");
  document.getElementById("signal-data").textContent = signalText;
  if (reduce) signal.classList.add("resolved");

  control.addEventListener("click", function () {
    var on = signal.classList.toggle("resolved");
    control.setAttribute("aria-pressed", String(on));
    control.textContent = on ? "Restore image" : "Resolve signal";
  });

  /* --- CTF-Tools terminal sequence ----------------------------------- */

  var lines = [
    ["prompt", "$ python3 wikiscraper.py -u wiki/List_of_dog_breeds -c 1 -o breeds.txt"],
    ["dim", "[*] fetching page..."],
    ["dim", "[*] parsing 3 tables with BeautifulSoup"],
    ["dim", "[+] 592 entries → breeds.txt (case + l33t variants)"],
    ["out", "affenpinscher"],
    ["out", "afghanhound"],
    ["out", "a1redaleterr1er"],
    ["out", "..."],
    ["prompt", "$ hashcat -m 0 hashes.txt breeds.txt --rules best64.rule"],
    ["dim", "[*] 6/6 hashes recovered"],
    ["out", "Status...........: Cracked"],
    ["prompt", "$ _"]
  ];

  var term = document.getElementById("terminal");
  var timer;

  function draw(n, partial) {
    var html = "";
    for (var i = 0; i < n; i++) {
      html += '<span class="' + lines[i][0] + '">' + lines[i][1] + "</span>\n";
    }
    if (partial !== undefined) {
      html += '<span class="' + lines[n][0] + '">' + lines[n][1].slice(0, partial) + "▌</span>";
    }
    term.innerHTML = html;
  }

  function play() {
    clearTimeout(timer);
    if (reduce) { draw(lines.length); return; }
    var line = 0, ch = 0;
    (function tick() {
      if (line >= lines.length) return;
      var isPrompt = lines[line][0] === "prompt";
      if (isPrompt && ch < lines[line][1].length) {
        draw(line, ++ch);
        timer = setTimeout(tick, 18);
      } else {
        line++; ch = 0;
        draw(line);
        timer = setTimeout(tick, isPrompt ? 260 : 190);
      }
    })();
  }

  document.getElementById("replay").addEventListener("click", play);

  /* --- red-black tree: insertion resolves into a left rotation ------- */

  var treeStage = document.getElementById("tree-stage");
  var treeStep = document.getElementById("tree-step");
  var treeTimer;

  function playTree() {
    clearTimeout(treeTimer);
    treeStage.classList.remove("rotated");
    treeStep.textContent = "Insert 30 · red-red conflict";
    if (reduce) {
      treeStage.classList.add("rotated");
      treeStep.textContent = "Rotate left · root becomes 20";
      return;
    }
    treeTimer = setTimeout(function () {
      treeStage.classList.add("rotated");
      treeStep.textContent = "Rotate left · recolor root";
    }, 850);
  }

  document.getElementById("tree-replay").addEventListener("click", playTree);

  if ("IntersectionObserver" in window && !reduce) {
    new IntersectionObserver(function (entries, obs) {
      if (entries[0].isIntersecting) { play(); obs.disconnect(); }
    }, { threshold: 0.3 }).observe(term);
    new IntersectionObserver(function (entries, obs) {
      if (entries[0].isIntersecting) { playTree(); obs.disconnect(); }
    }, { threshold: 0.45 }).observe(treeStage);
  } else {
    play();
    playTree();
  }
})();
