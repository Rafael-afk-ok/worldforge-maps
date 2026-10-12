import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Moon, Sun, Maximize, Minimize, Menu, X, Plus, Minus, Scan, Download, Upload, RotateCcw, Trash2, Settings, Users, Coins, Undo, Redo, Waves } from "lucide-react";
import { strokeCells, floodFill, territoryPath, MAP_COLS, MAP_ROWS, MAP_CELL } from "@/lib/map-tools";
import { DICTS, LANGS, type Lang } from "@/lib/i18n";

type Relation = "propria" | "aliada" | "neutra" | "inimiga";
type Nation = { id: string; name: string; color: string; relation: Relation; ruler: string; treaties: string; notes: string; flag?: string | undefined };
type MarkerType = "capital" | "cidade" | "forte" | "porto";
type Marker = {
  id: string;
  type: MarkerType;
  x: number;
  y: number;
  name: string;
  notes: string;
  npcs?: number;
  grossIncome?: number;
  expenses?: number;
  production?: string;
  photo?: string;
};
type LineType = "estrada" | "rota";
type Line = { id: string; type: LineType; points: [number, number][] };
type Data = {
  cellSize?: number;
  nations: Nation[];
  tiles: Record<string, string>;
  seaTiles?: Record<string, boolean>;
  lockSea?: boolean;
  showSea?: boolean;
  markers: Marker[];
  lines: Line[];
  bg: string | null;
  bgOpacity: number;
  bgFit: "contain" | "cover" | "stretch";
  bgScale: number;
  bgX: number;
  bgY: number;
  bgRotation: number;
  smooth: boolean;
  showGrid: boolean;
};
type Tool = "mover" | "pintar" | "balde" | "apagar" | "mar" | "terra" | MarkerType | LineType;

const COLS = MAP_COLS, ROWS = MAP_ROWS, CELL = MAP_CELL, W = COLS * CELL, H = ROWS * CELL;
const KEY = "atlas-nacoes-v1";
const uid = () => Math.random().toString(36).slice(2, 9);
const empty: Data = {
  cellSize: MAP_CELL,
  nations: [],
  tiles: {},
  seaTiles: {},
  lockSea: true,
  showSea: false,
  markers: [],
  lines: [],
  bg: null,
  bgOpacity: 0.6,
  bgFit: "contain",
  bgScale: 1,
  bgX: 0,
  bgY: 0,
  bgRotation: 0,
  smooth: true,
  showGrid: true,
};
const RELS: Relation[] = ["propria", "aliada", "neutra", "inimiga"];
const ICON: Record<MarkerType, string> = { capital: "★", cidade: "●", forte: "▲", porto: "⚓" };
const TOOLS: Tool[] = ["mover", "pintar", "balde", "apagar", "mar", "terra", "capital", "cidade", "forte", "porto", "estrada", "rota"];

type Sel = { kind: "nation"; id: string } | { kind: "marker"; id: string } | { kind: "line"; id: string } | null;

