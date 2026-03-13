import L from "leaflet";
import { useCallback, useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
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
import { useSaveRoute } from "@/hooks/useQueries";
import { exportGPX, exportKML } from "@/utils/exportRoute";
import {
  distanceToPolyline,
  formatDistance,
  formatDuration,
  formatSpeed,
  haversineDistance,
} from "@/utils/haversine";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";
import {
  AlertCircle,
  AlertTriangle,
  Compass,
  Download,
  FileText,
  Loader2,
  Map as MapIcon,
  Navigation,
  Pause,
  Play,
  Save,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import type { Coordinate } from "../backend.d";

L.Icon.Default.mergeOptions({ iconRetinaUrl, iconUrl, shadowUrl });

type RecordingState = "idle" | "recording" | "paused" | "stopped";

interface MapViewProps {
  viewRoute?: { name: string; waypoints: Coordinate[] } | null;
  onViewRouteClear?: () => void;
  referenceRoute?: { name: string; waypoints: Coordinate[] } | null;
  onClearReferenceRoute?: () => void;
}

export default function MapView({
  viewRoute,
  onViewRouteClear,
  referenceRoute,
  onClearReferenceRoute,
}: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const referencePolylineRef = useRef<L.Polyline | null>(null);
  const positionMarkerRef = useRef<L.Marker | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);
  const startMarkerRef = useRef<L.Marker | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [waypoints, setWaypoints] = useState<Coordinate[]>([]);
  const [distanceMeters, setDistanceMeters] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [routeName, setRouteName] = useState("");
  const [isLocating, setIsLocating] = useState(false);
  const [isDeviating, setIsDeviating] = useState(false);

  const { mutateAsync: saveRoute, isPending: isSaving } = useSaveRoute();

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const map = L.map(mapRef.current, {
      center: [51.505, -0.09],
      zoom: 15,
      zoomControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    mapInstance.current = map;

    // Try to get initial position
    if (navigator.geolocation) {
      setIsLocating(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          map.setView([pos.coords.latitude, pos.coords.longitude], 16);
          setIsLocating(false);
        },
        () => setIsLocating(false),
        { timeout: 8000 },
      );
    }

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, []);

  // Draw / update reference route polyline
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    // Remove old reference polyline
    if (referencePolylineRef.current) {
      referencePolylineRef.current.remove();
      referencePolylineRef.current = null;
    }

    if (referenceRoute && referenceRoute.waypoints.length >= 2) {
      const latlngs = referenceRoute.waypoints.map(
        (w) => [w.latitude, w.longitude] as [number, number],
      );
      const refPoly = L.polyline(latlngs, {
        color: "#f59e0b",
        weight: 4,
        opacity: 0.85,
        dashArray: "8, 6",
      }).addTo(map);
      referencePolylineRef.current = refPoly;

      // If idle, pan to reference route
      if (recordingState === "idle") {
        map.fitBounds(refPoly.getBounds(), { padding: [40, 40] });
      }
    }
  }, [referenceRoute, recordingState]);

  // Display a saved/viewed route
  useEffect(() => {
    if (!mapInstance.current || !viewRoute) return;
    const map = mapInstance.current;

    if (polylineRef.current) {
      polylineRef.current.remove();
      polylineRef.current = null;
    }
    if (startMarkerRef.current) {
      startMarkerRef.current.remove();
      startMarkerRef.current = null;
    }
    if (positionMarkerRef.current) {
      positionMarkerRef.current.remove();
      positionMarkerRef.current = null;
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

      if (recordingState === "recording") {
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
              color: "#3b8df0",
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
          setIsDeviating(deviation > 5);
        } else {
          setIsDeviating(false);
        }
      }
    },
    [recordingState, referenceRoute],
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
  }, [routeName, waypoints, distanceMeters, saveRoute, discardRecording]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null)
        navigator.geolocation.clearWatch(watchIdRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const isRecordingActive =
    recordingState === "recording" || recordingState === "paused";

  // How far below the stats/geo-error panel the deviation banner sits
  // We show deviation only when actively recording
  const showDeviationWarning = isDeviating && recordingState === "recording";

  return (
    <div className="relative w-full h-full">
      <div
        ref={mapRef}
        data-ocid="map.canvas_target"
        className="w-full h-full"
      />

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
            className="absolute top-4 left-4 right-4 z-[1000] bg-destructive/90 backdrop-blur-md px-4 py-3 rounded-xl flex items-start gap-3 border border-destructive/50"
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
            className="absolute top-4 left-4 right-4 z-[1000] bg-card/85 backdrop-blur-lg border border-border/50 rounded-2xl px-5 py-3 shadow-glass"
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
              Off Route — more than 5m from reference
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
            className="absolute top-4 left-4 right-4 z-[1000] bg-card/85 backdrop-blur-lg border border-border/50 rounded-2xl px-5 py-3 shadow-glass flex items-center justify-between"
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
            className="absolute top-4 left-4 right-4 z-[1000] bg-card/85 backdrop-blur-lg border border-amber-500/40 rounded-2xl px-5 py-3 shadow-glass flex items-center justify-between"
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

                {/* Export row */}
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

                {/* Save / Discard row */}
                <div className="flex gap-3">
                  <Button
                    data-ocid="save.primary_button"
                    onClick={() => setSaveDialogOpen(true)}
                    size="lg"
                    className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl h-12 font-display font-semibold gap-2"
                  >
                    <Save className="w-4 h-4" />
                    Save Route
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

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="mx-4 rounded-2xl bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">
              Save Route
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label
              htmlFor="route-name"
              className="text-muted-foreground text-sm"
            >
              Route name
            </Label>
            <Input
              id="route-name"
              data-ocid="route.save_input"
              value={routeName}
              onChange={(e) => setRouteName(e.target.value)}
              placeholder="e.g. Morning Run in the Park"
              className="bg-input border-border rounded-xl h-11"
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              autoFocus
            />
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
    </div>
  );
}
