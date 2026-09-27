// Programme sigma (WebGL) des symboles de l'instrument : la forme dit le statut, deux petits
// indicateurs disent qui a validé. Dérivé du programme « cercle » de sigma v3 (même structure,
// mêmes uniformes), avec un triangle agrandi pour pouvoir dessiner hors du disque.
//
//   forme 0  ●  validé      disque plein
//   forme 1  ◐  incertain   anneau + moitié gauche pleine
//   forme 2  ✕  réfuté      croix
//   forme 3  ◎  agrégat     disque translucide + anneau + point central (catégorie)
//   forme 4  ▣  case        carré translucide + cadre + point central (regroupement par cases)
//
// Validation (feuilles) : point creux au nord-ouest = IA, point plein au nord-est = humain,
// les deux = IA + humain. Couleurs passées en uniformes (constantes par thème).
//
// Contour : `couleurBordure` / `tailleBordure` dilatent la silhouette (séparation sur le fond,
// ou surlignage de lignée quand le moteur l'épaissit).

import { NodeProgram } from 'sigma/rendering'
import type { ProgramInfo } from 'sigma/rendering'
import type { NodeDisplayData, RenderParams } from 'sigma/types'
import { floatColor } from 'sigma/utils'

/** Facteur d'agrandissement du triangle (le disque du nœud a le rayon 1 / EXT du triangle inscrit). */
const EXT = 2.0

const VERTEX = /* glsl */ `
attribute vec4 a_id;
attribute vec4 a_color;
attribute vec4 a_bord;
attribute vec2 a_position;
attribute float a_size;
attribute vec4 a_params;
attribute float a_angle;

uniform mat3 u_matrix;
uniform float u_sizeRatio;
uniform float u_correctionRatio;

varying vec4 v_color;
varying vec4 v_bord;
varying vec2 v_diff;
varying float v_rayon;
varying vec4 v_params;

const float bias = 255.0 / 254.0;

void main() {
  float taille = a_size * u_correctionRatio / u_sizeRatio * 4.0;
  vec2 diff = taille * ${EXT.toFixed(1)} * vec2(cos(a_angle), sin(a_angle));
  gl_Position = vec4((u_matrix * vec3(a_position + diff, 1)).xy, 0, 1);
  v_diff = diff;
  v_rayon = taille / 2.0;
  v_params = a_params;
  #ifdef PICKING_MODE
  v_color = a_id;
  #else
  v_color = a_color;
  #endif
  v_color.a *= bias;
  v_bord = a_bord;
}
`

const FRAGMENT = /* glsl */ `
precision highp float;

varying vec4 v_color;
varying vec4 v_bord;
varying vec2 v_diff;
varying float v_rayon;
varying vec4 v_params;

uniform float u_correctionRatio;
uniform vec4 u_couleurIA;
uniform vec4 u_couleurHumain;
uniform float u_rayonIndicateur;

float sdBoite(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

// Distance signée de la silhouette (unité = rayon du nœud).
float silhouette(vec2 p, float forme) {
  if (forme < 1.5) return length(p) - 1.0;
  if (forme < 2.5) {
    vec2 q = abs(vec2(p.x + p.y, p.x - p.y) * 0.70710678);
    return min(sdBoite(q, vec2(1.05, 0.26)), sdBoite(q, vec2(0.26, 1.05)));
  }
  if (forme < 3.5) return length(p) - 1.0;
  return sdBoite(p, vec2(0.84)) - 0.08;
}

vec4 dessus(vec4 fond, vec4 c, float couverture) {
  vec4 s = c * couverture;
  return s + fond * (1.0 - s.a);
}

void main(void) {
  vec2 p = v_diff / v_rayon;
  float px = u_correctionRatio * 2.0 / v_rayon;
  float forme = v_params.x;
  float validation = v_params.y;
  float bord = v_params.z;

  #ifdef PICKING_MODE
  if (length(p) > 1.15) discard;
  gl_FragColor = v_color;
  #else
  vec4 c = vec4(0.0);
  float d = silhouette(p, forme);

  // Contour (dilatation de la silhouette).
  if (bord > 0.001) c = dessus(c, v_bord, clamp(0.5 - (d - bord) / px, 0.0, 1.0));

  float cov = clamp(0.5 - d / px, 0.0, 1.0);
  if (forme < 0.5) {
    c = dessus(c, v_color, cov);
  } else if (forme < 1.5) {
    // Incertain : fond clair, anneau et moitié gauche.
    c = dessus(c, v_color * 0.16, cov);
    float anneau = abs(length(p) - 0.84) - 0.16;
    float moitie = max(length(p) - 0.7, p.x);
    c = dessus(c, v_color, clamp(0.5 - min(anneau, moitie) / px, 0.0, 1.0));
  } else if (forme < 2.5) {
    c = dessus(c, v_color, cov);
  } else if (forme < 3.5) {
    c = dessus(c, v_color * 0.16, cov);
    float anneau = abs(length(p) - 0.9) - 0.1;
    c = dessus(c, v_color, clamp(0.5 - anneau / px, 0.0, 1.0));
    c = dessus(c, v_color, clamp(0.5 - (length(p) - 0.16) / px, 0.0, 1.0));
  } else {
    c = dessus(c, v_color * 0.14, cov);
    float cadre = abs(sdBoite(p, vec2(0.84)) - 0.0) - 0.09;
    c = dessus(c, v_color, clamp(0.5 - cadre / px, 0.0, 1.0));
    c = dessus(c, v_color, clamp(0.5 - (length(p) - 0.16) / px, 0.0, 1.0));
  }

  // Indicateurs de validation (1 = IA, 2 = humain, 3 = les deux).
  if (validation > 0.5 && u_rayonIndicateur > 0.001) {
    float r = u_rayonIndicateur;
    float a = v_color.a;
    float ecart = 1.0 + r * 1.25;
    if (validation > 1.5) {
      float dh = length(p - vec2(0.72, 0.72) * ecart) - r;
      c = dessus(c, u_couleurHumain * a, clamp(0.5 - dh / px, 0.0, 1.0));
    }
    if (validation < 1.5 || validation > 2.5) {
      float di = abs(length(p - vec2(-0.72, 0.72) * ecart) - r * 0.78) - r * 0.26;
      c = dessus(c, u_couleurIA * a, clamp(0.5 - di / px, 0.0, 1.0));
    }
  }
  if (c.a < 0.002) discard;
  gl_FragColor = c;
  #endif
}
`

