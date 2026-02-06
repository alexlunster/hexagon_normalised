import { useState, useMemo } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import HexagonMap from "@/components/HexagonMap";
import ControlPanel from "@/components/ControlPanel";
import DistributionView from "@/components/DistributionView";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

export default function Dashboard() {
  const [hexagonResolution, setHexagonResolution] = useState(8);
  const [timeframeMinutes, setTimeframeMinutes] = useState(60);
  const [snapshotTime, setSnapshotTime] = useState(new Date());
  const [isUploadingDemand, setIsUploadingDemand] = useState(false);
  const [isUploadingSupply, setIsUploadingSupply] = useState(false);
  const [isUploadingMultiplier, setIsUploadingMultiplier] = useState(false);
  const [demandEvents, setDemandEvents] = useState<EventData[]>([]);
  const [supplyVehicles, setSupplyVehicles] = useState<SupplyData[]>([]);
  const [multiplierData, setMultiplierData] = useState<MultiplierData[]>([]);
  const [basePrice, setBasePrice] = useState<number>(0);

  // ✅ added (default ON so current behavior remains)
  const [normalizationEnabled, setNormalizationEnabled] = useState(true);

  const [activeTab, setActiveTab] = useState<"map" | "distribution">("map");
  const [focusHexId, setFocusHexId] = useState<string | null>(null);

  // Calculate min and max time from both demand and supply
  const { minTime, maxTime } = useMemo(() => {
    const times: number[] = [];

    demandEvents.forEach((e) => times.push(e.timestamp.getTime()));
    supplyVehicles.forEach((v) => {
      times.push(v.startTime.getTime());
      times.push(v.endTime.getTime());
    });

    if (times.length === 0) return { minTime: null, maxTime: null };

    // Avoid using Math.min(...times) / Math.max(...times) on large arrays.
    // Spreading tens of thousands of values can throw:
    // RangeError: Maximum call stack size exceeded.
    let min = Infinity;
    let max = -Infinity;
    for (const t of times) {
      if (!Number.isFinite(t)) continue;
      if (t < min) min = t;
      if (t > max) max = t;
    }

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return { minTime: null, maxTime: null };
    }

    return {
      minTime: new Date(min),
      maxTime: new Date(max),
    };
  }, [demandEvents, supplyVehicles]);

  const handleDemandUpload = async (file: File) => {
    setIsUploadingDemand(true);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      // Parse demand events from CSV
      const parsedEvents: EventData[] = [];
      for (const row of jsonData as any[]) {
        const keys = Object.keys(row);

        let timeValue, latValue, lngValue;

        if (
          keys.length === 3 &&
          keys[0] === "timestamp" &&
          keys[1] === "latitude" &&
          keys[2] === "longitude"
        ) {
          timeValue = row.timestamp;
          latValue = row.latitude;
          lngValue = row.longitude;
        } else if (keys.length >= 3) {
          const timeKey = keys.find(
            (k) =>
              k.toLowerCase().includes("time") || k.toLowerCase().includes("date")
          );
          const latKey = keys.find((k) => k.toLowerCase().includes("lat"));
          const lngKey = keys.find(
            (k) => k.toLowerCase().includes("lng") || k.toLowerCase().includes("lon")
          );

          if (timeKey && latKey && lngKey) {
            timeValue = row[timeKey];
            latValue = row[latKey];
            lngValue = row[lngKey];
          } else {
            timeValue = row[keys[0]];
            latValue = row[keys[1]];
            lngValue = row[keys[2]];
          }
        } else {
          continue;
        }

        let timestamp: Date;
        if (typeof timeValue === "string") {
          timestamp = new Date(timeValue);

          if (isNaN(timestamp.getTime())) {
            const match = timeValue.match(
              /(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})/
            );
            if (match) {
              const [, month, day, year, hour, minute] = match;
              const fullYear =
                parseInt(year) < 100 ? 2000 + parseInt(year) : parseInt(year);
              timestamp = new Date(
                fullYear,
                parseInt(month) - 1,
                parseInt(day),
                parseInt(hour),
                parseInt(minute)
              );
            } else {
              continue;
            }
          }
        } else if (typeof timeValue === "number") {
          timestamp = new Date((timeValue - 25569) * 86400 * 1000);
        } else {
          timestamp = new Date(timeValue);
        }

        const latitude = parseFloat(latValue);
        const longitude = parseFloat(lngValue);

        if (!isNaN(timestamp.getTime()) && !isNaN(latitude) && !isNaN(longitude)) {
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

  const handleDeleteDemand = () => {
    setDemandEvents([]);
    toast.success("Demand data cleared");
  };

  const handleDeleteSupply = () => {
    setSupplyVehicles([]);
    toast.success("Supply data cleared");
  };

  const handleMultiplierUpload = async (file: File) => {
    setIsUploadingMultiplier(true);

    try {
      let parsedMultipliers: MultiplierData[] = [];

      if (file.name.endsWith(".txt")) {
        // Parse .txt file as JSON
        const text = await file.text();
        const jsonData = JSON.parse(text);

        // Handle both array and object formats
        const dataArray = Array.isArray(jsonData) ? jsonData : [jsonData];

        for (const row of dataArray) {
          const minRatio = parseFloat(row.minRatio);
          const multiplier = parseFloat(row.multiplier);

          if (!isNaN(minRatio) && !isNaN(multiplier)) {
            parsedMultipliers.push({ minRatio, multiplier });
          }
        }
      } else {
        // Parse Excel file
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        for (const row of jsonData as any[]) {
          const minRatio = parseFloat(row.minRatio);
          const multiplier = parseFloat(row.multiplier);

          if (!isNaN(minRatio) && !isNaN(multiplier)) {
            parsedMultipliers.push({ minRatio, multiplier });
          }
        }
      }

      if (parsedMultipliers.length === 0) {
        toast.error("No valid multiplier data found in file");
        setIsUploadingMultiplier(false);
        return;
      }

      // Sort by minRatio in descending order for proper lookup
      parsedMultipliers.sort((a, b) => b.minRatio - a.minRatio);
      setMultiplierData(parsedMultipliers);
      toast.success(`Loaded ${parsedMultipliers.length} multiplier entries`);
    } catch (error) {
      console.error("Error uploading multiplier file:", error);
      toast.error("Failed to upload multiplier file");
    } finally {
      setIsUploadingMultiplier(false);
    }
  };

  const handleDeleteMultiplier = () => {
    setMultiplierData([]);
    toast.success("Multiplier data cleared");
  };

  // ✅ supply upload logic unchanged
  const handleSupplyUpload = async (file: File) => {
    setIsUploadingSupply(true);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      // Parse supply vehicles from CSV (start_time, end_time, lat, lng)
      const parsedSupply: SupplyData[] = [];
      for (const row of jsonData as any[]) {
        const keys = Object.keys(row);

        if (keys.length < 4) continue;

        let startValue, endValue, latValue, lngValue;

        // Try to find columns by name or use positional
        const startKey = keys.find((k) => k.toLowerCase().includes("start"));
        const endKey = keys.find((k) => k.toLowerCase().includes("end"));
        const latKey = keys.find((k) => k.toLowerCase().includes("lat"));
        const lngKey = keys.find(
          (k) => k.toLowerCase().includes("lng") || k.toLowerCase().includes("lon")
        );

        if (startKey && endKey && latKey && lngKey) {
          startValue = row[startKey];
          endValue = row[endKey];
          latValue = row[latKey];
          lngValue = row[lngKey];
        } else {
          // Assume positional: start_time, end_time, lat, lng
          startValue = row[keys[0]];
          endValue = row[keys[1]];
          latValue = row[keys[2]];
          lngValue = row[keys[3]];
        }

        // Parse timestamps
        const parseTime = (value: any): Date | null => {
          if (!value) return null;

          if (typeof value === "string") {
            let date = new Date(value);

            if (isNaN(date.getTime())) {
              const match = value.match(
                /(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})/
              );
              if (match) {
                const [, month, day, year, hour, minute] = match;
                const fullYear =
                  parseInt(year) < 100 ? 2000 + parseInt(year) : parseInt(year);
                date = new Date(
                  fullYear,
                  parseInt(month) - 1,
                  parseInt(day),
                  parseInt(hour),
                  parseInt(minute)
                );
              } else {
                return null;
              }
            }
            return date;
          } else if (typeof value === "number") {
            return new Date((value - 25569) * 86400 * 1000);
          }
          return new Date(value);
        };

        const startTime = parseTime(startValue);
        const endTime = parseTime(endValue);
        const latitude = parseFloat(latValue);
        const longitude = parseFloat(lngValue);

        if (
          startTime &&
          endTime &&
          !isNaN(startTime.getTime()) &&
          !isNaN(endTime.getTime()) &&
          !isNaN(latitude) &&
          !isNaN(longitude)
        ) {
          parsedSupply.push({ startTime, endTime, latitude, longitude });
        }
      }

      if (parsedSupply.length === 0) {
        toast.error("No valid supply vehicles found in file");
        setIsUploadingSupply(false);
        return;
      }

      setSupplyVehicles(parsedSupply);
      toast.success(`Loaded ${parsedSupply.length} supply vehicles`);
    } catch (error) {
      console.error("Error uploading supply file:", error);
      toast.error("Failed to upload supply file");
    } finally {
      setIsUploadingSupply(false);
    }
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
        onDemandUpload={handleDemandUpload}
        onSupplyUpload={handleSupplyUpload}
        onDeleteDemand={handleDeleteDemand}
        onDeleteSupply={handleDeleteSupply}
        onMultiplierUpload={handleMultiplierUpload}
        onDeleteMultiplier={handleDeleteMultiplier}
        basePrice={basePrice}
        onBasePriceChange={setBasePrice}
        isUploadingDemand={isUploadingDemand}
        isUploadingSupply={isUploadingSupply}
        isUploadingMultiplier={isUploadingMultiplier}
        demandCount={demandEvents.length}
        supplyCount={supplyVehicles.length}
        multiplierCount={multiplierData.length}
        minTime={minTime}
        maxTime={maxTime}
        normalizationEnabled={normalizationEnabled}
        onNormalizationEnabledChange={setNormalizationEnabled}
      />
      <div className="flex-1 h-full min-w-0">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "map" | "distribution")} className="h-full">
          <div className="flex items-center justify-between px-4 pt-3">
            <TabsList>
              <TabsTrigger value="map">Map</TabsTrigger>
              <TabsTrigger value="distribution">Distribution</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="map" className="h-[calc(100%-52px)]">
            <HexagonMap
              demandEvents={demandEvents}
              supplyVehicles={supplyVehicles}
              multiplierData={multiplierData}
              basePrice={basePrice}
              hexagonResolution={hexagonResolution}
              timeframeMinutes={timeframeMinutes}
              snapshotTime={snapshotTime}
              normalizationEnabled={normalizationEnabled}
              focusHexId={focusHexId}
              onFocusHexSeen={() => setFocusHexId(null)}
            />
          </TabsContent>

          <TabsContent value="distribution" className="h-[calc(100%-52px)] overflow-hidden">
            <DistributionView
              demandEvents={demandEvents}
              supplyVehicles={supplyVehicles}
              multiplierData={multiplierData}
              basePrice={basePrice}
              hexagonResolution={hexagonResolution}
              timeframeMinutes={timeframeMinutes}
              normalizationEnabled={normalizationEnabled}
              minTime={minTime}
              maxTime={maxTime}
              onSelectHexTime={({ hexId, timestamp }) => {
                setSnapshotTime(timestamp);
                setFocusHexId(hexId);
                setActiveTab("map");
              }}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
