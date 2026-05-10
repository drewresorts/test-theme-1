# test-theme-1 — Coming-Soon Storefront with a Live Webcam Background

A minimal Shopify theme that renders a single full-bleed "coming soon" page, with a
**live webcam feed playing as the background**. Ships with a self-hosted streaming
stack (MediaMTX + Caddy) so you don't have to use a public video site.

> **Why a self-hosted stream and not "stream straight into Shopify"?**
> Shopify themes can render `<video>` tags but Shopify itself does not ingest live
> video. The two real options are:
>
> 1. **Direct browser-to-browser via WebRTC** — every visitor opens a peer
>    connection back to whatever machine is holding the camera. The camera
>    machine has to encode and upload **N copies** of the stream, one per
>    viewer. It collapses the moment more than a handful of visitors land on the
>    page.
> 2. **Self-host a tiny stream server in front of a CDN** — the camera encodes
>    **once**, the server fans out HLS segments (just static `.m3u8` + `.ts`
>    files) over plain HTTPS. A CDN can cache them for 1–10 seconds. Bandwidth
>    is shared between viewers, and a $4/month VPS or a Raspberry Pi behind a
>    Cloudflare Tunnel handles thousands of concurrent visitors.
>
> Option 2 is dramatically more efficient at any scale beyond "you and a few
> friends", and lets you keep the stream on your own domain (no public site
> like YouTube/Twitch/Instagram in the loop). That's the architecture this
> repo implements.

---

## Architecture at a glance

```
┌────────────┐  RTSP/RTMP/WebRTC ingest   ┌───────────────┐   LL-HLS over HTTPS   ┌────────────┐
│  Webcam +  │ ─────────────────────────▶ │   MediaMTX    │ ─────────────────────▶│  Visitors  │
│  ffmpeg    │   (one encoded stream)     │  + Caddy TLS  │   (cached by CDN)     │ Shopify    │
└────────────┘                            └───────────────┘                       └────────────┘
                                                  │
                                                  └─ optional: Cloudflare / Bunny CDN in front
```

* The Shopify theme just embeds a `<video>` tag pointed at
  `https://stream.your-domain.com/cam/index.m3u8`.
* `hls.js` is loaded on demand for browsers that don't natively support HLS
  (Chrome/Firefox); Safari plays the playlist directly.
* If the stream is unreachable, the section gracefully falls back to a poster
  image. With `prefers-reduced-motion`, the video is skipped entirely.

---

## Repo layout

```
.
├── assets/                         # (kept empty — all CSS/JS is co-located in sections)
├── blocks/
├── config/
│   ├── settings_schema.json        # Theme-level settings (colors, font, stream origin)
│   └── settings_data.json
├── layout/
│   ├── theme.liquid                # Main layout (storefront)
│   └── password.liquid             # Layout used while the store password page is on
├── locales/
│   ├── en.default.json             # User-facing strings
│   └── en.default.schema.json      # Theme-editor strings
├── sections/
│   └── coming-soon.liquid          # The hero section: live video + overlay + countdown + signup
├── snippets/
├── templates/
│   ├── index.json                  # Home page → coming-soon section
│   ├── page.coming-soon.json       # /pages/coming-soon → same section
│   └── password.json               # Pre-launch password page → same section
└── streaming/                      # Self-hosted stream server (NOT uploaded to Shopify)
    ├── docker-compose.yml          # MediaMTX + Caddy
    ├── mediamtx/mediamtx.yml       # Stream server config (RTSP/RTMP in, LL-HLS out)
    ├── Caddyfile                   # TLS, CORS, cache headers
    ├── publish-webcam.sh           # ffmpeg one-liner that pushes /dev/video0 → MediaMTX
    └── .env.example                # Sample credentials
```

The `streaming/` folder is **not** part of the theme; it lives in the same repo
for convenience but is deployed separately to a server you control.

---

## Setting up the storefront (Shopify side)

### 1. Push the theme

