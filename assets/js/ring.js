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

    /* Components repeated round the board. The flex is populated the whole
       way round in the teardown photos — a field of small silver pads and
       chips — and one chip on its own reads as a toy, so the pads are
       instanced by folding space into a wedge instead of being authored
       one at a time. */
    "vec3 polarFold(vec3 p, float n){",
    "  float a = atan(p.z, p.x);",
    "  float r = length(p.xz);",
    "  float sector = 6.2831853 / n;",
    "  a = mod(a + sector * 0.5, sector) - sector * 0.5;",
    "  return vec3(cos(a) * r, p.y, sin(a) * r);",
    "}",

    /* The real ring, measured: 7.8 mm wide, 2.75 mm of wall, about 23.6 mm
       across the outside. The old model was half that width, which is why it
       read as a washer rather than the chunky thing it is. Everything below
       is in units of (outer radius = 0.985). */
    "const float R_OUT   = 0.9850;",   /* outer face of the shell          */
    "const float R_SHELL = 0.9425;",   /* shell profile centre             */
    "const float HW      = 0.3250;",   /* half the ring's width            */

    /* x = distance, y = material id.
       skipLiner lets the second march see what is behind the resin, which is
       how the board shows through it. */
    "vec2 mapX(vec3 p, bool skipLiner){",
    "  float t = uExplode;",
    "  vec2 res = vec2(1e9, 0.0);",

    /* --- outer shell: a flat band rolled over hard at both rims --- */
    "  vec3 ps = p - vec3(0.0, 0.95 * t, 0.0);",
    "  vec2 qs = revolve(ps) - vec2(R_SHELL, 0.0);",
    /*   No groove: on the real ring the bright line running round the band
         is a reflection, not a feature. The face is smooth and rolled hard
         over at each rim, and the material does the rest. */
    "  float shell = sdRB2(qs, vec2(0.0425, HW), vec4(0.0420, 0.0420, 0.0080, 0.0080));",
    "  res = opU(res, vec2(shell, 1.0));",

    /* --- curved battery: a partial arc, so you can see it is not a full ring --- */
    "  vec3 pb = p - vec3(0.0, 0.05 * t, 0.0);",
    "  vec2 qb = revolve(pb) - vec2(0.8720, 0.0);",
    "  float batt = sdRB2(qb, vec2(0.0210, 0.2100), vec4(0.0100));",
    "  batt = max(batt, 0.02 - pb.x);",
    "  res = opU(res, vec2(batt, 2.0));",

    /* --- flex PCB: thin, wraps most of the way round --- */
    "  vec3 pf = p - vec3(0.0, -0.62 * t, 0.0);",
    "  vec2 qf = revolve(pf) - vec2(0.8300, 0.0);",
    "  float pcb = sdRB2(qf, vec2(0.0075, 0.2050), vec4(0.0030));",
    "  res = opU(res, vec2(pcb, 3.0));",

    /* --- the population on it: two staggered rings of pads, one of chips --- */
    "  vec3 pr = polarFold(pf, 34.0);",
    "  float padA = sdRoundBox(pr - vec3(0.8210, 0.0960, 0.0), vec3(0.0090, 0.0380, 0.0120), 0.0030);",
    "  float padB = sdRoundBox(pr - vec3(0.8210, -0.0960, 0.0), vec3(0.0090, 0.0380, 0.0120), 0.0030);",
    "  res = opU(res, vec2(min(padA, padB), 10.0));",
    "  vec3 pc2 = polarFold(pf, 11.0);",
    "  float chip = sdRoundBox(pc2 - vec3(0.8140, 0.0, 0.0), vec3(0.0130, 0.0320, 0.0330), 0.0040);",
    "  res = opU(res, vec2(chip, 11.0));",

    /* --- the PPG sensor module, the one part that is not revolved ---
           pm.x runs outward from the board, so the optics stack has to be at
           *positive* pm.x to end up on the finger side of it. Negative put
           the whole module between the board and the shell, where the board
           itself hid every part of it. */
    "  vec3 pm = pf - vec3(-0.8260, 0.0, 0.0);",
    /*   housing: a lozenge sitting against the inside of the flex board */
    "  float hous = sdRoundBox(pm - vec3(0.0280, 0.0, 0.0), vec3(0.0260, 0.1500, 0.1900), 0.0160);",
    "  res = opU(res, vec2(hous, 4.0));",
    /*   The glossy window sits as a bezel around the optics rather than over
         them. On the real part the emitters are under the glass; drawn that
         way at this size they vanish behind it, and the optics are the whole
         reason for the viewer. The note under the canvas says this is a model
         of the layout, not a scan. */
    "  float win = sdRoundBox(pm - vec3(0.0500, 0.0, 0.0), vec3(0.0090, 0.1180, 0.1560), 0.0150);",
    "  res = opU(res, vec2(win, 7.0));",
    /*   In the product photography these are not two matching domes: small
         bright green emitters in pale packages either side of a larger
         photodiode with a gold active area in a dark frame. */
    "  float led = min(sdRoundBox(pm - vec3(0.0640, 0.0,  0.1000), vec3(0.0130, 0.0360, 0.0360), 0.0060),",
    "                  sdRoundBox(pm - vec3(0.0640, 0.0, -0.1000), vec3(0.0130, 0.0360, 0.0360), 0.0060));",
    "  res = opU(res, vec2(led, 5.0));",
    "  float diode = sdRoundBox(pm - vec3(0.0640, 0.0, 0.0), vec3(0.0130, 0.0540, 0.0580), 0.0045);",
    "  res = opU(res, vec2(diode, 8.0));",

    /* --- inner resin liner, with a window over the optics --- */
    "  if (!skipLiner) {",
    "    vec3 pl = p - vec3(0.0, -1.45 * t, 0.0);",
    "    vec2 ql = revolve(pl) - vec2(0.7840, 0.0);",
    "    float liner = sdRB2(ql, vec2(0.0290, 0.3050), vec4(0.0080, 0.0080, 0.0240, 0.0240));",
    /*     the sensor sits in a cut-out rather than behind the resin */
    "    float lwin = sdRoundBox(pl - vec3(-0.7900, 0.0, 0.0), vec3(0.0700, 0.1300, 0.1700), 0.0250);",
    "    liner = max(liner, -lwin);",
    "    res = opU(res, vec2(liner, 6.0));",
    "  }",

    /* --- two gold charging pads, proud of the inner face --- */
    "  vec3 pg = p - vec3(0.0, -1.45 * t, 0.0);",
    "  float pad = min(sdRoundBox(pg - vec3(0.0, 0.0,  0.7560), vec3(0.0700, 0.0420, 0.0150), 0.0080),",
    "                  sdRoundBox(pg - vec3(0.0, 0.0, -0.7560), vec3(0.0700, 0.0420, 0.0150), 0.0080));",
    "  res = opU(res, vec2(pad, 9.0));",

    "  return res;",
    "}",

    "vec2 map(vec3 p){ return mapX(p, false); }",

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
    /*   0.34 is the ring's half-width; at full width the corner of the band
         sits further out than the old 0.17 sphere reached, and rays that
         should have hit it were being thrown away. The component offsets
         above are likewise scaled for the doubled width (shell 0.95, flex
         -0.62, liner/pads -1.45) so the exploded layers fully separate. */
    "  float spread = 1.28 * uExplode + 0.34;",
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

    /* Colours read off the teardown photograph rather than guessed: the
       emitter is a hard green in a pale package, the photodiode is a gold
       plate in a dark frame, the pads are bare tinned silver, and the shell
       is piano black — almost no diffuse at all, nearly all reflection. */
    "void matProps(float id, out vec3 albedo, out float spec, out float rough,",
    "               out float metal, out vec3 emit){",
    "  emit = vec3(0.0); metal = 0.0;",
    /*   Piano black is not a metal. Modelled as one, its Fresnel term picks
         up the near-black albedo, the reflection goes to nothing and the
         shell comes out looking like matte rubber — which is exactly what it
         did. It is a dielectric over a black base: 5% white reflection
         head-on, total at a grazing angle, and no diffuse worth the name. */
    "  if (id < 1.5)      { albedo = vec3(0.008, 0.009, 0.008); spec = 1.00; rough = 0.040; metal = 0.0; }",  /* polished shell */
    "  else if (id < 2.5) { albedo = vec3(0.455, 0.270, 0.140); spec = 0.70; rough = 0.34;  metal = 0.60; }", /* battery foil */
    "  else if (id < 3.5) { albedo = vec3(0.055, 0.050, 0.046); spec = 0.35; rough = 0.55; }",                /* flex substrate */
    "  else if (id < 4.5) { albedo = vec3(0.052, 0.055, 0.050); spec = 0.30; rough = 0.60; }",                /* sensor housing */
    "  else if (id < 5.5) { albedo = vec3(0.090, 0.480, 0.070); spec = 0.85; rough = 0.10;",                  /* green emitter */
    "                       emit = vec3(0.045, 1.700, 0.110); }",
    "  else if (id < 6.5) { albedo = vec3(0.012, 0.013, 0.012); spec = 0.95; rough = 0.06; }",                /* resin liner */
    "  else if (id < 7.5) { albedo = vec3(0.016, 0.019, 0.018); spec = 1.00; rough = 0.04; }",                /* optics window */
    "  else if (id < 8.5) { albedo = vec3(0.880, 0.660, 0.215); spec = 1.00; rough = 0.24; metal = 0.95; }",  /* gold photodiode */
    "  else if (id < 9.5) { albedo = vec3(0.680, 0.520, 0.200); spec = 1.00; rough = 0.17; metal = 0.95; }",  /* gold charge pads */
    "  else if (id < 10.5){ albedo = vec3(0.620, 0.640, 0.650); spec = 1.00; rough = 0.22; metal = 0.90; }",  /* tinned pads */
    "  else               { albedo = vec3(0.105, 0.108, 0.112); spec = 0.55; rough = 0.38; metal = 0.25; }",  /* chip bodies */
    "}",

    /* A studio, not a grey gradient. Polished black is almost entirely the
       things around it, so what the shell reflects *is* the material: a dark
       floor, a bright horizon, a big soft overhead box, and one hard strip
       light. Take the strip light out and it goes straight back to looking
       like rubber. */
    "vec3 envmap(vec3 r){",
    "  vec3 c = mix(vec3(0.0040, 0.0044, 0.0038), vec3(0.0300, 0.0325, 0.0285),",
    "               smoothstep(-0.60, 0.05, r.y));",
    "  c = mix(c, vec3(0.1050, 0.1120, 0.1000), smoothstep(0.05, 0.75, r.y));",
    /*   The strip lights are bands in elevation only, so they wrap the whole
         way round in azimuth. On a cylindrical band that paints one
         continuous bright line all the way round the ring, which is the
         thing the eye reads as "polished". A point light cannot do it. */
    "  c += vec3(5.600, 5.700, 5.350) * smoothstep(0.075, 0.0, abs(r.y - 0.215));",
    "  c += vec3(1.250, 1.300, 1.180) * smoothstep(0.065, 0.0, abs(r.y + 0.300));",
    /*   overhead softbox */
    "  c += vec3(4.200, 4.300, 3.980) * smoothstep(0.58, 0.96, r.y) * smoothstep(0.85, 0.10, abs(r.x));",
    /*   a big white card off to one side, so the band is not evenly lit */
    /*   Two big cards either side. The flat part of the band is a cylinder,
         so its reflection barely moves in elevation as you look across it —
         all the modelling has to come from things placed around it in
         azimuth, or the band comes out a uniform black slab. */
    "  c += vec3(3.100, 3.180, 2.950) * smoothstep(0.05, 0.85, r.x) * smoothstep(-0.70, 0.10, r.y);",
    "  c += vec3(0.850, 0.880, 0.800) * smoothstep(-0.10, -0.80, r.x) * smoothstep(-0.70, 0.20, r.y);",
    /*   and a dim wrap so the shadow side is not pure void */
    "  c += vec3(0.090, 0.095, 0.086);",
    "  return c;",
    "}",

    /* three-tap ambient occlusion instead of a shadow march */
    "float occlusion(vec3 p, vec3 n){",
    "  float occ = 0.0;",
    "  occ += 0.16 - clamp(map(p + n * 0.045).x, -0.16, 0.16);",
    "  occ += 0.10 - clamp(map(p + n * 0.110).x, -0.10, 0.10) * 0.6;",
    "  occ += 0.06 - clamp(map(p + n * 0.220).x, -0.06, 0.06) * 0.3;",
    "  return clamp(1.0 - occ * 2.1, 0.25, 1.0);",
    "}",

    /* one shading evaluation, so the liner pass can reuse it */
    "vec3 shade(vec3 p, vec3 n, vec3 v, float id, float ao){",
    "  vec3 albedo; float spec; float rough; float metal; vec3 emit;",
    "  matProps(id, albedo, spec, rough, metal, emit);",

    "  vec3 key  = normalize(vec3(0.55, 0.95, 0.60));",
    "  vec3 fill = normalize(vec3(-0.70, 0.25, 0.35));",

    "  float dif  = max(dot(n, key), 0.0) * ao;",
    "  float dif2 = max(dot(n, fill), 0.0) * 0.30;",
    "  float amb  = (0.16 + 0.20 * (0.5 + 0.5 * n.y)) * ao;",

    "  vec3 f0 = mix(vec3(0.045), albedo, metal);",
    "  float fres = pow(1.0 - max(dot(n, v), 0.0), 5.0);",
    "  vec3 F = f0 + (vec3(1.0) - f0) * fres;",

    /* Reflection is the whole story on the polished parts. Roughness is
       faked by sliding the lookup from the mirror direction toward the
       normal — a blurred reflection without a mip chain to blur. */
    "  vec3 r = reflect(-v, n);",
    "  vec3 rr = normalize(mix(r, n, rough * rough * 2.2));",
    "  vec3 env = mix(envmap(rr), envmap(n), rough * 0.55);",

    "  float shin = mix(420.0, 9.0, rough);",
    "  vec3 hv  = normalize(key + v);",
    "  vec3 hv2 = normalize(fill + v);",
    "  vec3 sp = F * spec * ao * (pow(max(dot(n, hv), 0.0), shin) * 1.30 +",
    "                             pow(max(dot(n, hv2), 0.0), shin) * 0.40);",

    "  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.4) * 0.40;",
    "  vec3 diffuse = albedo * (1.0 - metal) * (dif * 1.00 + dif2 + amb);",
    "  return diffuse + sp + env * F * mix(0.70, 1.55, metal) * ao",
    "       + albedo * rim * 1.6 + emit * 0.85;",
    "}",

    "void main(){",
    "  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;",

    /* a pool of light behind it — a polished black object needs something
       to be black against, or the silhouette disappears into the panel */
    "  vec3 bg = mix(vec3(0.0520, 0.0560, 0.0480), vec3(0.0050, 0.0056, 0.0046),",
    "                clamp(length(uv - vec2(0.0, 0.04)) * 1.05, 0.0, 1.0));",

    /* dolly out and re-centre as the stack opens, so it always fits the frame */
    "  vec3  target = vec3(0.0, -0.26 * uExplode, 0.0);",
    "  float dist   = 4.25 + 2.55 * uExplode;",

    "  mat3 rot = rotY(uYaw) * rotX(uPitch);",
    "  vec3 ro = target + rot * vec3(0.0, 0.0, dist);",
    "  vec3 rd = rot * normalize(vec3(uv, -1.95));",

    "  float tNear, tFar;",
    "  bool inBounds = boundsHit(ro, rd, tNear, tFar);",

    "  float t = tNear;",
    "  float id = 0.0;",
    "  bool hit = false;",
    "  if (inBounds){",
    "    for (int i = 0; i < 58; i++){",
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
    "    float ao = occlusion(p, n);",
    "    col = shade(p, n, v, id, ao);",

    /* The resin liner is clear on the real ring — you read the board through
       it. One more march past it, with the liner itself excluded, is what
       puts the components back behind the glass instead of hiding them. */
    "    if (id > 5.5 && id < 6.5){",
    "      float t2 = t + 0.02;",
    "      float id2 = 0.0;",
    "      bool hit2 = false;",
    "      for (int j = 0; j < 30; j++){",
    "        vec3 q = ro + rd * t2;",
    "        vec2 h2 = mapX(q, true);",
    "        if (h2.x < 0.0016){ id2 = h2.y; hit2 = true; break; }",
    "        t2 += h2.x;",
    "        if (t2 > tFar) break;",
    "      }",
    "      vec3 behind = bg;",
    "      if (hit2){",
    "        vec3 p2 = ro + rd * t2;",
    "        vec3 n2 = calcNormal(p2);",
    "        behind = shade(p2, n2, v, id2, occlusion(p2, n2));",
    "      }",
    /*     Fresnel decides it: face-on the resin is nearly invisible, at a
           grazing angle it goes to a hard reflection like real glass. */
    "      float f = 0.06 + 0.94 * pow(1.0 - max(dot(n, v), 0.0), 4.0);",
    "      col = mix(behind * vec3(0.86, 0.88, 0.86), col, clamp(f + 0.16, 0.0, 1.0));",
    "    }",

    "    col = mix(col, bg, clamp((t - 2.9) / 5.2, 0.0, 0.52));",
    "  }",

    /* ACES-ish. The previous curve, x/(x+0.72)*1.38, is a 1.9x *gain* on
       everything near zero — it lifted the whole shell to a flat mid grey,
       which is most of why it read as rubber. This one leaves black black
       and only rolls off the top end. */
    "  col = (col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14);",
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

  var yaw = 1.25, pitch = -0.34, explode = 0, explodeTarget = 0;

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
