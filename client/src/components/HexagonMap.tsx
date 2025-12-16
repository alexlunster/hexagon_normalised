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
  minRatio?: number;
  maxRatio?: number;
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

// Log-normalized demand/supply ratio.
// Mirrors:
//   log(journeys + 1) / log(vehicles + 1)
function computeLogRatio(journeys: number, vehicles: number): number {
  const logJourneys = Math.log(journeys + 1); // +1 to avoid log(0)
  const logVehicles = Math.log(vehicles + 1);
  return logVehicles === 0 ? Infinity : logJourneys / logVehicles;
}

export default function HexagonMap({
  demandEvents,
  supplyVehicles,
  multiplierData,
  basePrice,
  snapshotTime,
  snapshotRange,
  timeframeMinutes,
  showDemandVsSupply,
  heatmap,
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

  // Use custom heatmap if provided, otherwise use the default
  const colorScale = useMemo(() => {
    const heatmapToUse = heatmap.length > 0 ? heatmap : [
      { ratio: 0, color: [0, 0, 255] as [number, number, number] },
      { ratio: 0.5, color: [0, 255, 0] as [number, number, number] },
      { ratio: 1, color: [255, 0, 0] as [number, number, number] },
    ];
    return heatmapToUse.sort((a, b) => a.ratio - b.ratio);
  }, [heatmap]);

  const getColorFromRatio = useCallback(
    (ratio: number): [number, number, number] => {
      if (Number.isNaN(ratio) || !isFinite(ratio)) {
        return [200, 200, 200];
      }

      const clampedRatio = Math.max(0, Math.min(1, ratio));

      // If only one color is defined, return it
      if (colorScale.length === 1) {
        return colorScale[0].color;
      }

      // Find the two colors between which our ratio lies
      for (let i = 0; i < colorScale.length - 1; i++) {
        const start = colorScale[i];
        const end = colorScale[i + 1];

        if (clampedRatio >= start.ratio && clampedRatio <= end.ratio) {
          const range = end.ratio - start.ratio || 1; // Avoid division by zero
          const t = (clampedRatio - start.ratio) / range;

          // Linear interpolation between start.color and end.color
          const interpolatedColor: [number, number, number] = [
            Math.round(start.color[0] + (end.color[0] - start.color[0]) * t),
            Math.round(start.color[1] + (end.color[1] - start.color[1]) * t),
            Math.round(start.color[2] + (end.color[2] - start.color[2]) * t),
          ];

          return interpolatedColor;
        }
      }

      // If ratio is outside the defined range, clamp to the nearest color
      if (clampedRatio <= colorScale[0].ratio) {
        return colorScale[0].color;
      }
      return colorScale[colorScale.length - 1].color;
    },
    [colorScale]
  );

  // Calculate time range based on demand events and supply vehicles
  const calculatedTimeRange = useMemo<SnapshotRange | null>(() => {
    const times: number[] = [];

    demandEvents.forEach((event) => times.push(new Date(event.timestamp).getTime()));
    supplyVehicles.forEach((vehicle) => {
      times.push(new Date(vehicle.startTime).getTime());
      times.push(new Date(vehicle.endTime).getTime());
    });

    if (times.length === 0) return null;

    return {
      minTime: new Date(Math.min(...times)),
      maxTime: new Date(Math.max(...times)),
    };
  }, [demandEvents, supplyVehicles]);

  const isTimeInRange = useCallback(
    (time: Date) => {
      if (!snapshotRange) return true;
      const timeValue = time.getTime();
      return timeValue >= snapshotRange.minTime.getTime() && timeValue <= snapshotRange.maxTime.getTime();
    },
    [snapshotRange]
  );

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

  // Ensure snapshot time is within the calculated or provided range
  const isSnapshotValid = useMemo(() => {
    const range = snapshotRange || calculatedTimeRange;
    if (!range) return true;
    return isTimeInRange(snapshotTime);
  }, [snapshotTime, snapshotRange, calculatedTimeRange, isTimeInRange]);

  // Get multiplier for a given ratio based on precise ratio
  const getMultiplier = (ratio: number): number => {
    if (multiplierData.length === 0) return 1;

    // Sort by minRatio descending (should already be sorted, but ensure it)
    const sorted = [...multiplierData].sort((a, b) => b.minRatio - a.minRatio);

    for (const entry of sorted) {
      if (ratio >= entry.minRatio) {
        return entry.multiplier;
      }
    }

    // If ratio is below all defined thresholds, return the last multiplier
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

    // Peek into nearby empty hexagons around active ones
    const MAX_NEIGHBORS = 1;
    const inactiveSet = new Set<string>();

    allHexIds.forEach((hexId) => {
      try {
        const neighbors = gridDisk(hexId, MAX_NEIGHBORS);
        neighbors.forEach((neighborId) => {
          if (
            !allHexIds.has(neighborId) &&
            !inactiveSet.has(neighborId) &&
            demandMap.get(neighborId) === undefined &&
            supplyMap.get(neighborId) === undefined
          ) {
            inactiveSet.add(neighborId);
          }
        });
      } catch (e) {
        // Skip if gridDisk fails
      }
    });

    // Create inactive hexagon data
    const inactive = Array.from(inactiveSet).map((hexId) => {
      const [lat, lng] = cellToLatLng(hexId);
      return {
        hexId,
        ratio: 0,
        center: [lng, lat] as [number, number],
      };
    });

    const hexMap = new Map<string, HexagonData>();

    allHexIds.forEach((hexId) => {
      const [lat, lng] = cellToLatLng(hexId);
      const demand = demandMap.get(hexId) || 0;
      const supply = supplyMap.get(hexId) || 0;

      // Calculate ratio based on available data
      let ratio: number;
      let finalPrice: number = 0;

      const hasBothData = demandMap.size > 0 && supplyMap.size > 0;
      const hasDemandOnly = demandMap.size > 0 && supplyMap.size === 0;
      const hasSupplyOnly = supplyMap.size > 0 && demandMap.size === 0;
      const hasMultiplier = multiplierData.length > 0;

      if (hasBothData) {
        // Show coefficient (log-normalised demand / log-normalised supply) when both files are uploaded
        if (supply === 0) {
          // required special-case behavior
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
        // Show sum of demand events
        ratio = demand;
      } else if (hasSupplyOnly) {
        // Show sum of supply vehicles
        ratio = supply;
      } else {
        ratio = 0;
      }

      hexMap.set(hexId, {
        hexId,
        ratio,
        center: [lng, lat],
        sumDemand: demand,
        sumSupply: supply,
        finalPrice: hasBothData && hasMultiplier ? finalPrice : undefined,
      });
    });

    // Ensure all inactive hexagons are included
    inactive.forEach((hex) => {
      if (!hexMap.has(hex.hexId)) {
        hexMap.set(hex.hexId, hex);
      }
    });

    const activeHexes: HexagonData[] = Array.from(hexMap.values());

    return {
      activeHexagons: activeHexes,
      inactiveHexagons: inactive,
    };
  }, [
    filteredDemand,
    availableSupply,
    multiplierData,
    basePrice,
    timeframeMinutes,
    showDemandVsSupply,
    hexagonResolution,
  ]);

  // Calculate dynamic font size based on zoom level
  const getFontSize = (zoom: number) => {
    const baseZoom = 12;
    const baseFontSize = 28;
    const minFontSize = 8;
    const maxFontSize = 28;

    const scale = Math.pow(2, (zoom - baseZoom) * 0.5);
    const fontSize = baseFontSize * scale;
    return Math.max(minFontSize, Math.min(maxFontSize, fontSize));
  };

  // Convert hexagon centers to screen coordinates
  const hexagonCenters = useMemo(() => {
    const viewport = new WebMercatorViewport({
      longitude: viewState.longitude,
      latitude: viewState.latitude,
      zoom: viewState.zoom,
      pitch: viewState.pitch,
      bearing: viewState.bearing,
      width: window.innerWidth,
      height: window.innerHeight,
    });

    return activeHexagons.map((hex) => {
      const [x, y] = viewport.project(hex.center);
      const displayValue =
        hex.finalPrice && hex.finalPrice > 0 && basePrice > 0 && multiplierData.length > 0
          ? `$${hex.finalPrice.toFixed(2)}`
          : hex.ratio.toFixed(2);

      return {
        x,
        y,
        displayValue,
      };
    });
  }, [activeHexagons, viewState, multiplierData, basePrice]);

  const deckRef = useRef<any>(null);

  // Update label positions once the map is rendered
  const handleAfterRender = () => {
    const viewState = deckRef.current?.deck?.viewState;
    if (!viewState) return;

    const viewport = new WebMercatorViewport({
      longitude: viewState.longitude,
      latitude: viewState.latitude,
      zoom: viewState.zoom,
      pitch: viewState.pitch,
      bearing: viewState.bearing,
      width: window.innerWidth,
      height: window.innerHeight,
    });

    const positions = activeHexagons.map((hex) => {
      const [x, y] = viewport.project(hex.center);
      const displayValue =
        hex.finalPrice && hex.finalPrice > 0 && basePrice > 0 && multiplierData.length > 0
          ? `$${hex.finalPrice.toFixed(2)}`
          : hex.ratio.toFixed(2);

      return {
        x,
        y,
        displayValue,
      };
    });

    setLabelPositions(positions);
  };

  useEffect(() => {
    const updateSize = () => {
      if (deckRef.current) {
        deckRef.current.deck.setProps({
          width: window.innerWidth,
          height: window.innerHeight,
        });
      }
    };

    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  const layers = useMemo(() => {
    const hexagonLayer = new H3HexagonLayer<HexagonData>({
      id: "h3-hexagon-layer",
      data: activeHexagons,
      pickable: true,
      wireframe: true,
      filled: true,
      getHexagon: (d) => d.hexId,
      getFillColor: (d) => {
        return getColorFromRatio(d.ratio);
      },
      getElevation: (d) => {
        // Higher elevation for higher ratio
        if (!Number.isFinite(d.ratio)) return 0;
        if (multiplierData.length > 0 && basePrice > 0 && d.finalPrice && d.finalPrice > 0) {
          return d.finalPrice * 10;
        }
        return d.ratio * 100;
      },
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
  }, [activeHexagons, getColorFromRatio, multiplierData, basePrice, showMap]);

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
          onAfterRender={handleAfterRender}
        />
      </div>
    );
  }

  const fontSize = getFontSize(viewState.zoom);

  return (
    <div className="relative w-full h-full bg-gray-900 text-white">
      <DeckGL
        ref={deckRef}
        initialViewState={viewState}
        controller={true}
        layers={layers}
        onViewStateChange={({ viewState: newViewState }) => setViewState(newViewState as MapViewState)}
        onAfterRender={handleAfterRender}
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
              fontSize: `${fontSize}px`,
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

      {activeHexagons.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-800 text-gray-400">
          Upload demand and supply files to get started
        </div>
      )}
    </div>
  );
}
