import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload, Trash2 } from "lucide-react";
import { useRef } from "react";

interface ControlPanelProps {
  onDemandUpload: (file: File) => void;
  onSupplyUpload: (file: File) => void;
  onDeleteDemand: () => void;
  onDeleteSupply: () => void;
  onMultiplierUpload: (file: File) => void;
  onDeleteMultiplier: () => void;
  basePrice: number;
  onBasePriceChange: (value: number) => void;
  hexagonResolution: number;
  onHexagonResolutionChange: (value: number) => void;
  timeframeMinutes: number;
  onTimeframeChange: (value: number) => void;
  snapshotTime: Date;
  onSnapshotTimeChange: (value: Date) => void;
  minTime: Date | null;
  maxTime: Date | null;
  demandCount: number;
  supplyCount: number;
  multiplierCount: number;
  isUploadingDemand: boolean;
  isUploadingSupply: boolean;
  isUploadingMultiplier: boolean;
  normalizationEnabled: boolean;
  onNormalizationEnabledChange: (enabled: boolean) => void;
}

export default function ControlPanel({
  onDemandUpload,
  onSupplyUpload,
  onDeleteDemand,
  onDeleteSupply,
  onMultiplierUpload,
  onDeleteMultiplier,
  basePrice,
  onBasePriceChange,
  hexagonResolution,
  onHexagonResolutionChange,
  timeframeMinutes,
  onTimeframeChange,
  snapshotTime,
  onSnapshotTimeChange,
  minTime,
  maxTime,
  demandCount,
  supplyCount,
  multiplierCount,
  isUploadingDemand,
  isUploadingSupply,
  isUploadingMultiplier,
  normalizationEnabled,
  onNormalizationEnabledChange,
}: ControlPanelProps) {
  const demandInputRef = useRef<HTMLInputElement>(null);
  const supplyInputRef = useRef<HTMLInputElement>(null);
  const multiplierInputRef = useRef<HTMLInputElement>(null);

  const resolutionOptions = [
    { value: 6, label: "Resolution 6 (Large)" },
    { value: 7, label: "Resolution 7" },
    { value: 8, label: "Resolution 8 (Default)" },
    { value: 9, label: "Resolution 9 (Small)" },
    { value: 10, label: "Resolution 10 (Very Small)" },
  ];

  const timeframeOptions = [
    { value: 15, label: "15 minutes" },
    { value: 30, label: "30 minutes" },
    { value: 60, label: "1 hour" },
    { value: 120, label: "2 hours" },
    { value: 240, label: "4 hours" },
    { value: 480, label: "8 hours" },
    { value: 720, label: "12 hours" },
    { value: 1440, label: "24 hours" },
  ];

  const handleDemandSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onDemandUpload(file);
    e.target.value = "";
  };

  const handleSupplySelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onSupplyUpload(file);
    e.target.value = "";
  };

  const handleMultiplierSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onMultiplierUpload(file);
    e.target.value = "";
  };

  const getCurrentDayIndex = () => {
    if (!minTime || !maxTime) return 0;
    const totalMs = maxTime.getTime() - minTime.getTime();
    if (totalMs <= 0) return 0;

    const currentMs = snapshotTime.getTime() - minTime.getTime();
    const totalDays = Math.ceil(totalMs / (1000 * 60 * 60 * 24));
    const currentDay = Math.floor(
      currentMs / (1000 * 60 * 60 * 24)
    );
    return Math.min(currentDay, totalDays);
  };

  const getTimeValue = (date: Date) => {
    return date.getHours() * 60 + date.getMinutes();
  };

  const handleDateChange = (value: number[]) => {
    if (!minTime) return;
    const newDate = new Date(
      minTime.getTime() + value[0] * 24 * 60 * 60 * 1000
    );
    newDate.setHours(
      snapshotTime.getHours(),
      snapshotTime.getMinutes(),
      0,
      0
    );
    onSnapshotTimeChange(newDate);
  };

  const handleTimeChange = (value: number[]) => {
    if (!minTime) return;
    const newDate = new Date(snapshotTime);
    const totalMinutes = value[0];
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    newDate.setHours(hours, minutes, 0, 0);
    onSnapshotTimeChange(newDate);
  };

  const totalDays =
    minTime && maxTime
      ? Math.ceil(
          (maxTime.getTime() - minTime.getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : 0;

  return (
    <Card className="w-96 h-full overflow-y-auto p-6 space-y-6 rounded-none border-r">
      <div>
        <h2 className="text-2xl font-bold mb-2">Demand-Supply Analyzer</h2>
        <p className="text-sm text-muted-foreground">
          Upload demand and supply data to analyze ratios
        </p>
      </div>

      {/* Demand Upload */}
      <div>
        <h3 className="text-sm font-medium mb-2">Demand Data</h3>
        <input
          ref={demandInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleDemandSelect}
          className="hidden"
        />
        <div className="flex gap-2">
          <Button
            onClick={() => demandInputRef.current?.click()}
            disabled={isUploadingDemand}
            className="flex-1"
            variant="outline"
          >
            <Upload className="mr-2 h-4 w-4" />
            {isUploadingDemand ? "Uploading..." : "Upload"}
          </Button>
          {demandCount > 0 && (
            <Button
              onClick={onDeleteDemand}
              variant="destructive"
              size="icon"
              title="Delete demand data"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Events loaded: {demandCount}
        </p>
      </div>

      {/* Supply Upload */}
      <div>
        <h3 className="text-sm font-medium mb-2">Supply Data</h3>
        <input
          ref={supplyInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleSupplySelect}
          className="hidden"
        />
        <div className="flex gap-2">
          <Button
            onClick={() => supplyInputRef.current?.click()}
            disabled={isUploadingSupply}
            className="flex-1"
            variant="outline"
          >
            <Upload className="mr-2 h-4 w-4" />
            {isUploadingSupply ? "Uploading..." : "Upload"}
          </Button>
          {supplyCount > 0 && (
            <Button
              onClick={onDeleteSupply}
              variant="destructive"
              size="icon"
              title="Delete supply data"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Vehicles loaded: {supplyCount}
        </p>
      </div>

      {/* Multiplier Upload */}
      <div>
        <h3 className="text-sm font-medium mb-2">Multiplier Data</h3>
        <input
          ref={multiplierInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleMultiplierSelect}
          className="hidden"
        />
        <div className="flex gap-2">
          <Button
            onClick={() => multiplierInputRef.current?.click()}
            disabled={isUploadingMultiplier}
            className="flex-1"
            variant="outline"
          >
            <Upload className="mr-2 h-4 w-4" />
            {isUploadingMultiplier ? "Uploading..." : "Upload"}
          </Button>
          {multiplierCount > 0 && (
            <Button
              onClick={onDeleteMultiplier}
              variant="destructive"
              size="icon"
              title="Delete multiplier data"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Multiplier entries loaded: {multiplierCount}
        </p>
      </div>

      {/* Normalization Toggle */}
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium">Normalization</h3>
            <p className="text-xs text-muted-foreground">
              Toggle log normalization for the demand/supply ratio
            </p>
          </div>
          <Switch
            checked={normalizationEnabled}
            onCheckedChange={(checked) =>
              onNormalizationEnabledChange(Boolean(checked))
            }
          />
        </div>
      </div>

      {/* Base Price Input */}
      <div>
        <h3 className="text-sm font-medium mb-2">Base Price</h3>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">$</span>
          <input
            type="number"
            value={basePrice}
            min={0}
            step={0.01}
            onChange={(e) => onBasePriceChange(Number(e.target.value))}
            className="w-full bg-transparent border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
            placeholder="e.g. 10.00"
          />
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Used to calculate final price = basePrice × multiplier
        </p>
      </div>

      {/* Hexagon Resolution */}
      <div>
        <h3 className="text-sm font-medium mb-2">Hexagon Resolution</h3>
        <Select
          value={String(hexagonResolution)}
          onValueChange={(v) => onHexagonResolutionChange(Number(v))}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select resolution" />
          </SelectTrigger>
          <SelectContent>
            {resolutionOptions.map((opt) => (
              <SelectItem key={opt.value} value={String(opt.value)}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground mt-2">
          Higher resolution = smaller hexagons
        </p>
      </div>

      {/* Timeframe */}
      <div>
        <h3 className="text-sm font-medium mb-2">Demand Timeframe Window</h3>
        <Select
          value={String(timeframeMinutes)}
          onValueChange={(v) => onTimeframeChange(Number(v))}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select timeframe" />
          </SelectTrigger>
          <SelectContent>
            {timeframeOptions.map((opt) => (
              <SelectItem key={opt.value} value={String(opt.value)}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground mt-2">
          Demand events within this window before snapshot time are counted
        </p>
      </div>

      {/* Time Controls */}
      {minTime && maxTime && (
        <>
          <div>
            <h3 className="text-sm font-medium mb-2">Snapshot Date</h3>
            <Slider
              value={[getCurrentDayIndex()]}
              min={0}
              max={Math.max(totalDays, 0)}
              step={1}
              onValueChange={handleDateChange}
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>{minTime.toLocaleDateString()}</span>
              <span>{maxTime.toLocaleDateString()}</span>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium mb-2">Snapshot Time</h3>
            <Slider
              value={[getTimeValue(snapshotTime)]}
              min={0}
              max={1439}
              step={1}
              onValueChange={handleTimeChange}
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>12:00 AM</span>
              <span>11:59 PM</span>
            </div>
          </div>
        </>
      )}

      {demandCount === 0 && supplyCount === 0 && (
        <div className="text-center text-sm text-muted-foreground pt-4">
          Upload demand and supply files to get started
        </div>
      )}
    </Card>
  );
}
