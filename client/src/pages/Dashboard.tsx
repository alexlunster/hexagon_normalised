import { useState, useMemo } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import HexagonMap from "@/components/HexagonMap";
import ControlPanel from "@/components/ControlPanel";

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

const parseExcelDate = (value: any): Date | null => {
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    // Excel date serial number
    const utc_days = Math.floor(value - 25569);
    const utc_value = utc_days * 86400;
    const date_info = new Date(utc_value * 1000);

    const fractional_day = value - Math.floor(value) + 0.0000001;
    let total_seconds = Math.floor(86400 * fractional_day);

    const seconds = total_seconds % 60;
    total_seconds -= seconds;

    const hours = Math.floor(total_seconds / (60 * 60));
    const minutes = Math.floor(total_seconds / 60) % 60;

    date_info.setHours(hours);
    date_info.setMinutes(minutes);
    date_info.setSeconds(seconds);

    return date_info;
  }
  if (typeof value === "string") {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
};

export default function Dashboard() {
  const [hexagonResolution, setHexagonResolution] = useState(8);
  const [timeframeMinutes, setTimeframeMinutes] = useState(60);
  const [snapshotTime, setSnapshotTime] = useState<Date>(new Date());
  const [isUploadingDemand, setIsUploadingDemand] = useState(false);
  const [isUploadingSupply, setIsUploadingSupply] = useState(false);
  const [isUploadingMultiplier, setIsUploadingMultiplier] = useState(false);
  const [demandEvents, setDemandEvents] = useState<EventData[]>([]);
  const [supplyVehicles, setSupplyVehicles] = useState<SupplyData[]>([]);
  const [multiplierData, setMultiplierData] = useState<MultiplierData[]>([]);
  const [basePrice, setBasePrice] = useState<number>(0);
  const [normalizationEnabled, setNormalizationEnabled] =
    useState<boolean>(true);

  // Calculate min and max time from both demand and supply
  const { minTime, maxTime } = useMemo(() => {
    const times: number[] = [];

    demandEvents.forEach((e) => times.push(e.timestamp.getTime()));
    supplyVehicles.forEach((v) => {
      times.push(v.startTime.getTime());
      times.push(v.endTime.getTime());
    });

    if (times.length === 0) return { minTime: null, maxTime: null };

    return {
      minTime: new Date(Math.min(...times)),
      maxTime: new Date(Math.max(...times)),
    };
  }, [demandEvents, supplyVehicles]);

  const handleDemandUpload = async (file: File) => {
    setIsUploadingDemand(true);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);

      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      const rows = XLSX.utils.sheet_to_json<any>(worksheet, { defval: "" });

      // Try to detect columns
      const parsedEvents: EventData[] = [];

      for (const row of rows) {
        const timestampValue =
          row.timestamp ??
          row.Timestamp ??
          row.time ??
          row.Time ??
          row.datetime ??
          row.DateTime ??
          row.date ??
          row.Date ??
          row.ts;

        const latValue =
          row.latitude ??
          row.Latitude ??
          row.lat ??
          row.Lat ??
          row.y ??
          row.Y;

        const lngValue =
          row.longitude ??
          row.Longitude ??
          row.lon ??
          row.Lon ??
          row.lng ??
          row.Lng ??
          row.x ??
          row.X;

        const timestamp = parseExcelDate(timestampValue);
        const latitude = Number(latValue);
        const longitude = Number(lngValue);

        if (
          timestamp &&
          !isNaN(latitude) &&
          !isNaN(longitude) &&
          latitude !== 0 &&
          longitude !== 0
        ) {
          parsedEvents.push({ timestamp, latitude, longitude });
        }
      }

      if (parsedEvents.length === 0) {
        toast.error("No valid demand events found in file");
        setIsUploadingDemand(false);
        return;
      }

      setDemandEvents(parsedEvents);

      const times = parsedEvents.map((e) => e.timestamp.getTime());
      const avgTime = new Date(times.reduce((a, b) => a + b, 0) / times.length);
      setSnapshotTime(avgTime);

      toast.success(`Loaded ${parsedEvents.length} demand events`);
    } catch (error) {
      console.error("Error uploading demand file:", error);
      toast.error("Failed to upload demand file");
    } finally {
      setIsUploadingDemand(false);
    }
  };

  const handleSupplyUpload = async (file: File) => {
    setIsUploadingSupply(true);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);

      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      const rows = XLSX.utils.sheet_to_json<any>(worksheet, { defval: "" });

      const parsedSupply: SupplyData[] = [];

      for (const row of rows) {
        const startValue =
          row.startTime ??
          row.StartTime ??
          row.start ??
          row.Start ??
          row.start_time ??
          row.Start_Time ??
          row.begin ??
          row.Begin;

        const endValue =
          row.endTime ??
          row.EndTime ??
          row.end ??
          row.End ??
          row.end_time ??
          row.End_Time ??
          row.finish ??
          row.Finish;

        const latValue =
          row.latitude ??
          row.Latitude ??
          row.lat ??
          row.Lat ??
          row.y ??
          row.Y;

        const lngValue =
          row.longitude ??
          row.Longitude ??
          row.lon ??
          row.Lon ??
          row.lng ??
          row.Lng ??
          row.x ??
          row.X;

        const startTime = parseExcelDate(startValue);
        const endTime = parseExcelDate(endValue);
        const latitude = Number(latValue);
        const longitude = Number(lngValue);

        if (
          startTime &&
          endTime &&
          startTime <= endTime &&
          !isNaN(latitude) &&
          !isNaN(longitude) &&
          latitude !== 0 &&
          longitude !== 0
        ) {
          parsedSupply.push({ startTime, endTime, latitude, longitude });
        }
      }

      if (parsedSupply.length === 0) {
        toast.error("No valid supply rows found in file");
        setIsUploadingSupply(false);
        return;
      }

      setSupplyVehicles(parsedSupply);
      toast.success(`Loaded ${parsedSupply.length} supply rows`);
    } catch (error) {
      console.error("Error uploading supply file:", error);
      toast.error("Failed to upload supply file");
    } finally {
      setIsUploadingSupply(false);
    }
  };

  const handleMultiplierUpload = async (file: File) => {
    setIsUploadingMultiplier(true);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);

      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      const rows = XLSX.utils.sheet_to_json<any>(worksheet, { defval: "" });

      const parsedMultipliers: MultiplierData[] = [];

      for (const row of rows) {
        const minRatioValue =
          row.minRatio ??
          row.MinRatio ??
          row.min_ratio ??
          row.Min_Ratio ??
          row.ratio ??
          row.Ratio ??
          row.threshold ??
          row.Threshold;

        const multiplierValue =
          row.multiplier ??
          row.Multiplier ??
          row.mult ??
          row.Mult ??
          row.factor ??
          row.Factor;

        const minRatio = Number(minRatioValue);
        const multiplier = Number(multiplierValue);

        if (!isNaN(minRatio) && !isNaN(multiplier)) {
          parsedMultipliers.push({ minRatio, multiplier });
        }
      }

      if (parsedMultipliers.length === 0) {
        toast.error("No valid multiplier rows found in file");
        setIsUploadingMultiplier(false);
        return;
      }

      setMultiplierData(parsedMultipliers);
      toast.success(`Loaded ${parsedMultipliers.length} multiplier rows`);
    } catch (error) {
      console.error("Error uploading multiplier file:", error);
      toast.error("Failed to upload multiplier file");
    } finally {
      setIsUploadingMultiplier(false);
    }
  };

  const handleDeleteDemand = () => {
    setDemandEvents([]);
    toast.success("Demand data removed");
  };

  const handleDeleteSupply = () => {
    setSupplyVehicles([]);
    toast.success("Supply data removed");
  };

  const handleDeleteMultiplier = () => {
    setMultiplierData([]);
    toast.success("Multiplier data removed");
  };

  return (
    <div className="flex h-screen">
      <ControlPanel
        hexagonResolution={hexagonResolution}
        onHexagonResolutionChange={setHexagonResolution}
        timeframeMinutes={timeframeMinutes}
        onTimeframeChange={setTimeframeMinutes}
        snapshotTime={snapshotTime}
        onSnapshotTimeChange={setSnapshotTime}
        normalizationEnabled={normalizationEnabled}
        onNormalizationEnabledChange={setNormalizationEnabled}
        onDemandUpload={handleDemandUpload}
        onSupplyUpload={handleSupplyUpload}
        onMultiplierUpload={handleMultiplierUpload}
        onDeleteDemand={handleDeleteDemand}
        onDeleteSupply={handleDeleteSupply}
        onDeleteMultiplier={handleDeleteMultiplier}
        basePrice={basePrice}
        onBasePriceChange={setBasePrice}
        demandCount={demandEvents.length}
        supplyCount={supplyVehicles.length}
        multiplierCount={multiplierData.length}
        isUploadingDemand={isUploadingDemand}
        isUploadingSupply={isUploadingSupply}
        isUploadingMultiplier={isUploadingMultiplier}
        minTime={minTime}
        maxTime={maxTime}
      />
      <HexagonMap
        demandEvents={demandEvents}
        supplyVehicles={supplyVehicles}
        multiplierData={multiplierData}
        basePrice={basePrice}
        normalizationEnabled={normalizationEnabled}
        hexagonResolution={hexagonResolution}
        timeframeMinutes={timeframeMinutes}
        snapshotTime={snapshotTime}
      />
    </div>
  );
}
