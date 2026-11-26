/* ============================================================
   world/WorldGeometry.ts — реальные векторные границы мира (Natural Earth 110m)
   Декодирует TopoJSON и адаптирует границы к 1 января 2000 года.
   ============================================================ */
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import countriesAtlas from 'world-atlas/countries-110m.json';
import { ATLAS_MERGE_MAP, WORLD_COUNTRIES_2000 } from '../data/worldCountries2000.js';

export type LatLngRing = [number, number][]; // [lat, lng]
export type CountryPolygon = LatLngRing[];   // [outer, ...holes]

export interface GeoBBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

interface CountryGeoCache {
  polygons: CountryPolygon[];
  centroid: [number, number];
  bbox: GeoBBox;
}

const countryGeoMap = new Map<string, CountryGeoCache>();
let antarcticaPolygons: CountryPolygon[] = [];
let initialized = false;

/** Разрезает кольцо, если оно перепрыгивает через линию смены дат (±180°), чтобы не рисовать полосы через всю карту */
function splitAntimeridianRing(coords: number[][]): LatLngRing[] {
  const rings: LatLngRing[] = [];
  let current: LatLngRing = [];

  for (let i = 0; i < coords.length; i++) {
    const pt = coords[i]!;
    const lng = pt[0]!;
    const lat = pt[1]!;

    if (i > 0) {
      const prevLng = coords[i - 1]![0]!;
      if (Math.abs(lng - prevLng) > 180) {
        if (current.length >= 3) rings.push(current);
        current = [];
      }
    }
    current.push([lat, lng]);
  }
  if (current.length >= 3) rings.push(current);
  return rings;
}

function ringArea(ring: LatLngRing): number {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [y1, x1] = ring[j]!;
    const [y2, x2] = ring[i]!;
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) * 0.5;
}

function ringCentroid(ring: LatLngRing): [number, number] {
  let sumLat = 0;
  let sumLng = 0;
  for (const [lat, lng] of ring) {
    sumLat += lat;
    sumLng += lng;
  }
  return [sumLat / Math.max(1, ring.length), sumLng / Math.max(1, ring.length)];
}

export function initWorldGeometry(): void {
  if (initialized) return;
  initialized = true;

  const idToCode = new Map<string, string>();
  for (const c of WORLD_COUNTRIES_2000) {
    for (const aid of c.atlasIds) idToCode.set(aid, c.code);
  }

  const rawTopo = countriesAtlas as unknown as Topology<{ countries: GeometryCollection<{ name?: string }> }>;
  // Патчим границы под 1 января 2000 года (включая возврат Крыма в состав Украины)
  const topo = structuredClone(rawTopo);
  for (const g of topo.objects.countries.geometries as any[]) {
    if (g.id === '643' && g.type === 'MultiPolygon') {
      // Удаляем отдельный полигон Крыма [163, 164] из России
      g.arcs = g.arcs.filter((poly: number[][]) => !(poly[0]?.includes(163) && poly[0]?.includes(164)));
    } else if (g.id === '804' && g.type === 'Polygon') {
      // Заменяем перешеек (-164) на береговую линию Крыма (164) в контуре Украины
      g.arcs = g.arcs.map((ring: number[]) => ring.map((arcId: number) => (arcId === -164 ? 164 : arcId)));
    }
  }
  const fc = feature(topo, topo.objects.countries);

  const rawByCode = new Map<string, CountryPolygon[]>();

  for (const feat of fc.features) {
    const gid = feat.id !== undefined ? String(feat.id).padStart(3, '0') : '';
    const gname = feat.properties?.name ?? '';
    const mergeKey = gid && ATLAS_MERGE_MAP[gid]
      ? ATLAS_MERGE_MAP[gid]
      : ATLAS_MERGE_MAP[`name:${gname}`];

    const targetCode = mergeKey ?? idToCode.get(gid);
    if (!targetCode) continue;

    const geom = feat.geometry;
    if (!geom) continue;

    const extracted: CountryPolygon[] = [];
    if (geom.type === 'Polygon') {
      const rings = geom.coordinates.flatMap((r) => splitAntimeridianRing(r));
      for (const r of rings) extracted.push([r]);
    } else if (geom.type === 'MultiPolygon') {
      for (const poly of geom.coordinates) {
        const rings = poly.flatMap((r) => splitAntimeridianRing(r));
        for (const r of rings) extracted.push([r]);
      }
    }

    if (targetCode === 'ANTARCTICA') {
      antarcticaPolygons.push(...extracted);
      continue;
    }

    const list = rawByCode.get(targetCode) ?? [];
    list.push(...extracted);
    rawByCode.set(targetCode, list);
  }

  for (const [code, polys] of rawByCode.entries()) {
    // Центр тяжести крупнейшего полигона страны для подписи/позиционирования
    let bestRing: LatLngRing = [[0, 0]];
    let bestArea = -1;
    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    for (const poly of polys) {
      const outer = poly[0];
      if (!outer) continue;
      for (const [lat, lng] of outer) {
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
      }
      const a = ringArea(outer);
      if (a > bestArea) {
        bestArea = a;
        bestRing = outer;
      }
    }
    countryGeoMap.set(code, {
      polygons: polys,
      centroid: ringCentroid(bestRing),
      bbox: { minLat, maxLat, minLng, maxLng }
    });
  }

  console.log(`[WorldGeometry] загружено контуров стран: ${countryGeoMap.size}`);
}

export function getCountryPolygons(code: string): CountryPolygon[] {
  initWorldGeometry();
  return countryGeoMap.get(code)?.polygons ?? [];
}

export function getCountryCentroid(code: string): [number, number] {
  initWorldGeometry();
  return countryGeoMap.get(code)?.centroid ?? [0, 0];
}

export function getCountryBBox(code: string): GeoBBox | null {
  initWorldGeometry();
  return countryGeoMap.get(code)?.bbox ?? null;
}

export function getAntarcticaPolygons(): CountryPolygon[] {
  initWorldGeometry();
  return antarcticaPolygons;
}
