import { describe, expect, it } from "vitest";
import { Decimateur } from "./motCle";

function sinus(frequence: number, n: number, taux = 48000): Float32Array {
  return Float32Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * frequence * i) / taux));
}

function amplitude(signal: Float32Array): number {
  return Math.max(...signal.slice(100).map(Math.abs));
}

describe("Decimateur 48 kHz → 16 kHz", () => {
  it("divise le nombre d'échantillons par trois, même par petits blocs", () => {
    const d = new Decimateur(3);
    const total = [960, 960, 961].map((n) => d.traiter(new Float32Array(n)).length).reduce((a, b) => a + b);
    expect(total).toBe(Math.floor(2881 / 3));
  });

  it("conserve la voix et coupe au-dessus de 8 kHz", () => {
    expect(amplitude(new Decimateur(3).traiter(sinus(1000, 9600)))).toBeGreaterThan(0.9);
    expect(amplitude(new Decimateur(3).traiter(sinus(12000, 9600)))).toBeLessThan(0.1);
  });
});
