import { useEffect, useRef, useState } from "react";

const TICK_ANGLES = Array.from({ length: 36 }, (_, i) => i * 10);

export function LiveCompass() {
  const [heading, setHeading] = useState<number | null>(null);
  const [available, setAvailable] = useState(true);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const listenerRef = useRef<((e: DeviceOrientationEvent) => void) | null>(
    null,
  );

  useEffect(() => {
    if (!window.DeviceOrientationEvent) {
      setAvailable(false);
      return;
    }

    const handleOrientation = (e: DeviceOrientationEvent) => {
      let h: number | null = null;
      if (typeof (e as any).webkitCompassHeading === "number") {
        h = (e as any).webkitCompassHeading;
      } else if (e.alpha !== null) {
        h = (360 - e.alpha) % 360;
      }
      if (h !== null) setHeading(h);
    };

    listenerRef.current = handleOrientation;

    const addListener = () => {
      window.addEventListener("deviceorientation", handleOrientation, true);
    };

    if (
      typeof (DeviceOrientationEvent as any).requestPermission === "function"
    ) {
      (DeviceOrientationEvent as any)
        .requestPermission()
        .then((state: string) => {
          if (state === "granted") {
            addListener();
          } else {
            setPermissionDenied(true);
            setAvailable(false);
          }
        })
        .catch(() => {
          setPermissionDenied(true);
          setAvailable(false);
        });
    } else {
      addListener();
    }

    return () => {
      if (listenerRef.current) {
        window.removeEventListener(
          "deviceorientation",
          listenerRef.current,
          true,
        );
      }
    };
  }, []);

  const rotation = heading !== null ? -heading : 0;
  const isStatic = !available || heading === null;

  return (
    <div
      data-ocid="map.compass.panel"
      className="absolute top-4 right-4 z-[1000] flex flex-col items-center gap-1 select-none pointer-events-none"
      title={
        permissionDenied
          ? "Compass permission denied"
          : heading !== null
            ? `${Math.round(heading)}°`
            : "Compass"
      }
    >
      <div
        className="relative flex items-center justify-center rounded-full shadow-lg"
        style={{
          width: 60,
          height: 60,
          background: "rgba(15, 20, 30, 0.82)",
          border: "1.5px solid rgba(255,255,255,0.13)",
          backdropFilter: "blur(8px)",
          opacity: isStatic ? 0.55 : 1,
          transition: "opacity 0.3s",
        }}
      >
        <svg
          width="48"
          height="48"
          viewBox="0 0 48 48"
          role="img"
          aria-label="Compass"
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: heading !== null ? "transform 0.2s ease-out" : "none",
          }}
        >
          <title>Compass</title>
          {TICK_ANGLES.map((deg) => {
            const angle = (deg * Math.PI) / 180;
            const isMajor = deg % 90 === 0;
            const r1 = 22;
            const r2 = isMajor ? 18 : 20;
            const x1 = 24 + r1 * Math.sin(angle);
            const y1 = 24 - r1 * Math.cos(angle);
            const x2 = 24 + r2 * Math.sin(angle);
            const y2 = 24 - r2 * Math.cos(angle);
            return (
              <line
                key={deg}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={
                  isMajor ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.3)"
                }
                strokeWidth={isMajor ? 1.5 : 0.8}
              />
            );
          })}

          {/* South needle (gray) */}
          <polygon
            points="24,28 21.5,24 24,32 26.5,24"
            fill="rgba(150,150,160,0.85)"
          />
          {/* North needle (red) */}
          <polygon points="24,20 21.5,24 24,16 26.5,24" fill="#ef4444" />

          {/* Center dot */}
          <circle cx="24" cy="24" r="2.5" fill="rgba(255,255,255,0.9)" />

          <text
            x="24"
            y="10"
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="7"
            fontWeight="700"
            fontFamily="sans-serif"
            fill="#ef4444"
            letterSpacing="0.5"
          >
            N
          </text>
          <text
            x="24"
            y="38.5"
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="6"
            fontFamily="sans-serif"
            fill="rgba(180,180,190,0.8)"
          >
            S
          </text>
          <text
            x="38.5"
            y="24"
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="6"
            fontFamily="sans-serif"
            fill="rgba(180,180,190,0.8)"
          >
            E
          </text>
          <text
            x="9.5"
            y="24"
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="6"
            fontFamily="sans-serif"
            fill="rgba(180,180,190,0.8)"
          >
            W
          </text>
        </svg>
      </div>

      {heading !== null && (
        <div
          style={{
            fontSize: "10px",
            fontWeight: 600,
            color: "rgba(255,255,255,0.85)",
            background: "rgba(15,20,30,0.75)",
            borderRadius: "6px",
            padding: "1px 6px",
            letterSpacing: "0.5px",
            fontFamily: "monospace",
            backdropFilter: "blur(6px)",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          {Math.round(heading)}°
        </div>
      )}
    </div>
  );
}
