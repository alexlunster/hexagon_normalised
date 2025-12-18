import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
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
  onBasePriceChange: (price: number) => void;
  hexagonResolution: number;
  onHexagonResolutionChange: (resolution: number) => void;
  timeframeMinutes: number;
  onTimeframeChange: (minutes: number) => void;
  snapshotTime: Date;
  onSnapshotTimeChange: (time: Date) => void;
  minTime: Date | null;
  maxTime: Date | null;
  demandCount: number;
  supplyCount: number;
  multiplierCount: number;
  isUploadingDemand: boolean;
  isUploadingSupply: boolean;
  isUploadingMultiplier: boolean;

  // ✅ added
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

  // ✅ added
  normalizationEnabled,
  onNormalizationEnabledChange,
}: ControlPanelProps) {
  const demandInputRef = useRef<HTMLInputElement>(null);
  const supplyInputRef = useRef<HTMLInputElement>(null);
  const multiplierInputRef = useRef<HTMLInputElement>(null);

  const handleDemandSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onDemandUpload(file);
      if (demandInputRef.current) {
        demandInputRef.current.value = "";
      }
    }
  };

  const handleSupplySelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onSupplyUpload(file);
      if (supplyInputRef.current) {
        supplyInputRef.current.value = "";
      }
    }
  };

  const handleMultiplierSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onMultiplierUpload(file);
      if (multiplierInputRef.current) {
        multiplierInputRef.current.value = "";
      }
    }
  };

  const getResolutionLabel = (level: number) => {
    const sizes: Record<number, string> = {
      5: "~100-200 km",
      6: "~14-36 km",
      7: "~2-5 km",
      8: "~0.7-1.9 km",
      9: "~100-300 m",
      10: "~66-122 m",
      11: "~9-17 m",
      12: "~1.3-2.5 m",
    };
    return sizes[level] || "~0.7-1.9 km";
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
    });
  };

  // Calculate date and time slider values
  const getDateValue = (date: Date) => {
    if (!minTime || !maxTime) return 0;
    const totalDays = Math.ceil(
      (maxTime.getTime() - minTime.getTime()) / (1000 * 60 * 60 * 24)
    );
    const currentDay = Math.floor(
      (date.getTime() - minTime.getTime()) / (1000 * 60 * 60 * 24)
    );
    return Math.min(currentDay, totalDays);
  };

  const getTimeValue = (date: Date) => {
    return date.getHours() * 60 + date.getMinutes();
  };

  const handleDateChange = (value: number[]) => {
    if (!minTime) return;
    const newDate = new Date(minTime.getTime() + value[0] * 24 * 60 * 60 * 1000);
    newDate.setHours(snapshotTime.getHours(), snapshotTime.getMinutes(), 0, 0);
    onSnapshotTimeChange(newDate);
  };

  const handleTimeChange = (value: number[]) => {
    const totalMinutes = value[0];
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const newDate = new Date(snapshotTime);
    newDate.setHours(hours, minutes, 0, 0);
    onSnapshotTimeChange(newDate);
  };

  const totalDays =
    minTime && maxTime
      ? Math.ceil((maxTime.getTime() - minTime.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

  return (
    <Card className="w-96 h-full overflow-y-auto p-6 space-y-6 rounded-none border-r">
      <div>
        <h2 className="text-2xl font-bold mb-2">Demand-Supply Analyzer</h2>
        <p className="text-sm text-muted-foreground">
          Upload demand and supply data to analyze ratios
        </p>
      </div>

      {/* ✅ Normalization Toggle (added, minimal) */}
      <div>
        <label className="text-sm font-medium mb-2 block">Normalization</label>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => onNormalizationEnabledChange(!normalizationEnabled)}
        >
          {normalizationEnabled ? "ON (log-normalized)" : "OFF (raw ratio)"}
        </Button>
        <p className="text-xs text-muted-foreground mt-2">
          Controls how the ratio is computed when both demand + supply are uploaded
        </p>
      </div>

      {/* Demand Upload */}
      <div>
        <label className="text-sm font-medium mb-2 block">Demand Data</label>
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
          Demand events loaded: {demandCount}
        </p>
      </div>

      {/* Supply Upload */}
      <div>
        <label className="text-sm font-medium mb-2 block">Supply Data</label>
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
          Supply vehicles loaded: {supplyCount}
        </p>
      </div>

      {/* Multiplier Upload */}
      <div>
        <label className="text-sm font-medium mb-2 block">Multiplier Data</label>
        <input
          ref={multiplierInputRef}
          type="file"
          accept=".xlsx,.xls,.csv,.txt"
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

      {/* Base Price Input */}
      <div>
        <label className="text-sm font-medium mb-2 block">Base Price ($)</label>
        <input
          type="number"
          value={basePrice || ""}
          onChange={(e) => onBasePriceChange(parseFloat(e.target.value) || 0)}
          placeholder="Enter base price"
          min="0"
          step="0.01"
          className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm"
        />
        <p className="text-xs text-muted-foreground mt-2">
          Current: ${basePrice.toFixed(2)}
        </p>
      </div>

      {/* Hexagon Resolution */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="text-sm font-medium">Hexagon Resolution (H3 level)</label>
          <span className="text-sm font-medium">Level {hexagonResolution}</span>
        </div>
        <Slider
          value={[hexagonResolution]}
          onValueChange={(value) => onHexagonResolutionChange(value[0])}
          min={5}
          max={12}
          step={1}
          className="mb-2"
        />
        <p className="text-xs text-muted-foreground">~~{getResolutionLabel(hexagonResolution)} edge</p>
      </div>

      {/* Timeframe Window */}
      <div>
        <label className="text-sm font-medium mb-2 block">Timeframe Window (Demand)</label>
        <Select
          value={timeframeMinutes.toString()}
          onValueChange={(value) => onTimeframeChange(parseInt(value))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="15">t - 15 minutes</SelectItem>
            <SelectItem value="30">t - 30 minutes</SelectItem>
            <SelectItem value="60">t - 60 minutes</SelectItem>
            <SelectItem value="90">t - 90 minutes</SelectItem>
            <SelectItem value="120">t - 2 hours</SelectItem>
            <SelectItem value="360">t - 6 hours</SelectItem>
            <SelectItem value="720">t - 12 hours</SelectItem>
            <SelectItem value="1440">t - 24 hours</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground mt-2">
          Supply calculated at snapshot time only
        </p>
      </div>

      {/* Snapshot Time Controls */}
      {minTime && maxTime && (
        <>
          {/* Date Slider */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium">Snapshot Date</label>
              <span className="text-sm font-medium">{formatDate(snapshotTime)}</span>
            </div>
            <Slider
              value={[getDateValue(snapshotTime)]}
              onValueChange={handleDateChange}
              min={0}
              max={totalDays}
              step={1}
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>{formatDate(minTime)}</span>
              <span>{formatDate(maxTime)}</span>
            </div>
          </div>

          {/* Time Slider */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium">Snapshot Time</label>
              <span className="text-sm font-medium">{formatTime(snapshotTime)}</span>
            </div>
            <Slider
              value={[getTimeValue(snapshotTime)]}
              onValueChange={handleTimeChange}
              min={0}
              max={1439}
              step={1}
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
