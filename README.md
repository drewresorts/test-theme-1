# test-theme-1 — A 3D Boutique on the Storefront Home Page

A Shopify theme whose home page is a **fully 3D boutique** the visitor walks
through with WASD + mouse (or a virtual joystick on touch), powered by
[Three.js](https://threejs.org). Each product becomes a real object on a
pedestal — using the **3D model uploaded to that product's Media gallery in the
Shopify admin** when one is present, and falling back to a framed image card
otherwise.

The boutique pulls every piece of catalog data — title, description, options
and variants, prices, compare-at prices, inventory state — straight from
Shopify's storefront via Liquid, so the in-room experience stays in lockstep
with the back office.

> **TL;DR — what does this theme actually do?**
>
> * Renders a circular gallery room with `N` pedestals, one per product.
> * Loads each product's first GLB / glTF media file (the file you upload via
>   *Admin → Products → Media → Add 3D model*) onto its pedestal at the right
>   scale.
> * Uses raycasting + a center crosshair so the visitor can walk up to a
>   product, click to open a full product detail panel, choose options, see
>   stock levels, and add to cart.
> * Hits `/cart/add.js`, `/cart.js`, `/cart/change.js` from inside the
>   boutique. There's a slide-out cart drawer with a checkout link — the
>   shopper never leaves the home page until they hit *Checkout*.
> * Gracefully degrades to a 2D product grid when the device can't run WebGL,
>   when JavaScript is disabled, or when the visitor hits the *Browse 2D*
>   skip button on the intro screen.

---

## How the back-end Shopify data flows into the 3D world

Everything below happens server-side at render time, so there are no admin
API tokens or Storefront API keys involved. It's all stock Liquid + the
public Cart Ajax API.

```
┌──────────────────────────┐    Liquid render      ┌────────────────────────────┐
│  Shopify back office     │ ───────────────────▶  │  /sections/three-boutique  │
│   • collection of        │                       │   * <script type=          │
│     products             │                       │     "application/json">    │
│   * variants, prices,    │                       │     [{...products...}]     │
│     options              │                       │                            │
│   * inventory_quantity   │                       │   * Liquid-side fallback   │
│   * media (3D models +   │                       │     <ul> for noscript /    │
│     images)              │                       │     reduced-motion         │
└──────────────────────────┘                       └────────────┬───────────────┘
                                                                │
                                                                ▼
                                                    ┌────────────────────────────┐
                                                    │  <script type="module">    │
                                                    │   * Three.js scene +       │
                                                    │     PointerLockControls    │
                                                    │   * GLTFLoader on each     │
                                                    │     product.media.model    │
                                                    │   * Raycast → open product │
                                                    │   * Variant picker reads   │
                                                    │     product.variants[]     │
                                                    │   * Add-to-cart →          │
                                                    │     POST /cart/add.js      │
                                                    │   * Cart drawer →          │
                                                    │     GET  /cart.js          │
                                                    │     POST /cart/change.js   │
                                                    └────────────────────────────┘
```

For each product we serialize the following into the JSON payload that the
WebGL runtime consumes:

| Liquid source | Used in 3D for |
| --- | --- |
| `product.handle`, `product.title`, `product.vendor`, `product.url` | Floating label, dialog header, "View full details" link |
| `product.description` (stripped + truncated) | Dialog body |
| `product.options_with_values` | Variant picker (button per value, disables incompatible combos) |
| `product.variants[]` (id, title, options, price, compare_at_price, available, inventory_management, inventory_quantity, inventory_policy, sku, featured_image) | Variant selection logic, price + stock display, cart add |
| `product.images[]` | Dialog gallery + 3D image-card fallback when no model exists |
| `product.media[]` where `media_type == 'model'` (`sources[].url`, `format`, `mime_type`) | Loaded via `GLTFLoader` + `DRACOLoader` + `KTX2Loader` + `MeshoptDecoder` and placed on the pedestal |
| `product.media[*].preview_image` | First-frame texture if a model fails to fetch |
| `routes.cart_add_url`, `routes.cart_url`, `routes.cart_change_url` | Cart endpoints (locale-correct, market-correct) |
| `shop.currency` | `Intl.NumberFormat` formatting in the cart drawer |

There is no proxy server and no API key. Every URL above is part of the
Shopify storefront's public surface.

---

## Where the 3D model comes from

In the Shopify admin, edit any product and click
*Media → Add media → Upload 3D model (or drag-and-drop a `.glb` / `.gltf`
file)*. Shopify converts and serves the file from its CDN. In Liquid this
shows up as:

```liquid
{% for media in product.media %}
  {% if media.media_type == 'model' %}
    {% for source in media.sources %}
      {{ source.url }}      {# usable directly by GLTFLoader #}
      {{ source.format }}   {# "glb" or "usdz" #}
      {{ source.mime_type }}
    {% endfor %}
  {% endif %}
{% endfor %}
```

