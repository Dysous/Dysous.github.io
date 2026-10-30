(function () {
  "use strict";

  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ================================================================
     The rail — this replaces navigation. It shows where you are in
     the page and only names a section while you are standing in it.
     ================================================================ */

  var sections = [].slice.call(document.querySelectorAll("[data-rail]"));
  var ticksEl = document.getElementById("rail-ticks");
  var fillEl = document.getElementById("rail-fill");
  var ticks = [];

  if (ticksEl) {
    sections.forEach(function (sec, i) {
      var li = document.createElement("li");
      var b = document.createElement("button");
      b.type = "button";
      b.innerHTML = "<span>" + sec.getAttribute("data-rail") + "</span>";
      b.setAttribute("aria-label", "Jump to " + sec.getAttribute("data-rail"));
      b.addEventListener("click", function () {
        sec.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      });
      li.appendChild(b);
      ticksEl.appendChild(li);
      ticks.push({ li: li, sec: sec, i: i });
    });
  }

  var ticking = false;
  var lastY = 0;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;

      var doc = document.documentElement;
      var max = doc.scrollHeight - window.innerHeight;
      var pct = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      if (fillEl) fillEl.style.height = (pct * 100) + "%";

      /* active tick: the last section whose top is above the middle */
      var mid = window.innerHeight * 0.45;
      var active = -1;
      ticks.forEach(function (t) {
        if (t.sec.getBoundingClientRect().top <= mid) active = t.i;
      });
      ticks.forEach(function (t) { t.li.classList.toggle("on", t.i === active); });

      /* top chrome gets out of the way going down, returns going up */
      var y = window.scrollY;
      if (Math.abs(y - lastY) > 6) {
        document.body.classList.toggle("chrome-away", y > lastY && y > 240);
        lastY = y;
      }

      updateChip();
    });
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);

  /* ================================================================
     Entries unwrap as they arrive.
     ================================================================ */

  var revealables = [].slice.call(
    document.querySelectorAll(".work, .aside-block, .worked, .grid-block, .evidence, .ccdc, .comp-grid")
  );

  if ("IntersectionObserver" in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      });
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.12 });
    revealables.forEach(function (el) { io.observe(el); });
  } else {
    revealables.forEach(function (el) { el.classList.add("in"); });
  }

  /* ================================================================
     The deck.

     This is a placeholder instrument, not a soundtrack. Noah asked for
     music he actually listens to; until he picks it, this stays a quiet
     ambient bed rather than pretending to be a song.
     ================================================================ */

  var deck = { ctx: null, master: null, timer: null, side: "A", playing: false };
  var SIDE_A = [146.83, 174.61, 220.00, 261.63, 293.66, 349.23];
  var SIDE_B = [130.81, 155.56, 196.00, 233.08, 261.63, 311.13];

  var btn = document.getElementById("soundtrack");
  var scene = document.querySelector(".listening-scene");
  var label = document.getElementById("record-label");
  var chip = document.getElementById("now-playing");
  var chipLabel = document.getElementById("now-playing-label");
  var opening = document.querySelector(".open");

  function voice(freq, when, dur, peak) {
    var ctx = deck.ctx;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    var filter = ctx.createBiquadFilter();
    osc.type = "sine";
    osc.frequency.value = freq;
    filter.type = "lowpass";
    filter.frequency.value = 900;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(peak, when + dur * 0.35);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(deck.master);
    osc.start(when);
    osc.stop(when + dur + 0.1);
  }

  function schedule() {
    if (!deck.playing) return;
    var scale = deck.side === "A" ? SIDE_A : SIDE_B;
    var now = deck.ctx.currentTime;
    var root = scale[Math.floor(Math.random() * 3)];
    voice(root, now + 0.05, 5.5, 0.07);
    voice(root * 1.5, now + 0.6, 4.2, 0.035);
    voice(scale[3 + Math.floor(Math.random() * 3)], now + 1.4, 3.4, 0.028);
    deck.timer = setTimeout(schedule, 3600 + Math.random() * 1400);
  }

  function startDeck() {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;
    if (!deck.ctx) {
      deck.ctx = new Ctx();
      deck.master = deck.ctx.createGain();
      deck.master.gain.value = 0.0001;
      deck.master.connect(deck.ctx.destination);
    }
    if (deck.ctx.state === "suspended") deck.ctx.resume();
    deck.playing = true;
    var t = deck.ctx.currentTime;
    deck.master.gain.cancelScheduledValues(t);
    deck.master.gain.setValueAtTime(Math.max(deck.master.gain.value, 0.0001), t);
    deck.master.gain.exponentialRampToValueAtTime(0.9, t + 1.6);
    schedule();
    return true;
  }

  function stopDeck() {
    deck.playing = false;
    clearTimeout(deck.timer);
    if (!deck.ctx) return;
    var t = deck.ctx.currentTime;
    deck.master.gain.cancelScheduledValues(t);
    deck.master.gain.setValueAtTime(Math.max(deck.master.gain.value, 0.0001), t);
    deck.master.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
  }

  function setPlaying(on) {
    if (btn) {
      btn.setAttribute("aria-pressed", String(on));
      btn.querySelector(".play-icon").textContent = on ? "❚❚" : "▶";
      btn.querySelector(".sound-label").textContent = on ? "Stop" : "Play";
    }
    if (scene) scene.classList.toggle("playing", on);
    updateChip();
  }

  /* the chip only exists once the deck is running and the deck itself
     has scrolled away — it is the deck following you down the page */
  function updateChip() {
    if (!chip) return;
    var gone = opening ? opening.getBoundingClientRect().bottom < 60 : false;
    chip.hidden = !(deck.playing && gone);
    if (chipLabel) chipLabel.textContent = "Side " + deck.side;
  }

  if (btn) {
    btn.addEventListener("click", function () {
      if (deck.playing) { stopDeck(); setPlaying(false); }
      else if (startDeck()) { setPlaying(true); }
      else {
        btn.disabled = true;
        btn.querySelector(".sound-label").textContent = "Unavailable";
      }
    });
  }

  if (chip) {
    chip.addEventListener("click", function () {
      stopDeck();
      setPlaying(false);
    });
  }

  /* ================================================================
     CTF-Tools terminal
     ================================================================ */

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
  var termTimer;

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
    if (!term) return;
    clearTimeout(termTimer);
    if (reduce) { draw(lines.length); return; }
    var line = 0, ch = 0;
    (function tick() {
      if (line >= lines.length) return;
      var isPrompt = lines[line][0] === "prompt";
      if (isPrompt && ch < lines[line][1].length) {
        draw(line, ++ch);
        termTimer = setTimeout(tick, 18);
      } else {
        line++; ch = 0;
        draw(line);
        termTimer = setTimeout(tick, isPrompt ? 260 : 190);
      }
    })();
  }

  var replay = document.getElementById("replay");
  if (replay) replay.addEventListener("click", play);

  if ("IntersectionObserver" in window && term) {
    new IntersectionObserver(function (entries, obs) {
      if (entries[0].isIntersecting) { play(); obs.disconnect(); }
    }, { threshold: 0.3 }).observe(term);
  } else {
    play();
  }

  /* ================================================================
     The tree recording.

     Native controls, so it can be scrubbed and so the project's own
     audio plays when the viewer asks for it. Nothing autoplays; it
     only pauses itself once it is well off screen.
     ================================================================ */

  var video = document.getElementById("tree-video");
  if (video && "IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting && !video.paused) video.pause();
    }, { threshold: 0 }).observe(video);
  }

  /* ================================================================
     Easter eggs
     ================================================================ */

  try {
    console.log(
      "%c  ___  ___ _ __  \n / _ \\/ __| '_ \\ \n|  __/\\__ \\ |_) |\n \\___||___/ .__/ \n         |_|     ",
      "color:#4c6654;font:12px/1.2 monospace"
    );
    console.log("%cRPO{three_keys_three_gates_one_champion}", "color:#a9c186;font:13px monospace");
    console.log(
      "%cYou found gate one. There is one more on this page — the record knows a second side.",
      "color:#777;font:12px monospace"
    );
  } catch (e) { /* console is optional */ }

  var SEQ = [38, 38, 40, 40, 37, 39, 37, 39, 66, 65];
  var pos = 0;

  document.addEventListener("keydown", function (e) {
    if (e.keyCode === SEQ[pos]) {
      pos++;
      if (pos === SEQ.length) { pos = 0; flipRecord(); }
    } else {
      pos = (e.keyCode === SEQ[0]) ? 1 : 0;
    }
  });

  function flipRecord() {
    deck.side = deck.side === "A" ? "B" : "A";
    if (label) label.textContent = "SIDE " + deck.side;
    if (!deck.playing && startDeck()) setPlaying(true);
    updateChip();
    try {
      console.log("%cSide " + deck.side + ". RPO{the_easter_egg_was_the_b_side}", "color:#a9c186;font:13px monospace");
    } catch (e) { /* ignore */ }
  }

  onScroll();
})();
