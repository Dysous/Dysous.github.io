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
  var nowEl = document.getElementById("rail-now");
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

  /* ================================================================
     Holding the reader's place.

     When the Spotify playlist advances, the embed takes focus, and the
     browser scrolls the focused iframe back into view. The deck sits at
     the top of the page, so every track change threw the reader back to
     the opening. We cannot reach inside a cross-origin iframe to stop
     it, so we pin the scroll position across the change and put it back
     — and release the pin the moment the reader does anything that
     means they wanted to move.
     ================================================================ */

  var root = document.documentElement;
  var trail = [];                    /* recent scroll positions, newest last */
  var pinY = null;
  var pinUntil = 0;
  var pinRaf = null;
  var pinBehavior = "";

  function now() {
    return window.performance && performance.now ? performance.now() : Date.now();
  }

  /* The jump can land either side of the playback_update that announces
     the new track, so "where they were" cannot be read at pin time — by
     then it may already be 0. We keep a short trail and reach back past
     the jump for a position it cannot have touched. */
  function record(y) {
    var t = now();
    trail.push({ t: t, y: y });
    while (trail.length > 2 && trail[0].t < t - 5000) trail.shift();
  }

  function positionBefore(ms) {
    var cut = now() - ms;
    for (var i = trail.length - 1; i >= 0; i--) {
      if (trail[i].t <= cut) return trail[i].y;
    }
    return trail.length ? trail[0].y : window.scrollY;
  }

  function pinScroll() {
    pinY = positionBefore(600);
    pinUntil = now() + 2000;
    /* hold the restore un-animated for the duration, or smooth scrolling
       turns every correction into a visible slide */
    if (pinRaf === null) {
      pinBehavior = root.style.scrollBehavior;
      root.style.scrollBehavior = "auto";
      pinRaf = requestAnimationFrame(holdPin);
    }
  }

  /* An active hold, not a scroll listener: the scroll that throws the
     reader may have finished before the pin was armed, and a finished
     scroll fires no further events to react to. */
  function holdPin() {
    pinRaf = null;
    if (pinY === null || now() > pinUntil) { endPin(); return; }
    if (Math.abs(window.scrollY - pinY) > 24) window.scrollTo(0, pinY);
    pinRaf = requestAnimationFrame(holdPin);
  }

  function endPin() {
    pinY = null;
    if (pinRaf !== null) { cancelAnimationFrame(pinRaf); pinRaf = null; }
    root.style.scrollBehavior = pinBehavior;
  }

  /* any sign the reader meant to move releases the hold at once */
  ["wheel", "touchstart", "pointerdown", "keydown"].forEach(function (ev) {
    window.addEventListener(ev, endPin, { passive: true });
  });

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

      /* the standing name, set vertically so it stays inside the gutter */
      if (nowEl) {
        var name = active >= 0 ? ticks[active].sec.getAttribute("data-rail") : "";
        if (nowEl.textContent !== name) nowEl.textContent = name;
        nowEl.classList.toggle("on", name !== "");
      }

      /* top chrome gets out of the way going down, returns going up */
      var y = window.scrollY;
      if (Math.abs(y - lastY) > 6) {
        document.body.classList.toggle("chrome-away", y > lastY && y > 240);
        lastY = y;
      }

      if (pinY === null) record(y);

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

     ——— THE ONE LINE TO EDIT ———————————————————————————————————————
     Paste a Spotify playlist (or album, or single track) link between
     the quotes below and the deck becomes a real player. Leave it
     empty and the deck stays a silent object — no play button, no
     audio. Both states are intentional; nothing else needs changing.

       var PLAYLIST = "https://open.spotify.com/playlist/xxxxxxxx";

     The playlist has to be public for anyone but you to hear it.
     Public is not the same as shown-on-profile — those are separate
     toggles in Spotify.
     ———————————————————————————————————————————————————————————————— */

  var PLAYLIST = "https://open.spotify.com/playlist/6o7tZiunCJpBw9pEAnXwrq";

  var deck = { ctrl: null, iframe: null, side: "A", playing: false, armed: false,
               uri: null, track: "", artist: "" };

  var btn = document.getElementById("soundtrack");
  var scene = document.querySelector(".listening-scene");
  var recordEl = document.getElementById("record");
  var recordSide = document.getElementById("record-side");
  var recordFace = document.getElementById("record-face");
  var crateRail = document.getElementById("crate-rail");
  var deckNow = document.getElementById("deck-now");
  var chip = document.getElementById("now-playing");
  var chipSide = document.getElementById("now-playing-side");
  var chipTrack = document.getElementById("now-playing-track");
  var fine = document.getElementById("deck-fine");
  var opening = document.querySelector(".open");
  var mount = document.getElementById("deck-player");

  /* Accepts any of the shapes a Spotify "copy link" actually produces:
       https://open.spotify.com/playlist/<id>?si=...
       https://open.spotify.com/intl-de/track/<id>
       https://open.spotify.com/embed/album/<id>
       spotify:playlist:<id>
       <id>                        (bare, assumed a playlist)
     Trailing query strings are ignored — the id stops at the first
     character that is not alphanumeric. */
  function parseSpotify(raw) {
    var s = String(raw || "").trim();
    if (!s) return null;
    var m = s.match(
      /(?:spotify\.com\/(?:intl-[a-z-]{2,7}\/)?(?:embed\/)?|spotify:)(playlist|album|track)[:/]([A-Za-z0-9]+)/i
    );
    if (m) return { type: m[1].toLowerCase(), id: m[2] };
    if (/^[A-Za-z0-9]{22}$/.test(s)) return { type: "playlist", id: s };
    return null;
  }

  var source = parseSpotify(PLAYLIST);

  /* No link yet — the deck is furniture, not a broken player. */
  if (!source && btn) btn.hidden = true;

  function setPlaying(on) {
    deck.playing = on;
    if (btn) {
      btn.setAttribute("aria-pressed", String(on));
      btn.querySelector(".play-icon").textContent = on ? "❚❚" : "▶";
      btn.querySelector(".sound-label").textContent = on ? "Pause" : "Play";
    }
    if (scene) scene.classList.toggle("playing", on);
    updateChip();
  }

  /* the chip only exists once the deck is running and the deck itself
     has scrolled away — it is the deck following you down the page.
     "Side A" alone told you nothing, so it carries the track too. */
  function updateChip() {
    if (!chip) return;
    var gone = opening ? opening.getBoundingClientRect().bottom < 60 : false;
    chip.hidden = !(deck.playing && gone);
    if (chipSide) chipSide.textContent = "Side " + deck.side;
    if (chipTrack) {
      chipTrack.textContent = deck.track;
      chipTrack.hidden = deck.track === "";
    }
    chip.setAttribute("aria-label", deck.track ? "Pause " + deck.track : "Pause the deck");
  }

  /* ----------------------------------------------------------------
     The crate.

     playlist.js carries the running order, each cover, and a colour
     pulled out of that cover — generated at build time, because the
     embed only announces the track it is playing and the page that
     lists a playlist cannot be read cross-origin. That is what lets
     the shelf be full before anyone presses play, and lets a record
     be chosen rather than waited for.
     ---------------------------------------------------------------- */

  var records = window.PLAYLIST_RECORDS || [];
  var crateItems = [];

  function buildCrate() {
    if (!crateRail || !records.length) return;
    records.forEach(function (rec, i) {
      var li = document.createElement("li");
      var b = document.createElement("button");
      b.type = "button";
      b.className = "sleeve";
      b.style.setProperty("--tint", rec.tint);

      var img = document.createElement("img");
      img.src = rec.art;
      img.alt = "";
      img.width = 300;
      img.height = 300;
      img.loading = "lazy";

      var cap = document.createElement("span");
      cap.className = "sleeve-cap";
      cap.innerHTML = '<b></b><i></i>';
      cap.querySelector("b").textContent = rec.title;
      cap.querySelector("i").textContent = rec.artist;

      b.appendChild(img);
      b.appendChild(cap);
      b.setAttribute("aria-label", "Play " + rec.title + " by " + rec.artist);
      b.addEventListener("click", function () { pick(i); });

      li.appendChild(b);
      crateRail.appendChild(li);
      crateItems.push(b);
    });

    /* something is always cued up, so the deck is never a blank disc */
    dressRecord(records[0], false);
  }

  /* Press the cover into the disc. A picture disc, so the record on the
     platter is the record you picked rather than the same black one
     wearing a different sticker. */
  function dressRecord(rec, playing) {
    if (!rec) return;
    if (recordFace) {
      recordFace.src = rec.artBig || rec.art;
      recordFace.hidden = false;
    }
    if (recordEl) {
      recordEl.style.setProperty("--vinyl", rec.vinyl);
      recordEl.style.setProperty("--tint", rec.tint);
      recordEl.classList.add("pressed");
    }
    deck.track = rec.title;
    deck.artist = rec.artist;
    if (deckNow) deckNow.textContent = playing === false ? "" : rec.title + " — " + rec.artist;
    markCrate(rec.id);
    updateChip();
  }

  function markCrate(id) {
    records.forEach(function (rec, i) {
      if (crateItems[i]) crateItems[i].classList.toggle("on", rec.id === id);
    });
  }

  /* Choosing a record off the shelf. The embed has to exist before it can
     be told what to play, so a pick made before the first press of Play
     mounts the player and is replayed once the controller arrives. */
  var queued = null;

  function pick(i) {
    var rec = records[i];
    if (!rec) return;
    dressRecord(rec, true);
    if (!source) return;
    if (deck.ctrl) {
      deck.ctrl.loadUri("spotify:track:" + rec.id);
      /* loadUri only loads; the controller needs a beat before it will
         take a play() for the track it has just been handed */
      setTimeout(function () { if (deck.ctrl) deck.ctrl.play(); }, 350);
    } else {
      queued = rec;
      deck.armed = true;
      if (!deck.iframe) mountControlled();
    }
  }

  /* A track can still arrive that the baked crate has never heard of — he
     adds to the playlist more often than the crate is regenerated. oEmbed
     turns the bare URI from playback_update into a name and a cover. */
  var described = Object.create(null);

  function describe(uri) {
    var m = String(uri || "").match(/track[:/]([A-Za-z0-9]+)/);
    if (!m) return;
    var id = m[1];

    for (var i = 0; i < records.length; i++) {
      if (records[i].id === id) { dressRecord(records[i], true); return; }
    }

    if (described[id]) { applyTrack(described[id]); return; }
    if (!window.fetch) return;
    fetch("https://open.spotify.com/oembed?url=https://open.spotify.com/track/" + id)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.title) return;
        described[id] = { id: id, title: d.title, artist: "",
                          art: d.thumbnail_url || "", artBig: d.thumbnail_url || "",
                          tint: "#2a2a2a", vinyl: "#141414" };
        applyTrack(described[id]);
      })
      .catch(function () { /* the deck plays fine without a name on it */ });
  }

  function applyTrack(info) {
    dressRecord(info, true);
    if (deckNow) deckNow.textContent = info.title;
  }

  /* Plain embed: Spotify's own controls, used when the iframe API is
     unavailable (blocked script, no network to Spotify, etc.). */
  function mountPlainEmbed(autoplay) {
    if (!mount || !source || deck.iframe) return;
    var f = document.createElement("iframe");
    f.src = "https://open.spotify.com/embed/" + source.type + "/" + source.id +
            "?utm_source=generator&theme=0" + (autoplay ? "&autoplay=1" : "");
    f.width = "100%";
    f.height = "152";
    f.frameBorder = "0";
    f.allow = "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture";
    f.loading = "lazy";
    f.title = "Spotify player";
    mount.appendChild(f);
    deck.iframe = f;
    mount.hidden = false;
    if (fine) fine.hidden = false;
    if (btn) btn.hidden = true;      /* Spotify's transport takes over */
    if (scene) scene.classList.add("has-player");
  }

  /* Preferred path: Spotify's iframe API, so the record spins and the
     chip follows the real playback state instead of guessing. */
  function mountControlled() {
    if (!mount || !source) return;
    var host = document.createElement("div");
    mount.appendChild(host);
    mount.hidden = false;
    if (fine) fine.hidden = false;
    if (scene) scene.classList.add("has-player");

    var settled = false;
    window.onSpotifyIframeApiReady = function (API) {
      settled = true;
      API.createController(host, {
        uri: "spotify:" + source.type + ":" + source.id,
        width: "100%",
        height: 152,
        /* "dark" is what the iframe API turns into ?theme=0. Without it
           Spotify tints the whole panel from the album art, so the deck
           would change colour every track and fight the page. */
        theme: "dark"
      }, function (ctrl) {
        deck.ctrl = ctrl;
        deck.iframe = true;
        ctrl.addListener("playback_update", function (e) {
          if (!e || !e.data) return;
          setPlaying(!e.data.isPaused);
          var uri = e.data.playingURI;
          if (uri && uri !== deck.uri) {
            deck.uri = uri;
            pinScroll();        /* the track is changing — hold their place */
            describe(uri);
          }
        });
        /* a record pulled off the shelf before the player existed */
        if (queued) {
          var rec = queued;
          queued = null;
          ctrl.loadUri("spotify:track:" + rec.id);
          setTimeout(function () { if (deck.ctrl) deck.ctrl.play(); }, 350);
        } else if (deck.armed) {
          ctrl.play();
        }
      });
    };

    var s = document.createElement("script");
    s.src = "https://open.spotify.com/embed/iframe-api/v1";
    s.async = true;
    s.onerror = function () { if (!settled) { mount.removeChild(host); mountPlainEmbed(deck.armed); } };
    document.head.appendChild(s);

    /* script loaded but never called back — fall through to plain */
    setTimeout(function () {
      if (!settled && !deck.ctrl) {
        if (host.parentNode === mount) mount.removeChild(host);
        mountPlainEmbed(deck.armed);
      }
    }, 6000);
  }

  function toggleDeck() {
    if (!source) return;
    if (deck.ctrl) { deck.ctrl.togglePlay(); return; }
    deck.armed = true;              /* play as soon as it is ready */
    if (!deck.iframe) mountControlled();
  }

  if (btn && source) {
    btn.addEventListener("click", toggleDeck);
  }

  buildCrate();

  if (chip) {
    chip.addEventListener("click", function () {
      if (deck.ctrl) deck.ctrl.pause();
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

     It starts itself when it comes into view and stops when it leaves,
     so the project is already running by the time you have read the
     paragraph next to it. Muted, because no browser will autoplay
     audio and a blocked play() would leave a dead poster frame — the
     sound is one click away and the button says so. Native controls
     stay on top of that, so it can still be scrubbed.
     ================================================================ */

  var video = document.getElementById("tree-video");
  var soundBtn = document.getElementById("tree-sound");

  /* Every capture on the page plays on sight and stops when it leaves;
     only the tree carries audio, so only the tree gets a sound button. */
  Array.prototype.forEach.call(
    document.querySelectorAll(".screen-capture video"),
    function (v) {
      /* autoplay is declared in the markup as the no-JS path; with JS the
         observer owns it, so start from a known state */
      v.muted = true;
      if (!("IntersectionObserver" in window)) return;
      new IntersectionObserver(function (entries) {
        var on = entries[0].isIntersecting;
        if (on && v.paused && !reduce) {
          var p = v.play();
          /* a rejected play is not an error worth surfacing — the poster
             and the controls are still there */
          if (p && p.catch) p.catch(function () {});
        } else if (!on && !v.paused) {
          v.pause();
        }
      }, { threshold: 0.25 }).observe(v);
    }
  );

  if (video) {
    if (soundBtn) {
      soundBtn.addEventListener("click", function () {
        video.muted = !video.muted;
        if (!video.muted && video.paused) video.play().catch(function () {});
        soundBtn.setAttribute("aria-pressed", String(!video.muted));
        soundBtn.querySelector("i").textContent = video.muted ? "🔇" : "🔊";
        soundBtn.querySelector("span").textContent = video.muted ? "Sound off" : "Sound on";
      });
      /* the native controls can unmute too; keep the button honest */
      video.addEventListener("volumechange", function () {
        soundBtn.setAttribute("aria-pressed", String(!video.muted));
        soundBtn.querySelector("i").textContent = video.muted ? "🔇" : "🔊";
        soundBtn.querySelector("span").textContent = video.muted ? "Sound off" : "Sound on";
      });
    }
  }

  /* ================================================================
     The DNS monitor window.

     Three full-height dashboard captures stacked ran for a screen and
     a half. The monitor is a tabbed app, so they live in one window
     and you switch between them instead of scrolling past them.
     ================================================================ */

  var dnsWindow = document.getElementById("dns-window");
  if (dnsWindow) {
    var dnsTabs = [].slice.call(dnsWindow.querySelectorAll('[role="tab"]'));
    var dnsCap = document.getElementById("dns-cap");
    var dnsCaptions = [
      "Ordinary traffic · the window scrolls, the tabs are the app’s own",
      "Under a simulated tunneling run · 432 unique subdomains on one parent",
      "The live DNS request stream"
    ];
    var dnsScreen = dnsWindow.querySelector(".app-screen");

    dnsTabs.forEach(function (tab, i) {
      tab.addEventListener("click", function () { showDns(i); });
      tab.addEventListener("keydown", function (e) {
        var next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : -1;
        if (next < 0 || next >= dnsTabs.length) return;
        e.preventDefault();
        dnsTabs[next].focus();
        showDns(next);
      });
    });

    function showDns(active) {
      dnsTabs.forEach(function (tab, i) {
        tab.setAttribute("aria-selected", String(i === active));
        var panel = document.getElementById(tab.getAttribute("aria-controls"));
        if (panel) panel.hidden = i !== active;
      });
      if (dnsCap) dnsCap.textContent = dnsCaptions[active];
      /* each view is its own page; start it at the top */
      if (dnsScreen) dnsScreen.scrollTop = 0;
    }
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
    if (recordSide) recordSide.textContent = "Side " + deck.side;
    /* visual flip always; it only starts the player if there is one */
    if (scene) scene.classList.add("flipped");
    if (source && !deck.playing) toggleDeck();
    updateChip();
    try {
      console.log("%cSide " + deck.side + ". RPO{the_easter_egg_was_the_b_side}", "color:#a9c186;font:13px monospace");
    } catch (e) { /* ignore */ }
  }

  onScroll();
})();
