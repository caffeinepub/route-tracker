import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActor } from "@/hooks/useActor";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  LogOut,
  Radio,
  StopCircle,
  UserPlus,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type {
  backendInterface as FullBackendInterface,
  Option,
  Participant,
} from "../backend.d";

const PARTICIPANT_COLORS = [
  "#0ea5e9",
  "#22c55e",
  "#f97316",
  "#a855f7",
  "#ef4444",
  "#14b8a6",
  "#eab308",
  "#ec4899",
];

interface LiveSession {
  sessionId: string;
  participantId: string;
  isAdmin: boolean;
  name: string;
}

function unwrapOption<T>(opt: Option<T>): T | null {
  if (opt.__kind__ === "Some") return opt.value;
  return null;
}

function createParticipantIcon(name: string, color: string, isSelf: boolean) {
  const size = isSelf ? 44 : 36;
  const fontSize = isSelf ? 16 : 13;
  const initial = name.charAt(0).toUpperCase();
  const html = `
    <div style="display:flex;flex-direction:column;align-items:center;">
      <div style="
        width:${size}px;height:${size}px;
        background:${color};
        border-radius:50%;
        border:${isSelf ? "3px solid white" : "2px solid rgba(255,255,255,0.8)"};
        display:flex;align-items:center;justify-content:center;
        font-weight:700;font-size:${fontSize}px;color:white;
        box-shadow:0 2px 8px rgba(0,0,0,0.35);
        font-family:'Bricolage Grotesque',sans-serif;
      ">${initial}</div>
      <div style="
        margin-top:3px;
        background:${color};
        color:white;
        font-size:10px;
        font-weight:600;
        padding:1px 6px;
        border-radius:999px;
        white-space:nowrap;
        box-shadow:0 1px 4px rgba(0,0,0,0.3);
        font-family:'Bricolage Grotesque',sans-serif;
        max-width:80px;overflow:hidden;text-overflow:ellipsis;
      ">${name}</div>
    </div>
  `;
  return L.divIcon({
    html,
    className: "",
    iconSize: [size + 20, size + 28],
    iconAnchor: [(size + 20) / 2, size / 2],
  });
}

interface Props {
  autoJoinSessionId?: string | null;
}

