# Membrane model, version 1

The field `u(x,y,t)` is the transverse displacement of an infinite homogeneous membrane, observed in `x,y ∈ [−5,5] m`. All calculations use SI units. The observation boundary does not reflect waves. Density is fixed at `ρ = 1 kg/m²`; changing wave speed changes tension `T = ρc²`.

Away from point sources:

```math
ρ ∂²u/∂t² = T(∂²u/∂x² + ∂²u/∂y²),    c = √(T/ρ).
ωᵢ = 2πfᵢ,    kᵢ = ωᵢ/c,    λᵢ = c/fᵢ.
```

This is a linear, lossless, nondispersive model. A physical membrane interpretation requires `|∇u| ≪ 1`; the allowed controls also permit exploration of the formal linear equations outside that small-slope regime. Visual height exaggeration does not affect physical slopes.

## Plane waves

With `nᵢ = (cos θᵢ, sin θᵢ)`:

```math
uᵢ(r,t) = Aᵢ cos(kᵢ nᵢ·r − ωᵢt + φᵢ).
Uᵢ(r) = Aᵢ exp[i(kᵢ nᵢ·r + φᵢ)].
```

Direction is measured from the positive x axis toward positive y. Phase is specified at the origin at `t=0`. A plane wave has no localized source position.

## Outgoing circular waves

For source `sᵢ = (xᵢ,yᵢ)`, radius `rᵢ = |r−sᵢ|`, and reference radius `r_ref = 1 m`:

```math
Uᵢ(r) = Aᵢ exp(iφᵢ) H₀⁽¹⁾(kᵢrᵢ) / H₀⁽¹⁾(kᵢr_ref),
H₀⁽¹⁾(x) = J₀(x) + iY₀(x),
uᵢ(r,t) = Re[Uᵢ(r) exp(−iωᵢt)].
```

Thus the reference circle has contribution `Aᵢ cos(φᵢ−ωᵢt)`. Amplitude is not defined at the singular source center. The full Hankel expression is used, with shared Cephes rational approximations for both CPU and TSL. The familiar `A√(1 m/r) cos(k(r−1 m)−ωt+φ)` is only a far-field approximation and is not substituted into the implementation.

The union of disks `rᵢ < 0.05 m` for enabled circular sources with nonzero amplitude is undefined. The GPU discards those fragments; CPU measurements return `null`. Source rings indicate the excluded regions. Arithmetic may clamp the radius to avoid evaluating the singularity, but the clamped values inside a disk are never presented as physical measurements. The disks create no walls or reflections.

## Superposition and averaging

Enabled contributions sum linearly; disabled waves preserve their settings. An empty scene has zero displacement.

For each exact canonical frequency value, form `U_f = Σ Uᵢ`. Nearby frequencies remain separate groups.

```math
u(r,t) = Σ Re[Uᵢ(r) exp(−iωᵢt)],
M(r) = ⟨u²⟩ = ½ Σ_f |U_f(r)|².
```

`M` is the infinite-time mean-square displacement in m². Same-frequency interference remains; different-frequency cross terms vanish. The stationary map cannot show beats.

Finite-window mode instead evaluates the exact analytic symmetric average:

```math
M_τ(r,t) = (1/τ) ∫_[t−τ/2,t+τ/2] u²(r,s) ds.
```

For complex amplitudes rotated to current time, `Vᵢ = Uᵢ exp(−iωᵢt)`, each diagonal contribution is

```math
½|Vᵢ|² + ½Re(Vᵢ²) sinc(ωᵢτ).
```

Each unordered pair adds

```math
Re(Vᵢ Vⱼ*) sinc((ωᵢ−ωⱼ)τ/2) + Re(Vᵢ Vⱼ) sinc((ωᵢ+ωⱼ)τ/2),
sinc(x) = sin(x)/x,    sinc(0) = 1.
```

This average is independent of the page’s frame history.

## Display and time

