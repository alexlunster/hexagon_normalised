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
  normalizationEnabled: boolean; // ✅ added
}

interface LabelPosition {
  x: number;
  y: number;
  ratio: number;
  displayValue: string;
}

export default function HexagonMap({
  demandEvents,
  supplyVehicles,
  multiplierData,
  basePrice,
  snapshotTime,
  timeframeMinutes,
  hexagonResolution,
  normalizationEnabled, // ✅ added
}: HexagonMapProps) {
  const [labelPositions, setLabelPositions] = useState<LabelPosition[]>([]);
  const prevPositionsRef = useRef<string>('');
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });
  
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
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
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

  // Compute z-score normalized ratio (computed across all active hexagons in the current snapshot)
  // NOTE: We keep the toggle + downstream pipeline unchanged by applying z-score to the raw ratio
  // and leaving the rest of the rendering / multiplier logic as-is.
  const computeZScore = useCallback((value: number, mean: number, stdDev: number): number => {
    if (!Number.isFinite(value)) return 0;
    if (!Number.isFinite(mean)) return 0;
    if (!Number.isFinite(stdDev) || stdDev === 0) return 0;
    return (value - mean) / stdDev;
  }, []);

  // ✅ added: raw (non-normalized) ratio
  const computeRawRatio = useCallback((journeys: number, vehicles: number): number => {
    if (vehicles === 0) {
      return journeys > 0 ? 1 : 0;
    }
    return journeys / vehicles;
  }, []);

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

    // Calculate ratios for hexagons with data
    const hexMap = new Map<string, { hexId: string; ratio: number; center: [number, number]; demand: number; supply: number; finalPrice: number }>();

    // Precompute mean/stdDev of the raw ratio across all active hexagons (when both files are present)
    // so that the "normalization" toggle can switch from raw ratio -> z-score.
    const hasBothData = demandMap.size > 0 && supplyMap.size > 0;
    const rawRatioMap = new Map<string, number>();
    let ratioMean = 0;
    let ratioStdDev = 0;

    if (hasBothData) {
      // Welford's algorithm for numerically stable streaming mean/std
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
      
      // Calculate ratio based on available data
      let ratio: number;
      let finalPrice: number = 0;
      const hasDemandOnly = demandMap.size > 0 && supplyMap.size === 0;
      const hasMultiplier = multiplierData.length > 0;
      
      if (hasBothData) {
        // ✅ changed: choose normalized vs raw based on toggle
        // Normalized = z-score of the raw ratio across all active hexagons.
        const raw = rawRatioMap.get(hexId) ?? computeRawRatio(demand, supply);
        ratio = normalizationEnabled ? computeZScore(raw, ratioMean, ratioStdDev) : raw;
        
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
          if (!activeHexIds.has(neighborId)) {
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
        center: [lng, lat],
        demand: 0,
        supply: 0,
        finalPrice: 0,
      };
    });

    const active = Array.from(hexMap.values());
    console.log('Created', active.length, 'active hexagons from', filteredDemand.length, 'demand and', availableSupply.length, 'supply');
    
    return { activeHexagons: active, inactiveHexagons: inactive };
  }, [
    filteredDemand,
    availableSupply,
    hexagonResolution,
    multiplierData,
    basePrice,
    computeRawRatio,
    computeZScore,
    normalizationEnabled, // ✅ added
  ]);

  // Auto-center map on first data load
  useEffect(() => {
    if ((filteredDemand.length > 0 || availableSupply.length > 0) && viewState.zoom === 11) {
      const allPoints = [
        ...filteredDemand.map(e => ({ lat: e.latitude, lng: e.longitude })),
        ...availableSupply.map(v => ({ lat: v.latitude, lng: v.longitude })),
      ];
      
      if (allPoints.length > 0) {
        const lats = allPoints.map(p => p.lat);
        const lngs = allPoints.map(p => p.lng);
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

  // Create layers
  const layers = useMemo(() => {
    const allLayers = [];

    // Add base map tiles
    allLayers.push(
      new TileLayer({
        id: 'tile-layer',
        data: 'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
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

    // Add inactive hexagons (pale gray borders)
    if (inactiveHexagons.length > 0) {
      allLayers.push(
        new H3HexagonLayer({
          id: 'inactive-hexagon-layer',
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

    // Add active hexagons with ratios
    if (activeHexagons.length > 0) {
      allLayers.push(
        new H3HexagonLayer({
          id: 'active-hexagon-layer',
          data: activeHexagons,
          pickable: true,
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
  const updateLabels = useCallback((viewport: WebMercatorViewport) => {
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
        
        newPositions.push
