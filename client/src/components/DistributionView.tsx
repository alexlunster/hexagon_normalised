import { useEffect, useMemo, useRef, useState } from "react";
import { latLngToCell } from "h3-js";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";

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

export type DistributionEntry = {
  value: number;
  hexId: string;
  timestamp: Date;
};

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
  onSelectHexTime?: (params: { hexId: string; timestamp: Date }) => void;
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
  onSelectHexTime,
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

  // Async distribution result and loading state (calculation runs off main thread so we can show loading UI).
  type DistributionResult = {
    values: number[];
    entries: DistributionEntry[];
    effectiveFrom: Date | null;
    effectiveTo: Date | null;
  };
  const [distributionResult, setDistributionResult] = useState<DistributionResult>({
    values: [],
    entries: [],
    effectiveFrom: null,
    effectiveTo: null,
  });
  const [isCalculating, setIsCalculating] = useState(false);
  const calcRunIdRef = useRef(0);

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

  // Returns { value, hexId }[] for building histogram bin entries (clickable list).
  const computeSnapshotEntries = (snapshotTime: Date): { value: number; hexId: string }[] => {
    const demandMap = new Map<string, number>();
    const supplyMap = new Map<string, number>();
    const allHexIds = new Set<string>();

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

    if (hasSupply) {
      for (const v of supplyVehicles) {
        if (v.startTime > snapshotTime || v.endTime < snapshotTime) continue;
        const hexId = latLngToCell(v.latitude, v.longitude, hexagonResolution);
        supplyMap.set(hexId, (supplyMap.get(hexId) || 0) + 1);
        allHexIds.add(hexId);
      }
    }

    if (allHexIds.size === 0) return [];

    if (!hasBoth) {
      const out: { value: number; hexId: string }[] = [];
      allHexIds.forEach((hexId) => {
        const demand = demandMap.get(hexId) || 0;
        const supply = supplyMap.get(hexId) || 0;
        if (mode === "demand") out.push({ value: demand, hexId });
        else if (mode === "supply") out.push({ value: supply, hexId });
      });
      return out;
    }

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

    const out: { value: number; hexId: string }[] = [];
    allHexIds.forEach((hexId) => {
      const raw = rawRatioMap.get(hexId) ?? 0;
      const ratio =
        normalizationEnabled && stdDev > 0 ? (raw - mean) / stdDev : raw;

      if (mode === "price") {
        const multiplier = getMultiplier(ratio);
        out.push({ value: multiplier * basePrice, hexId });
      } else {
        out.push({ value: ratio, hexId });
      }
    });
    return out;
  };

  // Run distribution calculation asynchronously so we can show a loading state.
  useEffect(() => {
    if (!minTime || !maxTime) {
      setDistributionResult({
        values: [],
        entries: [],
        effectiveFrom: null,
        effectiveTo: null,
      });
      setIsCalculating(false);
      return;
    }

    const runId = ++calcRunIdRef.current;
    setIsCalculating(true);

    const run = () => {
      const parsedFrom = fromValue ? new Date(fromValue) : minTime!;
      const parsedTo = toValue ? new Date(toValue) : maxTime!;

      const from = new Date(Math.max(minTime!.getTime(), parsedFrom.getTime()));
      const to = new Date(Math.min(maxTime!.getTime(), parsedTo.getTime()));

      if (from.getTime() > to.getTime()) {
        if (runId === calcRunIdRef.current) {
          setDistributionResult({ values: [], entries: [], effectiveFrom: from, effectiveTo: to });
          setIsCalculating(false);
        }
        return;
      }

      const stepMs = Math.max(1, stepMinutes) * 60 * 1000;
      const collectedValues: number[] = [];
      const collectedEntries: DistributionEntry[] = [];

      const times: number[] = [];
      times.push(from.getTime());
      for (let t = from.getTime() + stepMs; t < to.getTime(); t += stepMs) {
        times.push(t);
      }
      if (to.getTime() !== from.getTime()) times.push(to.getTime());

      for (const t of times) {
        const snapshot = new Date(t);
        const snapshotEntries = computeSnapshotEntries(snapshot);
        for (const e of snapshotEntries) {
          const vv = safeNumber(e.value);
          if (Number.isFinite(vv)) {
            collectedValues.push(vv);
            collectedEntries.push({ value: vv, hexId: e.hexId, timestamp: snapshot });
          }
        }
      }

      if (runId === calcRunIdRef.current) {
        setDistributionResult({
          values: collectedValues,
          entries: collectedEntries,
          effectiveFrom: from,
          effectiveTo: to,
        });
        setIsCalculating(false);
      }
    };

    const id = setTimeout(run, 0);
    return () => clearTimeout(id);
  }, [
    recalcNonce,
    basePrice,
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

  const { values, entries, effectiveFrom, effectiveTo } = distributionResult;

  const summary = useMemo(() => {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    return { n: sorted.length, min, max, mean, p50 };
  }, [values]);

  type HistogramBin = { bin: string; count: number; entries: DistributionEntry[] };
  const histogramData = useMemo((): HistogramBin[] => {
    if (entries.length === 0) return [];
    const nBins = Math.max(5, Math.min(60, Math.round(bins)));

    let min = Infinity;
    let max = -Infinity;
    for (const e of entries) {
      const v = e.value;
      if (!Number.isFinite(v)) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return [];

    if (min === max) {
      return [{ bin: `${min.toFixed(2)}`, count: entries.length, entries }];
    }

    const width = (max - min) / nBins;
    const binEntries: DistributionEntry[][] = Array.from({ length: nBins }, () => []);

    for (const e of entries) {
      const idx = Math.min(nBins - 1, Math.max(0, Math.floor((e.value - min) / width)));
      binEntries[idx].push(e);
    }

    return binEntries.map((ents, i) => {
      const a = min + i * width;
      const b = min + (i + 1) * width;
      const label = `${a.toFixed(2)}–${b.toFixed(2)}`;
      return { bin: label, count: ents.length, entries: ents };
    });
  }, [bins, entries]);

  const [selectedBinEntries, setSelectedBinEntries] = useState<DistributionEntry[] | null>(null);

  // Add fullHeight to each bin so we can draw a transparent full-height bar for clickability
  const histogramChartData = useMemo(() => {
    if (histogramData.length === 0) return [];
    const maxCount = Math.max(...histogramData.map((d) => d.count), 1);
    return histogramData.map((d) => ({ ...d, fullHeight: maxCount }));
  }, [histogramData]);

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
    <div className="h-full w-full overflow-auto p-4 relative">
      {hasAnyData && isCalculating && (
        <div
          className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 rounded-lg bg-background/90 backdrop-blur-sm"
          aria-live="polite"
          aria-busy="true"
        >
          <Spinner className="size-10 text-primary" />
          <p className="text-sm font-medium text-muted-foreground">
            Calculating distribution…
          </p>
          <p className="text-xs text-muted-foreground">
            Sampling snapshots and aggregating values
          </p>
        </div>
      )}
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
                // Apply draft settings and trigger recalculation.
                setFromValue(draftFromValue);
                setToValue(draftToValue);
                setStepMinutes(draftStepMinutes);
                setBins(draftBins);
                setRecalcNonce((x) => x + 1);
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
                    data={histogramChartData}
                    margin={{ top: 8, right: 16, bottom: 32, left: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="bin"
                      interval={Math.max(0, Math.floor(histogramChartData.length / 8))}
                      angle={-25}
                      textAnchor="end"
                      height={70}
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    {/* Visible bar (drawn first, behind) */}
                    <Bar dataKey="count" fill="#7dd3fc" isAnimationActive={true} />
                    {/* Transparent full-height bar so the whole column is clickable (drawn on top) */}
                    <Bar
                      dataKey="fullHeight"
                      fill="transparent"
                      cursor="pointer"
                      isAnimationActive={false}
                      onClick={(payload: unknown) => {
                        const data = (payload && typeof payload === "object" && "payload" in payload)
                          ? (payload as { payload: HistogramBin & { fullHeight?: number } }).payload
                          : (payload as HistogramBin);
                        if (data?.entries?.length) setSelectedBinEntries(data.entries);
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Distribution is computed by sampling snapshots in the selected time range and
                aggregating values across all active hexagons per snapshot. Click a bar to see entries.
              </p>
            </Card>

            {/* Sheet: list of entries for the selected histogram bin */}
            <Sheet open={selectedBinEntries !== null} onOpenChange={(open) => !open && setSelectedBinEntries(null)}>
              <SheetContent side="right" className="w-full sm:max-w-md">
                <SheetHeader>
                  <SheetTitle>Entries in this bin</SheetTitle>
                </SheetHeader>
                {selectedBinEntries && selectedBinEntries.length > 0 ? (
                  <ScrollArea className="h-[calc(100vh-120px)] mt-4 pr-4">
                    <ul className="space-y-1">
                      {selectedBinEntries.map((e, i) => (
                        <li key={`${e.hexId}-${e.timestamp.getTime()}-${i}`}>
                          <button
                            type="button"
                            className="w-full text-left px-3 py-2 rounded-md text-sm hover:bg-muted focus:bg-muted focus:outline-none border border-transparent hover:border-border"
                            onClick={() => {
                              onSelectHexTime?.({ hexId: e.hexId, timestamp: e.timestamp });
                              setSelectedBinEntries(null);
                            }}
                          >
                            <span className="font-mono text-muted-foreground">{e.hexId}</span>
                            <span className="mx-2">·</span>
                            <span>{e.timestamp.toLocaleString(undefined, { dateStyle: "short", timeStyle: "medium" })}</span>
                            <span className="ml-2 text-muted-foreground">({e.value.toFixed(2)})</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </ScrollArea>
                ) : null}
              </SheetContent>
            </Sheet>
          </>
        )}
      </div>
    </div>
  );
}