2D maps signed displacement to a symmetric color scale ±u_scale, where u_scale is the largest enabled source amplitude plus 0.004 m. The same scale is used by the instantaneous cross-section. It updates on source edits, enabling/disabling, addition or deletion; it does not vary during animation. Zero has a visible contour; values exceeding the scale saturate without altering the field. The 3D surface has height `g u`. For an averaging mode, color shows mean square with upper limit `u_scale²`, and height shows `g√M` or `g√M_τ` (RMS displacement). Its legend is marked in mm²; `1 mm² = 10⁻⁶ m²`. The square-root color mapping puts one-quarter of the mean-square scale at the legend midpoint.

Playback advances physical time by `dt/dt_real = rate`; pausing holds time, and a step adds the specified `Δt`. Each wave’s temporal phase is reduced in double precision before GPU evaluation to keep late paused frames accurate. Phases always refer to `t=0`. Editing parameters selects a different steady-state field at the current time. No transient response, source motion, or Doppler effect is simulated.

## Energy is a separate quantity

Mean-square displacement is not labeled intensity. The CPU reference provides energy/flux helpers for validation:

```math
e = (ρ/2)(∂ₜu)² + (T/2)|∇u|²                  [J/m²],
S = −T(∂ₜu)∇u                                  [W/m],
⟨S⟩_f = (Tω_f/2) Im(U_f* ∇U_f).
```

For an outgoing circular source, `2πr⟨S_r⟩` is constant. Standing waves have zero mean flux while storing energy. Energy visualization is outside version 1.

## Operating bounds

| Parameter | Range / definition |
| --- | --- |
| Wave count | 0–8 |
| Amplitude | Nonnegative finite values; circular amplitude is defined at 1 m. Numeric entry is not limited to the initial 5 mm slider range. |
| Frequency | Finite values ≥0.1 Hz. Numeric entry is not limited to the initial 2 Hz slider range. |
| Shared speed | 0.5–3 m/s |
| Source coordinates | −5–5 m |
| Phase / direction | 0–2π radians, UI in degrees |
| Excluded radius | 0.05 m |
| Displacement color limit | Largest enabled source amplitude + 0.004 m |
| 3D height multiplier | 1–500 |
| Playback rate | 0–2 |
| Frame step | 0.001–1 s |
| Captured time | 0–86400 s |
| Averaging window | 0.01–20 s |
| 3D grid segments per axis | 128 / 256 / 512 |

At the former prototype bounds (f=2 Hz, c=0.5 m/s), the wavelength is 0.25 m and the 512 grid provides 12.8 points per wavelength. The expanded frequency inputs can produce shorter wavelengths than the selected detail resolves. A visible notice flags fewer than 12 points per wavelength in the 3D mesh or the current 2D pixel resolution. Zooming the 2D camera can resolve shorter waves. Near-source features can need more sampling than the far-field wavelength criterion; lowering detail is a visible surface approximation, with fragment-level masking and analytic colors preserved. The 2D field is evaluated directly per fragment on a single rectangle.

Amplitude and frequency validation rejects non-finite values and magnitudes above JavaScript’s safe numeric bound (`Number.MAX_SAFE_INTEGER` in SI units). The expanded input range is not a guarantee of display resolution or float32 phase accuracy at arbitrarily high frequencies.

The initial scene uses two circular sources at `(−1,0)` and `(1,0) m`, with `A=0.001 m`, `f=1 Hz`, `φ=0`, `c=1 m/s`, `g=100`, and `u_scale=0.005 m`.

## References

- [Membrane wave equation](https://www.math.toronto.edu/courses/apm346h1/20169/PDE-textbook/Chapter1/S1.4.html)
- [NIST definitions of Bessel and Hankel functions](https://dlmf.nist.gov/10.2), [near-zero behavior](https://dlmf.nist.gov/10.7)
- [OpenStax: interference and superposition](https://openstax.org/books/university-physics-volume-1/pages/16-5-interference-of-waves)
- [Membrane energy and flux](https://gustavdelius.github.io/WavesAndFluids/lecture_07.html#energy-of-membrane)
- [SciPy/Cephes approximation source](https://github.com/scipy/xsf/blob/main/include/xsf/cephes/j0.h)
