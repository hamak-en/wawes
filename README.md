# Хвилі — Wave Interference Laboratory

A browser-only teaching tool for exploring harmonic waves on an infinite membrane. Ukrainian controls, a signed-displacement field in 2D, and the same field as a movable 3D surface. Built with TypeScript, Vite, Three.js WebGPURenderer and one shared TSL shader.

[GitHub Pages demo](https://hamak-en.github.io/wawes/) (available after the deployment workflow runs).

## Run locally

Use Node.js 24 and npm. Versions are pinned in `package.json` and `package-lock.json`.

```sh
npm ci
npm run dev
```

Open the printed localhost address. WebGPU is the primary backend; WebGL 2 is selected automatically when WebGPU is unavailable. To explicitly test the fallback, open `http://127.0.0.1:5173/?backend=webgl`.

For an offline presentation, prepare the build while online, then keep the local server running:

```sh
npm run build
npm run preview
```

The built app needs no internet connection, CDN, external fonts, simulation server, or local storage. A local HTTP server is required; opening `dist/index.html` as a `file:` URL is unsupported.

## Explore

- Add up to eight plane or circular waves; edit amplitude, frequency, phase, direction or position. Duplicate, temporarily disable, or delete a source.
- Choose the five teaching scenes: separated sources, equal phases, opposite phases, standing waves, and beats.
- Switch between 2D and 3D. Orbit, pan, zoom, and reset the camera. Each view remembers its camera.
- Inspect instantaneous displacement, the infinite-time mean-square map, or exact symmetric finite-window averaging. The cross-section always shows instantaneous contributions and their sum.
- Pause, slow playback, advance by a configurable physical time step, or reset time. Hide the panels for a presentation. The sidebar scrolls independently of the visualization.
- Copy a portable scene link or export/import a validated JSON file. A paused link restores its exact time; a playing link starts at zero.

Space pauses/resumes, Right Arrow steps, H toggles panels. Keyboard shortcuts leave focused form controls alone. In 3D, drag to orbit, right-drag or Shift-drag to pan, and scroll to zoom; touch supports orbit and two-finger pan/zoom. In 2D, use right-drag to pan and scroll to zoom.

## Physics and state

See [the physical model](docs/model.md), [the versioned scene format](docs/scene-format.md), and [validation and performance](docs/validation.md).

The circular field uses the full outgoing Hankel function, normalized at **one meter**. Active nonzero circular sources have an undefined disk with radius **0.05 m**. Masked measurements return `null`; those disks are excluded from drawing. These are harmonic steady states, without obstacles, reflections, pulses, transients, or volumetric propagation.

Physical amplitudes are in meters. The signed color and cross-section limits are ±(the largest enabled source amplitude + 4 mm), recalculated when amplitudes or enabled sources change. Amplitude and frequency number fields accept values beyond their initial slider ranges, and the sliders expand to match. Color saturation and the 3D exaggeration do not modify the model. Mean-square displacement has units of m² and is distinct from energy flux. Editing parameters substitutes a new configured field at the current time.

## Check

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

The standard browser suite exercises forced WebGL 2. To also require WebGPU on supported hardware:

```sh
E2E_WEBGPU=1 npm run test:e2e
```

On macOS, the existing Chrome executable can be used in isolated test profiles:

```sh
E2E_CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' E2E_WEBGPU=1 npm run test:e2e
```

The UI’s **“Перевірити фізику на GPU”** button performs float readback comparisons before color or height conversion. Numeric error is measured against the CPU reference with a combined absolute/relative tolerance. `?qa=1` exposes a small browser-test API; normal operation needs no QA flag.

## GitHub Pages

The repository is `hamak-en/wawes`, with `master` as the deployment branch. One-time setup:

1. Open repository **Settings → Pages → Build and deployment → Source** and select **GitHub Actions**.
2. When ready, commit and push the implementation, including `.github/workflows/`, to `master`.
3. Watch **Actions → Check and deploy**. After a successful deployment, open https://hamak-en.github.io/wawes/.

Every subsequent push to `master` starts one workflow: the **Check** job runs unit tests, builds the site, and runs browser checks; **Deploy to GitHub Pages** starts only after Check succeeds and publishes that same build. The workflow can also be started manually from Actions on `master`. No personal access token or additional secret is required: deployment uses GitHub's workflow token. The deployment uploads **only `dist/`**; the production base path comes from GitHub Pages metadata. The development server keeps `/` as its base path so browser tests work in CI. Public GitHub Pages hosting must be enabled by the repository owner before the first deployment.

The single [CI/CD workflow](.github/workflows/pages.yml) runs on pushes and pull requests. Other branches and pull requests run only Check; deployment is restricted to `master` outside pull request events. `private/` remains ignored and is not an input to the site build.

## Layout

```text
src/state.ts              state schema, bounds and teaching scenes
src/physics/              shared Bessel expressions and CPU reference
src/render/               shared TSL field, both graphics backends and readback checks
src/url.ts                bounded scene encoding and coalesced history updates
src/main.ts               controls, time and file/link interactions
src/plot.ts               instantaneous cross-section plot
tests/                    independent math fixtures, unit tests and browser tests
docs/                     public model, state and validation documentation
```

Project code is licensed under the [MIT License](LICENSE). The Bessel approximation retains its BSD license and attribution; see [third-party notices](THIRD_PARTY_NOTICES.md). Both notices and the project license are included in the built site.
