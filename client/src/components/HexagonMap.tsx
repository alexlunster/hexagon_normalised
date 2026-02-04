import { H3HexagonLayer } from "@deck.gl/geo-layers";
import { TileLayer } from "@deck.gl/geo-layers";
import { BitmapLayer } from "@deck.gl/layers";
import DeckGL from "@deck.gl/react";
import { WebMercatorViewport } from "@deck.gl/core";
import { cellToLatLng, latLngToCell, gridDisk } from "h3-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LoadingOverlay from "@/components/LoadingOverlay";

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

  // what you display
  displayValue: string;

  // ✅ extra data for tooltip
  hexId: string;
  demand: number;
  supply: number;
  ratio: number;
  finalPrice: number;
}

type HoverInfoState = {
  x: number;
  y: number;
  hexId: string;
  demand: number;
  supply: number;
  ratio: number;
  finalPrice: number;
} | null;

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
  const [isCalculating, setIsCalculating] = useState(false);

  const [labelPositions, setLabelPositions] = useState<LabelPosition[]>([]);
  const prevPositionsRef = useRef<string>("");
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });

  // ✅ hover tooltip state (driven by label hover, NOT by hex border)
  const [hoverInfo, setHoverInfo] = useState<HoverInfoState>(null);

  const [viewState, setViewState] = useState<MapViewState>({
    longitude: -74.006,
    latitude: 40.7128,
    zoom: 11,
    pitch: 0,
    bearing: 0,
  });

  // Update container size
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setContainerSize({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };

    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

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
      return vehicle.startTime <= snapshotTime && vehicle.endTime >= snapshotTime;
    });
  }, [supplyVehicles, snapshotTime]);

  type HexCell = {
    hexId: string;
    ratio: number;
    center: [number, number];
    demand: number;
    supply: number;
    finalPrice: number;
  };

  const [{ activeHexagons, inactiveHexagons }, setHexagons] = useState<{
    activeHexagons: HexCell[];
    inactiveHexagons: HexCell[];
  }>({ activeHexagons: [], inactiveHexagons: [] });

  const computeZScore = useCallback((value: number, mean: number, stdDev: number): number => {
    if (!Number.isFinite(value)) return 0;
    if (!Number.isFinite(mean)) return 0;
    if (!Number.isFinite(stdDev) || stdDev === 0) return 0;
    return (value - mean) / stdDev;
  }, []);

  const computeRawRatio = useCallback((journeys: number, vehicles: number): number => {
    if (vehicles === 0) {
      return journeys > 0 ? 1 : 0;
    }
    return journeys / vehicles;
  }, []);

  const getMultiplier = (ratio: number): number => {
    if (multiplierData.length === 0) return 1;
    const sorted = [...multiplierData].sort((a, b) => b.minRatio - a.minRatio);
    for (const entry of sorted) {
      if (ratio >= entry.minRatio) return entry.multiplier;
    }
    return sorted[sorted.length - 1]?.multiplier || 1;
  };

  const formatRatio = (ratio: number) => {
    if (ratio === Infinity) return "∞";
    if (ratio === 0) return "0";
    if (ratio < 0.01 && ratio > 0) return "<0.01";
    if (ratio > -0.01 && ratio < 0) return ">-0.01";
    if (Math.abs(ratio) < 1) return ratio.toFixed(2);
    if (Math.abs(ratio) < 10) return ratio.toFixed(1);
    return Math.round(ratio).toString();
  };

  // Aggregate demand and supply into hexagons and calculate ratios.
  // Done in an effect so we can show a loading overlay BEFORE heavy computation kicks in.
  useEffect(() => {
    setIsCalculating(true);
    setHoverInfo(null);

    const t = setTimeout(() => {
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

      const hexMap = new Map<string, HexCell>();

      const hasBothData = demandMap.size > 0 && supplyMap.size > 0;
      const rawRatioMap = new Map<string, number>();
      let ratioMean = 0;
      let ratioStdDev = 0;

      if (hasBothData) {
        let n = 0;
        let mean = 0;
        let m2 = 0;

        allHexIds.forEach((hexId) => {
          const demand = demandMap.get(hexId) || 0;
          const supply = supplyMap.get(hexId) || 0;
          const raw = computeRawRatio(demand, supply);
          rawRatioMap.set(hexId, raw);

          n += 1;
          const delta = raw - mean;
          mean += delta / n;
          const delta2 = raw - mean;
          m2 += delta * delta2;
        });

        ratioMean = mean;
        ratioStdDev = n > 1 ? Math.sqrt(m2 / (n - 1)) : 0;
      }

      allHexIds.forEach((hexId) => {
        const demand = demandMap.get(hexId) || 0;
        const supply = supplyMap.get(hexId) || 0;

        let ratio = 0;
        let finalPrice = 0;
        const hasDemandOnly = demandMap.size > 0 && supplyMap.size === 0;
        const hasMultiplier = multiplierData.length > 0;

        if (hasBothData) {
          const raw = rawRatioMap.get(hexId) ?? computeRawRatio(demand, supply);
          ratio = normalizationEnabled ? computeZScore(raw, ratioMean, ratioStdDev) : raw;

          if (hasMultiplier && basePrice > 0) {
            const multiplier = getMultiplier(ratio);
            finalPrice = multiplier * basePrice;
          }
        } else if (hasDemandOnly) {
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

      activeHexIds.forEach((hexId) => {
        try {
          const neighbors = gridDisk(hexId, 1);
          neighbors.forEach((neighborId) => {
            if (!activeHexIds.has(neighborId)) inactiveSet.add(neighborId);
          });
        } catch {
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
        } satisfies HexCell;
      });

      setHexagons({ activeHexagons: Array.from(hexMap.values()), inactiveHexagons: inactive });
      setIsCalculating(false);
    }, 0);

    return () => clearTimeout(t);
  }, [
    filteredDemand,
    availableSupply,
    hexagonResolution,
    multiplierData,
    basePrice,
    computeRawRatio,
    computeZScore,
    normalizationEnabled,
  ]);

  // Auto-center map on first data load
  useEffect(() => {
    if ((filteredDemand.length > 0 || availableSupply.length > 0) && viewState.zoom === 11) {
      const allPoints = [
        ...filteredDemand.map((e) => ({ lat: e.latitude, lng: e.longitude })),
        ...availableSupply.map((v) => ({ lat: v.latitude, lng: v.longitude })),
      ];

      if (allPoints.length > 0) {
        const lats = allPoints.map((p) => p.lat);
        const lngs = allPoints.map((p) => p.lng);
        const avgLat = lats.reduce((a, b) => a + b, 0) / lats.length;
        const avgLng = lngs.reduce((a, b) => a + b, 0) / lngs.length;
        setViewState((prev) => ({
          ...prev,
          latitude: avgLat,
          longitude: avgLng,
          zoom: 12,
        }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredDemand.length, availableSupply.length]);

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

  const currentFontSize = getFontSize(viewState.zoom);

  // Create layers (no hover picking needed anymore)
  const layers = useMemo(() => {
    const allLayers: any[] = [];

    allLayers.push(
      new TileLayer({
        id: "tile-layer",
        data: "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        minZoom: 0,
        maxZoom: 19,
        tileSize: 256,
        renderSubLayers: (props: any) => {
          const { bbox } = props.tile;
          return new BitmapLayer(props, {
            data: undefined,
            image: props.data,
            bounds: [bbox.west, bbox.south, bbox.east, bbox.north],
          });
        },
      })
    );

    if (inactiveHexagons.length > 0) {
      allLayers.push(
        new H3HexagonLayer({
          id: "inactive-hexagon-layer",
          data: inactiveHexagons,
          pickable: false,
          wireframe: true,
          filled: false,
          extruded: false,
          getHexagon: (d: any) => d.hexId,
          getFillColor: [0, 0, 0, 0],
          getLineColor: [100, 100, 100, 80],
          lineWidthMinPixels: 1,
        })
      );
    }

    if (activeHexagons.length > 0) {
      allLayers.push(
        new H3HexagonLayer({
          id: "active-hexagon-layer",
          data: activeHexagons,
          pickable: false, // ✅ important: no picking on hex border
          wireframe: true,
          filled: false,
          extruded: false,
          getHexagon: (d: any) => d.hexId,
          getFillColor: [0, 0, 0, 0],
          getLineColor: [0, 255, 255, 200],
          lineWidthMinPixels: 2,
        })
      );
    }

    return allLayers;
  }, [activeHexagons, inactiveHexagons]);

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
        if (x >= 0 && x <= viewport.width && y >= 0 && y <= viewport.height) {
          const displayValue = showPrice ? `$${hex.finalPrice.toFixed(2)}` : formatRatio(hex.ratio);

          newPositions.push({
            x,
            y,
            displayValue,
            hexId: hex.hexId,
            demand: hex.demand,
            supply: hex.supply,
            ratio: hex.ratio,
            finalPrice: hex.finalPrice,
          });
        }
      });

      // only update if positions changed
      const positionsKey = newPositions
        .map((p) => `${Math.round(p.x)},${Math.round(p.y)},${p.displayValue}`)
        .join("|");
      if (positionsKey !== prevPositionsRef.current) {
        setLabelPositions(newPositions);
        prevPositionsRef.current = positionsKey;
      }
    },
    [activeHexagons, demandEvents.length, supplyVehicles.length, multiplierData.length, basePrice]
  );

  const handleAfterRender = useCallback(() => {
    const viewport = new WebMercatorViewport({
      ...viewState,
      width: containerSize.width,
      height: containerSize.height,
    });
    updateLabels(viewport);
  }, [viewState, containerSize, updateLabels]);

  // Tooltip should show price if price is being computed
  const showPriceInTooltip =
    demandEvents.length > 0 && supplyVehicles.length > 0 && multiplierData.length > 0 && basePrice > 0;

  // Helper: set tooltip position based on mouse
  const setHoverFromMouse = (e: React.MouseEvent, label: LabelPosition) => {
    // Use container-local coordinates (stable even if page scrolls)
    const rect = containerRef.current?.getBoundingClientRect();
    const x = rect ? e.clientX - rect.left : label.x;
    const y = rect ? e.clientY - rect.top : label.y;

    setHoverInfo({
      x,
      y,
      hexId: label.hexId,
      demand: label.demand,
      supply: label.supply,
      ratio: label.ratio,
      finalPrice: label.finalPrice,
    });
  };

  return (
    <div ref={containerRef} className="relative flex-1 h-full">
      <LoadingOverlay show={isCalculating} label="Updating map..." />
      <DeckGL
        viewState={viewState}
        onViewStateChange={({ viewState: newViewState }) => setViewState(newViewState as MapViewState)}
        controller={true}
        layers={layers}
        onAfterRender={handleAfterRender}
        style={{ position: "relative" }}
      />

      {/* Label overlay (interactive labels only) */}
      <div className="absolute inset-0 pointer-events-none">
        {labelPositions.map((pos, i) => (
          <div
            key={`${pos.hexId}-${i}`}
            className="absolute pointer-events-auto"
            style={{
              left: `${pos.x}px`,
              top: `${pos.y}px`,
              transform: "translate(-50%, -50%)",
              fontSize: `${currentFontSize}px`,
              fontWeight: "bold",
              color: "white",
              textShadow: "0 0 4px rgba(0,0,0,0.8), 0 0 8px rgba(0,0,0,0.6)",
              backgroundColor: "rgba(0,0,0,0.5)",
              padding: "2px 6px",
              borderRadius: "4px",
              whiteSpace: "nowrap",
              cursor: "default",
            }}
            onMouseEnter={(e) => setHoverFromMouse(e, pos)}
            onMouseMove={(e) => setHoverFromMouse(e, pos)}
            onMouseLeave={() => setHoverInfo(null)}
          >
            {pos.displayValue}
          </div>
        ))}
      </div>

      {/* Hover tooltip (only shown when hovering the label) */}
      {hoverInfo ? (
        <div
          className="absolute pointer-events-none"
          style={{
            left: `${hoverInfo.x + 12}px`,
            top: `${hoverInfo.y + 12}px`,
            background: "rgba(0,0,0,0.80)",
            color: "white",
            padding: "8px 10px",
            borderRadius: "8px",
            border: "1px solid rgba(125, 211, 252, 0.35)",
            boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
            fontSize: "12px",
            lineHeight: 1.3,
            maxWidth: "260px",
            whiteSpace: "nowrap",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Details</div>
          <div>
            Demand: <span style={{ fontWeight: 600 }}>{hoverInfo.demand}</span>
          </div>
          <div>
            Supply: <span style={{ fontWeight: 600 }}>{hoverInfo.supply}</span>
          </div>
          <div>
            Ratio: <span style={{ fontWeight: 600 }}>{formatRatio(hoverInfo.ratio)}</span>
          </div>
          {showPriceInTooltip ? (
            <div>
              Price: <span style={{ fontWeight: 600 }}>${hoverInfo.finalPrice.toFixed(2)}</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {activeHexagons.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-800 text-gray-400">
          Upload demand and supply files to get started
        </div>
      )}
    </div>
  );
}