export default function MapApp() {
  const [data, setData] = useState<Data>(empty);
  const [dark, setDark] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [brushSize, setBrushSize] = useState(2);
  const [filter, setFilter] = useState<"todas" | Relation>("todas");
  const [notice, setNotice] = useState("");
  const [lang, setLang] = useState<Lang>("pt");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [flagUrl, setFlagUrl] = useState("");
  const [markerPhotoUrl, setMarkerPhotoUrl] = useState("");
  const [cityThreshold, setCityThreshold] = useState(35); // 35% de zoom padrão
  const [seaColorSample, setSeaColorSample] = useState("#2b5075");
  const [seaTolerance, setSeaTolerance] = useState(35);
  const [isDetectingSea, setIsDetectingSea] = useState(false);

  // Pilha de Desfazer e Refazer (Undo/Redo)
  const historyRef = useRef<Data[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Posição do cursor para mostrar a mira redonda do pincel
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);

  const t = DICTS[lang];
  const REL: Record<Relation, string> = { propria: t.rel_propria, aliada: t.rel_aliada, neutra: t.rel_neutra, inimiga: t.rel_inimiga };
  const appRef = useRef<HTMLDivElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const lastPaint = useRef<[number, number] | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [tool, setTool] = useState<Tool>("mover");
  const [brush, setBrush] = useState<string | null>(null);
  const [sel, setSel] = useState<Sel>(null);
  const [view, setView] = useState({ x: 20, y: 20, z: 0.35 });
  const [draft, setDraft] = useState<[number, number][]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  // Rastreamento para pinch-to-zoom com múltiplos dedos
  const activePointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStartDist = useRef<number | null>(null);
  const pinchStartZoom = useRef<number>(view.z);
  const drag = useRef<{ mode: "pan" | "paint"; sx: number; sy: number; vx: number; vy: number } | null>(null);

  const updateHistoryState = () => {
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  };

  const pushHistory = (nextData: Data) => {
    const nextIdx = historyIndexRef.current + 1;
    const trimmed = historyRef.current.slice(0, nextIdx);
    trimmed.push(nextData);
    if (trimmed.length > 30) trimmed.shift();
    historyRef.current = trimmed;
    historyIndexRef.current = trimmed.length - 1;
    updateHistoryState();
  };

  const handleUndo = () => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current--;
      const prevState = historyRef.current[historyIndexRef.current];
      if (prevState) setData(prevState);
      updateHistoryState();
    }
  };

  const handleRedo = () => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current++;
      const nextState = historyRef.current[historyIndexRef.current];
      if (nextState) setData(nextState);
      updateHistoryState();
    }
  };

  useEffect(() => {
    try {
      const s = localStorage.getItem(KEY);
      if (s) {
        const loadedData = readMap(JSON.parse(s));
        setData(loadedData);
        historyRef.current = [loadedData];
        historyIndexRef.current = 0;
      } else {
        historyRef.current = [empty];
        historyIndexRef.current = 0;
      }
      setDark(localStorage.getItem("atlas-theme") === "dark");
      const l = localStorage.getItem("atlas-lang");
      if (l === "pt" || l === "en" || l === "es") setLang(l);
    } catch {}
    setLoaded(true);
    updateHistoryState();
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    if (loaded) localStorage.setItem("atlas-theme", dark ? "dark" : "light");
  }, [dark, loaded]);

  useEffect(() => {
    document.documentElement.lang = lang === "pt" ? "pt-BR" : lang;
    if (loaded) localStorage.setItem("atlas-lang", lang);
  }, [lang, loaded]);

  useEffect(() => {
    const changed = () => {
      if (!document.fullscreenElement) {
        setFullscreen(false);
        screen.orientation?.unlock?.();
      }
    };
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, []);

  // Atalhos de teclado (Ctrl+Z, Ctrl+Y)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "z" && !e.shiftKey) {
          e.preventDefault();
          handleUndo();
        } else if (e.key === "y" || (e.key === "z" && e.shiftKey)) {
          e.preventDefault();
          handleRedo();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      setNotice(t.storageFull);
    }
  }, [data, loaded, t.storageFull]);

  const toWorld = (cx: number, cy: number): [number, number] => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return [0, 0];
    const { x, y, z } = viewRef.current;
    return [(cx - r.left - x) / z, (cy - r.top - y) / z];
  };

  const cellAt = (cx: number, cy: number) => {
    const [wx, wy] = toWorld(cx, cy);
    const x = Math.floor(wx / CELL), y = Math.floor(wy / CELL);
    return x >= 0 && y >= 0 && x < COLS && y < ROWS ? [x, y] as [number, number] : null;
  };

  const paint = useCallback((cx: number, cy: number) => {
    const [wx, wy] = toWorld(cx, cy);
    const current: [number, number] = [Math.floor(wx / CELL), Math.floor(wy / CELL)];
    const cells = strokeCells(lastPaint.current ?? current, current, brushSize - 1);
    lastPaint.current = current;

    setData(d => {
      if (tool === "mar" || tool === "terra") {
        const nextSea = { ...(d.seaTiles ?? {}) };
        for (const cell of cells) {
          if (tool === "mar") nextSea[cell] = true;
          else delete nextSea[cell];
        }
        return { ...d, seaTiles: nextSea };
      }

      const tiles = { ...d.tiles };
      const lockSea = d.lockSea ?? true;
      const sea = d.seaTiles ?? {};

      for (const cell of cells) {
        if (lockSea && sea[cell]) continue;
        if (tool === "apagar") delete tiles[cell];
        else if (brush) tiles[cell] = brush;
      }
      return { ...d, tiles };
    });
  }, [tool, brush, brushSize]);

  const stopDrag = () => {
    drag.current = null;
    lastPaint.current = null;
    pushHistory(data);
  };

  const fitMap = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const z = Math.min((r.width - 40) / W, (r.height - 70) / H);
    setView({ z, x: (r.width - W * z) / 2, y: (r.height - H * z) / 2 });
  };

  const zoom = (factor: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setView(v => {
      const z = Math.min(4, Math.max(0.08, v.z * factor));
      const k = z / v.z;
      return { z, x: r.width / 2 - (r.width / 2 - v.x) * k, y: r.height / 2 - (r.height / 2 - v.y) * k };
    });
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      setView(v => {
        const z = Math.min(4, Math.max(0.08, v.z * Math.exp(-dy * 0.0015)));
        const k = z / v.z;
        return { z, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const toggleFullscreen = async () => {
    if (fullscreen) {
      if (document.fullscreenElement) await document.exitFullscreen();
      screen.orientation?.unlock?.();
      setFullscreen(false);
      return;
    }
    setFullscreen(true);
    setPanelOpen(false);
    setSel(null);
    try {
      await appRef.current?.requestFullscreen?.();
      const orientation = screen.orientation as ScreenOrientation & { lock?: (value: string) => Promise<void> };
      if (orientation?.lock) await orientation.lock("landscape");
      else setNotice(t.rotate);
    } catch {
      setNotice(t.rotateFallback);
    }
  };

  // Detecção automática de Mar da Imagem de Fundo
  const detectSeaFromBackground = () => {
    if (!data.bg) {
      setNotice(t.noBgForSea);
      return;
    }
    setIsDetectingSea(true);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const offscreen = document.createElement("canvas");
        offscreen.width = 400;
        offscreen.height = Math.round((400 * ROWS) / COLS);
        const ctx = offscreen.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, offscreen.width, offscreen.height);
        const imgData = ctx.getImageData(0, 0, offscreen.width, offscreen.height).data;

        // Converter cor alvo hex para RGB
        const hex = seaColorSample.replace("#", "");
        const tr = parseInt(hex.substring(0, 2), 16) || 40;
        const tg = parseInt(hex.substring(2, 4), 16) || 80;
        const tb = parseInt(hex.substring(4, 6), 16) || 120;
        const tolDist = seaTolerance * 2.5;

        const nextSea: Record<string, boolean> = {};
        const stepX = COLS / offscreen.width;
        const stepY = ROWS / offscreen.height;

        for (let py = 0; py < offscreen.height; py++) {
          for (let px = 0; px < offscreen.width; px++) {
            const idx = (py * offscreen.width + px) * 4;
            const r = imgData[idx] ?? 0, g = imgData[idx + 1] ?? 0, b = imgData[idx + 2] ?? 0, a = imgData[idx + 3] ?? 0;
            if (a > 30) {
              const dist = Math.hypot(r - tr, g - tg, b - tb);
              if (dist <= tolDist) {
                const cellX = Math.floor(px * stepX);
                const cellY = Math.floor(py * stepY);
                nextSea[`${cellX},${cellY}`] = true;
              }
            }
          }
        }
        setData(d => {
          const next = { ...d, seaTiles: nextSea, lockSea: true, showSea: true };
          pushHistory(next);
          return next;
        });
        setNotice(t.detectedSeaMsg);
      } finally {
        setIsDetectingSea(false);
      }
    };
    img.onerror = () => {
      setIsDetectingSea(false);
      setNotice(t.imageFail);
    };
    img.src = data.bg;
  };

  const onDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Início de gesto de 2 dedos (pinch-to-zoom)
    if (activePointers.current.size === 2) {
      const pts = Array.from(activePointers.current.values());
      pinchStartDist.current = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      pinchStartZoom.current = view.z;
      drag.current = null;
      return;
    }

    if (e.button === 1 || e.button === 2 || tool === "mover") {
      drag.current = { mode: "pan", sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
      if (tool === "mover" && e.button === 0) {
        const c = cellAt(e.clientX, e.clientY);
        const cellKey = c ? `${c[0]},${c[1]}` : null;
        const n = cellKey && data.tiles[cellKey];
        const nation = n ? nationById(n) : undefined;
        setSel(nation && (filter === "todas" || nation.relation === filter) ? { kind: "nation", id: nation.id } : null);
      }
      return;
    }

    const [wx, wy] = toWorld(e.clientX, e.clientY);
    if (tool === "pintar" || tool === "apagar" || tool === "mar" || tool === "terra") {
      if (tool === "pintar" && !brush) {
        setPanelOpen(true);
        setNotice(data.nations.length ? t.pickNation : t.createFirst);
        return;
      }
      drag.current = { mode: "paint", sx: 0, sy: 0, vx: 0, vy: 0 };
      paint(e.clientX, e.clientY);
    } else if (tool === "balde") {
      if (!brush) {
        setPanelOpen(true);
        setNotice(data.nations.length ? t.pickNation : t.createFirst);
        return;
      }
      const c = cellAt(e.clientX, e.clientY);
      if (c) {
        setData(d => {
          const next = { ...d, tiles: floodFill(c[0], c[1], brush, d.tiles, d.seaTiles, d.lockSea ?? true) };
          pushHistory(next);
          return next;
        });
      }
    } else if (tool === "capital" || tool === "cidade" || tool === "forte" || tool === "porto") {
      const m: Marker = { id: uid(), type: tool, x: wx, y: wy, name: t.newMarker, notes: "", npcs: 100, grossIncome: 50, expenses: 20, production: "" };
      setData(d => {
        const next = { ...d, markers: [...d.markers, m] };
        pushHistory(next);
        return next;
      });
      setSel({ kind: "marker", id: m.id });
    } else {
      setDraft(p => [...p, [wx, wy]]);
    }
  };

  const onMove = (e: React.PointerEvent) => {
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Atualiza mira do pincel
    const [wx, wy] = toWorld(e.clientX, e.clientY);
    setCursorPos({ x: wx, y: wy });

    // Trata pinch-to-zoom com 2 dedos
    if (activePointers.current.size === 2 && pinchStartDist.current) {
      const pts = Array.from(activePointers.current.values());
      const currentDist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      const ratio = currentDist / pinchStartDist.current;
      const r = ref.current?.getBoundingClientRect();
      if (r) {
        const midX = (pts[0].x + pts[1].x) / 2 - r.left;
        const midY = (pts[0].y + pts[1].y) / 2 - r.top;
        const targetZ = Math.min(4, Math.max(0.08, pinchStartZoom.current * ratio));
        const k = targetZ / viewRef.current.z;
        setView(v => ({
          z: targetZ,
          x: midX - (midX - v.x) * k,
          y: midY - (midY - v.y) * k,
        }));
      }
      return;
    }

    const d = drag.current;
    if (!d) return;
    if (d.mode === "pan") {
      setView(v => ({ ...v, x: d.vx + e.clientX - d.sx, y: d.vy + e.clientY - d.sy }));
    } else if (d.mode === "paint") {
      paint(e.clientX, e.clientY);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    activePointers.current.delete(e.pointerId);
    if (activePointers.current.size < 2) {
      pinchStartDist.current = null;
    }
    stopDrag();
  };

  const finishLine = () => {
    if (draft.length >= 2 && (tool === "estrada" || tool === "rota")) {
      const l: Line = { id: uid(), type: tool, points: draft };
      setData(d => {
        const next = { ...d, lines: [...d.lines, l] };
        pushHistory(next);
        return next;
      });
      setSel({ kind: "line", id: l.id });
    }
    setDraft([]);
  };

  const addNation = () => {
    const n: Nation = { id: uid(), name: t.newNationName, color: `hsl(${Math.floor(Math.random() * 360)} 55% 50%)`, relation: data.nations.length ? "neutra" : "propria", ruler: "", treaties: "", notes: "" };
    setData(d => {
      const next = { ...d, nations: [...d.nations, n] };
      pushHistory(next);
      return next;
    });
    setBrush(n.id);
    setSel({ kind: "nation", id: n.id });
    setTool("pintar");
    setNotice("");
  };

  const upNation = (id: string, p: Partial<Nation>) => setData(d => ({ ...d, nations: d.nations.map(n => n.id === id ? { ...n, ...p } : n) }));
  const upMarker = (id: string, p: Partial<Marker>) => setData(d => ({ ...d, markers: d.markers.map(n => n.id === id ? { ...n, ...p } : n) }));
  const nationById = (id: string) => data.nations.find(n => n.id === id);

  const onImage = (f: File | undefined, apply: (value: string) => void, maxSize = 1600) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) { setNotice(t.invalidImage); return; }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        apply(canvas.toDataURL("image/webp", 0.85));
      };
      img.onerror = () => setNotice(t.imageFail);
      img.src = reader.result;
    };
    reader.readAsDataURL(f);
  };

  const onBg = (f?: File) => onImage(f, bg => {
    setData(d => {
      const next = { ...d, bg };
      pushHistory(next);
      return next;
    });
  });

  const exportJson = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ ...data, format: "atlas-nacoes", version: 3 }, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `meu-mundo-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(t.exported);
  };

  const importJson = async (f?: File) => {
    if (!f) return;
    try {
      const next = readMap(JSON.parse(await f.text()));
      if (!confirm(t.confirmImport)) return;
      setData(next);
      pushHistory(next);
      setSel(null);
      setBrush(null);
      setDraft([]);
      setFilter("todas");
      fitMap();
      setNotice(t.imported);
    } catch {
      setNotice(t.invalidFile);
    }
  };

  const selNation = sel?.kind === "nation" ? nationById(sel.id) : undefined;
  const selMarker = sel?.kind === "marker" ? data.markers.find(m => m.id === sel.id) : undefined;
  const selLine = sel?.kind === "line" ? data.lines.find(m => m.id === sel.id) : undefined;
  const tileCount = (id: string) => Object.values(data.tiles).filter(t => t === id).length;

  const visibleNations = data.nations.filter(n => filter === "todas" || n.relation === filter);
  const territories = useMemo(() => data.nations.map(n => {
    const keys = Object.entries(data.tiles).filter(([, id]) => id === n.id).map(([key]) => key);
    return { nation: n, keys, path: territoryPath(keys, data.smooth) };
  }), [data.nations, data.tiles, data.smooth]);

  const zoomPercent = Math.round(view.z * 100);

  return (
    <div ref={appRef} className={`atlas-app relative flex w-full overflow-hidden bg-background text-foreground ${fullscreen ? "atlas-fullscreen" : ""}`}>
      <input ref={importRef} type="file" accept=".json,application/json" hidden onChange={e => { void importJson(e.target.files?.[0]); e.target.value = ""; }} />

      <aside className={`map-tools-panel flex shrink-0 flex-col gap-4 overflow-y-auto border-r border-border bg-card p-4 ${panelOpen ? "" : "panel-closed"}`}>
        <div className="flex items-center justify-between gap-2">
          <h1 className="font-display text-2xl leading-none text-primary">{t.appName}</h1>
          <Button size="icon" variant="ghost" className="min-[901px]:hidden" aria-label={t.close} onClick={() => setPanelOpen(false)}><X /></Button>
        </div>

        <section>
          <h2 className="label">{t.tools}</h2>
          <div className="grid gap-1">
            {TOOLS.map(id => (
              <Button
                variant="ghost"
                key={id}
                onClick={() => {
                  setTool(id);
                  setDraft([]);
                  if ((id === "pintar" || id === "balde") && !brush) {
                    const first = visibleNations[0] ?? data.nations[0];
                    if (first) setBrush(first.id);
                    else setNotice(t.createFirst);
                  }
                }}
                className={`justify-start rounded px-2 py-1 text-left text-sm transition ${tool === id ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
              >
                {t[id]}
              </Button>
            ))}
          </div>

          {(tool === "pintar" || tool === "apagar" || tool === "mar" || tool === "terra") && (
            <div className="mt-3">
              <label htmlFor="brush-size" className="label">{t.brushSize} · {brushSize}</label>
              <input id="brush-size" type="range" min={1} max={12} value={brushSize} onChange={e => setBrushSize(+e.target.value)} className="w-full" />
            </div>
          )}

          <div className="mt-3 grid gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={data.smooth} onChange={e => setData(d => ({ ...d, smooth: e.target.checked }))} />
              {t.smooth}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={data.showGrid} onChange={e => setData(d => ({ ...d, showGrid: e.target.checked }))} />
              {t.grid}
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold text-primary">
              <input type="checkbox" checked={data.lockSea ?? true} onChange={e => setData(d => ({ ...d, lockSea: e.target.checked }))} />
              {t.lockSea}
            </label>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={data.showSea ?? false} onChange={e => setData(d => ({ ...d, showSea: e.target.checked }))} />
              {t.showSea}
            </label>
          </div>

          {(tool === "estrada" || tool === "rota") && <Button variant="outline" size="sm" className="mt-2 w-full" disabled={draft.length < 2} onClick={finishLine}>{t.finishLine}</Button>}
          {(tool === "pintar" || tool === "balde") && (brush && nationById(brush) ? <p className="mt-2 text-sm">{t.paintingWith}: <span style={{ color: nationById(brush)?.color }}>■</span> {nationById(brush)?.name}</p> : <div className="mt-2 grid gap-1"><p className="text-sm text-destructive">{data.nations.length ? t.pickNation : t.createFirst}</p>{!data.nations.length && <Button size="sm" onClick={addNation}>{t.createNation}</Button>}</div>)}
        </section>

        {/* Separação de Mar e Terra */}
        <section className="rounded border border-border bg-accent/20 p-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="label !mb-0 flex items-center gap-1.5"><Waves className="h-4 w-4 text-blue-500" /> {t.seaSection}</h2>
          </div>
          <div className="grid gap-2 text-xs">
            <div className="flex items-center justify-between">
              <span>{t.seaColor}:</span>
              <input type="color" value={seaColorSample} onChange={e => setSeaColorSample(e.target.value)} className="h-6 w-10 cursor-pointer rounded border border-border" />
            </div>
            <div>
              <div className="flex justify-between"><span>{t.tolerance}:</span> <span>{seaTolerance}</span></div>
              <input type="range" min={5} max={80} value={seaTolerance} onChange={e => setSeaTolerance(+e.target.value)} className="w-full" />
            </div>
            <Button size="sm" variant="default" disabled={isDetectingSea || !data.bg} onClick={detectSeaFromBackground} className="mt-1 w-full bg-blue-600 hover:bg-blue-700 text-white">
              {isDetectingSea ? t.detecting : t.detectSea}
            </Button>
            {Object.keys(data.seaTiles ?? {}).length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setData(d => ({ ...d, seaTiles: {} }))} className="text-xs text-destructive">
                {t.clearSea} ({Object.keys(data.seaTiles ?? {}).length} células)
              </Button>
            )}
          </div>
        </section>

        <section>
          <div className="mb-1 flex items-center justify-between"><h2 className="label !mb-0">{t.nations}</h2><Button variant="ghost" size="sm" onClick={addNation} className="text-sm text-primary hover:underline">{t.newNation}</Button></div>
          <div className="mb-2"><select value={filter} onChange={e => setFilter(e.target.value as "todas" | Relation)} className="field text-sm"><option value="todas">{t.allNations} ({data.nations.length})</option>{RELS.map(r => <option key={r} value={r}>{REL[r]}</option>)}</select></div>
          <div className="grid max-h-56 gap-1 overflow-y-auto">
            {visibleNations.map(n => (
              <div key={n.id} onClick={() => { setSel({ kind: "nation", id: n.id }); setBrush(n.id); }} className={`flex cursor-pointer items-center justify-between rounded p-1.5 text-sm transition ${selNation?.id === n.id ? "bg-accent" : "hover:bg-muted"}`}>
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-4 w-4 shrink-0 rounded-full border border-border" style={{ backgroundColor: n.color }} />
                  <span className="truncate">{n.name}</span>
                </div>
                <span className="text-xs text-muted-foreground">{tileCount(n.id)}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="label">{t.bgMap}</h2>
          <label className="inline-flex cursor-pointer items-center justify-center rounded border border-border bg-accent px-3 py-1 text-sm"><Upload className="mr-2 h-4 w-4" />{t.bgImage}<input type="file" accept="image/*" hidden onChange={e => { onBg(e.target.files?.[0]); e.target.value = ""; }} /></label>
          {data.bg && (
            <div className="mt-2 grid gap-2">
              <div><label className="label">{t.opacity} · {Math.round(data.bgOpacity * 100)}%</label><input type="range" min={0} max={1} step={0.05} value={data.bgOpacity} onChange={e => setData(d => ({ ...d, bgOpacity: +e.target.value }))} className="w-full" /></div>
              <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setData(d => ({ ...d, bgScale: 1, bgX: 0, bgY: 0, bgRotation: 0 }))}>{t.reset}</Button><Button size="sm" variant="ghost" onClick={() => setData(d => ({ ...d, bg: null }))} className="text-destructive">{t.removeBg}</Button></div>
            </div>
          )}
        </section>

        <section className="mt-auto grid gap-2 border-t border-border pt-4">
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="flex-1" onClick={exportJson}><Download className="mr-1 h-4 w-4" />{t.exportWorld}</Button>
            <Button size="sm" variant="outline" className="flex-1" onClick={() => importRef.current?.click()}><Upload className="mr-1 h-4 w-4" />{t.importWorld}</Button>
          </div>
          <Button size="sm" variant="ghost" onClick={() => { if (confirm(t.confirmClear)) { setData(empty); pushHistory(empty); } }} className="text-destructive">{t.clearMap}</Button>
        </section>
      </aside>

      <main ref={ref} className="relative flex-1 touch-none select-none overflow-hidden bg-muted/20" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onPointerUp} onPointerLeave={() => { setCursorPos(null); stopDrag(); }}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="absolute left-0 top-0 max-w-none overflow-visible" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})`, transformOrigin: "0 0" }}>
          <defs>
            <pattern id="g" width={CELL * 10} height={CELL * 10} patternUnits="userSpaceOnUse">
              <path d={`M ${CELL * 10} 0 L 0 0 0 ${CELL * 10}`} fill="none" stroke="currentColor" strokeWidth={0.5} opacity={0.15} />
            </pattern>
          </defs>

          {data.bg && (
            <image href={data.bg} x={data.bgX} y={data.bgY} width={W * data.bgScale} height={H * data.bgScale} opacity={data.bgOpacity} preserveAspectRatio={data.bgFit === "stretch" ? "none" : data.bgFit === "cover" ? "xMidYMid slice" : "xMidYMid meet"} />
          )}

          {/* Destaque visual da máscara do mar (quando ativado) */}
          {data.showSea && Object.keys(data.seaTiles ?? {}).map(k => {
            const [x, y] = k.split(",").map(Number);
            return <rect key={k} x={x * CELL} y={y * CELL} width={CELL} height={CELL} fill="#3b82f6" opacity={0.35} pointerEvents="none" />;
          })}

          {/* Territórios das Nações */}
          {territories.filter(t => filter === "todas" || t.nation.relation === filter).map(t => (
            <path key={t.nation.id} d={t.path} fill={t.nation.color} opacity={0.65} stroke={t.nation.color} strokeWidth={2} strokeLinejoin="round" />
          ))}

          {data.showGrid && <rect width={W} height={H} fill="url(#g)" pointerEvents="none" />}

          {/* Estradas e Rotas */}
          {data.lines.map(l => (
            <polyline
              key={l.id}
              points={l.points.map(p => p.join(",")).join(" ")}
              fill="none"
              className={l.type === "estrada" ? "stroke-foreground" : "stroke-chart-3"}
              strokeWidth={selLine?.id === l.id ? 5 : 3}
              strokeDasharray={l.type === "rota" ? "8 6" : undefined}
              strokeLinecap="round"
              strokeLinejoin="round"
              onPointerDown={e => {
                if (tool === "mover") { e.stopPropagation(); setSel({ kind: "line", id: l.id }); }
                else if (tool === "apagar") { e.stopPropagation(); setData(d => ({ ...d, lines: d.lines.filter(x => x.id !== l.id) })); }
              }}
              style={{ cursor: "pointer" }}
            />
          ))}

          {draft.length > 0 && <polyline points={draft.map(p => p.join(",")).join(" ")} fill="none" className="stroke-primary" strokeWidth={2} strokeDasharray="4 4" />}

          {/* Cidades e Marcadores com Campo de Visão por aproximação */}
          {data.markers.map(m => {
            const isCapital = m.type === "capital";
            // Capitais e cidades respeitam o limiar de zoom (35% padrão)
            const minZoom = isCapital ? (cityThreshold / 100) * 0.7 : (cityThreshold / 100);
            const isVisible = view.z >= minZoom;
            if (!isVisible) return null;
            const r = isCapital ? 9 : 6;

            return (
              <g
                key={m.id}
                transform={`translate(${m.x},${m.y})`}
                style={{ cursor: "pointer" }}
                onPointerDown={e => {
                  if (tool === "mover") { e.stopPropagation(); setSel({ kind: "marker", id: m.id }); }
                  else if (tool === "apagar") { e.stopPropagation(); setData(d => ({ ...d, markers: d.markers.filter(x => x.id !== m.id) })); }
                }}
              >
                <circle r={r} className={selMarker?.id === m.id ? "fill-primary" : "fill-card stroke-foreground"} strokeWidth={1.5} />
                <text textAnchor="middle" dy="0.32em" fontSize={isCapital ? 10 : 7} className="fill-foreground font-bold">{ICON[m.type]}</text>
                <text y={isCapital ? 18 : 14} textAnchor="middle" fontSize={isCapital ? 12 : 10} className="fill-foreground font-display" paintOrder="stroke" stroke="var(--background)" strokeWidth={3}>{m.name}</text>
              </g>
            );
          })}

          {/* Nomes dos Países */}
          {territories.filter(t => filter === "todas" || t.nation.relation === filter).map(({ nation: n, keys: ks }) => {
            if (!ks.length) return null;
            let sx = 0, sy = 0;
            ks.forEach(k => { const [x = 0, y = 0] = k.split(",").map(Number); sx += x; sy += y; });
            const x = (sx / ks.length + 0.5) * CELL, y = (sy / ks.length + 0.5) * CELL;

            const area = ks.length;
            const baseFontSize = Math.max(12, Math.min(36, Math.round(10 + Math.sqrt(area) * 0.12)));
            const clampedFontSize = Math.max(10, Math.min(baseFontSize, Math.round(baseFontSize * Math.min(1, Math.max(0.4, view.z * 1.4)))));
            const flagScale = clampedFontSize / 24;

            return (
              <g key={n.id} pointerEvents="none">
                {n.flag && <image href={n.flag} x={x - 20 * flagScale} y={y - 36 * flagScale} width={40 * flagScale} height={24 * flagScale} preserveAspectRatio="xMidYMid meet" />}
                <text x={x} y={y} textAnchor="middle" fontSize={clampedFontSize} className="fill-foreground font-display uppercase" opacity={0.85} paintOrder="stroke" stroke="var(--background)" strokeWidth={3}>{n.name}</text>
              </g>
            );
          })}

          {/* Mira do Pincel (Bolinha semitransparente que acompanha o ponteiro) */}
          {cursorPos && (tool === "pintar" || tool === "apagar" || tool === "mar" || tool === "terra") && (
            <circle
              cx={cursorPos.x}
              cy={cursorPos.y}
              r={brushSize * CELL * 1.4}
              fill={tool === "apagar" ? "rgba(239, 68, 68, 0.25)" : tool === "mar" ? "rgba(59, 130, 246, 0.35)" : tool === "terra" ? "rgba(34, 197, 94, 0.35)" : (brush ? nationById(brush)?.color : "rgba(255, 255, 255, 0.25)")}
              stroke="white"
              strokeWidth={1.5}
              strokeDasharray="3 2"
              pointerEvents="none"
              opacity={0.85}
            />
          )}
        </svg>

        {/* Barra de Ferramentas Flutuante */}
        <div className="map-toolbar" onPointerDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="min-[901px]:hidden" aria-label={t.tools} title={t.tools} onClick={() => setPanelOpen(v => !v)}><Menu /></Button>

          {/* Desfazer e Refazer */}
          <Button variant="ghost" size="icon" disabled={!canUndo} aria-label={t.undo} title={t.undo} onClick={handleUndo}><Undo className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" disabled={!canRedo} aria-label={t.redo} title={t.redo} onClick={handleRedo}><Redo className="h-4 w-4" /></Button>

          <Button variant="ghost" size="icon" aria-label={t.zoomOut} title={t.zoomOut} onClick={() => zoom(0.8)}><Minus /></Button>
          <span className="px-1 text-xs font-mono text-muted-foreground">{zoomPercent}%</span>
          <Button variant="ghost" size="icon" aria-label={t.zoomIn} title={t.zoomIn} onClick={() => zoom(1.25)}><Plus /></Button>
          <Button variant="ghost" size="icon" aria-label={t.fitMap} title={t.fitMap} onClick={fitMap}><Scan /></Button>
          <Button variant="ghost" size="icon" aria-label={dark ? t.light : t.dark} title={dark ? t.light : t.dark} onClick={() => setDark(d => !d)}>{dark ? <Sun /> : <Moon />}</Button>
          <Button variant="ghost" size="icon" aria-label={fullscreen ? t.exitFullscreen : t.fullscreen} title={fullscreen ? t.exitFullscreen : t.fullscreen} onClick={toggleFullscreen}>{fullscreen ? <Minimize /> : <Maximize />}</Button>
          <Button variant="ghost" size="icon" aria-label={t.settings} title={t.settings} onClick={() => setSettingsOpen(s => !s)}><Settings /></Button>
        </div>

        {/* Modal de Configurações */}
        {settingsOpen && (
          <div className="absolute right-4 top-16 z-50 w-72 rounded-lg border border-border bg-card p-4 shadow-xl" onPointerDown={e => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between"><h3 className="font-display text-lg">{t.settings}</h3><Button size="icon" variant="ghost" onClick={() => setSettingsOpen(false)}><X /></Button></div>
            <div className="grid gap-3">
              <div>
                <label className="label">{t.language}</label>
                <select value={lang} onChange={e => setLang(e.target.value as Lang)} className="field">
                  {LANGS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">{t.cityThreshold}: {cityThreshold}%</label>
                <input type="range" min={15} max={100} value={cityThreshold} onChange={e => setCityThreshold(+e.target.value)} className="w-full" />
              </div>
            </div>
          </div>
        )}

        {/* Painel de Edição de Nação / Localidade / Linha Selecionada */}
        {sel && (
          <aside className="map-detail-panel" onPointerDown={e => e.stopPropagation()}>
            <div className="flex items-center justify-between"><span className="label !mb-0">{sel.kind}</span><Button size="icon" variant="ghost" aria-label={t.close} onClick={() => setSel(null)}><X /></Button></div>

            {selNation && (
              <div className="grid gap-3">
                <input value={selNation.name} onChange={e => upNation(selNation.id, { name: e.target.value })} className="field font-display text-xl" />
                <div className="flex items-center gap-2"><input type="color" value={selNation.color} onChange={e => upNation(selNation.id, { color: e.target.value })} className="h-8 w-12 cursor-pointer rounded border border-border" /><span className="text-xs text-muted-foreground">{tileCount(selNation.id)} {t.territories}</span></div>
                <div><label className="label">{t.relation}</label><select value={selNation.relation} onChange={e => upNation(selNation.id, { relation: e.target.value as Relation })} className="field">{RELS.map(r => <option key={r} value={r}>{REL[r]}</option>)}</select></div>
                <div><label className="label">{t.ruler}</label><input value={selNation.ruler} onChange={e => upNation(selNation.id, { ruler: e.target.value })} className="field" /></div>
                <div>
                  <label className="label">{t.flag}</label>
                  {selNation.flag && <div className="mb-2 flex items-center gap-3"><img src={selNation.flag} alt={selNation.name} className="h-10 w-16 rounded border border-border object-cover" /><Button variant="ghost" size="icon" aria-label={t.removeFlag} onClick={() => upNation(selNation.id, { flag: undefined })}><Trash2 /></Button></div>}
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded border border-border bg-accent px-3 py-1 text-sm"><Upload className="h-4 w-4" />{t.uploadFlag}<input type="file" accept="image/*" hidden onChange={e => { onImage(e.target.files?.[0], flag => upNation(selNation.id, { flag }), 400); e.target.value = ""; }} /></label>
                  <div className="mt-2 flex gap-1"><input placeholder={t.flagUrl} value={flagUrl} onChange={e => setFlagUrl(e.target.value)} className="field text-xs" /><Button size="sm" variant="outline" disabled={!/^https:\/\//.test(flagUrl.trim())} onClick={() => { upNation(selNation.id, { flag: flagUrl.trim() }); setFlagUrl(""); }}>OK</Button></div>
                </div>
                <div><label className="label">{t.treaties}</label><textarea rows={3} value={selNation.treaties} onChange={e => upNation(selNation.id, { treaties: e.target.value })} className="field" /></div>
                <div><label className="label">{t.notes}</label><textarea rows={3} value={selNation.notes} onChange={e => upNation(selNation.id, { notes: e.target.value })} className="field" /></div>
                <Button onClick={() => { setBrush(selNation.id); setTool("pintar"); setSel(null); setPanelOpen(false); }} className="h-auto whitespace-normal rounded bg-primary px-2 py-2 text-sm text-primary-foreground">{t.paintThis}</Button>
                <Button variant="ghost" onClick={() => { if (!confirm(t.confirmDeleteNation)) return; setData(d => ({ ...d, nations: d.nations.filter(n => n.id !== selNation.id), tiles: Object.fromEntries(Object.entries(d.tiles).filter(([, v]) => v !== selNation.id)) })); setSel(null); }} className="text-sm text-destructive">{t.deleteNation}</Button>
              </div>
            )}

            {selMarker && (
              <div className="grid gap-3">
                <span className="label">{ICON[selMarker.type]} {t[`m_${selMarker.type}`]}</span>
                <input value={selMarker.name} onChange={e => upMarker(selMarker.id, { name: e.target.value })} className="field font-display text-xl" />
                <select value={selMarker.type} onChange={e => upMarker(selMarker.id, { type: e.target.value as MarkerType })} className="field">
                  {(Object.keys(ICON) as MarkerType[]).map(k => <option key={k} value={k}>{t[`m_${k}`]}</option>)}
                </select>

                <div>
                  <label className="label">{t.photo}</label>
                  {selMarker.photo && (
                    <div className="mb-2 flex items-center gap-3">
                      <img src={selMarker.photo} alt={selMarker.name} className="h-20 w-32 rounded border border-border object-cover" />
                      <Button variant="ghost" size="icon" aria-label={t.removePhoto} onClick={() => upMarker(selMarker.id, { photo: undefined })}><Trash2 /></Button>
                    </div>
                  )}
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded border border-border bg-accent px-3 py-1 text-sm">
                    <Upload className="h-4 w-4" />{t.uploadPhoto}
                    <input type="file" accept="image/*" hidden onChange={e => { onImage(e.target.files?.[0], photo => upMarker(selMarker.id, { photo }), 600); e.target.value = ""; }} />
                  </label>
                  <div className="mt-2 flex gap-1">
                    <input placeholder={t.photoUrl} value={markerPhotoUrl} onChange={e => setMarkerPhotoUrl(e.target.value)} className="field text-xs" />
                    <Button size="sm" variant="outline" disabled={!/^https:\/\//.test(markerPhotoUrl.trim())} onClick={() => { upMarker(selMarker.id, { photo: markerPhotoUrl.trim() }); setMarkerPhotoUrl(""); }}>OK</Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label flex items-center gap-1"><Users className="h-3 w-3" /> {t.npcs}</label>
                    <input type="number" min={0} value={selMarker.npcs ?? 0} onChange={e => upMarker(selMarker.id, { npcs: Math.max(0, +e.target.value) })} className="field" />
                  </div>
                  <div>
                    <label className="label flex items-center gap-1"><Coins className="h-3 w-3 text-emerald-500" /> {t.grossIncome}</label>
                    <input type="number" min={0} value={selMarker.grossIncome ?? 0} onChange={e => upMarker(selMarker.id, { grossIncome: Math.max(0, +e.target.value) })} className="field" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label">{t.expenses}</label>
                    <input type="number" min={0} value={selMarker.expenses ?? 0} onChange={e => upMarker(selMarker.id, { expenses: Math.max(0, +e.target.value) })} className="field" />
                  </div>
                  <div className="rounded border border-border bg-accent/40 p-2 text-center">
                    <span className="text-[11px] text-muted-foreground">{t.netIncome}</span>
                    <p className={`font-display text-sm font-bold ${((selMarker.grossIncome ?? 0) - (selMarker.expenses ?? 0)) >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                      {((selMarker.grossIncome ?? 0) - (selMarker.expenses ?? 0))} 🟢
                    </p>
                  </div>
                </div>

                <div>
                  <label className="label">{t.production}</label>
                  <input placeholder="Ex: Trigo, Minério de Ferro, Madeira..." value={selMarker.production ?? ""} onChange={e => upMarker(selMarker.id, { production: e.target.value })} className="field" />
                </div>

                <div><label className="label">{t.notes}</label><textarea rows={4} value={selMarker.notes} onChange={e => upMarker(selMarker.id, { notes: e.target.value })} className="field" /></div>
                <Button variant="ghost" onClick={() => { setData(d => ({ ...d, markers: d.markers.filter(m => m.id !== selMarker.id) })); setSel(null); }} className="text-sm text-destructive">{t.delete}</Button>
              </div>
            )}

            {selLine && (
              <div className="grid gap-3">
                <span className="label">{t[`l_${selLine.type}`]} · {selLine.points.length} {t.points}</span>
                <Button variant="ghost" onClick={() => { setData(d => ({ ...d, lines: d.lines.filter(m => m.id !== selLine.id) })); setSel(null); }} className="text-sm text-destructive">{t.deleteLine}</Button>
              </div>
            )}
          </aside>
        )}

        {notice && (
          <div className="absolute bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full border border-border bg-card px-4 py-2 font-display text-sm text-foreground shadow-lg animate-in fade-in zoom-in-95">
            {notice}
            <Button size="icon" variant="ghost" className="ml-2 h-4 w-4" onClick={() => setNotice("")}><X className="h-3 w-3" /></Button>
          </div>
        )}
      </main>
    </div>
  );
}

