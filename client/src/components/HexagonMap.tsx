import { H3HexagonLayer } from "@deck.gl/geo-layers";
import { TileLayer } from "@deck.gl/geo-layers";
import { BitmapLayer } from "@deck.gl/layers";
import DeckGL from "@deck.gl/react";
import { WebMercatorViewport } from "@deck.gl/core";
import { cellToLatLng, latLngToCell, gridDisk } from "h3-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface EventData {
  timestamp: Date;
  latitude: number;
  longitude: number;
}

interface SupplyData {
  startTime: Date;
  endTime: Date;
  latitude: number;
  longitude: number;
}

interface HexagonData {
  hexId: string;
  ratio: number;
  center: [number, number];
  sumDemand?: number;
  sumSupply?: number;
  finalPrice?: number;
}

interface HeatmapColor {
  ratio: number;
  color: [number, number, number];
}

interface MultiplierData {
  minRatio: number;
  multiplier: number;
}

interface SnapshotRange {
  minTime: Date;
  maxTime: Date;
}

interface MapViewState {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

interface HexagonMapProps {
  demandEvents: EventData[];
  supplyVehicles: SupplyData[];
  multiplierData: MultiplierData[];
  basePrice: number;
  snapshotTime: Date;
  snapshotRange: SnapshotRange | null;
  timeframeMinutes: number;
  showDemandVsSupply: boolean;
  heatmap: HeatmapColor[];
  showMap: boolean;
  hexagonResolution: number;
}

interface LabelPosition {
  x: number;
  y: number;
  displayValue: string;
}

/* =========================
   Log-normalised ratio
========================= */
function computeLogRatio(journeys: number, vehicles: number): number {
  if (vehicles === 0) return journeys > 0 ? 1 : 0;
  const logJourneys = Math.log(journeys + 1);
  const logVehicles = Math.log(vehicles + 1);
  return logVehicles === 0 ? 1 : logJourneys / logVehicles;
}

export default function HexagonMap({
  // ✅ runtime-safe defaults (fixes undefined.length)
  demandEvents = [],
  supplyVehicles = [],
  multiplierData = [],
  heatmap = [],
  basePrice,
  snapshotTime,
  snapshotRange,
  timeframeMinutes,
  showDemandVsSupply,
  showMap,
  hexagonResolution,
}: HexagonMapProps) {
  const [viewState, setViewState] = useState<MapViewState>({
    longitude: 11.576124,
    latitude: 48.137154,
    zoom: 12,
    pitch: 45,
    bearing: 0,
  });

  const [labelPositions, setLabelPositions] = useState<LabelPosition[]>([]);
  const deckRef = useRef<any>(null);

  /* =========================
     Heatmap
  ========================= */
  const colorScale = useMemo(() => {
    const fallback: HeatmapColor[] = [
      { ratio: 0, color: [0, 0, 255] },
      { ratio: 0.5, color: [0, 255, 0] },
      { ratio: 1, color: [255, 0, 0] },
    ];
    return (heatmap.length > 0 ? heatmap : fallback).sort((a, b) => a.ratio - b.ratio);
  }, [heatmap]);

  const getColorFromRatio = useCallback(
    (ratio: number): [number, number, number] => {
      if (!Number.isFinite(ratio)) return [200, 200, 200];
      const clamped = Math.max(0, Math.min(1, ratio));

      for (let i = 0; i < colorScale.length - 1; i++) {
        const a = colorScale[i];
        const b = colorScale[i + 1];
        if (clamped >= a.ratio && clamped <= b.ratio) {
          const t = (clamped - a.ratio) / (b.ratio - a.ratio || 1);
          return [
            Math.round(a.color[0] + (b.color[0] - a.color[0]) * t),
            Math.round(a.color[1] + (b.color[1] - a.color[1]) * t),
            Math.round(a.color[2] + (b.color[2] - a.color[2]) * t),
          ];
        }
      }
      return colorScale[colorScale.length - 1].color;
    },
    [colorScale]
  );

  /* =========================
     Demand & Supply filters
  ========================= */
  const filteredDemand = useMemo(() => {
    const from = new Date(snapshotTime.getTime() - timeframeMinutes * 60_000);
    return demandEvents.filter((e) => {
      const t = new Date(e.timestamp);
      return t >= from && t <= snapshotTime;
    });
  }, [demandEvents, snapshotTime, timeframeMinutes]);

  const availableSupply = useMemo(() => {
    return supplyVehicles.filter((v) => {
      const start = new Date(v.startTime);
      const end = new Date(v.endTime);
      return snapshotTime >= start && snapshotTime <= end;
    });
  }, [supplyVehicles, snapshotTime]);

  /* =========================
     Multipliers
  ========================= */
  const getMultiplier = (ratio: number) => {
    if (multiplierData.length === 0) return 1;
    const sorted = [...multiplierData].sort((a, b) => b.minRatio - a.minRatio);
    return sorted.find((m) => ratio >= m.minRatio)?.multiplier ?? sorted.at(-1)!.multiplier;
  };

  /* =========================
     Hexagon aggregation
  ========================= */
  const { activeHexagons } = useMemo(() => {
    const demandMap = new Map<string, number>();
    const supplyMap = new Map<string, number>();
    const all = new Set<string>();

    filteredDemand.forEach((e) => {
      const h = latLngToCell(e.latitude, e.longitude, hexagonResolution);
      demandMap.set(h, (demandMap.get(h) || 0) + 1);
      all.add(h);
    });

    availableSupply.forEach((v) => {
      const h = latLngToCell(v.latitude, v.longitude, hexagonResolution);
      supplyMap.set(h, (supplyMap.get(h) || 0) + 1);
      all.add(h);
    });

    const hexes: HexagonData[] = [];

    all.forEach((hexId) => {
      const demand = demandMap.get(hexId) || 0;
      const supply = supplyMap.get(hexId) || 0;
      const [lat, lng] = cellToLatLng(hexId);

      let ratio = 0;
      let finalPrice: number | undefined;

      if (demandMap.size > 0 && supplyMap.size > 0) {
        ratio = computeLogRatio(demand, supply);
        if (multiplierData.length > 0 && basePrice > 0) {
          finalPrice = getMultiplier(ratio) * basePrice;
        }
      } else if (demandMap.size > 0) {
        ratio = demand;
      } else if (supplyMap.size > 0) {
        ratio = supply;
      }

      hexes.push({
        hexId,
        ratio,
        center: [lng, lat],
        sumDemand: demand,
        sumSupply: supply,
        finalPrice,
      });
    });

    return { activeHexagons: hexes };
  }, [
    filteredDemand,
    availableSupply,
    multiplierData,
    basePrice,
    hexagonResolution,
  ]);

  /* =========================
     ✅ SAFE label calculation
     (no render-loop)
  ========================= */
  useEffect(() => {
    const viewport = new WebMercatorViewport({
      longitude: viewState.longitude,
      latitude: viewState.latitude,
      zoom: viewState.zoom,
      pitch: viewState.pitch,
      bearing: viewState.bearing,
      width: window.innerWidth,
      height: window.innerHeight,
    });

    setLabelPositions(
      activeHexagons.map((hex) => {
        const [x, y] = viewport.project(hex.center);
        const displayValue =
          hex.finalPrice !== undefined
            ? `$${hex.finalPrice.toFixed(2)}`
            : hex.ratio.toFixed(2);
        return { x, y, displayValue };
      })
    );
  }, [activeHexagons, viewState, basePrice, multiplierData]);

  /* =========================
     Layers
  ========================= */
  const layers = useMemo(() => {
    const hexLayer = new H3HexagonLayer<HexagonData>({
      id: "hex-layer",
      data: activeHexagons,
      pickable: true,
      filled: true,
      extruded: true,
      getHexagon: (d) => d.hexId,
      getFillColor: (d) => getColorFromRatio(d.ratio),
      getElevation: (d) => d.ratio * 100,
    });

    const tileLayer = showMap
      ? new TileLayer({
          id: "tile",
          data: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
          tileSize: 256,
          renderSubLayers: (props: any) => {
            const {
              bbox: { west, south, east, north },
            } = props.tile;
            return new BitmapLayer(props, {
              image: `https://c.tile.openstreetmap.org/${props.tile.z}/${props.tile.x}/${props.tile.y}.png`,
              bounds: [west, south, east, north],
            });
          },
        })
      : null;

    return tileLayer ? [tileLayer, hexLayer] : [hexLayer];
  }, [activeHexagons, getColorFromRatio, showMap]);

  return (
    <div className="relative w-full h-full bg-gray-900 text-white">
      <DeckGL
        ref={deckRef}
        initialViewState={viewState}
        controller
        layers={layers}
        onViewStateChange={({ viewState }) => setViewState(viewState as MapViewState)}
      />

      {/* Labels */}
      <div className="absolute inset-0 pointer-events-none">
        {labelPositions.map((p, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: p.x,
              top: p.y,
              transform: "translate(-50%, -50%)",
              fontWeight: "bold",
              textShadow: "0 0 5px black",
            }}
          >
            {p.displayValue}
          </div>
        ))}
      </div>
    </div>
  );
}
