import { Vector4 } from 'three/webgpu';
import type { Node } from 'three/webgpu';
import type ArrayNode from 'three/src/nodes/core/ArrayNode.js';
import { Fn, If, Loop, array, element, float, int, vec2, vec4, uniform, uniformArray } from 'three/tsl';
import { hankelSmall, hankelLarge } from '../physics/bessel';
import type { Arithmetic } from '../physics/bessel';
import { prepareWaves, sinc } from '../physics/model';
import type { SceneState } from '../state';
import { MAX_WAVES, MASK_RADIUS } from '../state';

type Scalar = Node<'float'>;
const arithmetic: Arithmetic<Scalar> = {
  constant: float, add: (a, b) => a.add(b), sub: (a, b) => a.sub(b),
  mul: (a, b) => a.mul(b), div: (a, b) => a.div(b),
  sin: x => x.sin(), cos: x => x.cos(), log: x => x.log(), sqrt: x => x.sqrt(),
};
const hankel = Fn(([x]: [Scalar]) => {
  const result = vec2(0).toVar();
  If(x.lessThanEqual(5), () => {
    const [j, y] = hankelSmall(x, arithmetic); result.assign(vec2(j, y));
  }).Else(() => {
    const [j, y] = hankelLarge(x, arithmetic); result.assign(vec2(j, y));
  });
  return result;
});

export function createFieldShader() {
  const parameters = Array.from({ length: MAX_WAVES }, () => new Vector4());
  const coefficients = Array.from({ length: MAX_WAVES }, () => new Vector4());
  const positions = Array.from({ length: MAX_WAVES }, () => new Vector4());
  const weights = Array.from({ length: MAX_WAVES * MAX_WAVES }, () => new Vector4());
  const params = uniformArray<'vec4'>(parameters, 'vec4');
  const coeff = uniformArray<'vec4'>(coefficients, 'vec4');
  const sources = uniformArray<'vec4'>(positions, 'vec4');
  const averages = uniformArray<'vec4'>(weights, 'vec4');
  const count = uniform(0, 'int');
  const quantity = uniform(0, 'int');
  const colorScale = uniform(0.004);
  const heightScale = uniform(100);
  const grid = uniform(1);

  // x = displacement, y = infinite-time mean square, z = finite-window mean square, w = undefined mask.
  // Diagnostics request every quantity; normal draws only evaluate the selected averaging mode.
  const makeField = (all: boolean) => Fn(([xy]: [Node<'vec2'>]) => {
    const result = vec4(0).toVar();
    // @types/three drops the array shape on toVar(); TSL supports an array VarNode here.
    const values = array('vec2', MAX_WAVES).toVar() as unknown as ArrayNode<'vec2'>;
    Loop({ start: int(0), end: count, type: 'int' }, ({ i }) => {
      const p = params.element(i), s = sources.element(i), c = coeff.element(i);
      const basis = vec2(0).toVar();
      If(s.w.greaterThan(0), () => {
        If(s.z.greaterThan(0.5), () => {
          const distance = xy.sub(s.xy).length().toVar();
          If(distance.lessThan(MASK_RADIUS), () => { result.w.assign(1); });
          // Only prevents singular arithmetic; values in the disk are discarded and remain undefined.
          basis.assign(hankel(p.x.mul(distance.max(MASK_RADIUS))));
        }).Else(() => {
          const phase = p.x.mul(xy.dot(p.yz));
          basis.assign(vec2(phase.cos(), phase.sin()));
        });
      });
      const value = vec2(c.x.mul(basis.x).sub(c.y.mul(basis.y)), c.x.mul(basis.y).add(c.y.mul(basis.x))).toVar();
      element(values, i).assign(value);
      result.x.addAssign(value.x);
    });
    If(all ? float(1).greaterThan(0) : quantity.greaterThan(0), () => {
      Loop({ start: int(0), end: count, type: 'int' }, ({ i }) => {
        const a = element(values, i), diagonal = averages.element(i.mul(MAX_WAVES).add(i));
        result.y.addAssign(a.dot(a).mul(0.5));
        if (all) {
          result.z.addAssign(a.dot(a).add(a.x.mul(a.x).sub(a.y.mul(a.y)).mul(diagonal.y)).mul(0.5));
        } else {
          If(quantity.equal(2), () => {
            result.z.addAssign(a.dot(a).add(a.x.mul(a.x).sub(a.y.mul(a.y)).mul(diagonal.y)).mul(0.5));
          });
        }
      });
      // The two-index Loop generates distinct i/j variables on both backends.
      Loop({ start: int(0), end: count, type: 'int' }, { start: int(0), end: count, type: 'int' }, ({ i, j }) => {
        If(j.greaterThan(i), () => {
          const a = element(values, i);
          const b = element(values, j), weight = averages.element(i.mul(MAX_WAVES).add(j));
          result.y.addAssign(a.dot(b).mul(weight.z));
          const addWindow = () => {
            result.z.addAssign(a.dot(b).mul(weight.x).add(a.x.mul(b.x).sub(a.y.mul(b.y)).mul(weight.y)));
          };
          if (all) addWindow(); else If(quantity.equal(2), addWindow);
        });
      });
      result.y.assign(result.y.max(0)); result.z.assign(result.z.max(0));
    });
    return result;
  });
  return {
    field: makeField(false), diagnosticField: makeField(true), quantity, colorScale, heightScale, grid,
    update(scene: SceneState, time: number) {
      const prepared = prepareWaves(scene, time);
      count.value = prepared.length;
      for (let i = 0; i < prepared.length; i++) {
        const { k, coefficient: [re, im], wave: w } = prepared[i];
        parameters[i].set(k, Math.cos(w.direction), Math.sin(w.direction), w.frequency);
        coefficients[i].set(re, im, 0, 0);
        positions[i].set(w.x, w.y, w.type === 'circular' ? 1 : 0, w.enabled && w.amplitude > 0 ? 1 : 0);
        for (let j = i; j < prepared.length; j++) {
          const f = prepared[j].wave.frequency, tau = scene.display.averageWindow;
          weights[i * MAX_WAVES + j].set(sinc(Math.PI * (w.frequency - f) * tau),
            sinc(Math.PI * (w.frequency + f) * tau), w.frequency === f ? 1 : 0, 0);
        }
      }
      quantity.value = scene.display.quantity === 'displacement' ? 0 : scene.display.quantity === 'meanSquare' ? 1 : 2;
      colorScale.value = scene.display.colorScale; heightScale.value = scene.display.heightScale;
      grid.value = scene.display.grid ? 1 : 0;
    },
  };
}