function readMap(input: unknown): Data {
  if (!input || typeof input !== "object") throw new Error("Invalid format");
  const d = input as Record<string, unknown>;
  if (!Array.isArray(d["nations"]) || !Array.isArray(d["markers"]) || !Array.isArray(d["lines"]) || !d["tiles"] || typeof d["tiles"] !== "object" || Array.isArray(d["tiles"])) throw new Error("Invalid map");
  const text = (value: unknown) => typeof value === "string" ? value : "";
  const num = (value: unknown, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
  const finite = (value: unknown, fallback: number, min: number, max: number) => typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
  const image = (value: unknown) => typeof value === "string" && /^data:image\/(png|jpeg|webp|gif|avif);base64,/.test(value) ? value : undefined;
  const flagImage = (value: unknown) => image(value) ?? (typeof value === "string" && /^https:\/\/\S+$/.test(value) ? value : undefined);

  const nations: Nation[] = d["nations"].map((n: Nation) => {
    if (!n || typeof n.id !== "string" || !n.id) throw new Error("Invalid nation");
    return {
      id: n.id,
      name: text(n.name) || "Sem nome",
      color: text(n.color) || "#ff5555",
      relation: RELS.includes(n.relation) ? n.relation : "neutra",
      ruler: text(n.ruler),
      treaties: text(n.treaties),
      notes: text(n.notes),
      flag: flagImage(n.flag),
    };
  });

  const tiles: Record<string, string> = {};
  for (const [key, id] of Object.entries(d["tiles"] as Record<string, unknown>)) {
    if (typeof id !== "string") continue;
    const [x = -1, y = -1] = key.split(",").map(Number);
    if (x < 0 || y < 0 || !Number.isInteger(x) || !Number.isInteger(y)) continue;
    if (x >= COLS || y >= ROWS) throw new Error("Invalid cell");
    tiles[key] = id;
  }

  const markers: Marker[] = d["markers"].map((m: any) => {
    if (!m || typeof m.id !== "string" || !(m.type in ICON) || !Number.isFinite(m.x) || !Number.isFinite(m.y)) throw new Error("Invalid marker");
    return {
      id: m.id,
      type: m.type,
      x: m.x,
      y: m.y,
      name: text(m.name),
      notes: text(m.notes),
      npcs: num(m.npcs, 0),
      grossIncome: num(m.grossIncome, 0),
      expenses: num(m.expenses, 0),
      production: text(m.production),
      photo: flagImage(m.photo),
    };
  });

  const lines: Line[] = d["lines"].map((l: Line) => {
    if (!l || typeof l.id !== "string" || !["estrada", "rota"].includes(l.type) || !Array.isArray(l.points) || l.points.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite))) throw new Error("Invalid line");
    return { id: l.id, type: l.type, points: l.points };
  });

  const seaTiles: Record<string, boolean> = {};
  if (d["seaTiles"] && typeof d["seaTiles"] === "object" && !Array.isArray(d["seaTiles"])) {
    for (const [k, v] of Object.entries(d["seaTiles"])) {
      if (v === true) seaTiles[k] = true;
    }
  }

  const bgFit: Data["bgFit"] = d["bgFit"] === "cover" || d["bgFit"] === "stretch" ? d["bgFit"] : "contain";
  return {
    cellSize: MAP_CELL,
    nations,
    tiles,
    seaTiles,
    lockSea: typeof d["lockSea"] === "boolean" ? d["lockSea"] : true,
    showSea: typeof d["showSea"] === "boolean" ? d["showSea"] : false,
    markers,
    lines,
    bg: image(d["bg"]) ?? null,
    bgOpacity: finite(d["bgOpacity"], 0.6, 0, 1),
    bgFit,
    bgScale: finite(d["bgScale"], 1, 0.2, 5),
    bgX: finite(d["bgX"], 0, -W, W),
    bgY: finite(d["bgY"], 0, -H, H),
    bgRotation: finite(d["bgRotation"], 0, -180, 180),
    smooth: Boolean(d["smooth"]),
    showGrid: Boolean(d["showGrid"] ?? true),
  };
}
