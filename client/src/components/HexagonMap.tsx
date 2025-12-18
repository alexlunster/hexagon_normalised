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
  timeframeMinutes: number;
  hexagonResolution: number;
  normalizationEnabled: boolean;
}

interface LabelPosition {
  x: number;
  y: number;
  value: string;
}

export default function HexagonMap({
  demandEvents,
  supplyVehicles,
  multiplierData,
  basePrice,
  snapshotTime,
  timeframeMinutes,
  hexagonResolution,
  normalizationEnabled,
}: HexagonMapProps) {
  const [labelPositions, setLabelPositions] = useState<LabelPosition[]>([]);
  const prevPositionsRef = useRef<string>("");
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({
    width: 800,
    height: 600,
  });

  const [viewState, setViewState] = useState<MapViewState>({
    longitude: -74.006,
    latitude: 40.7128,
    zoom: 11,
    pitch: 0,
    bearing: 0,
  });

  // Resize observer for container
  useEffect(() => {
    if (!containerRef.current) return;

    const updateSize = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) setContainerSize({ width: rect.width, height: rect.height });
    };

    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(containerRef.current);

    return () => ro.disconnect();
  }, []);

  // Filter demand events based on snapshot time and timeframe window
  const filteredDemand = useMemo(() => {
    const windowStart = new Date(
      snapshotTime.getTime() - timeframeMinutes * 60 * 1000
    );
    return demandEvents.filter((event) => {
      const eventTime = new Date(event.timestamp);
      return eventTime >= windowStart && eventTime <= snapshotTime;
    });
  }, [demandEvents, snapshotTime, timeframeMinutes]);

  // Filter supply vehicles available at snapshot time (no timeframe window)
  const availableSupply = useMemo(() => {
    return supplyVehicles.filter((vehicle) => {
      return vehicle.startTime <= snapshotTime && vehicle.endTime >= snapshotTime;
    });
  }, [supplyVehicles, snapshotTime]);

  // Compute log ratio with normalization
  const computeLogRatio = useCallback(
    (journeys: number, vehicles: number): number => {
      if (vehicles === 0) {
        return journeys > 0 ? 1 : 0.0;
      }

      const logJourneys = Math.log(journeys + 1); // Add 1 to avoid log(0)
      const logVehicles = Math.log(vehicles + 1);

      return logJourneys / logVehicles;
    },
    []
  );

  // Compute raw ratio (no normalization)
  const computeRawRatio = useCallback(
    (journeys: number, vehicles: number): number => {
      if (vehicles === 0) {
        return journeys > 0 ? Infinity : 0;
      }
      return journeys / vehicles;
    },
    []
  );

  // Choose which ratio function to use based on toggle
  const computeRatio = useCallback(
    (journeys: number, vehicles: number): number => {
      return normalizationEnabled
        ? computeLogRatio(journeys, vehicles)
        : computeRawRatio(journeys, vehicles);
    },
    [normalizationEnabled, computeLogRatio, computeRawRatio]
  );

  // Get multiplier from ratio
  const getMultiplier = (ratio: number): number => {
    if (multiplierData.length === 0) return 1;

    // Sort by minRatio descending (should already be sorted, but ensure it)
    const sorted = [...multiplierData].sort((a, b) => b.minRatio - a.minRatio);

    for (const entry of sorted) {
      if (ratio >= entry.minRatio) {
        return entry.multiplier;
      }
    }

    // If ratio is below all thresholds, return the last (lowest) multiplier
    return sorted[sorted.length - 1]?.multiplier || 1;
  };

  // Aggregate demand and supply into hexagons and calculate ratios
  const { activeHexagons, inactiveHexagons } = useMemo(() => {
    const demandMap = new Map<string, number>();
    const supplyMap = new Map<string, number>();

    // Aggregate demand
    filteredDemand.forEach((event) => {
      const hexId = latLngToCell(event.latitude, event.longitude, hexagonResolution);
      demandMap.set(hexId, (demandMap.get(hexId) || 0) + 1);
    });

    // Aggregate supply
    availableSupply.forEach((vehicle) => {
      const hexId = latLngToCell(vehicle.latitude, vehicle.longitude, hexagonResolution);
      supplyMap.set(hexId, (supplyMap.get(hexId) || 0) + 1);
    });

    // Get all hex IDs that have either demand or supply
    const allHexIds = new Set<string>();
    demandMap.forEach((_, hexId) => allHexIds.add(hexId));
    supplyMap.forEach((_, hexId) => allHexIds.add(hexId));

    // Calculate ratios for hexagons with data
    const hexMap = new Map<
      string,
      {
        hexId: string;
        ratio: number;
        center: [number, number];
        demand: number;
        supply: number;
        finalPrice: number;
      }
    >();

    allHexIds.forEach((hexId) => {
      const demand = demandMap.get(hexId) || 0;
      const supply = supplyMap.get(hexId) || 0;

      // Calculate ratio based on available data
      let ratio: number;
      let finalPrice: number = 0;
      const hasBothData = demandMap.size > 0 && supplyMap.size > 0;
      const hasDemandOnly = demandMap.size > 0 && supplyMap.size === 0;

      if (hasBothData) {
        // Use selected ratio calculation (normalized vs raw)
        ratio = computeRatio(demand, supply);

        // Calculate final price if multiplier data is available
        if (multiplierData.length > 0 && basePrice > 0) {
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
          if (!activeHexIds.has(neighborId)) {
            inactiveSet.add(neighborId);
          }
        });
      } catch (e) {
        // ignore
      }
    });

    const inactive = Array.from(inactiveSet).map((hexId) => {
      const [lat, lng] = cellToLatLng(hexId);
      return {
        hexId,
        ratio: 0,
        center: [lng, lat] as [number, number],
        demand: 0,
        supply: 0,
        finalPrice: 0,
      };
    });

    const active = Array.from(hexMap.values());
    console.log(
      "Created",
      active.length,
      "active hexagons from",
      filteredDemand.length,
      "demand and",
      availableSupply.length,
      "supply"
    );

    return { activeHexagons: active, inactiveHexagons: inactive };
  }, [
    filteredDemand,
    availableSupply,
    hexagonResolution,
    multiplierData,
    basePrice,
    computeRatio,
  ]);

  // Auto-center map on first data load
  useEffect(() => {
    if (
      (filteredDemand.length > 0 || availableSupply.length > 0) &&
      viewState.zoom === 11
    ) {
      const allPoints = [
        ...filteredDemand.map((e) => ({ lat: e.latitude, lng: e.longitude })),
        ...availableSupply.map((v) => ({ lat: v.latitude, lng: v.longitude })),
      ];

      if (allPoints.length > 0) {
        const avgLat =
          allPoints.reduce((sum, p) => sum + p.lat, 0) / allPoints.length;
        const avgLng =
          allPoints.reduce((sum, p) => sum + p.lng, 0) / allPoints.length;

        setViewState((prev) => ({
          ...prev,
          latitude: avgLat,
          longitude: avgLng,
        }));
      }
    }
  }, [filteredDemand, availableSupply, viewState.zoom]);

  const layers = useMemo(() => {
    const hasDemand = demandEvents.length > 0;
    const hasSupply = supplyVehicles.length > 0;
    const hasBoth = hasDemand && hasSupply;
    const hasMultiplier = multiplierData.length > 0;

    const getColor = (hex: any): [number, number, number, number] => {
      if (!hasBoth) {
        // Demand-only mode: color based on demand count
        if (hex.ratio === 0) return [0, 0, 0, 0];
        const intensity = Math.min(255, 40 + hex.ratio * 20);
        return [intensity, 80, 80, 180];
      }

      // Both data: color based on ratio intensity (normalized or raw)
      const r = hex.ratio;
      if (r === 0) return [0, 0, 0, 0];

      // For raw ratio, cap for coloring so it doesn't explode visually
      const capped = r === Infinity ? 10 : Math.min(r, 10);
      const intensity = Math.min(255, 40 + capped * 20);

      // If multiplier is present and base price is set, emphasize by multiplier bucket
      if (hasMultiplier && basePrice > 0) {
        const mult = getMultiplier(r);
        const mCapped = Math.min(mult, 5);
        const green = Math.min(255, 60 + mCapped * 35);
        return [80, green, 120, 200];
      }

      return [intensity, 120, 80, 190];
    };

    const activeLayer = new H3HexagonLayer({
      id: "active-hexagons",
      data: activeHexagons,
      pickable: true,
      stroked: true,
      filled: true,
      extruded: false,
      getHexagon: (d: any) => d.hexId,
      getFillColor: (d: any) => getColor(d),
      getLineColor: [255, 255, 255, 80],
      lineWidthMinPixels: 1,
      lineWidthMaxPixels: 3,
      onHover: (info: any) => {
        // No-op; you can add tooltip later if needed
      },
    });

    const inactiveLayer = new H3HexagonLayer({
      id: "inactive-hexagons",
      data: inactiveHexagons,
      pickable: false,
      stroked: true,
      filled: true,
      extruded: false,
      getHexagon: (d: any) => d.hexId,
      getFillColor: [0, 0, 0, 0],
      getLineColor: [255, 255, 255, 30],
      lineWidthMinPixels: 1,
      lineWidthMaxPixels: 2,
    });

    // Optional: map tiles background
    const tileLayer = new TileLayer({
      id: "tile-layer",
      data: "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
      minZoom: 0,
      maxZoom: 19,
      tileSize: 256,
      renderSubLayers: (props: any) => {
        const {
          bbox: { west, south, east, north },
        } = props.tile;

        return new BitmapLayer(props, {
          data: null,
          image: props.data,
          bounds: [west, south, east, north],
        });
      },
    });

    return [tileLayer, inactiveLayer, activeLayer];
  }, [activeHexagons, inactiveHexagons, demandEvents.length, supplyVehicles.length, multiplierData, basePrice]);

  // Update label positions when viewport changes
  const updateLabels = useCallback(
    (viewport: WebMercatorViewport) => {
      if (!viewport || activeHexagons.length === 0) return;

      const newPositions: LabelPosition[] = [];
      const hasBothData = demandEvents.length > 0 && supplyVehicles.length > 0;
      const hasMultiplier = multiplierData.length > 0;
      const showPrice = hasBothData && hasMultiplier && basePrice > 0;

      activeHexagons.forEach((hex) => {
        const [x, y] = viewport.project([hex.center[0], hex.center[1]]);

        // Only show labels for hexagons visible in viewport
        if (x >= 0 && x <= viewport.width && y >= 0 && y <= viewport.height) {
          let displayValue: string;

          if (showPrice) {
            // Show final price
            displayValue = `$${hex.finalPrice.toFixed(2)}`;
          } else {
            // Show ratio or sum
            displayValue = formatRatio(hex.ratio);
          }

          newPositions.push({
            x,
            y,
            value: displayValue,
          });
        }
      });

      const serialized = JSON.stringify(newPositions);
      if (serialized !== prevPositionsRef.current) {
        prevPositionsRef.current = serialized;
        setLabelPositions(newPositions);
      }
    },
    [
      activeHexagons,
      demandEvents.length,
      supplyVehicles.length,
      multiplierData.length,
      basePrice,
    ]
  );

  const handleAfterRender = useCallback(() => {
    const viewport = new WebMercatorViewport({
      ...viewState,
      width: containerSize.width,
      height: containerSize.height,
    });
    updateLabels(viewport);
  }, [viewState, containerSize, updateLabels]);

  useEffect(() => {
    const viewport = new WebMercatorViewport({
      ...viewState,
      width: containerSize.width,
      height: containerSize.height,
    });
    updateLabels(viewport);
  }, [viewState, containerSize, updateLabels]);

  const formatRatio = (ratio: number) => {
    if (ratio === Infinity) return "∞";
    if (ratio === 0) return "0";
    if (ratio < 0.01) return "<0.01";
    if (ratio < 1) return ratio.toFixed(2);
    if (ratio < 10) return ratio.toFixed(1);
    return Math.round(ratio).toString();
  };

  // Font size scaling based on zoom (simple heuristic)
  const currentFontSize = useMemo(() => {
    const z = viewState.zoom;
    if (z < 10) return 10;
    if (z < 12) return 12;
    if (z < 14) return 14;
    return 16;
  }, [viewState.zoom]);

  return (
    <div ref={containerRef} className="relative flex-1 h-full">
      <DeckGL
        viewState={viewState}
        onViewStateChange={({ viewState: newViewState }) =>
          setViewState(newViewState as MapViewState)
        }
        controller={true}
        layers={layers}
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
              transform: "translate(-50%, -50%)",
              fontSize: `${currentFontSize}px`,
              fontWeight: "bold",
              color: "white",
              textShadow:
                "0 0 4px rgba(0,0,0,0.8), 0 0 8px rgba(0,0,0,0.6)",
              backgroundColor: "rgba(0,0,0,0.5)",
              padding: "2px 6px",
              borderRadius: "4px",
              whiteSpace: "nowrap",
            }}
          >
            {pos.value}
          </div>
        ))}
      </div>
    </div>
  );
}
