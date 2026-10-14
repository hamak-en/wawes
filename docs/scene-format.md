# Portable scene format

`#scene=<base64url>` contains UTF-8 JSON encoded with URL-safe base64, without padding or compression. This avoids decompression bombs and allows final interaction/copy updates to flush synchronously. The bounded eight-wave scene fits well under the limit; encoding does not depend on local storage or a server.

Version **1** contains:

| Property | Meaning |
| --- | --- |
| `version` | Exactly `1`; unknown versions fail validation |
| `waves` | Up to eight complete wave objects, including disabled sources |
| `speed` | Shared speed `c` in m/s |
| `polarization` | `transverse` or `longitudinal`; omitted in older version-1 scenes defaults to `transverse` |
| `mode` | `2d` or `3d` |
| `camera`, `camera2d` | Position, target and zoom for each view |
| `display` | Quantity, derived color scale, height scale, detail, grid, section, section position, panels, contributions and averaging window |
| `playback` | Paused flag, captured time in seconds, playback rate and step |

Each wave has `id`, `type`, `enabled`, `amplitude`, `frequency`, `phase`, `direction`, `x`, and `y`. Amplitude/positions use meters, frequency Hz, angles radians. IDs are unique ASCII letters/digits/underscores/hyphens with a maximum length of 48. Unused direction or position parameters survive type changes. Exact frequency numbers define interference groups.

Camera position coordinates are bounded to ±250 m, target to ±100 m, distance to 0.1–150 m, and zoom to 0.25–8. The 2D camera remains above its target on the z axis. Display and physical bounds are in [model.md](model.md); they are enforced on URL and file import.

`playback.time` is serialized as **0 for a playing scene**. Opening it starts observation at zero. A **paused scene preserves its time**. Phases retain their origin at zero in both cases. JSON imports follow the same opening rule; exports include the current observed time, with the paused flag determining how it restores.

The fragment limit is **12000 characters**; decoded JSON is limited to **9000 UTF-8 bytes**, including imported files. Encoding is uncompressed, so a complete link may be several kilobytes and some link-sharing services may impose smaller limits. JSON file export is the alternative. There is no truncation.

The parser rejects missing/unknown versions, malformed encodings, excessive wave count, duplicate/malformed IDs, non-finite or out-of-bounds numbers, invalid enum/boolean values, invalid cameras, and oversized input. Only recognized properties are reconstructed. Invalid startup links open the default example with a notice; invalid runtime hash changes or JSON files preserve the current scene.

Parameter and camera changes use `history.replaceState`. Repeated inputs coalesce into one update per 150 ms; change/pointer-end, page hide and copy-link flush pending state immediately. Animation frames do not update the URL. Hash navigation can restore an externally edited link; normal edits do not add browser history entries.

The color scale is derived from enabled source amplitudes as `max(A) + 0.004 m`. The stored `display.colorScale` field is retained for version-1 compatibility and recalculated on import, including older links that used a manually fixed scale.

To evolve the schema, add a version-specific migration before validation and keep the playing/paused time rule explicit. Version 1 intentionally rejects future schemas rather than guessing their meaning.