Requires [Shopify CLI](https://shopify.dev/docs/themes/tools/cli):

```bash
npm install -g @shopify/cli@latest
shopify theme push --unpublished --json
```

Then either publish it or use it as your store's password-page theme so it
shows while the store is in pre-launch mode.

### 2. Configure the section in the Theme Editor

Open `Online Store → Themes → Customize` and on the home page select
**Coming soon**. Settings:

| Setting | Notes |
| --- | --- |
| **Stream URL** | Full HLS playlist URL, e.g. `https://stream.your-domain.com/cam/index.m3u8`. Plain `.mp4`/`.webm` URLs also work for testing. |
| **Fallback image** | Shown before the stream loads, on slow networks, and in reduced-motion mode. |
| **Start with audio muted** | Required for autoplay in every modern browser. The visitor can unmute via the small button bottom-right. |
| **Heading / Subheading / Eyebrow / Footer note** | Marketing copy. |
| **Launch date** | ISO timestamp (e.g. `2026-06-01T12:00:00Z`). Drives the live countdown. Leave empty to hide it. |
| **Show email signup** | Renders a Shopify customer signup form so anyone leaving an email becomes a customer tagged `coming-soon`. |
| **Overlay color / opacity / Accent color** | Tunes contrast over the live feed for readability. |
| **Social link blocks** | Add as many as you like. |

In `Theme settings → Live stream`, set **Stream origin** to your stream
hostname (e.g. `https://stream.your-domain.com`) so the layout can emit a
`<link rel="preconnect">` for faster startup.

---

## Running the streaming server

You can host this on anything from a Raspberry Pi at home (behind a
Cloudflare Tunnel) to a $4/month VPS. Two containers, no database.

### 1. Provision

```bash
git clone <this repo>
cd streaming
cp .env.example .env
$EDITOR .env                     # set PUBLISH_PASS to a strong secret
$EDITOR Caddyfile                # change stream.example.com to your domain
$EDITOR mediamtx/mediamtx.yml    # adjust paths/credentials if needed
```

Point a DNS A/AAAA record (or a Cloudflare Tunnel) at the host, then:

```bash
docker compose up -d
```

Caddy will obtain a Let's Encrypt cert automatically. After it's healthy:

```
HLS playback URL : https://stream.your-domain.com/cam/index.m3u8
RTSP ingest URL  : rtsp://publisher:<PUBLISH_PASS>@<host>:8554/cam
RTMP ingest URL  : rtmp://<host>:1935/cam?user=publisher&pass=<PUBLISH_PASS>
WebRTC ingest    : http://<host>:8889/cam/whip   (use OBS WHIP / browser WebRTC)
```

### 2. Push the camera

The included `publish-webcam.sh` wraps `ffmpeg` to capture a local
USB/built-in camera and push it to MediaMTX over RTSP. Defaults are tuned
for a 720p / 30 fps webcam with low-latency H.264.

```bash
# Linux (uses /dev/video0 by default)
./publish-webcam.sh

# macOS — capture index 0 of avfoundation
INPUT_OPTS="-f avfoundation -framerate 30 -video_size 1280x720 -i 0:none" \
  ./publish-webcam.sh

# Relay an IP camera (no transcode, lowest CPU)
INPUT_OPTS="-rtsp_transport tcp -i rtsp://user:pass@192.168.1.20:554/stream" \
  VIDEO_CODEC=copy AUDIO_CODEC=copy ./publish-webcam.sh
```

Alternatively, push from **OBS Studio**:
* `Settings → Stream → Service: Custom`
* Server: `rtmp://stream.your-domain.com:1935/cam`
* Stream key: `?user=publisher&pass=<your password>`

### 3. (Highly recommended) Put a CDN in front

The HLS playlist segments are static files. Putting Cloudflare (free plan
is fine) or Bunny CDN in front turns one viewer's request into one origin
request and serves everyone else from edge cache. Cache rules:

| Path | Cache TTL |
| --- | --- |
| `/cam/index.m3u8` | `no-store` (always fresh) |
| `/cam/*.ts` | `public, max-age=10` (segments are immutable for their lifetime) |

The provided `Caddyfile` already sends those headers so the CDN can
respect them automatically.

---

## Testing locally without a stream

You can hand the section any MP4/WebM URL — for example a sample loop
hosted on Shopify Files — and it will play it as the background. This
makes it easy to validate the page before the stream server is online.

---

## Validation

This theme has been linted with [Shopify Theme Check](https://shopify.dev/docs/themes/tools/theme-check):

```bash
shopify theme check
```

Zero offenses on the most recent run.

---

## Cost & efficiency notes

For a typical webcam page:

| Component | Typical cost | Bandwidth model |
| --- | --- | --- |
| MediaMTX VPS | ~$4–6 / month (1 vCPU, 1 GB) | ~3 Mb/s outbound when no CDN |
| Cloudflare in front | Free tier covers most launches | Origin sees ~1 viewer regardless of audience |
| ffmpeg encoder | Runs on the camera host (Pi 4 handles 720p easily) | ~3 Mb/s upstream, constant |

Compared with browser-to-browser WebRTC, where the camera host's upload
bandwidth scales linearly with concurrent visitors, this architecture
flat-lines: you serve 10 visitors or 10,000 visitors with effectively the
same upstream usage from your camera.