export default function LiveTrackingView({ autoJoinSessionId }: Props) {
  const { actor: _actor, isFetching: isActorLoading } = useActor();
  const actor = _actor as unknown as FullBackendInterface | null;

  const [session, setSession] = useState<LiveSession | null>(() => {
    try {
      const stored = localStorage.getItem("liveSession");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [showStartDialog, setShowStartDialog] = useState(false);
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [startName, setStartName] = useState("");
  const [joinName, setJoinName] = useState("");
  const [joinId, setJoinId] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const colorMapRef = useRef<Map<string, string>>(new Map());

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [locationGranted, setLocationGranted] = useState<boolean | null>(null);
  const currentPositionRef = useRef<{ lat: number; lng: number } | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionRef = useRef<LiveSession | null>(session);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    if (autoJoinSessionId && !session) {
      setJoinId(autoJoinSessionId);
      setShowJoinDialog(true);
    }
  }, [autoJoinSessionId, session]);

  const saveSession = (s: LiveSession | null) => {
    if (s) {
      localStorage.setItem("liveSession", JSON.stringify(s));
    } else {
      localStorage.removeItem("liveSession");
    }
    setSession(s);
  };

  const handleStartSession = async () => {
    if (!startName.trim()) return;
    if (isActorLoading) {
      toast.info("Connecting to backend, please try again in a moment");
      return;
    }
    if (!actor) {
      toast.error("Backend not available. Please refresh and try again.");
      return;
    }
    setIsLoading(true);
    try {
      const result = await actor.createSession(startName.trim());
      const newSession: LiveSession = {
        sessionId: result.sessionId,
        participantId: result.participantId,
        isAdmin: true,
        name: startName.trim(),
      };
      saveSession(newSession);
      setShowStartDialog(false);
      setStartName("");
      toast.success("Live session started!");
    } catch (err) {
      console.error("Failed to start session:", err);
      toast.error("Failed to start session. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinSession = async () => {
    if (!joinName.trim() || !joinId.trim()) return;
    if (isActorLoading) {
      toast.info("Connecting to backend, please try again in a moment");
      return;
    }
    if (!actor) {
      toast.error("Backend not available. Please refresh and try again.");
      return;
    }
    setIsLoading(true);
    try {
      const result = await actor.joinSession(joinId.trim(), joinName.trim());
      const unwrapped = unwrapOption(result);
      if (!unwrapped) {
        toast.error("Session not found or has ended");
        return;
      }
      const newSession: LiveSession = {
        sessionId: joinId.trim(),
        participantId: unwrapped.participantId,
        isAdmin: false,
        name: joinName.trim(),
      };
      saveSession(newSession);
      setShowJoinDialog(false);
      setJoinName("");
      setJoinId("");
      const url = new URL(window.location.href);
      url.searchParams.delete("liveSession");
      window.history.replaceState({}, "", url.toString());
      toast.success("Joined session!");
    } catch (err) {
      console.error("Failed to join session:", err);
      toast.error("Failed to join session. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (pollIntervalRef.current !== null) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const handleLeave = async () => {
    if (!actor || !session) return;
    try {
      await actor.leaveSession(session.sessionId, session.participantId);
    } catch {}
    saveSession(null);
    stopTracking();
    toast.success("Left session");
  };

  const handleEnd = async () => {
    if (!actor || !session) return;
    try {
      await actor.endSession(session.sessionId, session.participantId);
    } catch {}
    saveSession(null);
    stopTracking();
    toast.success("Session ended");
  };

  const getColor = useCallback((participantId: string, index: number) => {
    if (!colorMapRef.current.has(participantId)) {
      colorMapRef.current.set(
        participantId,
        PARTICIPANT_COLORS[index % PARTICIPANT_COLORS.length],
      );
    }
    return colorMapRef.current.get(participantId)!;
  }, []);

  const updateMarkers = useCallback(
    (parts: Participant[], currentSession: LiveSession) => {
      if (!mapRef.current) return;
      const existingIds = new Set(markersRef.current.keys());
      for (const [idx, p] of parts.entries()) {
        const isSelf = p.id === currentSession.participantId;
        const color = getColor(p.id, idx);
        const latlng = [p.lat, p.lng];
        if (markersRef.current.has(p.id)) {
          const marker = markersRef.current.get(p.id)!;
          marker.setLatLng(latlng);
          marker.setIcon(createParticipantIcon(p.name, color, isSelf));
        } else {
          const marker = L.marker(latlng, {
            icon: createParticipantIcon(p.name, color, isSelf),
            zIndexOffset: isSelf ? 1000 : 0,
          }).addTo(mapRef.current!);
          markersRef.current.set(p.id, marker);
        }
        existingIds.delete(p.id);
      }
      for (const id of existingIds) {
        markersRef.current.get(id)?.remove();
        markersRef.current.delete(id);
      }
    },
    [getColor],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: stopTracking is stable
  const pollParticipants = useCallback(async () => {
    const s = sessionRef.current;
    if (!actor || !s) return;
    try {
      if (currentPositionRef.current) {
        await actor.updateLocation(
          s.sessionId,
          s.participantId,
          currentPositionRef.current.lat,
          currentPositionRef.current.lng,
        );
      }
      const result = await actor.getSessionParticipants(s.sessionId);
      const parts = unwrapOption(result);
      if (parts) {
        setParticipants(parts);
        updateMarkers(parts, s);
      } else {
        toast.error("Session has ended");
        saveSession(null);
        stopTracking();
      }
    } catch {}
  }, [actor, updateMarkers, stopTracking]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally keyed on sessionId only
  useEffect(() => {
    if (!session || !mapContainerRef.current) return;

    const timer = setTimeout(() => {
      if (!mapContainerRef.current || mapRef.current) return;

      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
        attributionControl: false,
      }).setView([20, 0], 2);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
      }).addTo(map);

      mapRef.current = map;

      if ("geolocation" in navigator) {
        watchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            currentPositionRef.current = { lat, lng };
            setLocationGranted(true);
            if (mapRef.current) {
              mapRef.current.setView([lat, lng], 15);
            }
          },
          () => {
            setLocationGranted(false);
          },
          { enableHighAccuracy: true, maximumAge: 0 },
        );
      }

      pollParticipants();
      pollIntervalRef.current = setInterval(pollParticipants, 3000);
    }, 100);

    return () => {
      clearTimeout(timer);
      stopTracking();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      markersRef.current.clear();
    };
  }, [session?.sessionId]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  useEffect(() => {
    if (!session || !mapRef.current) return;
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollParticipants();
    pollIntervalRef.current = setInterval(pollParticipants, 3000);
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [actor, pollParticipants]);

  const handleCopyLink = async () => {
    if (!session) return;
    const link = `${window.location.origin}?liveSession=${session.sessionId}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Invite link copied!");
    } catch {
      toast.error("Could not copy");
    }
  };

  const secondsAgo = (ts: bigint) => {
    const now = BigInt(Date.now()) * BigInt(1_000_000);
    const diff = Number(now - ts) / 1_000_000_000;
    if (diff < 5) return "just now";
    if (diff < 60) return `${Math.floor(diff)}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  // ── NO SESSION ─────────────────────────────────────────────────────────────
  if (!session) {
    return (
      <div className="flex flex-col h-full bg-background items-center justify-center p-6">
        <div className="text-center mb-10">
          <div className="w-20 h-20 mx-auto mb-5 rounded-2xl bg-live/15 flex items-center justify-center">
            <Radio className="w-10 h-10 text-live" />
          </div>
          <h1 className="text-3xl font-bold text-foreground font-display mb-2">
            Live Group Tracking
          </h1>
          <p className="text-muted-foreground text-sm max-w-xs mx-auto leading-relaxed">
            Start a session and invite friends to track each other&apos;s
            location in real time.
          </p>
        </div>

        <div className="w-full max-w-sm flex flex-col gap-3">
          <Button
            data-ocid="live.start_session_button"
            onClick={() => setShowStartDialog(true)}
            className="w-full h-14 text-base font-bold rounded-2xl bg-live text-live-foreground hover:bg-live/90 shadow-lg shadow-live/25"
            size="lg"
            disabled={isActorLoading}
          >
            <Radio className="w-5 h-5 mr-2" />
            {isActorLoading ? "Connecting…" : "Start Live Session"}
          </Button>

          <Button
            data-ocid="live.join_session_button"
            variant="outline"
            onClick={() => setShowJoinDialog(true)}
            className="w-full h-12 rounded-2xl border-border/60 font-semibold"
            disabled={isActorLoading}
          >
            <UserPlus className="w-4 h-4 mr-2" />
            {isActorLoading ? "Connecting…" : "Join a Session"}
          </Button>
        </div>

        {/* Start Session Dialog */}
        <Dialog open={showStartDialog} onOpenChange={setShowStartDialog}>
          <DialogContent className="rounded-3xl">
            <DialogHeader>
              <DialogTitle className="font-display text-xl">
                Start Live Session
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="start-name">Your First Name</Label>
                <Input
                  id="start-name"
                  data-ocid="live.name_input"
                  placeholder="e.g. Alex"
                  value={startName}
                  onChange={(e) => setStartName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleStartSession()}
                  className="rounded-xl"
                  autoFocus
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={handleStartSession}
                disabled={!startName.trim() || isLoading}
                className="w-full rounded-xl bg-live text-live-foreground hover:bg-live/90 font-bold"
              >
                {isLoading ? "Starting…" : "Start Session"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Join Session Dialog */}
        <Dialog open={showJoinDialog} onOpenChange={setShowJoinDialog}>
          <DialogContent className="rounded-3xl">
            <DialogHeader>
              <DialogTitle className="font-display text-xl">
                Join a Session
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="join-id">Session ID</Label>
                <Input
                  id="join-id"
                  data-ocid="live.session_id_input"
                  placeholder="Enter session ID"
                  value={joinId}
                  onChange={(e) => setJoinId(e.target.value)}
                  className="rounded-xl font-mono tracking-widest text-center text-lg"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="join-name">Your First Name</Label>
                <Input
                  id="join-name"
                  data-ocid="live.name_input"
                  placeholder="e.g. Sam"
                  value={joinName}
                  onChange={(e) => setJoinName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleJoinSession()}
                  className="rounded-xl"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={handleJoinSession}
                disabled={!joinName.trim() || !joinId.trim() || isLoading}
                className="w-full rounded-xl bg-live text-live-foreground hover:bg-live/90 font-bold"
              >
                {isLoading ? "Joining…" : "Join Session"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ── ACTIVE SESSION ─────────────────────────────────────────────────────────
  return (
    <div className="relative flex flex-col h-full overflow-hidden">
      <div ref={mapContainerRef} className="absolute inset-0 z-0" />

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-3 pt-3 pb-2 pointer-events-none">
        <div className="flex items-center gap-2 bg-background/85 backdrop-blur-md rounded-2xl px-3 py-1.5 shadow-md pointer-events-auto">
          <div className="w-2 h-2 rounded-full bg-live animate-pulse" />
          <span className="text-xs font-bold text-live">LIVE</span>
          <span className="text-xs text-muted-foreground">
            {participants.length} participant
            {participants.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          {locationGranted === false && (
            <div className="flex items-center gap-1 bg-destructive/90 text-destructive-foreground rounded-xl px-2.5 py-1.5 text-xs font-semibold">
              <WifiOff className="w-3 h-3" />
              GPS off
            </div>
          )}
          {locationGranted === true && (
            <div className="flex items-center gap-1 bg-live/90 text-live-foreground rounded-xl px-2.5 py-1.5 text-xs font-semibold">
              <Wifi className="w-3 h-3" />
              GPS on
            </div>
          )}
          {session.isAdmin ? (
            <button
              type="button"
              data-ocid="live.end_session_button"
              onClick={handleEnd}
              className="flex items-center gap-1.5 bg-destructive/90 text-destructive-foreground rounded-xl px-3 py-1.5 text-xs font-bold backdrop-blur-sm shadow-md"
            >
              <StopCircle className="w-3.5 h-3.5" />
              End
            </button>
          ) : (
            <button
              type="button"
              data-ocid="live.leave_session_button"
              onClick={handleLeave}
              className="flex items-center gap-1.5 bg-background/85 text-foreground rounded-xl px-3 py-1.5 text-xs font-bold backdrop-blur-sm shadow-md"
            >
              <LogOut className="w-3.5 h-3.5" />
              Leave
            </button>
          )}
        </div>
      </div>

      {/* Bottom panel */}
      <div className="absolute bottom-0 left-0 right-0 z-10">
        <button
          type="button"
          onClick={() => setPanelOpen((v) => !v)}
          className="w-full flex flex-col items-center bg-card/90 backdrop-blur-lg pt-2 pb-1 rounded-t-3xl shadow-[0_-4px_24px_rgba(0,0,0,0.12)] border-t border-border/40"
          aria-label={panelOpen ? "Collapse panel" : "Expand panel"}
        >
          <div className="w-10 h-1 rounded-full bg-border/60 mb-1" />
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="w-3.5 h-3.5" />
            <span>Session Info</span>
            {panelOpen ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronUp className="w-3.5 h-3.5" />
            )}
          </div>
        </button>

        {panelOpen && (
          <div className="bg-card/95 backdrop-blur-lg border-t border-border/30 px-4 pt-3 pb-4 max-h-64 overflow-y-auto">
            <div className="mb-3">
              <p className="text-xs text-muted-foreground mb-1 font-semibold uppercase tracking-widest">
                Session ID
              </p>
              <p className="font-mono text-2xl font-bold text-live tracking-widest text-center bg-live/10 rounded-xl py-2 px-3">
                {session.sessionId}
              </p>
            </div>

            <Button
              data-ocid="live.copy_link_button"
              variant="outline"
              size="sm"
              onClick={handleCopyLink}
              className="w-full rounded-xl mb-3 border-live/30 text-live hover:bg-live/10 font-semibold"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 mr-2" />
                  Copy Invite Link
                </>
              )}
            </Button>

            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                Participants ({participants.length})
              </p>
              <div className="space-y-1.5">
                {participants.length === 0 ? (
                  <p
                    data-ocid="live.participants.empty_state"
                    className="text-sm text-muted-foreground text-center py-2"
                  >
                    Waiting for others to join…
                  </p>
                ) : (
                  participants.map((p, idx) => (
                    <div
                      key={p.id}
                      data-ocid={`live.participant.item.${idx + 1}`}
                      className="flex items-center gap-2.5 py-1"
                    >
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                        style={{ background: getColor(p.id, idx) }}
                      >
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {p.name}
                          {p.id === session.participantId && (
                            <span className="text-xs text-live ml-1.5 font-medium">
                              (you)
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {secondsAgo(p.lastUpdated)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
