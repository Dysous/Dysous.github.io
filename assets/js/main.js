/* Noah Mathew, portfolio interactions
   1. NCL category bar chart (single series, direct-labeled)
   2. CTF-Tools terminal demo
*/
(function () {
  "use strict";

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  document.getElementById("year").textContent = new Date().getFullYear();

  /* ============ 1. NCL chart ============ */
  /* [category, accuracy %, national rank of 7,010] */
  var NCL = [
    ["Enumeration & Exploitation", 100.0, "9th"],
    ["Scanning & Reconnaissance", 100.0, "12th"],
    ["Forensics", 100.0, "24th"],
    ["Password Cracking", 100.0, "26th"],
    ["Network Traffic Analysis", 95.7, "144th"],
    ["Log Analysis", 95.2, "80th"],
    ["Cryptography", 89.7, "125th"],
    ["Web App Exploitation", 82.6, "221st"],
    ["Open Source Intelligence", 82.2, "130th"]
  ];

  var chart = document.getElementById("ncl-chart");
  if (chart) {
    NCL.forEach(function (d) {
      var row = document.createElement("div");
      row.className = "bar-row" + (d[1] === 100 ? " perfect" : "");
      row.innerHTML =
        '<span class="bar-label">' + d[0] + "</span>" +
        '<span class="bar-track"><span class="bar-fill" data-w="' + d[1] + '"></span></span>' +
        '<span class="bar-value">' + d[1].toFixed(1) + "%</span>" +
        '<span class="bar-rank">' + d[2] + "</span>";
      row.title = d[0] + ": " + d[1].toFixed(1) + "% accuracy, 100% completion, ranked " + d[2] + " of 7,010 nationally";
      chart.appendChild(row);
    });

    var fill = function () {
      chart.querySelectorAll(".bar-fill").forEach(function (el) {
        el.style.width = el.getAttribute("data-w") + "%";
      });
    };
    if (reducedMotion || !("IntersectionObserver" in window)) {
      fill();
    } else {
      new IntersectionObserver(function (entries, obs) {
        if (entries[0].isIntersecting) { fill(); obs.disconnect(); }
      }, { threshold: 0.3 }).observe(chart);
    }
  }

  /* ============ 2. terminal demo ============ */
  var SCRIPT_LINES = [
    ["prompt", "$ python3 wikiscraper.py -u wiki/List_of_dog_breeds -c 1 -o breeds.txt"],
    ["dim",    "[*] fetching page..."],
    ["dim",    "[*] parsing 3 tables with BeautifulSoup"],
    ["dim",    "[+] 592 entries -> breeds.txt (plus case + l33t variants)"],
    ["out",    "affenpinscher"],
    ["out",    "afghanhound"],
    ["out",    "a1redaleterr1er"],
    ["out",    "..."],
    ["prompt", "$ hashcat -m 0 hashes.txt breeds.txt --rules best64.rule"],
    ["dim",    "[*] 6/6 hashes recovered"],
    ["out",    "Status...........: Cracked"],
    ["prompt", "$ _"]
  ];

  var term = document.getElementById("terminal-body");
  if (term) {
    var render = function (upTo, partial) {
      var html = "";
      for (var i = 0; i < upTo; i++) {
        var cls = SCRIPT_LINES[i][0] === "prompt" ? "t-prompt" : SCRIPT_LINES[i][0] === "dim" ? "t-dim" : "";
        html += '<span class="' + cls + '">' + SCRIPT_LINES[i][1] + "</span>\n";
      }
      if (partial !== undefined) {
        var l = SCRIPT_LINES[upTo];
        var cls2 = l[0] === "prompt" ? "t-prompt" : l[0] === "dim" ? "t-dim" : "";
        html += '<span class="' + cls2 + '">' + l[1].slice(0, partial) + "▌</span>";
      }
      term.innerHTML = html;
    };

    if (reducedMotion) {
      render(SCRIPT_LINES.length);
    } else {
      var line = 0, ch = 0;
      var tick = function () {
        if (line >= SCRIPT_LINES.length) {
          setTimeout(function () { line = 0; ch = 0; tick(); }, 6000);
          return;
        }
        var isPrompt = SCRIPT_LINES[line][0] === "prompt";
        if (isPrompt && ch < SCRIPT_LINES[line][1].length) {
          ch += 1;
          render(line, ch);
          setTimeout(tick, 26);
        } else {
          line += 1; ch = 0;
          render(line);
          setTimeout(tick, isPrompt ? 350 : 260);
        }
      };
      new IntersectionObserver(function (entries, obs) {
        if (entries[0].isIntersecting) { tick(); obs.disconnect(); }
      }, { threshold: 0.3 }).observe(term);
    }
  }

})();