The boutique picks the first `glb` source per product. `usdz` (iOS
QuickLook) files are ignored for the in-page WebGL view because Three.js
doesn't render them.

If a product has zero 3D models, the renderer falls back to an
upright **framed image card** using `product.featured_image`, which keeps
the room visually full even when only a fraction of the catalog has 3D
assets.

---

## Repo layout

```
.
├── config/
│   ├── settings_schema.json          # Theme-level settings (colors, font, stream origin)
│   └── settings_data.json
├── layout/
│   ├── theme.liquid                  # Storefront layout
│   └── password.liquid               # Password-page layout
├── locales/
│   ├── en.default.json               # User-facing strings (boutique + coming-soon)
│   └── en.default.schema.json        # Theme-editor strings
├── sections/
│   ├── three-boutique.liquid         # The 3D boutique: Liquid + CSS + Three.js + schema
│   └── coming-soon.liquid            # Pre-launch hero (used by /password and /pages/coming-soon)
├── templates/
│   ├── index.json                    # Home page → three-boutique
│   ├── page.coming-soon.json         # /pages/coming-soon → coming-soon section
│   └── password.json                 # Password page → coming-soon section
└── streaming/                        # Self-hosted live-stream stack for the coming-soon page
    ├── docker-compose.yml
    ├── mediamtx/mediamtx.yml
    ├── Caddyfile
    ├── publish-webcam.sh
    └── .env.example
```

The `streaming/` folder is **not** part of the theme; it's deployed
separately and powers the live webcam background of the coming-soon /
password page only.

---

## Setting up the boutique on a real store

