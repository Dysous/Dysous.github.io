/* Colmi R02 teardown viewer.
   A raymarched ring you can drag to rotate and scroll to pull apart.
   Falls back to the still render if WebGL is unavailable. */
(function () {
  "use strict";

  var stage = document.getElementById("ring-stage");
  if (!stage) return;

  var canvas = stage.querySelector("canvas");
  var slider = document.getElementById("ring-explode");
  var legend = document.querySelector("#ring .ring-legend") || stage.querySelector(".ring-legend");
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  var gl = null;
  try {
    gl = canvas.getContext("webgl", { antialias: true, alpha: false }) ||
         canvas.getContext("experimental-webgl", { antialias: true, alpha: false });
  } catch (e) { gl = null; }

  if (!gl) { stage.classList.add("no-webgl"); return; }

  var VERT = [
    "attribute vec2 aPos;",
    "void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }"
  ].join("\n");

  var FRAG = [
    "precision highp float;",
    "uniform vec2  uRes;",
    "uniform float uYaw;",
    "uniform float uPitch;",
    "uniform float uExplode;",

    "mat3 rotY(float a){ float s=sin(a), c=cos(a); return mat3(c,0.0,-s, 0.0,1.0,0.0, s,0.0,c); }",
    "mat3 rotX(float a){ float s=sin(a), c=cos(a); return mat3(1.0,0.0,0.0, 0.0,c,s, 0.0,-s,c); }",

    /* Everything except the sensor module is a surface of revolution, so the
       components are authored as 2D cross-sections in (radius, height) and
       revolved. That is exact, cheap, and it is what lets the shell carry a
       real domed profile and a chamfer instead of reading as a flat tube. */
    "vec2 revolve(vec3 p){ return vec2(length(p.xz), p.y); }",

    /* rounded box in 2D with per-corner radii: (outer-top, outer-bottom,
       inner-top, inner-bottom) relative to the profile centre */
    "float sdRB2(vec2 p, vec2 b, vec4 r){",
    "  r.xy = (p.x > 0.0) ? r.xy : r.zw;",
    "  r.x  = (p.y > 0.0) ? r.x  : r.y;",
    "  vec2 q = abs(p) - b + r.x;",
    "  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r.x;",
    "}",

    "float sdRoundBox(vec3 p, vec3 b, float r){",
    "  vec3 q = abs(p) - b;",
    "  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;",
    "}",

    /* an ellipsoid, used for the sensor dome and the LED lenses */
    "float sdEllipsoid(vec3 p, vec3 r){",
    "  float k0 = length(p / r);",
    "  float k1 = length(p / (r * r));",
    "  return k0 * (k0 - 1.0) / k1;",
    "}",

    "vec2 opU(vec2 a, vec2 b){ return a.x < b.x ? a : b; }",

    /* x = distance, y = material id */
    "vec2 map(vec3 p){",
    "  float t = uExplode;",
    "  vec2 res = vec2(1e9, 0.0);",

    /* --- outer shell: domed outside, chamfered edges, one fine groove --- */
    "  vec3 ps = p - vec3(0.0, 0.52 * t, 0.0);",
    "  vec2 qs = revolve(ps) - vec2(0.9425, 0.0);",
    "  float shell = sdRB2(qs, vec2(0.0425, 0.1550), vec4(0.0400, 0.0400, 0.0090, 0.0090));",
    /*   a shallow groove turned into the outer face, 0.1 mm of visual interest */
    "  float groove = length(qs - vec2(0.0455, 0.0)) - 0.0115;",
    "  shell = max(shell, -groove);",
    "  res = opU(res, vec2(shell, 1.0));",

    /* --- curved battery: a partial arc, so you can see it is not a full ring --- */
    "  vec3 pb = p - vec3(0.0, -0.12 * t, 0.0);",
    "  vec2 qb = revolve(pb) - vec2(0.8700, 0.0);",
    "  float batt = sdRB2(qb, vec2(0.0230, 0.1000), vec4(0.0110, 0.0110, 0.0110, 0.0110));",
    "  batt = max(batt, 0.02 - pb.x);",
    "  res = opU(res, vec2(batt, 2.0));",

    /* --- flex PCB: thin, green, wraps most of the way round --- */
    "  vec3 pf = p - vec3(0.0, -0.58 * t, 0.0);",
    "  vec2 qf = revolve(pf) - vec2(0.8320, 0.0);",
    "  float pcb = sdRB2(qf, vec2(0.0100, 0.0550), vec4(0.0040, 0.0040, 0.0040, 0.0040));",
    "  res = opU(res, vec2(pcb, 3.0));",

    /* --- the PPG sensor module, the one part that is not revolved --- */
    "  vec3 pm = pf - vec3(-0.8280, 0.0, 0.0);",
    /*   housing: a lozenge sitting against the inside of the flex board */
    "  float hous = sdRoundBox(pm - vec3(-0.0330, 0.0, 0.0), vec3(0.0290, 0.0880, 0.1520), 0.0200);",
    "  res = opU(res, vec2(hous, 4.0));",
    /*   the glossy window over the optics */
    "  float win = sdEllipsoid(pm - vec3(-0.0620, 0.0, 0.0), vec3(0.0300, 0.0680, 0.1280));",
    "  res = opU(res, vec2(win, 7.0));",
    /*   two green LEDs and, between them, the photodiode */
    "  float led = min(sdEllipsoid(pm - vec3(-0.0760, 0.0,  0.0680), vec3(0.0170, 0.0310, 0.0310)),",
    "                  sdEllipsoid(pm - vec3(-0.0760, 0.0, -0.0680), vec3(0.0170, 0.0310, 0.0310)));",
    "  res = opU(res, vec2(led, 5.0));",
    "  float diode = sdEllipsoid(pm - vec3(-0.0760, 0.0, 0.0), vec3(0.0160, 0.0270, 0.0270));",
    "  res = opU(res, vec2(diode, 8.0));",

    /* --- inner resin liner, with a window over the optics --- */
    "  vec3 pl = p - vec3(0.0, -1.05 * t, 0.0);",
    "  vec2 ql = revolve(pl) - vec2(0.7865, 0.0);",
    "  float liner = sdRB2(ql, vec2(0.0315, 0.1450), vec4(0.0090, 0.0090, 0.0260, 0.0260));",
    /*   the sensor shines through the liner rather than hiding behind it, so
         the module is still visible with the ring assembled */
    "  float lwin = sdEllipsoid(pl - vec3(-0.7900, 0.0, 0.0), vec3(0.0700, 0.0780, 0.1420));",
    "  liner = max(liner, -lwin);",
    "  res = opU(res, vec2(liner, 6.0));",

    /* --- two gold charging pads, proud of the inner face --- */
    "  float pad = min(sdRoundBox(pl - vec3(0.0, 0.0,  0.7560), vec3(0.0620, 0.0360, 0.0150), 0.0080),",
    "                  sdRoundBox(pl - vec3(0.0, 0.0, -0.7560), vec3(0.0620, 0.0360, 0.0150), 0.0080));",
    "  res = opU(res, vec2(pad, 9.0));",

    "  return res;",
    "}",

    /* four-tap tetrahedron normal — half the map() calls of the six-tap */
    "vec3 calcNormal(vec3 p){",
    "  vec2 k = vec2(1.0, -1.0) * 0.0016;",
    "  return normalize(k.xyy * map(p + k.xyy).x +",
    "                   k.yyx * map(p + k.yyx).x +",
    "                   k.yxy * map(p + k.yxy).x +",
    "                   k.xxx * map(p + k.xxx).x);",
    "}",

    /* the whole assembly lives inside this sphere; rays that miss it never march */
    "bool boundsHit(vec3 ro, vec3 rd, out float t0, out float t1){",
    "  float spread = 0.80 * uExplode + 0.17;",
    "  vec3  c = vec3(0.0, -0.28 * uExplode, 0.0);",
    "  float r = sqrt(1.0 + spread * spread) + 0.04;",
    "  vec3  oc = ro - c;",
    "  float b = dot(oc, rd);",
    "  float d = b * b - (dot(oc, oc) - r * r);",
    "  if (d < 0.0) return false;",
    "  d = sqrt(d);",
    "  t0 = max(-b - d, 0.0);",
    "  t1 = -b + d;",
    "  return t1 > 0.0;",
    "}",

    "void matProps(float id, out vec3 albedo, out float spec, out float rough,",
    "               out float metal, out vec3 emit){",
    "  emit = vec3(0.0); metal = 0.0;",
    "  if (id < 1.5)      { albedo = vec3(0.048, 0.051, 0.048); spec = 1.00; rough = 0.13; metal = 0.85; }",  /* anodised shell */
    "  else if (id < 2.5) { albedo = vec3(0.455, 0.270, 0.140); spec = 0.70; rough = 0.34; metal = 0.60; }",  /* battery foil */
    "  else if (id < 3.5) { albedo = vec3(0.075, 0.185, 0.120); spec = 0.40; rough = 0.50; }",                /* solder mask */
    "  else if (id < 4.5) { albedo = vec3(0.062, 0.066, 0.060); spec = 0.35; rough = 0.58; }",                /* sensor housing */
    "  else if (id < 5.5) { albedo = vec3(0.250, 0.420, 0.210); spec = 0.75; rough = 0.14;",                  /* PPG LEDs */
    "                       emit = vec3(0.360, 1.080, 0.420); }",
    "  else if (id < 6.5) { albedo = vec3(0.082, 0.085, 0.079); spec = 0.26; rough = 0.62; }",                /* resin liner */
    "  else if (id < 7.5) { albedo = vec3(0.020, 0.024, 0.022); spec = 1.00; rough = 0.05; }",                /* sensor window */
    "  else if (id < 8.5) { albedo = vec3(0.012, 0.013, 0.016); spec = 0.90; rough = 0.09; }",                /* photodiode */
    "  else               { albedo = vec3(0.620, 0.470, 0.185); spec = 1.00; rough = 0.18; metal = 0.95; }",  /* gold pads */
    "}",

    /* three-tap ambient occlusion instead of a shadow march */
    "float occlusion(vec3 p, vec3 n){",
    "  float occ = 0.0;",
    "  occ += 0.16 - clamp(map(p + n * 0.045).x, -0.16, 0.16);",
    "  occ += 0.10 - clamp(map(p + n * 0.110).x, -0.10, 0.10) * 0.6;",
    "  occ += 0.06 - clamp(map(p + n * 0.220).x, -0.06, 0.06) * 0.3;",
    "  return clamp(1.0 - occ * 2.1, 0.25, 1.0);",
    "}",

    "void main(){",
    "  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;",

    "  vec3 bg = mix(vec3(0.0105, 0.0120, 0.0098), vec3(0.0024, 0.0028, 0.0022),",
    "                clamp(length(uv) * 1.15, 0.0, 1.0));",

    /* dolly out and re-centre as the stack opens, so it always fits the frame */
    "  vec3  target = vec3(0.0, -0.28 * uExplode, 0.0);",
    "  float dist   = 3.95 + 1.55 * uExplode;",

    "  mat3 rot = rotY(uYaw) * rotX(uPitch);",
    "  vec3 ro = target + rot * vec3(0.0, 0.0, dist);",
    "  vec3 rd = rot * normalize(vec3(uv, -1.95));",

    "  float tNear, tFar;",
    "  bool inBounds = boundsHit(ro, rd, tNear, tFar);",

    "  float t = tNear;",
    "  float id = 0.0;",
    "  bool hit = false;",
    "  if (inBounds){",
    "    for (int i = 0; i < 56; i++){",
    "      vec3 p = ro + rd * t;",
    "      vec2 h = map(p);",
    "      if (h.x < 0.0011){ id = h.y; hit = true; break; }",
    "      t += h.x;",
    "      if (t > tFar) break;",
    "    }",
    "  }",

    "  vec3 col = bg;",
    "  if (hit){",
    "    vec3 p = ro + rd * t;",
    "    vec3 n = calcNormal(p);",
    "    vec3 v = -rd;",

    "    vec3 albedo; float spec; float rough; float metal; vec3 emit;",
    "    matProps(id, albedo, spec, rough, metal, emit);",

    "    vec3 key  = normalize(vec3(0.55, 0.95, 0.60));",
    "    vec3 fill = normalize(vec3(-0.70, 0.25, 0.35));",
    "    vec3 rimL = normalize(vec3(0.10, -0.35, -0.90));",

    "    float ao = occlusion(p, n);",
    "    float dif  = max(dot(n, key), 0.0) * ao;",
    "    float dif2 = max(dot(n, fill), 0.0) * 0.30;",
    "    float amb  = (0.18 + 0.22 * (0.5 + 0.5 * n.y)) * ao;",
    "    float rim  = pow(1.0 - max(dot(n, v), 0.0), 3.2) * 0.45;",

    /* metals tint their own highlight and have no diffuse of their own, which
       is the difference between the shell reading as anodised and as plastic */
    "    vec3 f0 = mix(vec3(0.045), albedo, metal);",
    "    float fres = pow(1.0 - max(dot(n, v), 0.0), 5.0);",
    "    vec3 F = f0 + (vec3(1.0) - f0) * fres;",

    "    float shin = mix(180.0, 9.0, rough);",
    "    vec3 hv  = normalize(key + v);",
    "    vec3 hv2 = normalize(fill + v);",
    "    vec3 hv3 = normalize(rimL + v);",
    "    vec3 sp = F * spec * ao * (",
    "        pow(max(dot(n, hv),  0.0), shin) * 1.00 +",
    "        pow(max(dot(n, hv2), 0.0), shin) * 0.35 +",
    "        pow(max(dot(n, hv3), 0.0), shin) * 0.55);",

    /* a crude vertical gradient standing in for an environment, so curved
       metal picks up a moving highlight as it turns */
    "    vec3 r = reflect(-v, n);",
    "    vec3 env = mix(vec3(0.020, 0.023, 0.020), vec3(0.150, 0.158, 0.148), clamp(r.y * 0.5 + 0.5, 0.0, 1.0));",
    "    env += vec3(0.30, 0.33, 0.28) * pow(max(dot(r, key), 0.0), 14.0);",

    "    vec3 diffuse = albedo * (1.0 - metal) * (dif * 1.05 + dif2 + amb);",
    "    col = diffuse + sp + env * F * mix(0.35, 1.25, metal) * ao",
    "        + albedo * rim * 2.2 + emit * 0.85;",
    "    col = mix(col, bg, clamp((t - 2.6) / 5.0, 0.0, 0.55));",
    "  }",

    "  col = pow(clamp(col, 0.0, 1.0), vec3(0.4545));",
    "  gl_FragColor = vec4(col, 1.0);",
    "}"
  ].join("\n");

  function compile(type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  var vs = compile(gl.VERTEX_SHADER, VERT);
  var fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) { stage.classList.add("no-webgl"); return; }

  var prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { stage.classList.add("no-webgl"); return; }
  gl.useProgram(prog);

  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var aPos = gl.getAttribLocation(prog, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  var uRes = gl.getUniformLocation(prog, "uRes");
  var uYaw = gl.getUniformLocation(prog, "uYaw");
  var uPitch = gl.getUniformLocation(prog, "uPitch");
  var uExplode = gl.getUniformLocation(prog, "uExplode");

  var yaw = 0.6, pitch = -0.52, explode = 0, explodeTarget = 0;

  /* on touch devices this is a battery drain to leave spinning forever, so it
     renders one frame and waits to be touched */
  var touch = matchMedia("(pointer: coarse)").matches;
  var spinning = !reduce && !touch;
  var visible = false, needsDraw = true, running = false;

  /* raymarching is fill-rate bound, so cap the buffer rather than the ratio.
     quality backs off on its own if frames come in slow. */
  var MAX_PIXELS = 900000;
  var MIN_PIXELS = 46000;

  /* start cheap on every device and climb only if the GPU is keeping up —
     a first frame that is too expensive can cost the whole context */
  var budget = 160000;

  /* while it is moving the buffer is capped for frame rate; once it settles
     one full-resolution frame is drawn, which is what kills the pixelation.
     a single expensive still is fine — nothing is waiting on it. */
  var refining = false;
  var refineTimer = null;

  function resize() {
    var rect = canvas.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var scale = refining
      ? 1
      : Math.min(1, Math.sqrt(budget / Math.max(1, rect.width * rect.height * dpr * dpr)));
    var w = Math.max(1, Math.round(rect.width * dpr * scale));
    var h = Math.max(1, Math.round(rect.height * dpr * scale));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      needsDraw = true;
    }
  }

  var slowFrames = 0;

  function draw() {
    resize();
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uYaw, yaw);
    gl.uniform1f(uPitch, pitch);
    gl.uniform1f(uExplode, explode);

    var t0 = performance.now();
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.finish();
    var cost = performance.now() - t0;

    needsDraw = false;

    if (refining) { refining = false; return; }

    if (cost > 45) {
      /* back off before the driver decides to kill the context */
      if (budget > MIN_PIXELS) {
        budget = Math.max(MIN_PIXELS, budget * 0.6);
        needsDraw = true;
        slowFrames = 0;
      } else if (++slowFrames > 3 && spinning) {
        /* already at the floor: stop animating but stay draggable */
        spinning = false;
        if (spinBtn) {
          spinBtn.setAttribute("aria-pressed", "false");
          spinBtn.textContent = "Resume";
        }
      }
    } else {
      slowFrames = 0;
      if (cost < 11 && budget < MAX_PIXELS) {
        budget = Math.min(MAX_PIXELS, budget * 1.5);
        needsDraw = true;
      }
    }
  }

  var last = 0;
  function frame(now) {
    if (!visible) { running = false; return; }
    var dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016;
    last = now;

    if (spinning && !dragging) { yaw += dt * 0.32; needsDraw = true; }

    if (Math.abs(explodeTarget - explode) > 0.001) {
      explode += (explodeTarget - explode) * Math.min(dt * 7, 1);
      needsDraw = true;
    } else if (explode !== explodeTarget) {
      explode = explodeTarget;
      needsDraw = true;
    }

    if (needsDraw) {
      draw();
      scheduleRefine();
    }
    requestAnimationFrame(frame);
  }

  function scheduleRefine() {
    clearTimeout(refineTimer);
    refineTimer = setTimeout(function () {
      if (!visible || dragging || spinning) return;
      if (Math.abs(explodeTarget - explode) > 0.001) return;
      refining = true;
      draw();
    }, 220);
  }

  function kick() {
    if (!running && visible) { running = true; last = 0; requestAnimationFrame(frame); }
  }

  /* --- drag to rotate ------------------------------------------------ */
  var dragging = false, lastX = 0, lastY = 0, pointerId = null;

  canvas.addEventListener("pointerdown", function (e) {
    dragging = true;
    pointerId = e.pointerId;
    lastX = e.clientX; lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    stage.classList.add("dragging");
  });

  canvas.addEventListener("pointermove", function (e) {
    if (!dragging || e.pointerId !== pointerId) return;
    yaw += (e.clientX - lastX) * 0.0095;
    pitch += (e.clientY - lastY) * 0.0075;
    pitch = Math.max(-1.45, Math.min(1.45, pitch));
    lastX = e.clientX; lastY = e.clientY;
    needsDraw = true;
    kick();
  });

  function endDrag(e) {
    if (!dragging || (e && e.pointerId !== pointerId)) return;
    dragging = false;
    pointerId = null;
    stage.classList.remove("dragging");
  }
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  /* --- wheel pulls it apart, but hands scrolling back at the ends ---- */
  canvas.addEventListener("wheel", function (e) {
    var dir = e.deltaY > 0 ? 1 : -1;
    var next = Math.max(0, Math.min(1, explodeTarget + dir * 0.16));
    if (next === explodeTarget) return;   /* let the page scroll on */
    e.preventDefault();
    setExplode(next);
  }, { passive: false });

  function setExplode(v) {
    explodeTarget = v;
    if (slider) slider.value = String(Math.round(v * 100));
    stage.classList.toggle("exploded", v > 0.12);
    if (legend) legend.setAttribute("aria-hidden", v > 0.12 ? "false" : "true");
    kick();
  }

  if (slider) {
    slider.addEventListener("input", function () {
      setExplode(parseInt(slider.value, 10) / 100);
    });
  }

  var spinBtn = document.getElementById("ring-spin");
  if (spinBtn) {
    spinBtn.setAttribute("aria-pressed", String(spinning));
    spinBtn.textContent = spinning ? "Pause" : "Resume";
    spinBtn.addEventListener("click", function () {
      spinning = !spinning;
      spinBtn.setAttribute("aria-pressed", String(spinning));
      spinBtn.textContent = spinning ? "Pause" : "Resume";
      kick();
    });
  }

  window.addEventListener("resize", function () { needsDraw = true; kick(); });

  /* if the GPU gives up, fall back to the still render rather than a blank box */
  canvas.addEventListener("webglcontextlost", function (e) {
    e.preventDefault();
    visible = false;
    running = false;
    stage.classList.add("no-webgl");
  });

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible) { needsDraw = true; kick(); }
    }, { threshold: 0.05 }).observe(stage);
  } else {
    visible = true;
  }

  stage.classList.add("ready");
  visible = true;
  draw();
  kick();
})();
