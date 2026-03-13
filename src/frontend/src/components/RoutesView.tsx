import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useDeleteRoute, useGetRoutes } from "@/hooks/useQueries";
import { exportGPX, exportKML } from "@/utils/exportRoute";
import { formatDistance } from "@/utils/haversine";
import {
  Clock,
  Compass,
  Download,
  FileText,
  Map as MapIcon,
  MapPin,
  Navigation2,
  Route,
  Trash2,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";
import type { Coordinate } from "../backend.d";

interface RoutesViewProps {
  onViewRoute: (route: { name: string; waypoints: Coordinate[] }) => void;
  referenceRoute: { name: string; waypoints: Coordinate[] } | null;
  onSetReferenceRoute: (
    route: { name: string; waypoints: Coordinate[] } | null,
  ) => void;
}

function formatTimestamp(ts: bigint): string {
  const ms = Number(ts);
  const date = new Date(ms);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function RoutesView({
  onViewRoute,
  referenceRoute,
  onSetReferenceRoute,
}: RoutesViewProps) {
  const { data: routes, isLoading, isError } = useGetRoutes();
  const { mutateAsync: deleteRoute, isPending: isDeleting } = useDeleteRoute();
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);

  const handleDelete = async () => {
    if (deleteIndex === null) return;
    try {
      await deleteRoute(BigInt(deleteIndex));
      toast.success("Route deleted");
    } catch {
      toast.error("Failed to delete route");
    }
    setDeleteIndex(null);
  };

  const handleFollowToggle = (
    route: { name: string; waypoints: Coordinate[] },
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    if (referenceRoute?.name === route.name) {
      onSetReferenceRoute(null);
      toast.success("Reference route cleared");
    } else {
      onSetReferenceRoute({ name: route.name, waypoints: route.waypoints });
      toast.success(`Following "${route.name}"`);
    }
  };

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="px-5 pt-6 pb-4 border-b border-border/50">
        <h1 className="font-display text-2xl font-bold text-foreground">
          Saved Routes
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          {routes?.length
            ? `${routes.length} route${routes.length !== 1 ? "s" : ""} saved`
            : "Your recorded journeys"}
        </p>
        {referenceRoute && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mt-3 flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/30 rounded-xl"
          >
            <Compass className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
            <span className="text-xs text-amber-600 dark:text-amber-400 font-semibold">
              Following: {referenceRoute.name}
            </span>
          </motion.div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 w-full rounded-2xl" />
            ))}
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-destructive font-semibold">
              Failed to load routes
            </p>
            <p className="text-muted-foreground text-sm mt-1">
              Check your connection and try again
            </p>
          </div>
        )}

        {!isLoading && !isError && routes?.length === 0 && (
          <motion.div
            data-ocid="routes.empty_state"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center py-20 text-center px-6"
          >
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-5">
              <Route className="w-9 h-9 text-muted-foreground" />
            </div>
            <h3 className="font-display text-xl font-bold text-foreground mb-2">
              No Routes Yet
            </h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Start recording your first route from the Map tab. Your journeys
              will appear here.
            </p>
          </motion.div>
        )}

        <AnimatePresence mode="popLayout">
          {routes?.map((route, index) => {
            const isFollowing = referenceRoute?.name === route.name;
            return (
              <motion.div
                key={`${route.name}-${index}`}
                data-ocid={`routes.item.${index + 1}`}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card
                  className={`bg-card border-border/50 rounded-2xl overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-glass active:scale-[0.99] ${
                    isFollowing
                      ? "border-amber-500/50 shadow-amber-500/10 shadow-md"
                      : "hover:border-primary/40"
                  }`}
                  onClick={() =>
                    onViewRoute({
                      name: route.name,
                      waypoints: route.waypoints,
                    })
                  }
                >
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <div
                            className={`w-2 h-2 rounded-full flex-shrink-0 ${
                              isFollowing ? "bg-amber-500" : "bg-primary"
                            }`}
                          />
                          <h3 className="font-display font-bold text-foreground text-base truncate">
                            {route.name}
                          </h3>
                          {isFollowing && (
                            <span className="flex-shrink-0 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                              Reference
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Navigation2 className="w-3.5 h-3.5 text-primary" />
                            <span className="font-semibold text-foreground">
                              {formatDistance(route.distance)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <MapPin className="w-3.5 h-3.5" />
                            <span>{route.waypoints.length} pts</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Clock className="w-3.5 h-3.5" />
                            <span className="text-xs">
                              {formatTimestamp(route.timestamp)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {/* Follow button */}
                        <Button
                          data-ocid={`routes.follow_button.${index + 1}`}
                          variant="ghost"
                          size="icon"
                          className={`h-9 w-9 rounded-xl transition-colors ${
                            isFollowing
                              ? "text-amber-500 bg-amber-500/10 hover:bg-amber-500/20"
                              : "text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10"
                          }`}
                          onClick={(e) =>
                            handleFollowToggle(
                              { name: route.name, waypoints: route.waypoints },
                              e,
                            )
                          }
                          title={
                            isFollowing ? "Stop following" : "Follow this route"
                          }
                        >
                          <Compass className="w-4 h-4" />
                        </Button>

                        {/* Export button */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              data-ocid={`routes.export_button.${index + 1}`}
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/10"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="rounded-xl"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <DropdownMenuItem
                              className="gap-2 cursor-pointer"
                              onClick={() => {
                                exportGPX(route.name, route.waypoints);
                                toast.success("Route exported as GPX");
                              }}
                            >
                              <MapIcon className="w-4 h-4" />
                              Export GPX
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="gap-2 cursor-pointer"
                              onClick={() => {
                                exportKML(route.name, route.waypoints);
                                toast.success("Route exported as KML");
                              }}
                            >
                              <FileText className="w-4 h-4" />
                              Export KML
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>

                        {/* Delete button */}
                        <Button
                          data-ocid={`routes.delete_button.${index + 1}`}
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteIndex(index);
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Delete confirmation */}
      <AlertDialog
        open={deleteIndex !== null}
        onOpenChange={(open) => !open && setDeleteIndex(null)}
      >
        <AlertDialogContent className="mx-4 rounded-2xl bg-card border-border max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">
              Delete Route?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the route. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-2">
            <AlertDialogCancel
              data-ocid="routes.cancel_button"
              className="flex-1 rounded-xl"
              onClick={() => setDeleteIndex(null)}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              data-ocid="routes.confirm_button"
              className="flex-1 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
