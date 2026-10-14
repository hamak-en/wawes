/* Cephes coefficients: Copyright 1984, 1987, 1989, 2000 Stephen L. Moshier.
 * SciPy adaptation Copyright (c) 2024 SciPy. BSD-3-Clause; see THIRD_PARTY_NOTICES.md.
 * Source: https://github.com/scipy/xsf/blob/main/include/xsf/cephes/j0.h
 */
export interface Arithmetic<T> {
  constant: (n: number) => T;
  add: (a: T, b: T) => T;
  sub: (a: T, b: T) => T;
  mul: (a: T, b: T) => T;
  div: (a: T, b: T) => T;
  sin: (x: T) => T;
  cos: (x: T) => T;
  log: (x: T) => T;
  sqrt: (x: T) => T;
}
const PP = [7.96936729297347051624e-4, 8.28352392107440799803e-2, 1.23953371646414299388,
  5.44725003058768775090, 8.74716500199817011941, 5.30324038235394892183, 1];
const PQ = [9.24408810558863637013e-4, 8.56288474354474431428e-2, 1.25352743901058953537,
  5.47097740330417105182, 8.76190883237069594232, 5.30605288235394617618, 1];
const QP = [-1.13663838898469149931e-2, -1.28252718670509318512, -19.5539544257735972385,
  -93.2060152123768231369, -177.681167980488050595, -147.077505154951170175, -51.4105326766599330220, -6.05014350600728481186];
const QQ = [1, 64.3178256118178023184, 856.430025976980587198, 3882.40183605401609683,
  7240.46774195652478189, 5930.72701187316984827, 2062.09331660327847417, 242.005740240291393179];
const YP = [1.55924367855235737965e4, -1.46639295903971606143e7, 5.43526477051876500413e9,
  -9.82136065717911466409e11, 8.75906394395366999549e13, -3.46628303384729719441e15,
  4.42733268572569800351e16, -1.84950800436986690637e16];
const YQ = [1, 1.04128353664259848412e3, 6.26107330137134956842e5, 2.68919633393814121987e8,
  8.64002487103935000337e10, 2.02979612750105546709e13, 3.17157752842975028269e15, 2.50596256172653059228e17];
const RP = [-4.79443220978201773821e9, 1.95617491946556577543e12, -2.49248344360967716204e14, 9.70862251047306323952e15];
const RQ = [1, 4.99563147152651017219e2, 1.73785401676374683123e5, 4.84409658339962045305e7,
  1.11855537045356834862e10, 2.11277520115489217587e12, 3.10518229857422583814e14,
  3.18121955943204943306e16, 1.71086294081043136091e18];

function polynomial<T>(x: T, coefficients: number[], m: Arithmetic<T>): T {
  return coefficients.slice(1).reduce((p, c) => m.add(m.mul(p, x), m.constant(c)), m.constant(coefficients[0]));
}
/** Same expression tree is used by double-precision JS and single-precision TSL. x > 0. */
export function hankelSmall<T>(x: T, m: Arithmetic<T>): [T, T] {
  const c = m.constant, z = m.mul(x, x);
  const j = m.div(m.mul(m.mul(m.sub(z, c(5.78318596294678452118)), m.sub(z, c(30.4712623436620863991))),
    polynomial(z, RP, m)), polynomial(z, RQ, m));
  const y = m.add(m.div(polynomial(z, YP, m), polynomial(z, YQ, m)), m.mul(m.mul(c(2 / Math.PI), m.log(x)), j));
  return [j, y];
}
export function hankelLarge<T>(x: T, m: Arithmetic<T>): [T, T] {
  const c = m.constant, z = m.div(c(25), m.mul(x, x));
  const p = m.div(polynomial(z, PP, m), polynomial(z, PQ, m));
  const q = m.mul(m.div(c(5), x), m.div(polynomial(z, QP, m), polynomial(z, QQ, m)));
  // sin(x) and cos(x) avoid subtracting π/4 from a large float32 argument.
  const cos = m.cos(x), sin = m.sin(x), scale = m.div(c(1 / Math.sqrt(Math.PI)), m.sqrt(x));
  return [m.mul(m.add(m.mul(m.add(p, q), cos), m.mul(m.sub(p, q), sin)), scale),
    m.mul(m.add(m.mul(m.sub(q, p), cos), m.mul(m.add(p, q), sin)), scale)];
}
export const doubleArithmetic: Arithmetic<number> = {
  constant: n => n, add: (a, b) => a + b, sub: (a, b) => a - b,
  mul: (a, b) => a * b, div: (a, b) => a / b,
  sin: Math.sin, cos: Math.cos, log: Math.log, sqrt: Math.sqrt,
};
export function hankel0(x: number): [number, number] {
  if (!(x > 0) || !Number.isFinite(x)) throw new RangeError('Hankel argument must be finite and positive.');
  return x <= 5 ? hankelSmall(x, doubleArithmetic) : hankelLarge(x, doubleArithmetic);
}

// Forward-mode differentiation of the existing rational approximations.
// H₁(x) = −H₀′(x); no finite-difference step or extra coefficient table is needed.
type Dual = [value: number, derivative: number];
const derivativeArithmetic: Arithmetic<Dual> = {
  constant: n => [n, 0],
  add: (a, b) => [a[0] + b[0], a[1] + b[1]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1]],
  mul: (a, b) => [a[0] * b[0], a[1] * b[0] + a[0] * b[1]],
  div: (a, b) => [a[0] / b[0], (a[1] - a[0] / b[0] * b[1]) / b[0]],
  sin: a => [Math.sin(a[0]), Math.cos(a[0]) * a[1]],
  cos: a => [Math.cos(a[0]), -Math.sin(a[0]) * a[1]],
  log: a => [Math.log(a[0]), a[1] / a[0]],
  sqrt: a => [Math.sqrt(a[0]), a[1] / (2 * Math.sqrt(a[0]))],
};
export function hankel1(x: number): [number, number] {
  if (!(x > 0) || !Number.isFinite(x)) throw new RangeError('Hankel argument must be finite and positive.');
  const [j, y] = x <= 5 ? hankelSmall<Dual>([x, 1], derivativeArithmetic) : hankelLarge<Dual>([x, 1], derivativeArithmetic);
  return [-j[1], -y[1]];
}
