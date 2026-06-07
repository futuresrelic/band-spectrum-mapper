# Band Spectrum Mapper — User Guide

Welcome to **Band Spectrum Mapper**, a music intelligence platform for exploring bands, albums, and songs through interactive visualizations and analysis.

This guide is written for **regular (non-admin) users** — people who have been invited to browse the platform. If you are the platform administrator, see [ARCHITECTURE.md](ARCHITECTURE.md) for the full technical picture and [DEV_GUIDE.md](DEV_GUIDE.md) for the codebase.

---

## Getting Started

### Signing in

Band Spectrum Mapper uses Google Sign-In. Click **Sign in with Google** on the login page and choose your Google account. Your account will be created automatically on first login.

You don't need to do anything special after signing in — your preferences are saved automatically.

---

## What you can access

| Area | What it is | Access |
|------|-----------|--------|
| `/view` | Public library browser — bands, albums, songs | No login needed |
| `/cinema` | 3D cinematic visualizer | Logged in |
| `/my/rate` | Rate songs (1–5 stars) | Logged in |
| `/my/contribute` | Submit discography for admin review | Logged in |
| `/play` | Album Art Quiz game | Logged in |

Admin-only areas (Library management, AI analysis, batch tools, configuration) require an admin account.

---

## Cinema Mode

Cinema Mode is a real-time 3D visualization of the music library — every band, album, song, keyword, theme, and emotion appears as a glowing node in space, connected by relationships.

Open it at `/cinema`.

### What you'll see

- **Nodes** — dots and labels floating in 3D space. Colour indicates type: purple = artist, orange = album, indigo = song, teal = keyword, green = theme, pink = emotion, cyan = tag.
- **Links** — thin lines connecting related nodes.
- **Scenes** — the camera automatically flies through the space, changing angle and focus every 30–90 seconds.

### Navigating with your hands

| Gesture | Result |
|---------|--------|
| One finger drag / mouse drag | Rotate the view |
| Two finger pinch | Zoom in / out |
| Two finger drag | Pan the camera |
| Tap / click a node | Open the node info panel |
| Tap / click empty space | Deselect current node |

> **Phone tip:** Movements are intentionally calmer than a desktop. The camera stops immediately when you lift your fingers — it does not spin after you let go.

### Filtering by band

Use the **Bands** button in the top-right toolbar to filter the graph to specific artists. Select one or more bands, then close the picker. The graph rebuilds with only those artists' nodes.

### Modes

Three playback modes are available in the bottom toolbar:

**Scenes** — The default. The platform plays a sequence of named cinematic scenes (Supernova, Wormhole, Fractal Web, etc.), each with a different camera path and arrangement. Use ⏮ / ⏭ to jump between scenes, ▶ to start autoplay.

**✨ Playbacks** — Curated tours created by the admin. Select one and press ▶ Play to watch a pre-built camera journey through specific nodes. The camera visits each node in sequence, orbiting briefly before moving on.

**🛤 Rail** — The camera follows a continuous smooth path through the galaxy. Press ▶ to launch. The path loops automatically. Different rail types produce different shapes (Circuit, Warp Jumps, Spiral, Corkscrew, Pendulum, etc.).

### Node info

Tap or click any node to open the info panel. For a **song node**, you'll see:

- Song title, album, band
- Duration, release year
- Tags and AI-generated themes
- Axis scores (if scored)
- Lyrics (tap **Read Lyrics** for a full-screen readable view)

Tap the ✕ or click empty space to dismiss.

### Watermark

A subtle "Band Spectrum Mapper" watermark appears in the bottom-right corner. This is intentional — it credits the platform when you share a recording of the visualizer.

---

## Rating Songs

Visit `/my/rate` to rate songs from the library. Ratings are per-user and contribute to the platform's community score layer.

---

## Album Art Quiz

Visit `/play` to play the Album Art Quiz. You're shown album artwork and must guess the correct album from multiple choices. Your score goes to the leaderboard.

---

## Contributing Discography

If you spot a band or album that's missing from the library, use `/my/contribute` to submit it for admin review. Provide the band name, suggested albums, and any other notes. The admin will review and approve additions.

---

## FAQ

**Q: Can I add bands myself?**
A: You can submit suggestions via `/my/contribute`. The admin reviews and approves all additions to keep the library accurate.

**Q: Can I edit lyrics or scores?**
A: No — lyrics and scores are managed by the admin to maintain quality. If you notice an error, use `/my/contribute` to leave a note.

**Q: Why can't I open the ⚙ config panel in Cinema?**
A: The configuration panel, Director Mode, and other advanced Cinema tools are admin-only. Your account gives you the full browsing and playback experience, plus curated tours the admin has published for everyone.

**Q: The Cinema graph is empty. Why?**
A: The graph needs at least one band in the library with songs. If you just signed in for the first time and the library is empty, ask the platform administrator to add content.

**Q: My session expired. What do I do?**
A: Sign out and sign back in with Google. Your ratings and contributions are saved to your account.

---

## Getting Help

If something doesn't work as described, report it to the platform administrator. Include what you were doing and what you expected to happen.
