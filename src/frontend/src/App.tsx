import DownloadedMapsView from "@/components/DownloadedMapsView";
import MapView from "@/components/MapView";
import RoutesView from "@/components/RoutesView";
import { Toaster } from "@/components/ui/sonner";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Download, HardDrive, List, MapIcon, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import type { Coordinate } from "./backend.d";

const queryClient = new QueryClient();

type Tab = "map" | "routes" | "downloads";

interface ViewRoute {
  name: string;
  waypoints: Coordinate[];
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function AppContent() {
  const [activeTab, setActiveTab] = useState<Tab>("map");
  const [viewRoute, setViewRoute] = useState<ViewRoute | null>(null);
  const [referenceRoute, setReferenceRoute] = useState<ViewRoute | null>(null);
  const [deviationThreshold, setDeviationThreshold] = useState<number>(() => {
    const stored = localStorage.getItem("deviationThreshold");
    return stored ? Number(stored) : 5;
  });
  const isOnline = useOnlineStatus();

  // PWA install prompt
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  useEffect(() => {
    // Register service worker
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").catch(() => {
          // SW registration failed silently
        });
      });
    }

    // Listen for beforeinstallprompt
    const dismissed = localStorage.getItem("pwaInstallDismissed");
    if (dismissed) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
      setShowInstallBanner(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") {
      setShowInstallBanner(false);
      setInstallPrompt(null);
    }
  };

  const handleDismissInstall = () => {
    setShowInstallBanner(false);
    setInstallPrompt(null);
    localStorage.setItem("pwaInstallDismissed", "true");
  };

  const handleViewRoute = (route: ViewRoute) => {
    setViewRoute(route);
    setActiveTab("map");
  };

  const handleDeviationThresholdChange = (value: number) => {
    setDeviationThreshold(value);
    localStorage.setItem("deviationThreshold", String(value));
  };

  return (
    <div className="flex flex-col h-svh bg-background overflow-hidden">
      {/* Main content */}
      <main className="flex-1 relative overflow-hidden">
        <AnimatePresence mode="wait">
          {activeTab === "map" ? (
            <motion.div
              key="map"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0"
            >
              <MapView
                viewRoute={viewRoute}
                onViewRouteClear={() => setViewRoute(null)}
                referenceRoute={referenceRoute}
                onClearReferenceRoute={() => setReferenceRoute(null)}
                deviationThreshold={deviationThreshold}
                onDeviationThresholdChange={handleDeviationThresholdChange}
                isOnline={isOnline}
              />
            </motion.div>
          ) : activeTab === "routes" ? (
            <motion.div
              key="routes"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0"
            >
              <RoutesView
                onViewRoute={handleViewRoute}
                referenceRoute={referenceRoute}
                onSetReferenceRoute={setReferenceRoute}
                isOnline={isOnline}
              />
            </motion.div>
          ) : (
            <motion.div
              key="downloads"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0"
            >
              <DownloadedMapsView />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* PWA Install Banner */}
      <AnimatePresence>
        {showInstallBanner && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="flex-shrink-0 px-3 py-2 bg-card/95 backdrop-blur-lg border-t border-border/40"
          >
            <div className="flex items-center gap-3 bg-primary/10 border border-primary/20 rounded-2xl px-4 py-3">
              <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center">
                <Download className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground leading-tight">
                  Install Route Tracker
                </p>
                <p className="text-xs text-muted-foreground leading-tight mt-0.5">
                  Add to home screen for offline use
                </p>
              </div>
              <button
                type="button"
                data-ocid="pwa.install_button"
                onClick={handleInstall}
                className="flex-shrink-0 px-4 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-full transition-all hover:bg-primary/90 active:scale-95"
              >
                Install
              </button>
              <button
                type="button"
                data-ocid="pwa.dismiss_button"
                onClick={handleDismissInstall}
                className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
                aria-label="Dismiss install banner"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tab bar */}
      <nav className="flex-shrink-0 bg-card/90 backdrop-blur-lg border-t border-border/50">
        <div className="flex">
          <button
            type="button"
            data-ocid="nav.map_tab"
            onClick={() => setActiveTab("map")}
            className={`flex-1 flex flex-col items-center gap-1 py-3 px-2 transition-all duration-200 ${
              activeTab === "map"
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <div
              className={`relative p-1.5 rounded-xl transition-all duration-200 ${
                activeTab === "map" ? "bg-primary/15" : ""
              }`}
            >
              <MapIcon className="w-5 h-5" />
              {activeTab === "map" && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute inset-0 bg-primary/15 rounded-xl"
                />
              )}
            </div>
            <span className="text-xs font-semibold">Map</span>
          </button>
          <button
            type="button"
            data-ocid="nav.routes_tab"
            onClick={() => setActiveTab("routes")}
            className={`flex-1 flex flex-col items-center gap-1 py-3 px-2 transition-all duration-200 ${
              activeTab === "routes"
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <div
              className={`relative p-1.5 rounded-xl transition-all duration-200 ${
                activeTab === "routes" ? "bg-primary/15" : ""
              }`}
            >
              <List className="w-5 h-5" />
              {activeTab === "routes" && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute inset-0 bg-primary/15 rounded-xl"
                />
              )}
            </div>
            <span className="text-xs font-semibold">Routes</span>
          </button>
          <button
            type="button"
            data-ocid="nav.downloads_tab"
            onClick={() => setActiveTab("downloads")}
            className={`flex-1 flex flex-col items-center gap-1 py-3 px-2 transition-all duration-200 ${
              activeTab === "downloads"
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <div
              className={`relative p-1.5 rounded-xl transition-all duration-200 ${
                activeTab === "downloads" ? "bg-primary/15" : ""
              }`}
            >
              <HardDrive className="w-5 h-5" />
              {activeTab === "downloads" && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute inset-0 bg-primary/15 rounded-xl"
                />
              )}
            </div>
            <span className="text-xs font-semibold">Downloaded</span>
          </button>
        </div>
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
      <Toaster position="top-center" richColors />
    </QueryClientProvider>
  );
}
