import { useEffect, useMemo, useState } from "react";
import { latLngToCell } from "h3-js";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import LoadingOverlay from "@/components/LoadingOverlay";
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

function csvEscape(s: string) {
  if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r")) {
    return '"' + s.replaceAll('"', '""') + '"';
  }
  return s;
}

function fmtForFilename(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${yyyy}${mm}${dd}-${hh}${min}`;
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

  // Draft (UI) settings: changing these should NOT trigger recalculation.
  const [draftFromValue, setDraftFromValue] = useState(() => {
    if (!computedDefaultRange) return "";
    return toDateTimeLocalValue(computedDefaultRange.from);
  });

  const [draftToValue, setDraftToValue] = useState(() => {
    if (!computedDefaultRange) return "";
    return toDateTimeLocalValue(computedDefaultRange.to);
  });

  // Step controls how densely we sample snapshots inside the selected time range.
  const [draftStepMinutes, setDraftStepMinutes] = useState<number>(15);
  const [draftBins, setDraftBins] = useState<number>(20);

  // Applied settings: calculations are ONLY based on these values.
  const [fromValue, setFromValue] = useState(() => {
    if (!computedDefaultRange) return "";
    return toDateTimeLocalValue(computedDefaultRange.from);
  });
  const [toValue, setToValue] = useState(() => {
    if (!computedDefaultRange) return "";
    return toDateTimeLocalValue(computedDefaultRange.to);
  });
  const [stepMinutes, setStepMinutes] = useState<number>(15);
  const [bins, setBins] = useState<number>(20);

  // Clicking "Recalculate now" increments this nonce to force recalculation even if values are unchanged.
  const [recalcNonce, setRecalcNonce] = useState(0);

  // UI feedback while heavy recalculation runs.
  const [isCalculating, setIsCalculating] = useState(false);

  // If the available data range changes (new uploads), set default draft/applied values
  // ONLY when the user hasn't already set something.
  useEffect(() => {
    if (!computedDefaultRange) return;
    const nextFrom = toDateTimeLocalValue(computedDefaultRange.from);
    const nextTo = toDateTimeLocalValue(computedDefaultRange.to);

    // Update draft fields if empty.
    if (draftFromValue === "" && draftToValue === "") {
      setDraftFromValue(nextFrom);
      setDraftToValue(nextTo);
    }

    // Update applied fields if empty.
    if (fromValue === "" && toValue === "") {
      setFromValue(nextFrom);
      setToValue(nextTo);
      setRecalcNonce((n) => n + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computedDefaultRange]);

  const isDirty =
    draftFromValue !== fromValue ||
    draftToValue !== toValue ||
    draftStepMinutes !== stepMinutes ||
    draftBins !== bins;

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
    recalcNonce,
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

  // Stop loading once we have new results.
  useEffect(() => {
    if (!isCalculating) return;
    const t = setTimeout(() => setIsCalculating(false), 0);
    return () => clearTimeout(t);
  }, [values, isCalculating]);

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

    // Avoid Math.min(...values)/Math.max(...values) for large arrays (can throw RangeError).
    let min = Infinity;
    let max = -Infinity;
    for (const v of values) {
      if (!Number.isFinite(v)) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
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

    const out = counts.map((count, i) => {
      const a = min + i * width;
      const b = min + (i + 1) * width;
      const label = `${a.toFixed(2)}–${b.toFixed(2)}`;
      return { bin: label, count };
    });

    return out;
  }, [bins, values]);

  const downloadDistributionCsv = () => {
    if (histogramData.length === 0) return;

    const rows: string[][] = [
      ["value", "frequency"],
      ...histogramData.map((h) => [String(h.bin), String(h.count)]),
    ];

    const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n") + "\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const fromTag = effectiveFrom ? fmtForFilename(effectiveFrom) : "from";
    const toTag = effectiveTo ? fmtForFilename(effectiveTo) : "to";
    const kind = mode === "price" ? "prices" : "ratios";
    const filename = `distribution-${kind}-${fromTag}-${toTag}.csv`;

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

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
    <div className="relative h-full w-full overflow-auto p-4">
      <LoadingOverlay show={isCalculating} label="Calculating distribution..." />
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
                value={draftFromValue}
                onChange={(e) => setDraftFromValue(e.target.value)}
                disabled={!hasAnyData}
                className="w-[210px]"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">To</label>
              <Input
                type="datetime-local"
                value={draftToValue}
                onChange={(e) => setDraftToValue(e.target.value)}
                disabled={!hasAnyData}
                className="w-[210px]"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Step</label>
              <Select
                value={String(draftStepMinutes)}
                onValueChange={(v) => setDraftStepMinutes(parseInt(v, 10))}
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
                value={String(draftBins)}
                onValueChange={(v) => setDraftBins(parseInt(v, 10))}
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
                // Reset to full available range.
                if (!computedDefaultRange) return;
                setDraftFromValue(toDateTimeLocalValue(computedDefaultRange.from));
                setDraftToValue(toDateTimeLocalValue(computedDefaultRange.to));
              }}
            >
              Full range
            </Button>

            <Button
              type="button"
              disabled={!hasAnyData}
              onClick={() => {
                // Two-phase update so the loading overlay can render BEFORE heavy computation.
                setIsCalculating(true);
                setTimeout(() => {
                  // Apply draft settings and trigger recalculation.
                  setFromValue(draftFromValue);
                  setToValue(draftToValue);
                  setStepMinutes(draftStepMinutes);
                  setBins(draftBins);
                  setRecalcNonce((x) => x + 1);
                }, 0);
              }}
            >
              Recalculate now
            </Button>

            <Button
              type="button"
              variant="outline"
              disabled={!hasAnyData || histogramData.length === 0}
              onClick={downloadDistributionCsv}
            >
              Download CSV
            </Button>

            {isDirty ? (
              <span className="text-xs text-muted-foreground self-center">
                Settings changed — press{" "}
                <span className="font-medium">Recalculate now</span>
              </span>
            ) : null}
          </div>
        </div>

        {/* rest of file unchanged */}
        {/* ... */}
      </div>
    </div>
  );
}
