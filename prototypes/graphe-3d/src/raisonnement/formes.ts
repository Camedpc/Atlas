// Programme sigma (WebGL) : nœuds de formes distinctes avec bordure.
//
// Une seule passe pour toutes les formes : le triangle englobant de chaque nœud est rempli, puis le
// fragment calcule la distance signée à la forme (cercle, losange, hexagone, carré, triangle,
// capsule) et mélange remplissage, bordure et transparence. Attributs lus dans les données
// d'affichage : `color` (remplissage), `couleurBordure`, `forme` (code), `epaisseur` (0…1, part
// du rayon). Les couleurs doivent être prémultipliées (voir rgbaGL du moteur).

import { NodeProgram } from 'sigma/rendering'
import type { ProgramInfo } from 'sigma/rendering'
import type { NodeDisplayData, RenderParams } from 'sigma/types'
import { floatColor } from 'sigma/utils'

export const FORMES = ['cercle', 'losange', 'hexagone', 'carre', 'triangle', 'capsule'] as const
export type Forme = (typeof FORMES)[number]
export const CODE_FORME: Record<Forme, number> = { cercle: 0, losange: 1, hexagone: 2, carre: 3, triangle: 4, capsule: 5 }

const VERTEX = /* glsl */ `
attribute vec4 a_id;
attribute vec4 a_color;
attribute vec4 a_bordure;
attribute vec2 a_position;
attribute float a_size;
attribute float a_forme;
attribute float a_epaisseur;
attribute float a_angle;

uniform mat3 u_matrix;
uniform float u_sizeRatio;
uniform float u_correctionRatio;

varying vec4 v_color;
varying vec4 v_bordure;
varying vec2 v_diff;
varying float v_rayon;
varying float v_forme;
varying float v_epaisseur;

const float bias = 255.0 / 254.0;

void main() {
  float taille = a_size * u_correctionRatio / u_sizeRatio * 4.0;
  // Triangle englobant deux fois plus grand que celui du cercle : la capsule et le losange y tiennent.
  vec2 diff = 2.0 * taille * vec2(cos(a_angle), sin(a_angle));
  gl_Position = vec4((u_matrix * vec3(a_position + diff, 1)).xy, 0, 1);
  v_diff = diff;
  v_rayon = taille / 2.0;
  v_forme = a_forme;
  v_epaisseur = a_epaisseur;
  #ifdef PICKING_MODE
  v_color = a_id;
  v_bordure = a_id;
  #else
  v_color = a_color;
  v_bordure = a_bordure;
  #endif
  v_color.a *= bias;
  v_bordure.a *= bias;
}
`

const FRAGMENT = /* glsl */ `
precision highp float;

varying vec4 v_color;
varying vec4 v_bordure;
varying vec2 v_diff;
varying float v_rayon;
varying float v_forme;
varying float v_epaisseur;

uniform float u_correctionRatio;

const vec4 transparent = vec4(0.0);

float hexagone(vec2 p, float r) {
  const vec3 k = vec3(-0.866025404, 0.5, 0.577350269);
  p = abs(p);
  p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
  p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
  return length(p) * sign(p.y);
}

float triangle(vec2 p, float r) {
  const float k = 1.7320508;
  p.x = abs(p.x) - r;
  p.y = p.y + r / k;
  if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
  p.x -= clamp(p.x, -2.0 * r, 0.0);
  return -length(p) * sign(p.y);
}

float distanceForme(vec2 p, float r, float f) {
  if (f < 0.5) return length(p) - r;
  if (f < 1.5) { vec2 q = abs(p); return (q.x + q.y - r * 1.38) * 0.70710678; }
  if (f < 2.5) return hexagone(p, r * 0.93);
  if (f < 3.5) { vec2 d = abs(p) - vec2(r * 0.78); return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r * 0.14; }
  if (f < 4.5) return triangle(p + vec2(0.0, r * 0.18), r * 1.12);
  vec2 q = vec2(max(abs(p.x) - r * 0.95, 0.0), p.y);
  return length(q) - r * 0.72;
}

void main(void) {
  float d = distanceForme(v_diff, v_rayon, v_forme);
  #ifdef PICKING_MODE
  gl_FragColor = d > 0.0 ? transparent : v_color;
  #else
  float aa = u_correctionRatio * 2.0;
  float bord = v_rayon * v_epaisseur;
  vec4 c = v_color;
  if (bord > 0.0) c = mix(v_color, v_bordure, smoothstep(-bord - aa, -bord, d));
  gl_FragColor = mix(c, transparent, smoothstep(-aa, 0.0, d));
  #endif
}
`

const { UNSIGNED_BYTE, FLOAT } = WebGLRenderingContext
const UNIFORMES = ['u_sizeRatio', 'u_correctionRatio', 'u_matrix'] as const

interface DonneesForme extends NodeDisplayData {
  couleurBordure?: string
  forme?: number
  epaisseur?: number
}

export class ProgrammeFormes extends NodeProgram<(typeof UNIFORMES)[number]> {
  getDefinition() {
    return {
      VERTICES: 3,
      VERTEX_SHADER_SOURCE: VERTEX,
      FRAGMENT_SHADER_SOURCE: FRAGMENT,
      METHOD: WebGLRenderingContext.TRIANGLES,
      UNIFORMS: UNIFORMES,
      ATTRIBUTES: [
        { name: 'a_position', size: 2, type: FLOAT },
        { name: 'a_size', size: 1, type: FLOAT },
        { name: 'a_color', size: 4, type: UNSIGNED_BYTE, normalized: true },
        { name: 'a_id', size: 4, type: UNSIGNED_BYTE, normalized: true },
        { name: 'a_bordure', size: 4, type: UNSIGNED_BYTE, normalized: true },
        { name: 'a_forme', size: 1, type: FLOAT },
        { name: 'a_epaisseur', size: 1, type: FLOAT },
      ],
      CONSTANT_ATTRIBUTES: [{ name: 'a_angle', size: 1, type: FLOAT }],
      CONSTANT_DATA: [[0], [(2 * Math.PI) / 3], [(4 * Math.PI) / 3]],
    }
  }

  processVisibleItem(idNoeud: number, debut: number, data: DonneesForme): void {
    const t = this.array
    t[debut++] = data.x
    t[debut++] = data.y
    t[debut++] = data.size
    t[debut++] = floatColor(data.color)
    t[debut++] = idNoeud
    t[debut++] = floatColor(data.couleurBordure ?? data.color)
    t[debut++] = data.forme ?? 0
    t[debut++] = data.epaisseur ?? 0
  }

  setUniforms(params: RenderParams, { gl, uniformLocations }: ProgramInfo): void {
    const { u_sizeRatio, u_correctionRatio, u_matrix } = uniformLocations
    gl.uniform1f(u_correctionRatio, params.correctionRatio)
    gl.uniform1f(u_sizeRatio, params.sizeRatio)
    gl.uniformMatrix3fv(u_matrix, false, params.matrix)
  }
}