Requires [Shopify CLI](https://shopify.dev/docs/themes/tools/cli):

```bash
npm install -g @shopify/cli@latest
shopify theme push --unpublished --json
```

Then either publish the theme directly or point your store's "Online store"
to it.

### 1. Pick (or create) the source collection

Open *Admin → Online Store → Themes → Customize* and on the **Home page**
select **3D boutique**. The most important setting is:

* **Featured collection** — every product in this collection will appear on a
  pedestal in the room. Leave it blank to use *all* products. Use the
  *Maximum products* slider (1–24) to keep frame rates healthy on low-end
  devices.

### 2. Upload 3D models per product

For each product you want to render in 3D:

1. *Admin → Products → \[product\] → Media*
2. *Add media → Upload 3D model*
3. Drop in a `.glb` (preferred) or `.gltf` file. ~1–5 MB usually works
   well. Shopify will store it in their CDN and serve a CORS-enabled URL
   that the boutique can load directly.

Tips for keeping the boutique fast:

* Bake textures into the model rather than relying on procedural materials.
* Compress with `gltf-pipeline` (Draco) or `gltfpack` (Meshopt) — both are
  decoded automatically by the boutique.
* Aim for ≤ 30 k triangles per model. The boutique auto-fits the bounding
  box to a ~0.9 m cube, so very high-poly assets just waste GPU.

### 3. Style the room

Same panel, *Environment* group:

| Setting | What it does |
| --- | --- |
| Floor / Wall / Ceiling color | Solid base palette |
| Accent color | Pedestal halos, label backgrounds, CTA buttons |
| Floor / Wall texture | Optional images, tiled across the surface |
| Skybox / environment map | An equirectangular image used both as the visible background *and* for image-based lighting (shows up as reflections on metallic models) |

*Layout* group: control the room radius (6–14 m) and pedestal height
(40–160 cm).

*Performance* group: toggle real-time shadows (off by default) and pick a
quality preset.

### 4. (Optional) Keep the coming-soon page for pre-launch

The repo still ships the coming-soon section for the **password page** and
the `/pages/coming-soon` route, exactly as before. While the store is in
pre-launch mode, visitors who hit the password page get the live webcam
hero; once the store is live, the home page renders the 3D boutique.

---

## Running the boutique locally with `shopify theme dev`

```bash
shopify theme dev --store your-shop.myshopify.com
```

The Theme Editor auto-reloads on file change. The Three.js bundle is
loaded from a CDN via an `importmap`, so there is **no `npm install`
step** for the storefront itself.

## Browser support and graceful degradation

| Layer | Behaviour |
| --- | --- |
| WebGL2 + ES modules + `importmap` (all evergreen browsers since 2023) | Full 3D experience |
| WebGL2 + ES modules without native `importmap` | `es-module-shims` polyfill (loaded async) backfills it |
| No WebGL | `[data-boutique-fallback]` 2D product grid is shown |
| `prefers-reduced-motion: reduce` | Visitor can click *Browse 2D* on the intro screen, or just enter the boutique — only camera bob/spin animations are skipped, navigation still works |
| JavaScript disabled | `<noscript>` block renders a server-side product grid with links to product pages |

Everything in the 3D layer is read-only of public storefront data. There is
no admin token in the page, no metafield required, and no edge function.

---

## Architecture of `sections/three-boutique.liquid`

The section is intentionally self-contained. Roughly, top to bottom:

1. **Liquid header** — resolves the source collection and palette.
2. **Server-side product JSON** — captured into `products_json` and emitted
   into a `<script type="application/json" data-boutique-products>` block.
   The capture is wrapped through `replace: '</', '<\/'` to be safe inside
   a `<script>` element.
3. **Liquid-rendered DOM skeleton** — the intro overlay, loading bar, HUD,
   product dialog, cart drawer, toast, and the 2D fallback grid are all
   server-rendered so the page is functional before any JS executes.
4. **`{% stylesheet %}`** — all CSS for the boutique. Bundled by Shopify.
5. **`<script type="importmap">`** — maps `three` and `three/addons/` to
   `cdn.jsdelivr.net/npm/three@<version>/...`.
6. **`<script type="module">`** — the runtime. Imports Three.js + a
   handful of addons:
   * `GLTFLoader` (with `DRACOLoader`, `KTX2Loader`, `MeshoptDecoder` so
     Shopify-pipeline GLBs decode)
   * `PointerLockControls` for first-person look
   * `RoomEnvironment` for cheap PMREM-based image-based lighting
7. **`{% schema %}`** — the merchant-facing settings.

The runtime keeps a single `requestAnimationFrame` loop that:

* Drives WASD/touch movement, clamped to the cylindrical room bounds.
* Spins each product display about its vertical axis at ~25 deg/s for
  inspection-from-any-angle.
* Raycasts the camera-center (or the unlocked mouse position) against the
  pedestals and pick-helper boxes to drive the focus ring + the *Press E*
  hint.
* Renders the scene.

---

## Pre-launch / coming-soon page (kept from previous theme version)

The repo also ships a self-hosted live-stream stack for the
**coming-soon hero** that runs while the store is in pre-launch mode.
Architecture and setup are unchanged from the previous version:

```
┌────────────┐  RTSP/RTMP/WebRTC ingest   ┌───────────────┐   LL-HLS over HTTPS   ┌────────────┐
│  Webcam +  │ ─────────────────────────▶ │   MediaMTX    │ ─────────────────────▶│  Visitors  │
│  ffmpeg    │   (one encoded stream)     │  + Caddy TLS  │   (cached by CDN)     │ Shopify    │
└────────────┘                            └───────────────┘                       └────────────┘
                                                  │
                                                  └─ optional: Cloudflare / Bunny CDN in front
```

### 1. Provision the streaming server

```bash
git clone <this repo>
cd streaming
cp .env.example .env
$EDITOR .env                     # set PUBLISH_PASS to a strong secret
$EDITOR Caddyfile                # change stream.example.com to your domain
$EDITOR mediamtx/mediamtx.yml    # adjust paths/credentials if needed

docker compose up -d
```

Caddy will obtain a Let's Encrypt cert automatically. After it's healthy:

```
HLS playback URL : https://stream.your-domain.com/cam/index.m3u8
RTSP ingest URL  : rtsp://publisher:<PUBLISH_PASS>@<host>:8554/cam
RTMP ingest URL  : rtmp://<host>:1935/cam?user=publisher&pass=<PUBLISH_PASS>
WebRTC ingest    : http://<host>:8889/cam/whip
```

### 2. Push the camera

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

### 3. Configure the Coming-soon section

In the Theme Editor, on `/password` (or `/pages/coming-soon`), set:

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

In *Theme settings → Live stream*, set **Stream origin** to your stream
hostname so the layout can emit a `<link rel="preconnect">` for faster
startup.

---

## Validation

This theme has been linted with
[Shopify Theme Check](https://shopify.dev/docs/themes/tools/theme-check):

```bash
shopify theme check
```

JSON files under `templates/`, `locales/`, and `config/` are also
schema-valid (run any `node -e "JSON.parse(require('fs').readFileSync('<file>','utf8'))"`
or your favorite editor's lint).

---

## Cost & efficiency notes

* The boutique itself is just static HTML + a `~250 KB` Three.js bundle from
  `cdn.jsdelivr.net`. No origin compute beyond the regular Shopify
  storefront render.
* GLB files are served from the Shopify CDN, which already caches at the
  edge. Putting a CDN (Cloudflare / Bunny) in front of your storefront is
  optional but doesn't hurt.
* The streaming stack remains the minimum-cost option for the pre-launch
  page (≈ \$4–6/month for a 1 vCPU VPS with Cloudflare in front).
