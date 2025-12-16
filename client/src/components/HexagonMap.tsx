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
  demand?: number;
  supply?: number;
  finalPrice?: number;
}

interface LabelPosition {
  x: number;
  y: number;
  ratio: number;
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
  // ✅ Default arrays to prevent "undefined.length" crashes in prod builds (Vercel)
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

  const [labelPositions, setLabelPositions] = useState<LabelPosition[]>([]);
  const deckRef = useRef<any>(null);

  // Log-normalized demand/supply ratio.
  // Mirrors:
  //   log(journeys + 1) / log(vehicles + 1)
  // Special rules:
  // - vehicles === 0 && journeys > 0 => 1
  // - vehicles === 0 && journeys === 0 => 0
  const computeLogRatio = (journeys: number, vehicles: number): number => {
    if (vehicles === 0) return journeys > 0 ? 1 : 0;
    if (journeys === 0) return 0;

    const logJourneys = Math.log(journeys + 1);
    const logVehicles = Math.log(vehicles + 1);

    // logVehicles can't be 0 when vehicles > 0, but keep a safe guard.
    return logVehicles === 0 ? 1 : logJourneys / logVehicles;
  };

  // Filter demand events based on snapshot time and timeframe window
  const filteredDemand = useMemo(() => {
    const windowStart = new Date(snapshotTime.getTime() - timeframeMinutes * 60 * 1000);
    return demandEvents.filter((event) => {
      const eventTime = new Date(event.timestamp);
      return eventTime >= windowStart && eventTime <= snapshotTime;
    });
  }, [demandEvents, snapshotTime, timeframeMinutes]);

  // Filter supply vehicles available at snapshot time (no timeframe window)
  const availableSupply = useMemo(() => {
    return supplyVehicles.filter((vehicle) => {
      const startTime = new Date(vehicle.startTime);
      const endTime = new Date(vehicle.endTime);
      return snapshotTime >= startTime && snapshotTime <= endTime;
    });
  }, [supplyVehicles, snapshotTime]);

  // Ensure snapshot time is within the provided range (if any)
  const isSnapshotValid = useMemo(() => {
    if (!snapshotRange) return true;
    const t = snapshotTime.getTime();
    return t >= snapshotRange.minTime.getTime() && t <= snapshotRange.maxTime.getTime();
  }, [snapshotTime, snapshotRange]);

  const getMultiplier = (ratio: number): number => {
    if (multiplierData.length === 0) return 1;

    // Sort by minRatio descending (ensure correct thresholding)
    const sorted = [...multiplierData].sort((a, b) => b.minRatio - a.minRatio);

    for (const entry of sorted) {
      if (ratio >= entry.minRatio) return entry.multiplier;
    }

    // If ratio is below all thresholds, return the last multiplier
    return sorted[sorted.length - 1].multiplier;
  };

  // Aggregate demand and supply into hexagons and calculate ratios
  const { activeHexagons, inactiveHexagons } = useMemo(() => {
    const demandMap = new Map<string, number>();
    const supplyMap = new Map<string, number>();
    const allHexIds = new Set<string>();

    // Count demand events per hexagon
    filteredDemand.forEach((event) => {
      const hexId = latLngToCell(event.latitude, event.longitude, hexagonResolution);
      demandMap.set(hexId, (demandMap.get(hexId) || 0) + 1);
      allHexIds.add(hexId);
    });

    // Count supply vehicles per hexagon
    availableSupply.forEach((vehicle) => {
      const hexId = latLngToCell(vehicle.latitude, vehicle.longitude, hexagonResolution);
      supplyMap.set(hexId, (supplyMap.get(hexId) || 0) + 1);
      allHexIds.add(hexId);
    });

    const hexMap = new Map<string, HexagonData>();

    allHexIds.forEach((hexId) => {
      const demand = demandMap.get(hexId) || 0;
      const supply = supplyMap.get(hexId) || 0;

      // Calculate ratio based on available data
      let ratio: number;
      let finalPrice: number = 0;

      const hasBothData = demandMap.size > 0 && supplyMap.size > 0;
      const hasDemandOnly = demandMap.size > 0 && supplyMap.size === 0;
      const hasMultiplier = multiplierData.length > 0;

      if (hasBothData) {
        // ✅ NEW: log-normalised ratio (with your special supply=0 rules)
        if (supply === 0) {
          ratio = demand > 0 ? 1 : 0;
        } else {
          ratio = computeLogRatio(demand, supply);
        }

        // If multiplier and base price are available, calculate final price
        if (hasMultiplier && basePrice > 0) {
          const multiplier = getMultiplier(ratio);
          finalPrice = multiplier * basePrice;
        }
      } else if (hasDemandOnly) {
        // Show sum of demand events when only demand file is uploaded
        ratio = demand;
      } else {
        ratio = 0;
      }

      const [lat, lng] = cellToLatLng(hexId);
      hexMap.set(hexId, {
        hexId,
        ratio,
        center: [lng, lat],
        demand,
        supply,
        finalPrice,
      });
    });

    const activeHexIds = new Set(hexMap.keys());
    const inactiveSet = new Set<string>();

    // Find all neighboring hexagons (1 ring around each active hexagon)
    activeHexIds.forEach((hexId) => {
      try {
        const neighbors = gridDisk(hexId, 1);
        neighbors.forEach((neighborId) => {
          if (!activeHexIds.has(neighborId)) inactiveSet.add(neighborId);
        });
      } catch (e) {
        // ignore
      }
    });

    const inactive: HexagonData[] = Array.from(inactiveSet).map((hexId) => {
      const [lat, lng] = cellToLatLng(hexId);
      return {
        hexId,
        ratio: 0,
        center: [lng, lat],
      };
    });

    const active = Array.from(hexMap.values());
    return { activeHexagons: active, inactiveHexagons: inactive };
  }, [
    filteredDemand,
    availableSupply,
    hexagonResolution,
    multiplierData,
    basePrice,
    computeLogRatio,
  ]);

