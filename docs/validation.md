# Validation and presentation checks

Validated locally on October 14, 2026, with Node.js 24.19.0 and isolated headless Chrome 155.0.8059.40 on the development Mac. This records a development check, not certification across browsers or a projector-connected presentation.

## Automated checks

`npm test`: 32 passing unit tests covering independent Bessel values, float32 arithmetic, the radial wave equation, plane-wave wavelength/period/direction, amplitude doubling, phase cancellation, standing-wave nodes, beats, circular reference normalization/symmetry, source masks, exact frequency grouping, symmetric averaging, circular power conservation, standing-wave energy, scene bounds and portable links.

The Bessel fixture contains 217 double-precision values generated with macOS `libSystem` functions `j0` and `y0`, independent of the TypeScript Cephes implementation. Arguments span 0.005–400, covering the original prototype circular-wave argument range, both sides of the approximation boundary, and Bessel zeros. Double-precision discrepancies are checked below `2×10⁻¹⁴` absolute; float32 expression errors below `2×10⁻⁵` relative to Hankel magnitude. The reference fixture records its provenance in JSON.

Browser checks run separately for forced WebGL 2 and WebGPU: eighteen passing tests in total. They exercise rendering and all three quantities; source editing, duplication, enabling and deletion; both camera positions, targets and zoom; paused-frame restoration in a fresh browser context; unchanged history length on edits; playing URL time semantics; file export/import; malformed links/files; keyboard presentation controls; larger fractional amplitude/frequency input and its URL restoration; automatic amplitude-derived color scales; independent sidebar scrolling; fullscreen removal; and a 390-pixel mobile layout. Page exceptions and console errors fail the suite.

`npm run build` type-checks all application/test code and produces the static artifact.

The GitHub Pages production artifact was also served locally under `/wawes/`: bundled styles/scripts loaded and its WebGPU readback check passed. The artifact contains public dependency notices and excludes `private/`. Remote Pages publication is a separate step.

## GPU accuracy

The same TSL function is compiled for WGSL and GLSL. Twelve deliberately asymmetric scenes cover all teaching presets, extreme speed/frequency values, long captured time, disabled/zero/empty fields, eight sources, source masks, and amplitudes up to 75 mm with frequencies up to 12.3456 Hz. Each backend renders an RGBA32F target of 37×31 pixels and reads displacement, infinite-time mean square, finite-window mean square, and an undefined mask **before color/height conversion**. CPU measurements use the matching physical pixel coordinates.

For `S = max(10⁻⁶ m, sum of enabled source amplitudes)`, define `Q=S` for displacement and `Q=S²` for mean squares. The acceptance condition is

```text
|GPU − CPU| / Q ≤ 5×10⁻⁴ + 5×10⁻⁴ |CPU| / Q.
```

This uses an absolute floor near zeros and a relative term elsewhere. Undefined masks must agree exactly. Non-finite outputs fail. The relative-error report excludes values below `0.01Q`, where relative errors are misleading.

| Backend | Defined sample points | Maximum normalized absolute error | Maximum reported relative error | Mask mismatches |
| --- | ---: | ---: | ---: | ---: |
| WebGPU | 13761 | 4.1×10⁻⁵ | 1.9×10⁻³ | 0 |
| Forced WebGL 2 | 13761 | 5.5×10⁻⁵ | 1.6×10⁻³ | 0 |

Both pass with substantial margin. These values concern the tested analytic fields and hardware, not arbitrary out-of-range parameters. The source formula is additionally checked against the radial equation and conservation of circular radiated power. In normal rendering, 3D height is sampled on a mesh; that geometric interpolation is a separate spatial approximation.

The readback path accounts for WebGPU’s 256-byte row alignment and its vertical image orientation; the WebGL buffer is tightly packed. The runtime verification button repeats these checks on the actual presentation browser/backend.

## Performance

The default two-source scene reached **60 FPS in both 2D and 3D on both backends**, with a 1440×1000 viewport, pixel ratio 1, medium detail, the cross-section visible, and four-second warm measurements in the isolated browser. The default 3D surface uses 256×256 segments. 2D evaluates the field per fragment on two triangles and avoids surface tessellation work.

The UI reports observed FPS and offers 128/256/512 detail, with reduced pixel ratio in low detail. Detail is never changed silently. A notice flags 3D grids or 2D pixel resolution below 12 samples per shortest wavelength; near-source geometry may need additional resolution. Mean-square modes still evaluate the analytic fragment field and preserve the undefined source mask.

An additional WebGL 2 stress check with eight circular sources at 1–1.7 Hz, finite-window averaging, and a 3D surface also reached 60 FPS at both high and low detail in four-second warm measurements at pixel ratio 1. This brief check does not establish a sustained thermal or projector performance guarantee.

Before presenting, run the runtime GPU check with the projector connected, measure FPS in the scenes you will show, and choose a detail level that holds 60 FPS or a stable 30 FPS without undersampling your wavelengths. Projector resolution, device pixel ratio, browser, GPU, source count, averaging mode and surface detail can change the result. Prepare and verify `npm run preview` while offline before the session. Projection hardware and the deployed Pages build have not been tested locally.


## Longitudinal checks

Independent system J₁/Y₁ fixtures cover the same 217 arguments as H₀, including the branch boundary. Tests verify plane-wave vector direction and phase, circular radial amplitude at 1 m, the source mask, zero curl and the vector Helmholtz equation, crossing-wave dot products, finite-window numerical quadrature, zero-speed behavior, legacy scene compatibility, and polarization URL round trips. A renderer test compares cached instanced particle coordinates with independently sampled physical displacement at several times and after source changes.

Each browser backend also exercises the longitudinal selector, circular particles, plane-wave direction edits and x-projection, both camera modes, a time-averaged color mode, stepping, state restoration in another browser context, and switching back to the membrane. This mode computes cached vector phasors on the CPU and uses GPU instancing for drawing; the existing float-texture GPU diagnostic remains specific to the transverse field.