type Uniforme = 'u_sizeRatio' | 'u_correctionRatio' | 'u_matrix' | 'u_couleurIA' | 'u_couleurHumain' | 'u_rayonIndicateur'

/** Paramètres globaux lus à chaque rendu (mis à jour par la variante au changement de thème / réglage). */
export const PARAMS_FORME = {
  couleurIA: [0.59, 0.46, 0.98, 1] as [number, number, number, number],
  couleurHumain: [0.11, 0.49, 0.84, 1] as [number, number, number, number],
  rayonIndicateur: 0.32,
}

const { UNSIGNED_BYTE, FLOAT } = WebGLRenderingContext

/** Données supplémentaires lues dans NodeDisplayData (posées par le réducteur via `a.extra`). */
interface DonneesForme extends NodeDisplayData {
  forme?: number
  validation?: number
  couleurBordure?: string
  tailleBordure?: number
}

export class ProgrammeForme extends NodeProgram<Uniforme> {
  static readonly ANGLE_1 = 0
  static readonly ANGLE_2 = (2 * Math.PI) / 3
  static readonly ANGLE_3 = (4 * Math.PI) / 3

  getDefinition() {
    return {
      VERTICES: 3,
      VERTEX_SHADER_SOURCE: VERTEX,
      FRAGMENT_SHADER_SOURCE: FRAGMENT,
      METHOD: WebGLRenderingContext.TRIANGLES,
      UNIFORMS: ['u_sizeRatio', 'u_correctionRatio', 'u_matrix', 'u_couleurIA', 'u_couleurHumain', 'u_rayonIndicateur'] as const,
      ATTRIBUTES: [
        { name: 'a_position', size: 2, type: FLOAT },
        { name: 'a_size', size: 1, type: FLOAT },
        { name: 'a_color', size: 4, type: UNSIGNED_BYTE, normalized: true },
        { name: 'a_id', size: 4, type: UNSIGNED_BYTE, normalized: true },
        { name: 'a_bord', size: 4, type: UNSIGNED_BYTE, normalized: true },
        { name: 'a_params', size: 4, type: FLOAT },
      ],
      CONSTANT_ATTRIBUTES: [{ name: 'a_angle', size: 1, type: FLOAT }],
      CONSTANT_DATA: [[ProgrammeForme.ANGLE_1], [ProgrammeForme.ANGLE_2], [ProgrammeForme.ANGLE_3]],
    }
  }

  processVisibleItem(indexNoeud: number, debut: number, data: NodeDisplayData): void {
    const d = data as DonneesForme
    const a = this.array
    a[debut++] = d.x
    a[debut++] = d.y
    a[debut++] = d.size
    a[debut++] = floatColor(d.color)
    a[debut++] = indexNoeud
    a[debut++] = floatColor(d.couleurBordure ?? 'rgba(0,0,0,0)')
    a[debut++] = d.forme ?? 0
    a[debut++] = d.validation ?? 0
    a[debut++] = d.tailleBordure ?? 0
    a[debut++] = 0
  }

  setUniforms(params: RenderParams, { gl, uniformLocations: u }: ProgramInfo<Uniforme>): void {
    gl.uniform1f(u.u_correctionRatio, params.correctionRatio)
    gl.uniform1f(u.u_sizeRatio, params.sizeRatio)
    gl.uniformMatrix3fv(u.u_matrix, false, params.matrix)
    gl.uniform4fv(u.u_couleurIA, PARAMS_FORME.couleurIA)
    gl.uniform4fv(u.u_couleurHumain, PARAMS_FORME.couleurHumain)
    gl.uniform1f(u.u_rayonIndicateur, PARAMS_FORME.rayonIndicateur)
  }
}
