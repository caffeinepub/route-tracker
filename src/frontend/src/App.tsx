import MapView from "@/components/MapView";
import RoutesView from "@/components/RoutesView";
import { Toaster } from "@/components/ui/sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { List, MapIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import type { Coordinate } from "./backend.d";

const queryClient = new QueryClient();

type Tab = "map" | "routes";

interface ViewRoute {
  name: string;
  waypoints: Coordinate[];
}

function AppContent() {
  const [activeTab, setActiveTab] = useState<Tab>("map");
  const [viewRoute, setViewRoute] = useState<ViewRoute | null>(null);
  const [referenceRoute, setReferenceRoute] = useState<ViewRoute | null>(null);

  const handleViewRoute = (route: ViewRoute) => {
    setViewRoute(route);
    setActiveTab("map");
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
              />
            </motion.div>
          ) : (
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
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Tab bar */}
      <nav className="flex-shrink-0 bg-card/90 backdrop-blur-lg border-t border-border/50">
        <div className="flex">
          <button
            type="button"
            data-ocid="nav.map_tab"
            onClick={() => setActiveTab("map")}
            className={`flex-1 flex flex-col items-center gap-1 py-3 px-4 transition-all duration-200 ${
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
            className={`flex-1 flex flex-col items-center gap-1 py-3 px-4 transition-all duration-200 ${
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
