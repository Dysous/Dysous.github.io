/* Colmi R02 teardown viewer.
   A raymarched ring you can drag to rotate and scroll to pull apart.
   Falls back to the still render if WebGL is unavailable. */
(function () {
  "use strict";

  var stage = document.getElementById("ring-stage");
  if (!stage) return;

  var canvas = stage.querySelector("canvas");
  var slider = document.getElementById("ring-explode");
  var legend = stage.querySelector(".ring-legend");
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

    /* annulus in the XZ plane, extruded along Y */
    "float sdBand(vec3 p, float ro, float ri, float h, float rad){",
    "  float d2 = length(p.xz);",
    "  float dr = max(d2 - ro, ri - d2);",
    "  float dy = abs(p.y) - h;",
    "  vec2 w = vec2(dr, dy);",
    "  return min(max(dr, dy), 0.0) + length(max(w, 0.0)) - rad;",
    "}",

    "float sdRoundBox(vec3 p, vec3 b, float r){",
    "  vec3 q = abs(p) - b;",
    "  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;",
    "}",

    "vec2 opU(vec2 a, vec2 b){ return a.x < b.x ? a : b; }",

    /* x = distance, y = material id */
    "vec2 map(vec3 p){",
    "  float t = uExplode;",
    "  vec2 res = vec2(1e9, 0.0);",

    "  vec3 ps = p - vec3(0.0, 0.62 * t, 0.0);",
    "  res = opU(res, vec2(sdBand(ps, 0.985, 0.900, 0.155, 0.015), 1.0));",

    "  vec3 pb = p - vec3(0.0, -0.18 * t, 0.0);",
    "  float db = sdBand(pb, 0.893, 0.847, 0.100, 0.012);",
    "  db = max(db, 0.02 - pb.x);",
    "  res = opU(res, vec2(db, 2.0));",

    "  vec3 pf = p - vec3(0.0, -0.72 * t, 0.0);",
    "  res = opU(res, vec2(sdBand(pf, 0.842, 0.822, 0.055, 0.006), 3.0));",

    "  vec3 pm = pf - vec3(-0.868, 0.0, 0.0);",
    "  res = opU(res, vec2(sdRoundBox(pm, vec3(0.035, 0.072, 0.130), 0.018), 4.0));",
    "  float dl = min(length(pm - vec3(0.038, 0.0,  0.055)) - 0.021,",
    "                 length(pm - vec3(0.038, 0.0, -0.055)) - 0.021);",
    "  res = opU(res, vec2(dl, 5.0));",

    "  vec3 pl = p - vec3(0.0, -1.30 * t, 0.0);",
    "  res = opU(res, vec2(sdBand(pl, 0.818, 0.755, 0.145, 0.010), 6.0));",

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
    "  float spread = 0.96 * uExplode + 0.17;",
    "  vec3  c = vec3(0.0, -0.34 * uExplode, 0.0);",
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

    "void matProps(float id, out vec3 albedo, out float spec, out float rough, out vec3 emit){",
    "  emit = vec3(0.0);",
    "  if (id < 1.5)      { albedo = vec3(0.055, 0.058, 0.054); spec = 0.95; rough = 0.16; }",
    "  else if (id < 2.5) { albedo = vec3(0.420, 0.250, 0.130); spec = 0.55; rough = 0.42; }",
    "  else if (id < 3.5) { albedo = vec3(0.090, 0.190, 0.130); spec = 0.35; rough = 0.55; }",
    "  else if (id < 4.5) { albedo = vec3(0.085, 0.090, 0.080); spec = 0.30; rough = 0.60; }",
    "  else if (id < 5.5) { albedo = vec3(0.300, 0.420, 0.220); spec = 0.40; rough = 0.45;",
    "                       emit = vec3(0.420, 0.620, 0.300); }",
    "  else               { albedo = vec3(0.135, 0.140, 0.128); spec = 0.22; rough = 0.70; }",
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
    "  vec3  target = vec3(0.0, -0.34 * uExplode, 0.0);",
    "  float dist   = 3.95 + 2.00 * uExplode;",

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

    "    vec3 albedo; float spec; float rough; vec3 emit;",
    "    matProps(id, albedo, spec, rough, emit);",

    "    vec3 key  = normalize(vec3(0.55, 0.95, 0.60));",
    "    vec3 fill = normalize(vec3(-0.70, 0.25, 0.35));",

    "    float ao = occlusion(p, n);",
    "    float dif  = max(dot(n, key), 0.0) * ao;",
    "    float dif2 = max(dot(n, fill), 0.0) * 0.30;",
    "    float amb  = (0.18 + 0.22 * (0.5 + 0.5 * n.y)) * ao;",
    "    float rim  = pow(1.0 - max(dot(n, v), 0.0), 3.2) * 0.45;",

    "    vec3 hv = normalize(key + v);",
    "    float sp = pow(max(dot(n, hv), 0.0), mix(120.0, 10.0, rough)) * spec * ao;",

    "    col = albedo * (dif * 1.05 + dif2 + amb) + vec3(sp) + albedo * rim * 2.2 + emit * 0.55;",
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
  var MAX_PIXELS = 320000;
  var MIN_PIXELS = 46000;

  /* start cheap on every device and climb only if the GPU is keeping up —
     a first frame that is too expensive can cost the whole context */
  var budget = 90000;

  function resize() {
    var rect = canvas.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var scale = Math.min(1, Math.sqrt(budget / Math.max(1, rect.width * rect.height * dpr * dpr)));
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
          spinBtn.textContent = "Resume rotation";
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

    if (needsDraw) draw();
    requestAnimationFrame(frame);
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
    spinBtn.textContent = spinning ? "Pause rotation" : "Resume rotation";
    spinBtn.addEventListener("click", function () {
      spinning = !spinning;
      spinBtn.setAttribute("aria-pressed", String(spinning));
      spinBtn.textContent = spinning ? "Pause rotation" : "Resume rotation";
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
