import { Button } from "@/components/ui/button";
import {
  type MapDownloadRecord,
  clearTileCache,
  deleteMapDownloadRecord,
  getCacheStats,
  getMapDownloadRecords,
} from "@/utils/tileCache";
import { HardDrive, Map as MapIcon2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

export default function DownloadedMapsView() {
  const [records, setRecords] = useState<MapDownloadRecord[]>([]);
  const [stats, setStats] = useState({ tileCount: 0, estimatedMB: 0 });

  const refresh = useCallback(async () => {
    setRecords(getMapDownloadRecords());
    const s = await getCacheStats();
    setStats(s);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleDelete = useCallback(
    async (id: string, name: string) => {
      deleteMapDownloadRecord(id);
      await refresh();
      toast.success(`"${name}" removed`);
    },
    [refresh],
  );

  const handleClearAll = useCallback(async () => {
    await clearTileCache();
    localStorage.removeItem("map-downloads-v1");
    await refresh();
    toast.success("All cached tiles cleared");
  }, [refresh]);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-5 pb-3 border-b border-border/50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
            <HardDrive className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">
              Downloaded Maps
            </h1>
            <p className="text-xs text-muted-foreground">
              Offline map areas saved on this device
            </p>
          </div>
        </div>

        {/* Cache stats summary */}
        <div className="mt-3 flex gap-3">
          <div className="flex-1 bg-muted/50 rounded-xl px-3 py-2">
            <p className="text-xs text-muted-foreground">Total tiles</p>
            <p className="text-sm font-semibold text-foreground">
              {stats.tileCount.toLocaleString()}
            </p>
          </div>
          <div className="flex-1 bg-muted/50 rounded-xl px-3 py-2">
            <p className="text-xs text-muted-foreground">Est. storage</p>
            <p className="text-sm font-semibold text-foreground">
              {stats.estimatedMB.toFixed(1)} MB
            </p>
          </div>
          <div className="flex-1 bg-muted/50 rounded-xl px-3 py-2">
            <p className="text-xs text-muted-foreground">Areas saved</p>
            <p className="text-sm font-semibold text-foreground">
              {records.length}
            </p>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {records.length === 0 ? (
          <div
            data-ocid="downloads.empty_state"
            className="flex flex-col items-center justify-center gap-3 py-16 text-center"
          >
            <div className="w-14 h-14 rounded-2xl bg-muted/60 flex items-center justify-center">
              <MapIcon2 className="w-7 h-7 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                No maps downloaded yet
              </p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[240px]">
                Use the Download button on the map to save areas for offline
                use.
              </p>
            </div>
          </div>
        ) : (
          records.map((record, idx) => {
            const date = new Date(record.date);
            const formatted = `${date.getDate().toString().padStart(2, "0")}/${(date.getMonth() + 1).toString().padStart(2, "0")}/${date.getFullYear()}`;
            const mb = ((record.tileCount * 15) / 1024).toFixed(1);
            const ocidIdx = idx + 1;
            return (
              <div
                key={record.id}
                data-ocid={`downloads.item.${ocidIdx}`}
                className="flex items-center gap-3 bg-card rounded-xl px-4 py-3 border border-border/40"
              >
                <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                  <HardDrive className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {record.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatted} · {record.tileCount.toLocaleString()} tiles ·{" "}
                    {mb} MB
                  </p>
                </div>
                <Button
                  data-ocid={`downloads.delete_button.${ocidIdx}`}
                  variant="ghost"
                  size="icon"
                  className="flex-shrink-0 w-8 h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => handleDelete(record.id, record.name)}
                  aria-label={`Delete ${record.name}`}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            );
          })
        )}
      </div>

      {/* Footer: Clear all */}
      <div className="flex-shrink-0 px-4 py-3 border-t border-border/50">
        <Button
          data-ocid="downloads.clear_cache_button"
          variant="destructive"
          className="w-full"
          onClick={handleClearAll}
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Clear All Cache
        </Button>
      </div>
    </div>
  );
}