  // Auto-center map on first data load
  useEffect(() => {
    const allPoints = [
      ...filteredDemand.map((d) => ({ lat: d.latitude, lng: d.longitude })),
      ...availableSupply.map((s) => ({ lat: s.latitude, lng: s.longitude })),
    ];

    if (allPoints.length === 0) return;

    const lats = allPoints.map((p) => p.lat);
    const lngs = allPoints.map((p) => p.lng);

    const avgLat = lats.reduce((a, b) => a + b, 0) / lats.length;
    const avgLng = lngs.reduce((a, b) => a + b, 0) / lngs.length;

    setViewState((prev) => ({
      ...prev,
      latitude: avgLat,
      longitude: avgLng,
    }));
  }, [filteredDemand, availableSupply]);

  const formatRatio = (ratio: number) => {
    if (ratio === Infinity) return "∞";
    if (ratio === 0) return "0";
    return ratio.toFixed(2);
  };

  // Convert hexagon centers to screen coordinates
  const updateLabels = useCallback(() => {
    const deck = deckRef.current?.deck;
    if (!deck) return;

    const vs = deck.viewState;
    const viewport = new WebMercatorViewport({
      longitude: vs.longitude,
      latitude: vs.latitude,
      zoom: vs.zoom,
      pitch: vs.pitch,
      bearing: vs.bearing,
      width: window.innerWidth,
      height: window.innerHeight,
    });

    const positions = activeHexagons.map((hex) => {
      const [x, y] = viewport.project(hex.center);
      const displayValue =
        multiplierData.length > 0 && basePrice > 0 && hex.finalPrice
          ? `${hex.finalPrice.toFixed(2)}`
          : formatRatio(hex.ratio);

      return { x, y, ratio: hex.ratio, displayValue };
    });

    setLabelPositions(positions);
  }, [activeHexagons, multiplierData.length, basePrice]);

  useEffect(() => {
    updateLabels();
  }, [updateLabels]);

  useEffect(() => {
    const onResize = () => updateLabels();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [updateLabels]);

  const getFillColor = (ratio: number): [number, number, number] => {
    // Simple clamped gradient 0..1 => green..red
    const clamped = Math.max(0, Math.min(1, ratio));
    const r = Math.round(255 * clamped);
    const g = Math.round(255 * (1 - clamped));
    return [r, g, 0];
  };

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
  }, [activeHexagons, showMap]);

  if (!isSnapshotValid) {
    return (
      <div className="relative w-full h-full">
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-80">
          <p className="text-white text-lg">
            Snapshot time is outside the range of available data. Please adjust the time range.
          </p>
        </div>
        <DeckGL
          ref={deckRef}
          initialViewState={viewState}
          controller={true}
          layers={[]}
          style={{ position: "relative" }}
        />
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-gray-900 text-white">
      <DeckGL
        ref={deckRef}
        initialViewState={viewState}
        controller={true}
        layers={layers}
        onViewStateChange={({ viewState: newViewState }) =>
          setViewState(newViewState as MapViewState)
        }
        onAfterRender={updateLabels}
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
