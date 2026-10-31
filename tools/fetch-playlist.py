#!/usr/bin/env python3
"""Regenerate assets/js/playlist.js from the Spotify playlist in main.js.

Why this exists: the crate on the opening screen shows what is on the playlist
*before* anything plays. Spotify's embed only announces the track it is playing
right now, and the page that lists a playlist's contents cannot be read from
the browser cross-origin — so the running order has to be fetched here and
committed.

    python3 tools/fetch-playlist.py                 # reads PLAYLIST from main.js
    python3 tools/fetch-playlist.py <playlist-url>  # or pass one

Needs Pillow for the colour extraction:  pip install pillow
"""
import colorsys
import io
import json
import os
import re
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAIN = os.path.join(ROOT, "assets", "js", "main.js")
OUT = os.path.join(ROOT, "assets", "js", "playlist.js")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"


def get(url, **kw):
    return urllib.request.urlopen(
        urllib.request.Request(url, headers={"User-Agent": UA}), timeout=30, **kw)


def playlist_id(raw):
    m = re.search(r"(?:playlist[:/])([A-Za-z0-9]+)", raw)
    if not m:
        sys.exit("could not find a playlist id in: " + raw)
    return m.group(1)


def track_list(pid):
    """The embed page carries the running order in its Next.js payload.

    The path to it moves around between Spotify's server variants — it has been
    seen at props.pageProps.state.data.entity and at props.pageProps.…entity —
    so walk the tree for the first trackList rather than hard-coding a path."""
    html = get("https://open.spotify.com/embed/playlist/" + pid).read().decode("utf-8", "replace")
    blob = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html, re.S)
    if not blob:
        sys.exit("Spotify changed the embed page shape; this script needs updating")

    found = []

    def walk(node):
        if found:
            return
        if isinstance(node, dict):
            tl = node.get("trackList")
            if isinstance(tl, list) and tl and isinstance(tl[0], dict) and "uri" in tl[0]:
                found.append(tl)
                return
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    walk(json.loads(blob.group(1)))
    return found[0] if found else None


def track_list_retrying(pid, tries=4):
    """Spotify intermittently serves an embed payload with the running order
    missing. It is there on the next request, so ask again rather than failing."""
    for attempt in range(tries):
        tl = track_list(pid)
        if tl:
            return tl
        print("  (empty payload, retrying)")
        time.sleep(1.5 * (attempt + 1))
    sys.exit("no trackList in the embed payload — is the playlist public?")


def palette(img):
    """Dominant colour, biased toward something with actual hue in it, plus a
    darkened pressed-vinyl version of the same."""
    q = img.resize((80, 80)).quantize(colors=8).convert("RGB")
    best, score = (40, 40, 40), -1
    for count, rgb in q.getcolors(6400):
        r, g, b = rgb
        _, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
        v = s * (1 - abs(l - 0.45) * 1.1) * (count ** 0.35)
        if v > score:
            best, score = rgb, v
    r, g, b = best
    h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    vr, vg, vb = [int(round(c * 255)) for c in colorsys.hls_to_rgb(h, min(l, 0.30), min(s, 0.75))]
    return "#%02x%02x%02x" % best, "#%02x%02x%02x" % (vr, vg, vb)


def main():
    if len(sys.argv) > 1:
        raw = sys.argv[1]
    else:
        src = open(MAIN, encoding="utf-8").read()
        m = re.search(r'var\s+PLAYLIST\s*=\s*"([^"]*)"', src)
        if not m or not m.group(1).strip():
            sys.exit("no PLAYLIST set in assets/js/main.js — pass a playlist URL instead")
        raw = m.group(1)

    from PIL import Image  # imported here so --help works without Pillow

    records = []
    for t in track_list_retrying(playlist_id(raw)):
        tid = t["uri"].rsplit(":", 1)[-1]
        meta = json.load(get(
            "https://open.spotify.com/oembed?url=https://open.spotify.com/track/" + tid))
        thumb = meta.get("thumbnail_url", "")
        if not thumb:
            print("  no cover for", t["title"])
            continue
        h = thumb.rsplit("/", 1)[-1]
        small = "https://i.scdn.co/image/" + h
        big = "https://i.scdn.co/image/" + h.replace("ab67616d00001e02", "ab67616d0000b273")
        tint, vinyl = palette(Image.open(io.BytesIO(get(big).read())).convert("RGB"))
        records.append(dict(id=tid, title=t["title"], artist=t["subtitle"],
                            art=small, artBig=big, tint=tint, vinyl=vinyl))
        print("  " + t["title"] + " — " + tint)

    if not records:
        sys.exit("nothing to write")

    body = [
        "/* The playlist, baked.\n",
        "   Spotify's embed will tell a browser what is playing, but it will not tell\n",
        "   it what is *on* a playlist before playback starts, and the page that will\n",
        "   is not readable cross-origin. So the crate is generated from the playlist\n",
        "   at build time and committed. Regenerate with tools/fetch-playlist.py after\n",
        "   changing the playlist; nothing breaks if it goes stale, the crate just\n",
        "   shows the older running order while the deck plays the current one.\n\n",
        "   tint  — the cover's dominant colour, used for the sleeve glow\n",
        "   vinyl — the same colour taken down to a pressed-vinyl darkness */\n",
        "window.PLAYLIST_RECORDS = [\n",
    ]
    for r in records:
        body.append(
            "  { id: %s, title: %s, artist: %s,\n    art: %s,\n    artBig: %s,\n"
            "    tint: %s, vinyl: %s },\n" % tuple(
                json.dumps(r[k]) for k in
                ("id", "title", "artist", "art", "artBig", "tint", "vinyl")))
    body.append("];\n")

    open(OUT, "w", encoding="utf-8").write("".join(body))
    print("wrote %s (%d records)" % (os.path.relpath(OUT, ROOT), len(records)))


if __name__ == "__main__":
    main()
