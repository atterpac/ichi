# Aurora v1

The desktop and avatar lab render locally using `src/lib/aurora/aurora.mjs`, copied
from the supplied reference. Pixel math and random draw order are unchanged.
The only additions are `VERSION = 1` and size validation (integer, 1–512).
The desktop embeds a lossless 128px PNG inside the existing SVG preview interface;
its bounded cache holds at most 128 portraits. No author name leaves the app.
Images are square and full-bleed; rounding belongs to the surrounding CSS.

From `frontend/`:

```
pnpm avatars:serve
# GET http://127.0.0.1:8787/avatars/v1/ada.lovelace.png?size=256
pnpm test:aurora
```

`PORT` overrides 8787. This is an optional standalone Node service, not a dependency
of the packaged Wails application. `auroraHandler` can also be mounted in an
existing Node server. `renderAuroraPNG(seed, size)` returns a Buffer using the
supplied dependency-free `png.mjs` encoder. `renderAurora(seed, size)` returns a
Uint8ClampedArray and works in both browsers and Node.

The renderer treats strings verbatim (UTF-16, case-sensitive, no Unicode
normalization), preserving the reference contract. The HTTP boundary normalizes
public seeds with `trim().toLowerCase()` before rendering. That normalization is
part of v1. For email identities use `publicEmailSeed(email)` **before** building a
URL: it hashes the trimmed, lowercased email with SHA-256. The server rejects raw
email seeds. Render from the resulting hex string, not from the original email.

HTTP accepts only sizes 32, 64, 128, 256, and 512 (default 256), rejecting other
values with 400. GET/HEAD responses use `image/png`, a one-year public immutable
cache policy, and a quoted ETag containing version, size, and the four zero-padded
cyrb128 words concatenated as hex. Conditional requests return 304. Algorithm or
normalization changes require a version bump in the module and URL route.

Tests cover all supplied goldens, fresh-process determinism, 1,000 randomized
identities, PNG roundtrips, size validation, HTTP handling, and the <50ms median
256px PNG target. Browser integration tests independently decode the embedded PNG
and check the golden pixel hash. Performance depends on the host machine.
