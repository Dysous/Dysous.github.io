(function () {
  "use strict";

  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* --- the deck: an ambient loop built in the browser ----------------
     Nothing autoplays. Once it is started it keeps running while you
     scroll, because it is just an AudioContext and not a <video>. */

  var deck = {
    ctx: null,
    master: null,
    voices: [],
    timer: null,
    side: "A",
    playing: false
  };

  /* two scales, so the easter-egg b-side actually sounds different */
  var SIDE_A = [146.83, 174.61, 220.00, 261.63, 293.66, 349.23];
  var SIDE_B = [130.81, 155.56, 196.00, 233.08, 261.63, 311.13];

  var btn = document.getElementById("soundtrack");
  var scene = document.querySelector(".listening-scene");
  var label = document.getElementById("record-label");

  function voice(freq, when, dur, gainPeak) {
    var ctx = deck.ctx;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    var filter = ctx.createBiquadFilter();

    osc.type = "sine";
    osc.frequency.value = freq;
    filter.type = "lowpass";
    filter.frequency.value = 900;

    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(gainPeak, when + dur * 0.35);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(deck.master);
    osc.start(when);
    osc.stop(when + dur + 0.1);
    deck.voices.push(osc);
    if (deck.voices.length > 24) deck.voices.shift();
  }

  function schedule() {
    if (!deck.playing) return;
    var ctx = deck.ctx;
    var scale = deck.side === "A" ? SIDE_A : SIDE_B;
    var now = ctx.currentTime;

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
    deck.master.gain.cancelScheduledValues(deck.ctx.currentTime);
    deck.master.gain.setValueAtTime(Math.max(deck.master.gain.value, 0.0001), deck.ctx.currentTime);
    deck.master.gain.exponentialRampToValueAtTime(0.9, deck.ctx.currentTime + 1.6);
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
    if (!btn) return;
    btn.setAttribute("aria-pressed", String(on));
    btn.querySelector(".play-icon").textContent = on ? "❚❚" : "▶";
    btn.querySelector(".sound-label").textContent = on ? "Stop the soundtrack" : "Play the soundtrack";
    if (scene) scene.classList.toggle("playing", on);
  }

  if (btn) {
    btn.addEventListener("click", function () {
      if (deck.playing) {
        stopDeck();
        setPlaying(false);
      } else if (startDeck()) {
        setPlaying(true);
      } else {
        btn.disabled = true;
        btn.querySelector(".sound-label").textContent = "Audio unavailable";
      }
    });
  }

  /* --- CTF-Tools terminal -------------------------------------------- */

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

  /* --- the tree recording -------------------------------------------- */

  var video = document.getElementById("tree-video");
  var treeBtn = document.getElementById("tree-play");

  var sourced = false;

  function loadVideo() {
    if (sourced || !video) return;
    video.src = "assets/video/redblack-tree.mp4";
    sourced = true;
  }

  function setTreeState(on) {
    if (treeBtn) {
      treeBtn.setAttribute("aria-pressed", String(on));
      treeBtn.textContent = on ? "Pause recording" : "Play recording";
    }
  }

  if (video) {
    if (treeBtn) {
      treeBtn.addEventListener("click", function () {
        loadVideo();
        if (video.paused) { video.play(); setTreeState(true); }
        else { video.pause(); setTreeState(false); }
      });
    }
    video.addEventListener("play", function () { setTreeState(true); });
    video.addEventListener("pause", function () { setTreeState(false); });
  }

  /* --- start things when they come into view -------------------------- */

  if ("IntersectionObserver" in window) {
    if (term) {
      new IntersectionObserver(function (entries, obs) {
        if (entries[0].isIntersecting) { play(); obs.disconnect(); }
      }, { threshold: 0.3 }).observe(term);
    }
    if (video) {
      new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) {
          if (!reduce) { loadVideo(); video.play().catch(function () {}); }
        } else if (!video.paused) {
          video.pause();
        }
      }, { threshold: 0.4 }).observe(video);
    }
  } else {
    play();
  }

  /* --- easter eggs ---------------------------------------------------- */

  /* 1. something in the console for anyone who opens it */
  try {
    console.log(
      "%c  ___  ___ _ __  \n / _ \\/ __| '_ \\ \n|  __/\\__ \\ |_) |\n \\___||___/ .__/ \n         |_|     ",
      "color:#4c6654;font:12px/1.2 monospace"
    );
    console.log(
      "%cRPO{three_keys_three_gates_one_champion}",
      "color:#a9c186;font:13px monospace"
    );
    console.log(
      "%cYou found gate one. There is one more on this page — the record knows a second side.",
      "color:#777;font:12px monospace"
    );
  } catch (e) { /* console is optional */ }

  /* 2. the konami code flips the record over */
  var SEQ = [38, 38, 40, 40, 37, 39, 37, 39, 66, 65];
  var pos = 0;

  document.addEventListener("keydown", function (e) {
    if (e.keyCode === SEQ[pos]) {
      pos++;
      if (pos === SEQ.length) {
        pos = 0;
        flipRecord();
      }
    } else {
      pos = (e.keyCode === SEQ[0]) ? 1 : 0;
    }
  });

  function flipRecord() {
    deck.side = deck.side === "A" ? "B" : "A";
    if (label) label.textContent = "SIDE " + deck.side;
    if (!deck.playing && startDeck()) setPlaying(true);
    try {
      console.log(
        "%cSide " + deck.side + ". RPO{the_easter_egg_was_the_b_side}",
        "color:#a9c186;font:13px monospace"
      );
    } catch (e) { /* ignore */ }
  }
})();
