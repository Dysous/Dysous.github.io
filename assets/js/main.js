/* Noah Mathew — portfolio interactions
   1. NCL category bar chart (single series, direct-labeled)
   2. CTF-Tools terminal demo
   3. Interactive red-black tree (real CLRS insert fixup)
*/
(function () {
  "use strict";

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  document.getElementById("year").textContent = new Date().getFullYear();

  /* ============ 1. NCL chart ============ */
  var NCL = [
    ["Enumeration & Exploitation", 100.0],
    ["Password Cracking", 100.0],
    ["Forensics", 100.0],
    ["Scanning & Reconnaissance", 100.0],
    ["Network Traffic Analysis", 95.7],
    ["Log Analysis", 95.2],
    ["Cryptography", 89.7],
    ["Web App Exploitation", 82.6],
    ["Open Source Intelligence", 82.2]
  ];

  var chart = document.getElementById("ncl-chart");
  if (chart) {
    NCL.forEach(function (d) {
      var row = document.createElement("div");
      row.className = "bar-row" + (d[1] === 100 ? " perfect" : "");
      row.innerHTML =
        '<span class="bar-label">' + d[0] + "</span>" +
        '<span class="bar-track"><span class="bar-fill" data-w="' + d[1] + '"></span></span>' +
        '<span class="bar-value">' + d[1].toFixed(1) + "%</span>";
      row.title = d[0] + " — " + d[1].toFixed(1) + "% accuracy, 100% completion";
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

  /* ============ 3. red-black tree ============ */
  var svg = document.getElementById("rbt-svg");
  if (!svg) return;

  var RED = "red", BLACK = "black";
  var root = null, nodeSeq = 0;

  function Node(key) {
    this.key = key; this.color = RED;
    this.left = this.right = this.parent = null;
    this.id = "n" + (nodeSeq++);
    this.x = 280; this.y = -20;           // current rendered position
  }

  function rotateLeft(x) {
    var y = x.right;
    x.right = y.left;
    if (y.left) y.left.parent = x;
    y.parent = x.parent;
    if (!x.parent) root = y;
    else if (x === x.parent.left) x.parent.left = y;
    else x.parent.right = y;
    y.left = x; x.parent = y;
  }
  function rotateRight(x) {
    var y = x.left;
    x.left = y.right;
    if (y.right) y.right.parent = x;
    y.parent = x.parent;
    if (!x.parent) root = y;
    else if (x === x.parent.right) x.parent.right = y;
    else x.parent.left = y;
    y.right = x; x.parent = y;
  }

  function insert(key) {
    var events = [];
    var z = new Node(key), y = null, x = root;
    while (x) {
      y = x;
      if (key === x.key) return null;        // no duplicates
      x = key < x.key ? x.left : x.right;
    }
    z.parent = y;
    if (!y) root = z;
    else if (key < y.key) y.left = z;
    else y.right = z;
    if (y) { z.x = y.x; z.y = y.y; }         // animate out from parent

    // CLRS fixup
    while (z.parent && z.parent.color === RED) {
      var gp = z.parent.parent;
      if (z.parent === gp.left) {
        var u = gp.right;
        if (u && u.color === RED) {
          z.parent.color = BLACK; u.color = BLACK; gp.color = RED;
          events.push("recolor @" + gp.key); z = gp;
        } else {
          if (z === z.parent.right) { z = z.parent; rotateLeft(z); events.push("rotate-left @" + z.key); }
          z.parent.color = BLACK; gp.color = RED;
          rotateRight(gp); events.push("rotate-right @" + gp.key);
        }
      } else {
        var u2 = gp.left;
        if (u2 && u2.color === RED) {
          z.parent.color = BLACK; u2.color = BLACK; gp.color = RED;
          events.push("recolor @" + gp.key); z = gp;
        } else {
          if (z === z.parent.left) { z = z.parent; rotateRight(z); events.push("rotate-right @" + z.key); }
          z.parent.color = BLACK; gp.color = RED;
          rotateLeft(gp); events.push("rotate-left @" + gp.key);
        }
      }
    }
    if (root.color === RED) { root.color = BLACK; events.push("root -> black"); }
    return events;
  }

  /* layout: in-order rank -> x, depth -> y */
  function layout() {
    var nodes = [], i = 0, maxDepth = 0;
    (function walk(n, d) {
      if (!n) return;
      walk(n.left, d + 1);
      n.rank = i++; n.depth = d; maxDepth = Math.max(maxDepth, d);
      nodes.push(n);
      walk(n.right, d + 1);
    })(root, 0);
    var W = 560, PADX = 26, PADY = 30, levelH = Math.min(56, (320 - 2 * PADY) / Math.max(maxDepth, 1));
    nodes.forEach(function (n) {
      n.tx = nodes.length === 1 ? W / 2 : PADX + (n.rank / (nodes.length - 1)) * (W - 2 * PADX);
      n.ty = PADY + n.depth * levelH;
    });
    return nodes;
  }

  var SVGNS = "http://www.w3.org/2000/svg";
  var els = {};   // node.id -> {g, circle, text, edge}

  function ensureEl(n) {
    if (els[n.id]) return els[n.id];
    var edge = document.createElementNS(SVGNS, "line");
    edge.setAttribute("class", "rbt-edge");
    svg.insertBefore(edge, svg.firstChild);
    var g = document.createElementNS(SVGNS, "g");
    var c = document.createElementNS(SVGNS, "circle");
    c.setAttribute("r", "14");
    var t = document.createElementNS(SVGNS, "text");
    t.textContent = n.key;
    g.appendChild(c); g.appendChild(t);
    svg.appendChild(g);
    els[n.id] = { g: g, edge: edge };
    return els[n.id];
  }

  var animFrom = null;
  function draw(nodes) {
    var present = {};
    nodes.forEach(function (n) { present[n.id] = true; ensureEl(n); });
    Object.keys(els).forEach(function (id) {
      if (!present[id]) {
        svg.removeChild(els[id].g); svg.removeChild(els[id].edge);
        delete els[id];
      }
    });

    var t0 = performance.now(), DUR = reducedMotion ? 0 : 480;
    var starts = {};
    nodes.forEach(function (n) { starts[n.id] = { x: n.x, y: n.y }; });
    if (animFrom) cancelAnimationFrame(animFrom);

    function frame(now) {
      var p = DUR === 0 ? 1 : Math.min(1, (now - t0) / DUR);
      var e = 1 - Math.pow(1 - p, 3);
      nodes.forEach(function (n) {
        n.x = starts[n.id].x + (n.tx - starts[n.id].x) * e;
        n.y = starts[n.id].y + (n.ty - starts[n.id].y) * e;
        var el = els[n.id];
        el.g.setAttribute("transform", "translate(" + n.x + "," + n.y + ")");
        el.g.setAttribute("class", "rbt-node " + n.color);
        if (n.parent) {
          el.edge.setAttribute("x1", n.parent.x); el.edge.setAttribute("y1", n.parent.y);
          el.edge.setAttribute("x2", n.x); el.edge.setAttribute("y2", n.y);
          el.edge.style.display = "";
        } else {
          el.edge.style.display = "none";
        }
      });
      if (p < 1) animFrom = requestAnimationFrame(frame);
    }
    animFrom = requestAnimationFrame(frame);
  }

  var status = document.getElementById("rbt-status");
  function doInsert(key) {
    if (layoutCount() >= 31) {
      status.textContent = "tree is full (31 nodes) — reset to keep going";
      return;
    }
    var events = insert(key);
    if (events === null) {
      status.textContent = key + " is already in the tree";
      return;
    }
    draw(layout());
    status.textContent = "insert " + key + (events.length ? " → " + events.join(", ") : " → no fixup needed");
  }
  function layoutCount() {
    var c = 0;
    (function walk(n) { if (n) { c++; walk(n.left); walk(n.right); } })(root);
    return c;
  }
  function reset(seed) {
    root = null; nodeSeq = 0;
    Object.keys(els).forEach(function (id) {
      svg.removeChild(els[id].g); svg.removeChild(els[id].edge); delete els[id];
    });
    (seed || []).forEach(function (k) { insert(k); });
    if (root) draw(layout());
    status.textContent = "a live red-black tree — insertions trigger real recolors & rotations";
  }

  document.getElementById("rbt-insert").addEventListener("click", function () {
    var k, tries = 0;
    do { k = Math.floor(Math.random() * 100); tries++; } while (contains(k) && tries < 200);
    doInsert(k);
  });
  document.getElementById("rbt-insert-value").addEventListener("click", insertFromInput);
  document.getElementById("rbt-value").addEventListener("keydown", function (e) {
    if (e.key === "Enter") insertFromInput();
  });
  document.getElementById("rbt-reset").addEventListener("click", function () { reset([50, 25, 75]); });

  function insertFromInput() {
    var input = document.getElementById("rbt-value");
    var v = parseInt(input.value, 10);
    if (isNaN(v) || v < 0 || v > 99) { status.textContent = "enter a value 0–99"; return; }
    doInsert(v);
    input.value = "";
  }
  function contains(k) {
    var n = root;
    while (n) { if (k === n.key) return true; n = k < n.key ? n.left : n.right; }
    return false;
  }

  reset([50, 25, 75, 10, 33]);
})();
