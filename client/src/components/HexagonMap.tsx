import { H3HexagonLayer } from "@deck.gl/geo-layers";
import { TileLayer } from "@deck.gl/geo-layers";
import { BitmapLayer } from "@deck.gl/layers";
import DeckGL from "@deck.gl/react";
import { WebMercatorViewport } from "@deck.gl/core";
import { cellToLatLng, latLngToCell, gridDisk } from "h3-js";
import { useCallback, useEffect, useMemo, useState } from "react";

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

interface HexagonData {
  hexId: string;
  ratio: number;
  center: [number, number];
  sumDemand?: number;
  sumSupply?: number;
  finalPrice?: number;
}

interface LabelPosition {
  x: number;
  y: number;
  displayValue: string;
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
  showMap: boolean;
  hexagonResolution: number;
}

export default function HexagonMap({
  // ✅ harden against undefined props in prod builds
  demandEvents = [],
  supplyVehicles = [],
  multiplierData = [],
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

  // Track viewport size to re-project labels on resize (no render loop)
  const [viewportSize, setViewportSize] = useState<{ width: number; height: number }>({
    width: typeof window !== "undefined" ? window.innerWidth : 1200,
    height: typeof window !== "undefined" ? window.innerHeight : 800,
  });

  useEffect(() => {
    const onResize = () => setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ✅ Java logic translated to TS + your required special-case behavior for supply=0
  const computeLogRatio = useCallback((journeys: number, vehicles: number): number => {
    if (vehicles === 0) return journeys > 0 ? 1 : 0;

    const logJourneys = Math.log(journeys + 1);
    const logVehicles = Math.log(vehicles + 1);

    // if logVehicles == 0 => would be Infinity; but for vehicles>0 it won't happen.
    // still keep it safe + aligned with your previous special-case intent.
    return logVehicles === 0 ? 1 : logJourneys / logVehicles;
  }, []);

  const filteredDemand = useMemo(() => {
    const windowStart = new Date(snapshotTime.getTime() - timeframeMinutes * 60 * 1000);
    return demandEvents.filter((event) => {
      const eventTime = new Date(event.timestamp);
      return eventTime >= windowStart && eventTime <= snapshotTime;
    });
  }, [demandEvents, snapshotTime, timeframeMinutes]);

  const availableSupply = useMemo(() => {
    return supplyVehicles.filter((vehicle) => {
      const startTime = new Date(vehicle.startTime);
      const endTime = new Date(vehicle.endTime);
      return snapshotTime >= startTime && snapshotTime <= endTime;
    });
  }, [supplyVehicles, snapshotTime]);

  const isSnapshotValid = useMemo(() => {
    if (!snapshotRange) return true;
    const t = snapshotTime.getTime();
    return t >= snapshotRange.minTime.getTime() && t <= snapshotRange.maxTime.getTime();
  }, [snapshotTime, snapshotRange]);

  const getMultiplier = useCallback(
    (ratio: number): number => {
      if (multiplierData.length === 0) return 1;
      const sorted = [...multiplierData].sort((a, b) => b.minRatio - a.minRatio);

      for (const entry of sorted) {
        if (ratio >= entry.minRatio) return entry.multiplier;
      }
      return sorted[sorted.length - 1].multiplier;
    },
    [multiplierData]
  );

  const { activeHexagons, inactiveHexagons } = useMemo(() => {
    const demandMap = new Map<string, number>();
    const supplyMap = new Map<string, number>();
    const allHexIds = new Set<string>();

    filteredDemand.forEach((event) => {
      const hexId = latLngToCell(event.latitude, event.longitude, hexagonResolution);
      demandMap.set(hexId, (demandMap.get(hexId) || 0) + 1);
      allHexIds.add(hexId);
    });

    availableSupply.forEach((vehicle) => {
      const hexId = latLngToCell(vehicle.latitude, vehicle.longitude, hexagonResolution);
      supplyMap.set(hexId, (supplyMap.get(hexId) || 0) + 1);
      allHexIds.add(hexId);
    });

    // also render a 1-ring of neighbors as "inactive"
    const inactiveSet = new Set<string>();
    allHexIds.forEach((hexId) => {
      try {
        const neighbors = gridDisk(hexId, 1);
        neighbors.forEach((n) => {
          if (!allHexIds.has(n)) inactiveSet.add(n);
        });
      } catch {
        // ignore
      }
    });

    const inactive = Array.from(inactiveSet).map((hexId) => {
      const [lat, lng] = cellToLatLng(hexId);
      return { hexId, ratio: 0, center: [lng, lat] as [number, number] };
    });

    const hasDemandFile = demandEvents.length > 0;
    const hasSupplyFile = supplyVehicles.length > 0;
    const hasBothFiles = hasDemandFile && hasSupplyFile;
    const hasDemandOnly = hasDemandFile && !hasSupplyFile;

    const active: HexagonData[] = [];

    allHexIds.forEach((hexId) => {
      const demand = demandMap.get(hexId) || 0;
      const supply = supplyMap.get(hexId) || 0;
      const [lat, lng] = cellToLatLng(hexId);

      let ratio = 0;
      let finalPrice: number | undefined;

      if (hasBothFiles) {
        // ✅ log-normalised ratio with supply=0 special cases
        ratio = computeLogRatio(demand, supply);

        if (multiplierData.length > 0 && basePrice > 0) {
          finalPrice = getMultiplier(ratio) * basePrice;
        }
      } else if (hasDemandOnly) {
        ratio = demand; // unchanged behavior when only demand is present
      } else {
        ratio = 0;
      }

      active.push({
        hexId,
        ratio,
        center: [lng, lat],
        sumDemand: demand,
        sumSupply: supply,
        finalPrice,
      });
    });

    return { activeHexagons: active, inactiveHexagons: inactive };
  }, [
    filteredDemand,
    availableSupply,
    demandEvents.length,
    supplyVehicles.length,
    hexagonResolution,
    computeLogRatio,
    multiplierData.length,
    basePrice,
    getMultiplier,
  ]);

  const getFillColor = useCallback((ratio: number): [number, number, number] => {
    const clamped = Math.max(0, Math.min(1, ratio));
    const r = Math.round(255 * clamped);
    const g = Math.round(255 * (1 - clamped));
    return [r, g, 0];
  }, []);

  const layers = useMemo(() => {
    const hexagonLayer = new H3HexagonLayer<HexagonData>({
      id: "h3-hexagon-layer",
      data: activeHexagons,
      pickable: true,
      wireframe: true,
      filled: true,
      getHexagon: (d) => d.hexId,
      getFillColor: (d) => getFillColor(d.ratio),
      getElevation: (d) => (Number.isFinite(d.ratio) ? d.ratio * 100 : 0),
      elevationScale: 1,
      extruded: true,
      opacity: 0.8,
      material: true,
    });

    const tileLayer = showMap
      ? new TileLayer({
          id: "tile-layer",
          data: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
          minZoom: 0,
          maxZoom: 19,
          tileSize: 256,
          renderSubLayers: (props: any) => {
            const {
              bbox: { west, south, east, north },
            } = props.tile;

            return new BitmapLayer(props, {
              data: null,
              image: `https://c.tile.openstreetmap.org/${props.tile.z}/${props.tile.x}/${props.tile.y}.png`,
              bounds: [west, south, east, north],
            });
          },
        })
      : null;

    return tileLayer ? [tileLayer, hexagonLayer] : [hexagonLayer];
  }, [activeHexagons, getFillColor, showMap]);

  // ✅ Labels are derived data now (no setState in onAfterRender => no React #185 loop)
  const labelPositions = useMemo<LabelPosition[]>(() => {
    if (activeHexagons.length === 0) return [];

    const viewport = new WebMercatorViewport({
      longitude: viewState.longitude,
      latitude: viewState.latitude,
      zoom: viewState.zoom,
      pitch: viewState.pitch,
      bearing: viewState.bearing,
      width: viewportSize.width,
      height: viewportSize.height,
    });

    return activeHexagons.map((hex) => {
      const [x, y] = viewport.project(hex.center);
      const displayValue =
        multiplierData.length > 0 && basePrice > 0 && hex.finalPrice !== undefined
          ? `${hex.finalPrice.toFixed(2)}`
          : Number.isFinite(hex.ratio)
            ? hex.ratio.toFixed(2)
            : "∞";

      return { x, y, displayValue };
    });
  }, [activeHexagons, viewState, viewportSize, multiplierData.length, basePrice]);

  if (!isSnapshotValid) {
    return (
      <div className="relative w-full h-full">
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-80">
          <p className="text-white text-lg">
            Snapshot time is outside the range of available data. Please adjust the time range.
          </p>
        </div>
        <DeckGL initialViewState={viewState} controller={true} layers={[]} />
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-gray-900 text-white">
      <DeckGL
        initialViewState={viewState}
        controller={true}
        layers={layers}
        onViewStateChange={({ viewState: newViewState }) =>
          setViewState(newViewState as MapViewState)
        }
        style={{ position: "relative" }}
      />

      {/* Label overlay */}
      <div className="absolute inset-0 pointer-events-none">
        {labelPositions.map((pos, i) => (
          <div
            key={i}
            className="absolute"
            style={{
              left: `${pos.x}px`,
              top: `${pos.y}px`,
              transform: "translate(-50%, -50%)",
              color: "white",
              textShadow: "0 0 5px rgba(0,0,0,0.8)",
              fontWeight: "bold",
              whiteSpace: "nowrap",
            }}
          >
            {pos.displayValue}
          </div>
        ))}
      </div>

      {activeHexagons.length === 0 && inactiveHexagons.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-800 text-gray-400">
          Upload demand and supply files to get started
        </div>
      )}
    </div>
  );
}
