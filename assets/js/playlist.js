/* The playlist, baked.
   Spotify's embed will tell a browser what is playing, but it will not tell
   it what is *on* a playlist before playback starts, and the page that will
   is not readable cross-origin. So the crate is generated from the playlist
   at build time and committed. Regenerate with tools/fetch-playlist.py after
   changing the playlist; nothing breaks if it goes stale, the crate just
   shows the older running order while the deck plays the current one.

   tint  — the cover's dominant colour, used for the sleeve glow
   vinyl — the same colour taken down to a pressed-vinyl darkness */
window.PLAYLIST_RECORDS = [
  { id: "6K4t31amVTZDgR3sKmwUJJ", title: "The Less I Know The Better", artist: "Tame Impala",
    art: "https://i.scdn.co/image/ab67616d00001e029e1cfc756886ac782e363d79",
    artBig: "https://i.scdn.co/image/ab67616d0000b2739e1cfc756886ac782e363d79",
    tint: "#231c2d", vinyl: "#231c2d" },
  { id: "4c6vZqYHFur11FbWATIJ9P", title: "There She Goes", artist: "The La's",
    art: "https://i.scdn.co/image/ab67616d00001e020e42d457a15ef2f133976f6b",
    artBig: "https://i.scdn.co/image/ab67616d0000b2730e42d457a15ef2f133976f6b",
    tint: "#542a1e", vinyl: "#542a1e" },
  { id: "5x3yh46amE0qXYT9k929Vq", title: "Dramatic Girl (feat. Che Ecru)", artist: "Baby Keem,\u00a0Che Ecru",
    art: "https://i.scdn.co/image/ab67616d00001e02436ad97bf66dee3b9aded2f2",
    artBig: "https://i.scdn.co/image/ab67616d0000b273436ad97bf66dee3b9aded2f2",
    tint: "#f4eacf", vinyl: "#7c631d" },
  { id: "1XrSjpNe49IiygZfzb74pk", title: "What Once Was", artist: "Her's",
    art: "https://i.scdn.co/image/ab67616d00001e02fc1bc1cf80c431c2bdbde601",
    artBig: "https://i.scdn.co/image/ab67616d0000b273fc1bc1cf80c431c2bdbde601",
    tint: "#992264", vinyl: "#7d1c52" },
  { id: "56sk7jBpZV0CD31G9hEU3b", title: "Animal I Have Become", artist: "Three Days Grace",
    art: "https://i.scdn.co/image/ab67616d00001e02e773763694ac5eb7f2aa0a37",
    artBig: "https://i.scdn.co/image/ab67616d0000b273e773763694ac5eb7f2aa0a37",
    tint: "#090d0e", vinyl: "#090d0e" },
  { id: "0ntQJM78wzOLVeCUAW7Y45", title: "Sex on Fire", artist: "Kings of Leon",
    art: "https://i.scdn.co/image/ab67616d00001e022519d01c0cca06f134eeadd8",
    artBig: "https://i.scdn.co/image/ab67616d0000b2732519d01c0cca06f134eeadd8",
    tint: "#731c1e", vinyl: "#731c1e" },
  { id: "3SoarlzPEiF7NgSeGsh44S", title: "the feeling", artist: "Steve Lacy",
    art: "https://i.scdn.co/image/ab67616d00001e02c2051e257fca29adecca19ee",
    artBig: "https://i.scdn.co/image/ab67616d0000b273c2051e257fca29adecca19ee",
    tint: "#040a2d", vinyl: "#060c2b" },
  { id: "3YuaBvuZqcwN3CEAyyoaei", title: "Like a Stone", artist: "Audioslave",
    art: "https://i.scdn.co/image/ab67616d00001e02a7292b6863258e889b78d787",
    artBig: "https://i.scdn.co/image/ab67616d0000b273a7292b6863258e889b78d787",
    tint: "#a4bad5", vinyl: "#304a69" },
  { id: "3n69hLUdIsSa1WlRmjMZlW", title: "Breezeblocks", artist: "alt-J",
    art: "https://i.scdn.co/image/ab67616d00001e02609c89ad17eb28c2013c56c6",
    artBig: "https://i.scdn.co/image/ab67616d0000b273609c89ad17eb28c2013c56c6",
    tint: "#435a61", vinyl: "#3f545a" },
  { id: "3qhlB30KknSejmIvZZLjOD", title: "End of Beginning", artist: "Djo",
    art: "https://i.scdn.co/image/ab67616d00001e02987466cc3363ea26094ca3c4",
    artBig: "https://i.scdn.co/image/ab67616d0000b273987466cc3363ea26094ca3c4",
    tint: "#130c0a", vinyl: "#130c0a" },
];
