import { useMemo, useState } from "react";
import { latLngToCell } from "h3-js";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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

type DistributionMode = "price" | "coefficient" | "demand" | "supply";

type Props = {
  demandEvents: EventData[];
  supplyVehicles: SupplyData[];
  multiplierData: MultiplierData[];
  basePrice: number;
  timeframeMinutes: number;
  hexagonResolution: number;
  normalizationEnabled: boolean;
  minTime: Date | null;
  maxTime: Date | null;
};

function toDateTimeLocalValue(d: Date) {
  // Convert Date -> 'YYYY-MM-DDTHH:mm' in local time for <input type="datetime-local" />
  const tzOffsetMs = d.getTimezoneOffset() * 60 * 1000;
  return new Date(d.getTime() - tzOffsetMs).toISOString().slice(0, 16);
}

function safeNumber(n: unknown) {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

export default function DistributionView({
  demandEvents,
  supplyVehicles,
  multiplierData,
  basePrice,
  timeframeMinutes,
  hexagonResolution,
  normalizationEnabled,
  minTime,
  maxTime,
}: Props) {
  const hasDemand = demandEvents.length > 0;
  const hasSupply = supplyVehicles.length > 0;
  const hasBoth = hasDemand && hasSupply;
  const hasMultiplier = multiplierData.length > 0;
  const canShowPrice = hasBoth && hasMultiplier && basePrice > 0;

  const computedDefaultRange = useMemo(() => {
    if (!minTime || !maxTime) return null;
    // Default to the full data range.
    return {
      from: minTime,
      to: maxTime,
    };
  }, [minTime, maxTime]);

  const [fromValue, setFromValue] = useState(() => {
    if (!computedDefaultRange) return "";
    return toDateTimeLocalValue(computedDefaultRange.from);
  });

  const [toValue, setToValue] = useState(() => {
    if (!computedDefaultRange) return "";
    return toDateTimeLocalValue(computedDefaultRange.to);
  });

  // Step controls how densely we sample snapshots inside the selected time range.
  const [stepMinutes, setStepMinutes] = useState<number>(15);
  const [bins, setBins] = useState<number>(20);

  const mode: DistributionMode = useMemo(() => {
    if (canShowPrice) return "price";
    if (hasBoth) return "coefficient";
    if (hasDemand) return "demand";
    if (hasSupply) return "supply";
    return "coefficient";
  }, [canShowPrice, hasBoth, hasDemand, hasSupply]);

  const getMultiplier = (ratio: number): number => {
    if (multiplierData.length === 0) return 1;
    // multiplierData is already sorted desc in upload logic, but keep this defensive.
    const sorted = [...multiplierData].sort((a, b) => b.minRatio - a.minRatio);
    for (const entry of sorted) {
      if (ratio >= entry.minRatio) return entry.multiplier;
    }
    return sorted[sorted.length - 1]?.multiplier ?? 1;
  };

  const computeSnapshotValues = (snapshotTime: Date): number[] => {
    const demandMap = new Map<string, number>();
    const supplyMap = new Map<string, number>();
    const allHexIds = new Set<string>();

    // Demand: window is [snapshot - timeframe, snapshot]
    if (hasDemand) {
      const windowStart = new Date(
        snapshotTime.getTime() - timeframeMinutes * 60 * 1000
      );
      for (const e of demandEvents) {
        const t = e.timestamp;
        if (t < windowStart || t > snapshotTime) continue;
        const hexId = latLngToCell(e.latitude, e.longitude, hexagonResolution);
        demandMap.set(hexId, (demandMap.get(hexId) || 0) + 1);
        allHexIds.add(hexId);
      }
    }

    // Supply: vehicle is active if start <= snapshot <= end
    if (hasSupply) {
      for (const v of supplyVehicles) {
        if (v.startTime > snapshotTime || v.endTime < snapshotTime) continue;
        const hexId = latLngToCell(v.latitude, v.longitude, hexagonResolution);
        supplyMap.set(hexId, (supplyMap.get(hexId) || 0) + 1);
        allHexIds.add(hexId);
      }
    }

    if (allHexIds.size === 0) return [];

    // If only one dataset exists, distribution is counts.
    if (!hasBoth) {
      const out: number[] = [];
      allHexIds.forEach((hexId) => {
        const demand = demandMap.get(hexId) || 0;
        const supply = supplyMap.get(hexId) || 0;
        if (mode === "demand") out.push(demand);
        else if (mode === "supply") out.push(supply);
      });
      return out;
    }

    // Both datasets: compute raw ratio per hex
    const rawRatioMap = new Map<string, number>();
    let mean = 0;
    let m2 = 0;
    let n = 0;

    allHexIds.forEach((hexId) => {
      const journeys = demandMap.get(hexId) || 0;
      const vehicles = supplyMap.get(hexId) || 0;
      const raw = vehicles === 0 ? (journeys > 0 ? 1 : 0) : journeys / vehicles;
      rawRatioMap.set(hexId, raw);
      n += 1;
      const delta = raw - mean;
      mean += delta / n;
      const delta2 = raw - mean;
      m2 += delta * delta2;
    });

    const stdDev = n > 1 ? Math.sqrt(m2 / (n - 1)) : 0;

    const out: number[] = [];
    allHexIds.forEach((hexId) => {
      const raw = rawRatioMap.get(hexId) ?? 0;
      const ratio =
        normalizationEnabled && stdDev > 0 ? (raw - mean) / stdDev : raw;

      if (mode === "price") {
        const multiplier = getMultiplier(ratio);
        out.push(multiplier * basePrice);
      } else {
        out.push(ratio);
      }
    });

    return out;
  };

  const { values, effectiveFrom, effectiveTo } = useMemo(() => {
    if (!minTime || !maxTime) {
      return {
        values: [] as number[],
        effectiveFrom: null as Date | null,
        effectiveTo: null as Date | null,
      };
    }

    const parsedFrom = fromValue ? new Date(fromValue) : minTime;
    const parsedTo = toValue ? new Date(toValue) : maxTime;

    const from = new Date(Math.max(minTime.getTime(), parsedFrom.getTime()));
    const to = new Date(Math.min(maxTime.getTime(), parsedTo.getTime()));

    if (from.getTime() > to.getTime()) {
      return { values: [] as number[], effectiveFrom: from, effectiveTo: to };
    }

    const stepMs = Math.max(1, stepMinutes) * 60 * 1000;
    const collected: number[] = [];

    // Always include the range endpoints, then fill the middle by step.
    const times: number[] = [];
    times.push(from.getTime());
    for (let t = from.getTime() + stepMs; t < to.getTime(); t += stepMs) {
      times.push(t);
    }
    if (to.getTime() !== from.getTime()) times.push(to.getTime());

    for (const t of times) {
      const snapshot = new Date(t);
      const snapshotValues = computeSnapshotValues(snapshot);
      for (const v of snapshotValues) {
        const vv = safeNumber(v);
        if (Number.isFinite(vv)) collected.push(vv);
      }
    }

    return { values: collected, effectiveFrom: from, effectiveTo: to };
  }, [
    basePrice,
    bins,
    demandEvents,
    fromValue,
    hexagonResolution,
    maxTime,
    minTime,
    mode,
    multiplierData,
    normalizationEnabled,
    stepMinutes,
    supplyVehicles,
    timeframeMinutes,
    toValue,
  ]);

  const summary = useMemo(() => {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    return { n: sorted.length, min, max, mean, p50 };
  }, [values]);

  const histogramData = useMemo(() => {
    if (values.length === 0) return [] as { bin: string; count: number }[];
    const nBins = Math.max(5, Math.min(60, Math.round(bins)));
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return [];

    if (min === max) {
      return [{ bin: `${min.toFixed(2)}`, count: values.length }];
    }

    const width = (max - min) / nBins;
    const counts = Array.from({ length: nBins }, () => 0);

    for (const v of values) {
      const idx = Math.min(nBins - 1, Math.max(0, Math.floor((v - min) / width)));
      counts[idx] += 1;
    }

    return counts.map((count, i) => {
      const a = min + i * width;
      const b = min + (i + 1) * width;
      return { bin: `${a.toFixed(2)}–${b.toFixed(2)}`, count };
    });
  }, [bins, values]);

  const title = useMemo(() => {
    if (mode === "price") return "Price distribution";
    if (mode === "coefficient")
      return normalizationEnabled
        ? "Coefficient distribution (z-score)"
        : "Coefficient distribution (raw ratio)";
    if (mode === "demand") return "Demand distribution (events per hex)";
    return "Supply distribution (vehicles per hex)";
  }, [mode, normalizationEnabled]);

  const subtitle = useMemo(() => {
    if (!effectiveFrom || !effectiveTo) return "";
    return `From ${effectiveFrom.toLocaleString()} to ${effectiveTo.toLocaleString()} • sampled every ${stepMinutes} min`;
  }, [effectiveFrom, effectiveTo, stepMinutes]);

  const hasAnyData = hasDemand || hasSupply;

  return (
    <div className="h-full w-full overflow-auto p-4">
      <div className="flex flex-col gap-4 max-w-5xl">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-semibold">{title}</h2>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>

          <div className="flex gap-2 items-end flex-wrap">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">From</label>
              <Input
                type="datetime-local"
                value={fromValue}
                onChange={(e) => setFromValue(e.target.value)}
                disabled={!hasAnyData}
                className="w-[210px]"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">To</label>
              <Input
                type="datetime-local"
                value={toValue}
                onChange={(e) => setToValue(e.target.value)}
                disabled={!hasAnyData}
                className="w-[210px]"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Step</label>
              <Select
                value={String(stepMinutes)}
                onValueChange={(v) => setStepMinutes(parseInt(v, 10))}
                disabled={!hasAnyData}
              >
                <SelectTrigger className="w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 min</SelectItem>
                  <SelectItem value="15">15 min</SelectItem>
                  <SelectItem value="30">30 min</SelectItem>
                  <SelectItem value="60">60 min</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Bins</label>
              <Select
                value={String(bins)}
                onValueChange={(v) => setBins(parseInt(v, 10))}
                disabled={!hasAnyData}
              >
                <SelectTrigger className="w-[110px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="30">30</SelectItem>
                  <SelectItem value="40">40</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              type="button"
              variant="outline"
              disabled={!hasAnyData}
              onClick={() => {
                if (!computedDefaultRange) return;
                setFromValue(toDateTimeLocalValue(computedDefaultRange.from));
                setToValue(toDateTimeLocalValue(computedDefaultRange.to));
              }}
            >
              Full range
            </Button>
          </div>
        </div>

        {!hasAnyData ? (
          <Card className="p-6">
            <div className="text-sm text-muted-foreground">
              Upload demand and/or supply data to see a distribution.
            </div>
          </Card>
        ) : values.length === 0 ? (
          <Card className="p-6">
            <div className="text-sm text-muted-foreground">
              No values found for the selected time range.
            </div>
          </Card>
        ) : (
          <>
            {summary ? (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                <Card className="p-3">
                  <div className="text-xs text-muted-foreground">Samples</div>
                  <div className="text-lg font-semibold">{summary.n}</div>
                </Card>
                <Card className="p-3">
                  <div className="text-xs text-muted-foreground">Min</div>
                  <div className="text-lg font-semibold">{summary.min.toFixed(2)}</div>
                </Card>
                <Card className="p-3">
                  <div className="text-xs text-muted-foreground">Median</div>
                  <div className="text-lg font-semibold">{summary.p50.toFixed(2)}</div>
                </Card>
                <Card className="p-3">
                  <div className="text-xs text-muted-foreground">Mean</div>
                  <div className="text-lg font-semibold">{summary.mean.toFixed(2)}</div>
                </Card>
                <Card className="p-3">
                  <div className="text-xs text-muted-foreground">Max</div>
                  <div className="text-lg font-semibold">{summary.max.toFixed(2)}</div>
                </Card>
              </div>
            ) : null}

            <Card className="p-4">
              <div className="h-[420px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={histogramData}
                    margin={{ top: 8, right: 16, bottom: 32, left: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="bin"
                      interval={Math.max(0, Math.floor(histogramData.length / 8))}
                      angle={-25}
                      textAnchor="end"
                      height={70}
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Distribution is computed by sampling snapshots in the selected time range and
                aggregating values across all active hexagons per snapshot.
              </p>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
