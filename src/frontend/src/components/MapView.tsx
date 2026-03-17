import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { useSaveRoute } from "@/hooks/useQueries";
import { exportGPX, exportKML } from "@/utils/exportRoute";
import {
  distanceToPolyline,
  formatDistance,
  formatDuration,
  formatSpeed,
  haversineDistance,
} from "@/utils/haversine";
import { savePendingRoute } from "@/utils/offlineRoutes";
import {
  cacheTile,
  clearTileCache,
  deleteMapDownloadRecord,
  downloadArea,
  estimateTileCount,
  getCacheStats,
  getMapDownloadRecords,
  getTileFromCache,
  saveMapDownloadRecord,
} from "@/utils/tileCache";
import type { MapDownloadRecord } from "@/utils/tileCache";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Compass,
  Download,
  FileText,
  HardDrive,
  Loader2,
  LocateFixed,
  Map as MapIcon,
  Navigation,
  Pause,
  Play,
  Save,
  Settings,
  Square,
  Trash2,
  WifiOff,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { Coordinate } from "../backend.d";
import { LiveCompass } from "./LiveCompass";

type RecordingState = "idle" | "recording" | "paused" | "stopped";

interface MapViewProps {
  viewRoute?: { name: string; waypoints: Coordinate[] } | null;
  onViewRouteClear?: () => void;
  referenceRoute?: { name: string; waypoints: Coordinate[] } | null;
  onClearReferenceRoute?: () => void;
  deviationThreshold?: number;
  onDeviationThresholdChange?: (value: number) => void;
  isOnline: boolean;
}

// Gray placeholder tile data URL
const GRAY_TILE =
  "data:image/gif;base64,R0lGODlhAQABAIAAAMLCwgAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==";

function formatRecordDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function MapView({
  viewRoute,
  onViewRouteClear,
  referenceRoute,
  onClearReferenceRoute,
  deviationThreshold = 5,
  onDeviationThresholdChange,
  isOnline,
}: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const polylineRef = useRef<any>(null);
  const referencePolylineRef = useRef<any>(null);
  const positionMarkerRef = useRef<any>(null);
  const accuracyCircleRef = useRef<any>(null);
  const startMarkerRef = useRef<any>(null);
  const watchIdRef = useRef<number | null>(null);
  const persistentWatchIdRef = useRef<number | null>(null);
  const hasCenteredRef = useRef<boolean>(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const recordingStateRef = useRef<RecordingState>("idle");
  useEffect(() => {
    recordingStateRef.current = recordingState;
  }, [recordingState]);
  const [waypoints, setWaypoints] = useState<Coordinate[]>([]);
  const [distanceMeters, setDistanceMeters] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [routeName, setRouteName] = useState("");
  const [isLocating, setIsLocating] = useState(false);
  const [isLocatingHome, setIsLocatingHome] = useState(false);
  const [isDeviating, setIsDeviating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [downloadSheetOpen, setDownloadSheetOpen] = useState(false);

  // Cache stats
  const [cacheStats, setCacheStats] = useState<{
    tileCount: number;
    estimatedMB: number;
  } | null>(null);
  const [isClearingCache, setIsClearingCache] = useState(false);

  // Download area state
  const [downloadName, setDownloadName] = useState("");
  const [maxDownloadZoom, setMaxDownloadZoom] = useState(16);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState({
    done: 0,
    total: 0,
  });
  const [mapBounds, setMapBounds] = useState<{
    north: number;
    south: number;
    east: number;
    west: number;
  } | null>(null);
  const [downloadRecords, setDownloadRecords] = useState<MapDownloadRecord[]>(
    [],
  );

  const { mutateAsync: saveRoute, isPending: isSaving } = useSaveRoute();

  // Initialize map with offline-capable tile layer
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const map = L.map(mapRef.current, {
      center: [51.505, -0.09],
      zoom: 15,
      zoomControl: true,
    });

    // Custom offline-capable tile layer
    const OfflineTileLayer = L.TileLayer.extend({
      createTile(
        coords: any,
        done: (err: any, tile: HTMLImageElement) => void,
      ) {
        const tile = document.createElement("img");
        tile.setAttribute("role", "presentation");
        const url = `https://tile.openstreetmap.org/${coords.z}/${coords.x}/${coords.y}.png`;
        getTileFromCache(url).then((cached) => {
          if (cached) {
            cached.blob().then((blob) => {
              tile.src = URL.createObjectURL(blob);
              done(null, tile);
            });
          } else if (navigator.onLine) {
            tile.onload = () => done(null, tile);
            tile.onerror = (e) => done(e, tile);
            tile.src = url;
            // Cache it passively
            cacheTile(url).catch(() => {});
          } else {
            tile.src = GRAY_TILE;
            tile.style.background = "#e5e7eb";
            done(null, tile);
          }
        });
        return tile;
      },
    });

    new (OfflineTileLayer as any)("", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    mapInstance.current = map;

    // Track bounds changes for download
    const updateBounds = () => {
      const b = map.getBounds();
      setMapBounds({
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest(),
      });
    };
    map.on("moveend", updateBounds);
    map.on("zoomend", updateBounds);
    updateBounds();

    // Try to get initial position
    if (navigator.geolocation) {
      setIsLocating(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          map.setView([pos.coords.latitude, pos.coords.longitude], 16);
          hasCenteredRef.current = true;
          setIsLocating(false);
        },
        () => setIsLocating(false),
        { timeout: 8000 },
      );
    }

    persistentWatchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        const map = mapInstance.current;
        if (!map) return;
        if (!hasCenteredRef.current) {
          map.setView([latitude, longitude], 16);
          hasCenteredRef.current = true;
        }
        const posIcon = L.divIcon({
          className: "",
          html: `<div class="position-marker-pulse"><div class="position-marker-dot"></div></div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        });
        if (positionMarkerRef.current) {
          positionMarkerRef.current.setLatLng([latitude, longitude]);
        } else {
          positionMarkerRef.current = L.marker([latitude, longitude], {
            icon: posIcon,
          }).addTo(map);
        }
        if (accuracyCircleRef.current) {
          accuracyCircleRef.current.setLatLng([latitude, longitude]);
          accuracyCircleRef.current.setRadius(accuracy);
        } else {
          accuracyCircleRef.current = L.circle([latitude, longitude], {
            radius: accuracy,
            className: "leaflet-accuracy-circle",
            weight: 1,
          }).addTo(map);
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );

    return () => {
      if (persistentWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(persistentWatchIdRef.current);
        persistentWatchIdRef.current = null;
      }
      map.remove();
      mapInstance.current = null;
    };
  }, []);

  // Draw / update reference route polyline
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    if (referencePolylineRef.current) {
      referencePolylineRef.current.remove();
      referencePolylineRef.current = null;
    }

    if (referenceRoute && referenceRoute.waypoints.length >= 2) {
      const latlngs = referenceRoute.waypoints.map(
        (w) => [w.latitude, w.longitude] as [number, number],
      );
      referencePolylineRef.current = L.polyline(latlngs, {
        color: "#f59e0b",
        weight: 4,
        opacity: 0.75,
        dashArray: "8 6",
      }).addTo(map);
    }
  }, [referenceRoute]);

  // View a specific route on the map
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !viewRoute) return;

    if (polylineRef.current) {
      polylineRef.current.remove();
      polylineRef.current = null;
    }
    if (startMarkerRef.current) {
      startMarkerRef.current.remove();
      startMarkerRef.current = null;
    }

    if (viewRoute.waypoints.length < 2) return;

    const latlngs = viewRoute.waypoints.map(
      (w) => [w.latitude, w.longitude] as [number, number],
    );
    const poly = L.polyline(latlngs, {
      color: "#3b8df0",
      weight: 4,
      opacity: 0.9,
    }).addTo(map);
    polylineRef.current = poly;

    const startIcon = L.divIcon({
      className: "",
      html: `<div style="width:14px;height:14px;border-radius:50%;background:#22c55e;border:3px solid white;box-shadow:0 0 8px rgba(34,197,94,0.8)"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
    startMarkerRef.current = L.marker(latlngs[0], { icon: startIcon }).addTo(
      map,
    );

    map.fitBounds(poly.getBounds(), { padding: [40, 40] });
  }, [viewRoute]);

  // Timer
  useEffect(() => {
    if (recordingState === "recording") {
      timerRef.current = setInterval(() => {
        setElapsedSeconds((s) => s + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [recordingState]);

  const addPosition = useCallback(
    (pos: GeolocationPosition) => {
      const { latitude, longitude, speed, accuracy } = pos.coords;
      const map = mapInstance.current;
      if (!map) return;

      const posIcon = L.divIcon({
        className: "",
        html: `<div class="position-marker-pulse"><div class="position-marker-dot"></div></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });

      if (positionMarkerRef.current) {
        positionMarkerRef.current.setLatLng([latitude, longitude]);
      } else {
        positionMarkerRef.current = L.marker([latitude, longitude], {
          icon: posIcon,
        }).addTo(map);
      }

      if (accuracyCircleRef.current) {
        accuracyCircleRef.current.setLatLng([latitude, longitude]);
        accuracyCircleRef.current.setRadius(accuracy);
      } else {
        accuracyCircleRef.current = L.circle([latitude, longitude], {
          radius: accuracy,
          className: "leaflet-accuracy-circle",
          weight: 1,
        }).addTo(map);
      }

      if (recordingStateRef.current === "recording") {
        setWaypoints((prev) => {
          const newPoint = { latitude, longitude };
          const updated = [...prev, newPoint];

          const latlngs = updated.map(
            (w) => [w.latitude, w.longitude] as [number, number],
          );
          if (polylineRef.current) {
            polylineRef.current.setLatLngs(latlngs);
          } else {
            polylineRef.current = L.polyline(latlngs, {
              color: "#ef4444",
              weight: 4,
              opacity: 0.9,
            }).addTo(map);
          }

          if (!startMarkerRef.current && updated.length === 1) {
            const startIcon = L.divIcon({
              className: "",
              html: `<div style="width:14px;height:14px;border-radius:50%;background:#22c55e;border:3px solid white;box-shadow:0 0 8px rgba(34,197,94,0.8)"></div>`,
              iconSize: [14, 14],
              iconAnchor: [7, 7],
            });
            startMarkerRef.current = L.marker(latlngs[0], {
              icon: startIcon,
            }).addTo(map);
          }

          if (prev.length > 0) {
            const last = prev[prev.length - 1];
            const d = haversineDistance(
              last.latitude,
              last.longitude,
              latitude,
              longitude,
            );
            setDistanceMeters((dm) => dm + d);
          }

          return updated;
        });

        map.panTo([latitude, longitude]);

        if (speed !== null) {
          setCurrentSpeed(speed);
        }

        // Deviation check
        if (referenceRoute && referenceRoute.waypoints.length >= 2) {
          const deviation = distanceToPolyline(
            latitude,
            longitude,
            referenceRoute.waypoints,
          );
          setIsDeviating(deviation > deviationThreshold);
        } else {
          setIsDeviating(false);
        }
      }
    },
    [referenceRoute, deviationThreshold],
  );

  const startRecording = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoError("Geolocation is not supported by your browser.");
      return;
    }

    setGeoError(null);
    setWaypoints([]);
    setDistanceMeters(0);
    setElapsedSeconds(0);
    setCurrentSpeed(0);
    setIsDeviating(false);

    if (polylineRef.current) {
      polylineRef.current.remove();
      polylineRef.current = null;
    }
    if (startMarkerRef.current) {
      startMarkerRef.current.remove();
      startMarkerRef.current = null;
    }
    if (onViewRouteClear) onViewRouteClear();

    setRecordingState("recording");

    watchIdRef.current = navigator.geolocation.watchPosition(
      addPosition,
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGeoError(
            "Location permission denied. Please allow location access.",
          );
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setGeoError("Location unavailable. Make sure GPS is enabled.");
        } else {
          setGeoError("Location timeout. Trying to reconnect...");
        }
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    );
  }, [addPosition, onViewRouteClear]);

  const pauseRecording = useCallback(() => {
    setRecordingState((s) => (s === "recording" ? "paused" : "recording"));
  }, []);

  const stopRecording = useCallback(() => {
    setRecordingState("stopped");
    setIsDeviating(false);
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const discardRecording = useCallback(() => {
    setRecordingState("idle");
    setWaypoints([]);
    setDistanceMeters(0);
    setElapsedSeconds(0);
    setCurrentSpeed(0);
    setIsDeviating(false);
    if (polylineRef.current) {
      polylineRef.current.remove();
      polylineRef.current = null;
    }
    if (startMarkerRef.current) {
      startMarkerRef.current.remove();
      startMarkerRef.current = null;
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!routeName.trim()) {
      toast.error("Please enter a route name");
      return;
    }
    if (!isOnline) {
      // Save offline
      try {
        await savePendingRoute({
          name: routeName.trim(),
          waypoints,
          distance: distanceMeters,
          timestamp: BigInt(Date.now()),
        });
        toast.success("Route saved offline — will sync when connected");
        setSaveDialogOpen(false);
        setRouteName("");
        discardRecording();
      } catch {
        toast.error("Failed to save route offline");
      }
      return;
    }
    try {
      await saveRoute({
        name: routeName.trim(),
        waypoints,
        distance: distanceMeters,
        timestamp: BigInt(Date.now()),
      });
      toast.success("Route saved!");
      setSaveDialogOpen(false);
      setRouteName("");
      discardRecording();
    } catch {
      toast.error("Failed to save route");
    }
  }, [
    routeName,
    waypoints,
    distanceMeters,
    saveRoute,
    discardRecording,
    isOnline,
  ]);

  const handleLocateMe = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser.");
      return;
    }
    setIsLocatingHome(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const map = mapInstance.current;
        if (map) {
          map.setView([pos.coords.latitude, pos.coords.longitude], 17, {
            animate: true,
          });
        }
        setIsLocatingHome(false);
      },
      () => {
        toast.error("Could not get your location. Make sure GPS is enabled.");
        setIsLocatingHome(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

  const handleOpenSettings = useCallback(async () => {
    setSettingsOpen(true);
    const stats = await getCacheStats();
    setCacheStats(stats);
  }, []);

  const handleClearCache = useCallback(async () => {
    setIsClearingCache(true);
    try {
      await clearTileCache();
      const stats = await getCacheStats();
      setCacheStats(stats);
      toast.success("Map cache cleared");
    } catch {
      toast.error("Failed to clear cache");
    }
    setIsClearingCache(false);
  }, []);

  const handleOpenDownload = useCallback(() => {
    const map = mapInstance.current;
    if (map) {
      const b = map.getBounds();
      setMapBounds({
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest(),
      });
    }
    setDownloadRecords(getMapDownloadRecords());
    setDownloadSheetOpen(true);
  }, []);

  const handleDownload = useCallback(async () => {
    if (!mapBounds || !downloadName.trim()) return;
    setIsDownloading(true);
    setDownloadProgress({ done: 0, total: 0 });
    try {
      const total = await downloadArea(
        mapBounds,
        12,
        maxDownloadZoom,
        (done, tot) => {
          setDownloadProgress({ done, total: tot });
        },
      );
      saveMapDownloadRecord({
        id: Date.now().toString(),
        name: downloadName.trim() || "Unnamed Map",
        date: Date.now(),
        tileCount: total,
        bounds: mapBounds,
        minZoom: 12,
        maxZoom: maxDownloadZoom,
      });
      setDownloadRecords(getMapDownloadRecords());
      setDownloadName("");
      toast.success(`Downloaded ${total} map tiles for offline use`);
    } catch {
      toast.error("Download failed");
    }
    setIsDownloading(false);
  }, [mapBounds, maxDownloadZoom, downloadName]);

  const handleDeleteRecord = useCallback((id: string) => {
    deleteMapDownloadRecord(id);
    setDownloadRecords(getMapDownloadRecords());
  }, []);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null)
        navigator.geolocation.clearWatch(watchIdRef.current);
      if (persistentWatchIdRef.current !== null)
        navigator.geolocation.clearWatch(persistentWatchIdRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const isRecordingActive =
    recordingState === "recording" || recordingState === "paused";

  const showDeviationWarning = isDeviating && recordingState === "recording";

  const estimatedTiles = mapBounds
    ? estimateTileCount(mapBounds, 12, maxDownloadZoom)
    : 0;
  const estimatedMB = ((estimatedTiles * 15) / 1024).toFixed(1);

  return (
    <div className="relative w-full h-full">
      <div
        ref={mapRef}
        data-ocid="map.canvas_target"
        className="w-full h-full"
      />
      <LiveCompass />

      {/* Offline / Online status badge */}
      <AnimatePresence>
        {!isOnline && (
          <motion.div
            key="offline-badge"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="absolute top-4 left-1/2 -translate-x-1/2 z-[1001] flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500/90 backdrop-blur-md border border-red-400/60 shadow-lg"
          >
            <WifiOff className="w-3.5 h-3.5 text-white" />
            <span className="text-xs font-bold text-white">Offline</span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isLocating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-card/90 backdrop-blur-md px-4 py-2 rounded-full flex items-center gap-2 text-sm text-muted-foreground border border-border"
          >
            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
            Locating...
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {geoError && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-4 left-4 right-20 z-[1000] bg-destructive/90 backdrop-blur-md px-4 py-3 rounded-xl flex items-start gap-3 border border-destructive/50"
          >
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-destructive-foreground" />
            <p className="text-sm text-destructive-foreground">{geoError}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isRecordingActive && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-4 left-4 right-20 z-[1000] bg-card/85 backdrop-blur-lg border border-border/50 rounded-2xl px-5 py-3 shadow-glass"
          >
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold mb-0.5">
                  Distance
                </p>
                <p className="text-lg font-display font-bold text-foreground leading-none">
                  {formatDistance(distanceMeters)}
                </p>
              </div>
              <div className="border-x border-border/40">
                <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold mb-0.5">
                  Time
                </p>
                <p className="text-lg font-display font-bold text-foreground leading-none">
                  {formatDuration(elapsedSeconds)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold mb-0.5">
                  Speed
                </p>
                <p className="text-lg font-display font-bold text-foreground leading-none">
                  {formatSpeed(currentSpeed)}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Deviation warning banner */}
      <AnimatePresence>
        {showDeviationWarning && (
          <motion.div
            data-ocid="map.deviation_warning"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="absolute top-24 left-4 right-4 z-[1001] bg-amber-500/95 backdrop-blur-md px-4 py-3 rounded-xl flex items-center gap-3 border border-amber-400/60 shadow-lg"
          >
            <AlertTriangle className="w-4 h-4 text-white flex-shrink-0" />
            <p className="text-sm font-bold text-white flex-1">
              Off Route — more than {deviationThreshold}m from reference
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {viewRoute && !isRecordingActive && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-4 left-4 right-20 z-[1000] bg-card/85 backdrop-blur-lg border border-border/50 rounded-2xl px-5 py-3 shadow-glass flex items-center justify-between"
          >
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">
                Viewing Route
              </p>
              <p className="font-display font-bold text-foreground">
                {viewRoute.name}
              </p>
            </div>
            <button
              type="button"
              onClick={onViewRouteClear}
              className="text-muted-foreground hover:text-foreground transition-colors text-sm p-1"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reference route indicator (idle, not recording) */}
      <AnimatePresence>
        {referenceRoute && !isRecordingActive && !viewRoute && (
          <motion.div
            data-ocid="map.reference_route_panel"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-4 left-4 right-20 z-[1000] bg-card/85 backdrop-blur-lg border border-amber-500/40 rounded-2xl px-5 py-3 shadow-glass flex items-center justify-between"
          >
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 flex-shrink-0 animate-pulse" />
              <div>
                <p className="text-xs text-amber-600 dark:text-amber-400 uppercase tracking-widest font-semibold">
                  Reference Route
                </p>
                <p className="font-display font-bold text-foreground text-sm">
                  {referenceRoute.name}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClearReferenceRoute}
              className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-lg hover:bg-muted/50"
              title="Clear reference route"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reference indicator during recording */}
      <AnimatePresence>
        {referenceRoute && isRecordingActive && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="absolute top-24 right-4 z-[1000] bg-amber-500/15 backdrop-blur-sm border border-amber-500/30 rounded-xl px-3 py-1.5 flex items-center gap-1.5"
          >
            <Compass className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
              {referenceRoute.name}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Map overlay buttons: Download + Settings + Locate */}
      <div className="absolute bottom-28 right-4 z-[1000] flex flex-col gap-2">
        <motion.button
          data-ocid="download_area.open_modal_button"
          type="button"
          onClick={handleOpenDownload}
          whileTap={{ scale: 0.92 }}
          whileHover={{ scale: 1.05 }}
          className="w-11 h-11 rounded-full bg-card/85 backdrop-blur-lg border border-border/50 shadow-glass flex items-center justify-center text-foreground hover:text-primary hover:border-primary/50 transition-colors"
          title="Download map area"
        >
          <Download className="w-5 h-5" />
        </motion.button>

        <motion.button
          data-ocid="settings.open_modal_button"
          type="button"
          onClick={handleOpenSettings}
          whileTap={{ scale: 0.92 }}
          whileHover={{ scale: 1.05 }}
          className="w-11 h-11 rounded-full bg-card/85 backdrop-blur-lg border border-border/50 shadow-glass flex items-center justify-center text-foreground hover:text-primary hover:border-primary/50 transition-colors"
          title="Settings"
        >
          <Settings className="w-5 h-5" />
        </motion.button>

        <motion.button
          data-ocid="map.locate_button"
          type="button"
          onClick={handleLocateMe}
          disabled={isLocatingHome}
          whileTap={{ scale: 0.92 }}
          whileHover={{ scale: 1.05 }}
          className="w-11 h-11 rounded-full bg-card/85 backdrop-blur-lg border border-border/50 shadow-glass flex items-center justify-center text-foreground hover:text-primary hover:border-primary/50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          title="Go to my location"
        >
          {isLocatingHome ? (
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          ) : (
            <LocateFixed className="w-5 h-5" />
          )}
        </motion.button>
      </div>

      <div className="absolute bottom-4 left-4 right-4 z-[1000]">
        <motion.div
          className="bg-card/85 backdrop-blur-lg border border-border/50 rounded-2xl px-5 py-4 shadow-glass"
          layout
        >
          <AnimatePresence mode="wait">
            {recordingState === "idle" && (
              <motion.div
                key="idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex justify-center"
              >
                <Button
                  data-ocid="record.primary_button"
                  onClick={startRecording}
                  size="lg"
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl h-12 text-base font-display font-semibold gap-2 shadow-lg"
                >
                  <Navigation className="w-5 h-5" />
                  {referenceRoute ? "Start Following Route" : "Start Recording"}
                </Button>
              </motion.div>
            )}

            {(recordingState === "recording" ||
              recordingState === "paused") && (
              <motion.div
                key="recording"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex gap-3"
              >
                <Button
                  data-ocid="stop.button"
                  onClick={stopRecording}
                  size="lg"
                  variant="destructive"
                  className="flex-1 rounded-xl h-12 text-base font-display font-semibold gap-2"
                >
                  <Square className="w-4 h-4 fill-current" />
                  Stop
                </Button>
                <Button
                  onClick={pauseRecording}
                  size="lg"
                  variant="secondary"
                  className="flex-1 rounded-xl h-12 text-base font-display font-semibold gap-2"
                >
                  {recordingState === "recording" ? (
                    <>
                      <Pause className="w-4 h-4" /> Pause
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" /> Resume
                    </>
                  )}
                </Button>
              </motion.div>
            )}

            {recordingState === "stopped" && (
              <motion.div
                key="stopped"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-3"
              >
                <div className="flex items-center justify-between text-sm text-muted-foreground px-1">
                  <span>{formatDistance(distanceMeters)}</span>
                  <span>{formatDuration(elapsedSeconds)}</span>
                  <span>{waypoints.length} points</span>
                </div>

                <div className="flex justify-center">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        data-ocid="record.export_button"
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-xl h-8 px-3 text-xs font-semibold"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Export Route
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="center" className="rounded-xl">
                      <DropdownMenuItem
                        className="gap-2 cursor-pointer"
                        onClick={() => {
                          exportGPX("Recorded Route", waypoints);
                          toast.success("Route exported as GPX");
                        }}
                      >
                        <MapIcon className="w-4 h-4" />
                        Export GPX
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="gap-2 cursor-pointer"
                        onClick={() => {
                          exportKML("Recorded Route", waypoints);
                          toast.success("Route exported as KML");
                        }}
                      >
                        <FileText className="w-4 h-4" />
                        Export KML
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="flex gap-3">
                  <Button
                    data-ocid="save.primary_button"
                    onClick={() => setSaveDialogOpen(true)}
                    size="lg"
                    className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl h-12 font-display font-semibold gap-2"
                  >
                    <Save className="w-4 h-4" />
                    {isOnline ? "Save Route" : "Save Offline"}
                  </Button>
                  <Button
                    data-ocid="discard.button"
                    onClick={discardRecording}
                    size="lg"
                    variant="outline"
                    className="flex-1 rounded-xl h-12 font-display font-semibold gap-2 border-destructive/40 text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="w-4 h-4" />
                    Discard
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Save Route Dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="mx-4 rounded-2xl bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">
              {isOnline ? "Save Route" : "Save Route Offline"}
            </DialogTitle>
          </DialogHeader>
          {!isOnline && (
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-600 dark:text-amber-400">
              <WifiOff className="w-3.5 h-3.5 flex-shrink-0" />
              Route will sync to the cloud when you&apos;re back online.
            </div>
          )}
          <div className="space-y-3">
            <Label htmlFor="route-name" className="text-sm font-semibold">
              Route Name
            </Label>
            <Input
              data-ocid="route.input"
              id="route-name"
              placeholder="e.g. Morning Run"
              value={routeName}
              onChange={(e) => setRouteName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              className="rounded-xl"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              {formatDistance(distanceMeters)} &middot; {waypoints.length}{" "}
              waypoints
            </p>
          </div>
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setSaveDialogOpen(false)}
              className="flex-1 rounded-xl"
            >
              Cancel
            </Button>
            <Button
              data-ocid="route.confirm_button"
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 bg-primary text-primary-foreground rounded-xl"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Download Area Panel */}
      {downloadSheetOpen && (
        <div
          role="button"
          tabIndex={-1}
          aria-label="Close panel"
          className="fixed inset-0"
          style={{ zIndex: 9998 }}
          onClick={() => setDownloadSheetOpen(false)}
          onKeyDown={(e) => e.key === "Escape" && setDownloadSheetOpen(false)}
        />
      )}
      <div
        data-ocid="download_area.sheet"
        className="fixed left-0 right-0 bottom-0 rounded-t-2xl bg-card border-t border-border px-6 pb-8 max-h-[85vh] overflow-y-auto transition-transform duration-300"
        style={{
          zIndex: 9999,
          transform: downloadSheetOpen ? "translateY(0)" : "translateY(100%)",
        }}
      >
        <div className="mb-6 flex items-center justify-between pt-5">
          <div className="font-display text-lg flex items-center gap-2 font-semibold">
            <Download className="w-4 h-4 text-primary" />
            Download Map Area
          </div>
          <button
            type="button"
            className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
            onClick={() => setDownloadSheetOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-5">
          {/* Name input */}
          <div className="space-y-2">
            <Label htmlFor="download-name" className="text-sm font-semibold">
              Map Name
            </Label>
            <Input
              data-ocid="download_area.input"
              id="download-name"
              placeholder="e.g. City Centre"
              value={downloadName}
              onChange={(e) => setDownloadName(e.target.value)}
              className="rounded-xl"
            />
          </div>

          {/* Current bounds */}
          {mapBounds && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-muted/50 rounded-xl px-3 py-2">
                <p className="text-muted-foreground">North</p>
                <p className="font-mono font-semibold">
                  {mapBounds.north.toFixed(4)}
                </p>
              </div>
              <div className="bg-muted/50 rounded-xl px-3 py-2">
                <p className="text-muted-foreground">South</p>
                <p className="font-mono font-semibold">
                  {mapBounds.south.toFixed(4)}
                </p>
              </div>
              <div className="bg-muted/50 rounded-xl px-3 py-2">
                <p className="text-muted-foreground">East</p>
                <p className="font-mono font-semibold">
                  {mapBounds.east.toFixed(4)}
                </p>
              </div>
              <div className="bg-muted/50 rounded-xl px-3 py-2">
                <p className="text-muted-foreground">West</p>
                <p className="font-mono font-semibold">
                  {mapBounds.west.toFixed(4)}
                </p>
              </div>
            </div>
          )}

          {/* Zoom range */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-foreground text-sm">
                  Max Zoom Level
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Higher = more detail, more tiles
                </p>
              </div>
              <span className="text-sm font-bold text-primary tabular-nums bg-primary/10 px-3 py-1 rounded-full">
                {maxDownloadZoom}
              </span>
            </div>
            <Slider
              min={12}
              max={17}
              step={1}
              value={[maxDownloadZoom]}
              onValueChange={([val]) => setMaxDownloadZoom(val)}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>12 (overview)</span>
              <span>17 (street detail)</span>
            </div>
          </div>

          {/* Estimates */}
          <div className="flex items-center justify-between bg-muted/30 rounded-xl px-4 py-3">
            <div className="text-sm">
              <span className="text-muted-foreground">Estimated: </span>
              <span className="font-bold text-foreground">
                {estimatedTiles.toLocaleString()} tiles
              </span>
              <span className="text-muted-foreground">
                {" "}
                (~{estimatedMB} MB)
              </span>
            </div>
          </div>

          {/* Download progress */}
          {isDownloading && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Downloading...</span>
                <span>
                  {downloadProgress.done} / {downloadProgress.total}
                </span>
              </div>
              <Progress
                value={
                  downloadProgress.total > 0
                    ? (downloadProgress.done / downloadProgress.total) * 100
                    : 0
                }
                className="h-2 rounded-full"
              />
            </div>
          )}

          <Button
            data-ocid="download_area.submit_button"
            onClick={handleDownload}
            disabled={isDownloading || !isOnline || !downloadName.trim()}
            className="w-full bg-primary text-primary-foreground rounded-xl h-12 font-display font-semibold gap-2"
          >
            {isDownloading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Downloading...
              </>
            ) : !isOnline ? (
              <>
                <WifiOff className="w-4 h-4" />
                Offline — Connect to Download
              </>
            ) : !downloadName.trim() ? (
              <>
                <Download className="w-4 h-4" />
                Enter a name to download
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Download {estimatedTiles.toLocaleString()} Tiles
              </>
            )}
          </Button>

          {/* Downloaded Maps list */}
          <div className="border-t border-border/40 pt-5 space-y-3">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-primary" />
              <p className="font-semibold text-foreground text-sm">
                Downloaded Maps
              </p>
            </div>

            {downloadRecords.length === 0 ? (
              <p
                data-ocid="download_area.empty_state"
                className="text-xs text-muted-foreground text-center py-3"
              >
                No maps downloaded yet
              </p>
            ) : (
              <div className="space-y-2">
                {downloadRecords.map((record, idx) => (
                  <div
                    key={record.id}
                    data-ocid={`download_area.item.${idx + 1}`}
                    className="flex items-center justify-between bg-muted/30 rounded-xl px-4 py-3 gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-foreground truncate">
                        {record.name}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatRecordDate(record.date)} &middot;{" "}
                        {record.tileCount.toLocaleString()} tiles (~
                        {((record.tileCount * 15) / 1024).toFixed(1)} MB)
                      </p>
                    </div>
                    <button
                      type="button"
                      data-ocid={`download_area.delete_button.${idx + 1}`}
                      onClick={() => handleDeleteRecord(record.id)}
                      className="flex-shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      title="Delete this download record"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Settings Panel */}
      {settingsOpen && (
        <div
          role="button"
          tabIndex={-1}
          aria-label="Close panel"
          className="fixed inset-0"
          style={{ zIndex: 9998 }}
          onClick={() => setSettingsOpen(false)}
          onKeyDown={(e) => e.key === "Escape" && setSettingsOpen(false)}
        />
      )}
      <div
        data-ocid="settings.sheet"
        className="fixed left-0 right-0 bottom-0 rounded-t-2xl bg-card border-t border-border px-6 pb-8 max-h-[85vh] overflow-y-auto transition-transform duration-300"
        style={{
          zIndex: 9999,
          transform: settingsOpen ? "translateY(0)" : "translateY(100%)",
        }}
      >
        <div className="mb-6 flex items-center justify-between pt-5">
          <div className="font-display text-lg flex items-center gap-2 font-semibold">
            <Settings className="w-4 h-4 text-primary" />
            Settings
          </div>
          <button
            type="button"
            className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
            onClick={() => setSettingsOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-6">
          {/* Deviation threshold */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-foreground text-sm">
                  Deviation Threshold
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Warn when off route by more than this distance
                </p>
              </div>
              <span className="text-sm font-bold text-primary tabular-nums bg-primary/10 px-3 py-1 rounded-full">
                {deviationThreshold} m
              </span>
            </div>
            <Slider
              data-ocid="settings.deviation_threshold.input"
              min={5}
              max={100}
              step={5}
              value={[deviationThreshold]}
              onValueChange={([val]) => onDeviationThresholdChange?.(val)}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>5 m</span>
              <span>100 m</span>
            </div>
          </div>

          {/* Map Cache section */}
          <div className="space-y-3 border-t border-border/40 pt-5">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-primary" />
              <p className="font-semibold text-foreground text-sm">Map Cache</p>
            </div>
            {cacheStats ? (
              <div className="flex items-center justify-between bg-muted/30 rounded-xl px-4 py-3">
                <div className="text-sm">
                  <span className="font-bold text-foreground">
                    {cacheStats.tileCount.toLocaleString()}
                  </span>
                  <span className="text-muted-foreground"> tiles cached</span>
                  <span className="text-muted-foreground ml-2">
                    (~{cacheStats.estimatedMB.toFixed(1)} MB)
                  </span>
                </div>
                {cacheStats.tileCount === 0 && (
                  <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
            ) : (
              <div className="h-12 bg-muted/30 rounded-xl animate-pulse" />
            )}
            <Button
              data-ocid="settings.clear_cache_button"
              variant="outline"
              size="sm"
              disabled={isClearingCache || cacheStats?.tileCount === 0}
              onClick={handleClearCache}
              className="w-full rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10"
            >
              {isClearingCache ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
                  Clearing...
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5 mr-2" />
                  Clear Cache
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
