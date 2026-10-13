import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Maximize, Minimize, Menu, X, Scan, Download, Upload, RotateCcw, Trash2, Settings, Users, Coins, Undo, Redo, History, BarChart3, Smartphone, Wheat, Layers, GitCompareArrows, GraduationCap, Eye, Pencil } from "lucide-react";
import { strokeCells, floodFill, territoryPath, expandTiles, MAP_COLS, MAP_ROWS, MAP_CELL } from "@/lib/map-tools";
import { DICTS, LANGS, type Lang } from "@/lib/i18n";

type Relation = "propria" | "amigavel" | "neutra" | "inimiga";
type Nation = { id: string; name: string; color: string; relation: Relation; relations?: Record<string, Relation> | undefined; ruler: string; treaties: string; notes: string; flag?: string | undefined; overlordId?: string | undefined; enemyIds?: string[] | undefined };
type Region = { id: string; name: string; nationId: string; color: string };
type Alliance = { id: string; name: string; nationIds: string[]; color: string; image?: string | undefined };
type War = { id: string; name: string; attackers: string[]; defenders: string[]; active: boolean; startedAt: string; endedAt?: string | undefined };
type MapComment = { id: string; x: number; y: number; text: string; createdAt: string; size?: number; fontFamily?: string; color?: string | undefined; rotation?: number };
type MapVersion = { id: string; name: string; description: string; createdAt: string; data: Data };
type MarkerType = "capital" | "cidade" | "forte" | "porto";
type MarkerShape = "circle" | "square" | "triangle" | "star" | "diamond" | "hexagon" | "cross";
type Marker = {
  id: string;
  type: MarkerType;
  shape?: MarkerShape;
  x: number;
  y: number;
  name: string;
  notes: string;
  npcs?: number;
  grossIncome?: number;
  expenses?: number;
  production?: string;
  foodProduction?: number;
  foodConsumption?: number;
  photo?: string | undefined;
  color?: string | undefined;
  size?: number;
  labelSize?: number;
  rotation?: number;
};
type LineType = "estrada" | "rota";
type Line = { id: string; type: LineType; points: [number, number][] };
type Data = { cellSize?: number; nations: Nation[]; regions?: Region[]; regionTiles?: Record<string, string>; playerNationId?: string | undefined; tiles: Record<string, string>; markers: Marker[]; lines: Line[]; comments: MapComment[]; alliances?: Alliance[]; wars?: War[]; bg: string | null; bgOpacity: number; bgFit: "contain" | "cover" | "stretch"; bgScale: number; bgX: number; bgY: number; bgRotation: number; smooth: boolean; showGrid: boolean };
type AppDialog = { type: "text"; title: string; value: string; onSubmit: (value: string) => void } | { type: "confirm"; title: string; message: string; onSubmit: () => void } | { type: "save"; name: string; description: string; filename: string } | { type: "history"; selectedId: string } | { type: "status" } | { type: "compare" } | { type: "diplomacy" } | { type: "tutorial" };
type Tool = "mover" | "pintar" | "balde" | "apagar" | "regiao" | "comentario" | MarkerType | LineType;

const COLS = MAP_COLS, ROWS = MAP_ROWS, CELL = MAP_CELL, W = COLS * CELL, H = ROWS * CELL;
const KEY = "atlas-nacoes-v1";
const uid = () => Math.random().toString(36).slice(2, 9);
const empty: Data = { cellSize: MAP_CELL, nations: [], regions: [], regionTiles: {}, playerNationId: undefined, tiles: {}, markers: [], lines: [], comments: [], alliances: [], wars: [], bg: null, bgOpacity: 0.6, bgFit: "contain", bgScale: 1, bgX: 0, bgY: 0, bgRotation: 0, smooth: true, showGrid: true };
const RELS: Relation[] = ["propria", "amigavel", "neutra", "inimiga"];
const ICON: Record<MarkerType, string> = { capital: "★", cidade: "●", forte: "▲", porto: "⚓" };
const SHAPES: { id: MarkerShape; label: string }[] = [{ id: "circle", label: "Círculo" }, { id: "square", label: "Quadrado" }, { id: "triangle", label: "Triângulo" }, { id: "star", label: "Estrela" }, { id: "diamond", label: "Losango" }, { id: "hexagon", label: "Hexágono" }, { id: "cross", label: "Cruz" }];
const TOOLS: Tool[] = ["mover", "pintar", "balde", "apagar", "regiao", "comentario", "capital", "cidade", "forte", "porto", "estrada", "rota"];
type HomeTheme = "atlas" | "midnight" | "parchment" | "ocean" | "forest";
const HOME_THEMES: { id: HomeTheme; label: string; background: string; panel: string; foreground: string; muted: string; accent: string; card: string }[] = [
  { id: "atlas", label: "Atlas", background: "bg-background", panel: "bg-card border-border", foreground: "text-foreground", muted: "text-muted-foreground", accent: "text-primary", card: "border-border hover:bg-accent" },
  { id: "midnight", label: "Noturno", background: "bg-slate-950", panel: "bg-slate-900 border-slate-700", foreground: "text-slate-100", muted: "text-slate-300", accent: "text-cyan-300", card: "border-slate-700 hover:bg-slate-800" },
  { id: "parchment", label: "Pergaminho", background: "bg-amber-50", panel: "bg-amber-50 border-amber-300", foreground: "text-amber-950", muted: "text-amber-800", accent: "text-amber-900", card: "border-amber-300 hover:bg-amber-100" },
  { id: "ocean", label: "Oceano", background: "bg-sky-950", panel: "bg-sky-900 border-sky-700", foreground: "text-sky-50", muted: "text-sky-200", accent: "text-cyan-300", card: "border-sky-700 hover:bg-sky-800" },
  { id: "forest", label: "Floresta", background: "bg-emerald-950", panel: "bg-emerald-900 border-emerald-700", foreground: "text-emerald-50", muted: "text-emerald-200", accent: "text-emerald-300", card: "border-emerald-700 hover:bg-emerald-800" },
];

type Sel = { kind: "nation"; id: string } | { kind: "marker"; id: string } | { kind: "line"; id: string } | { kind: "comment"; id: string } | null;

export default function MapApp() {
  const [mode, setMode] = useState<"home" | "edit" | "view">("home");
  const [homeTheme, setHomeTheme] = useState<HomeTheme>("atlas");
  const [pendingViewer, setPendingViewer] = useState(false);
  const [data, setData] = useState<Data>(empty);
  const [fullscreen, setFullscreen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [brushSize, setBrushSize] = useState(2);
  const [filter, setFilter] = useState<"todas" | "propria" | "amigavel" | "neutra" | "inimigas" | "alianças" | "guerras">("todas");
  const [showRegions, setShowRegions] = useState(false);
  const [regionName, setRegionName] = useState("");
  const [regionNationId, setRegionNationId] = useState("");
  const [selectedRegionId, setSelectedRegionId] = useState("");
  const [allianceName, setAllianceName] = useState("");
  const [allianceMembers, setAllianceMembers] = useState<string[]>([]);
  const [allianceColor, setAllianceColor] = useState("#64748b");
  const [allianceImage, setAllianceImage] = useState<string | undefined>();
  const [warName, setWarName] = useState("");
  const [warAttackers, setWarAttackers] = useState<string[]>([]);
  const [warDefenders, setWarDefenders] = useState<string[]>([]);
  const [layers, setLayers] = useState({ background: true, territories: true, labels: true, markers: true, routes: true, comments: true, grid: true });
  const [compareNations, setCompareNations] = useState<string[]>([]);
  const [compareMarkers, setCompareMarkers] = useState<string[]>([]);
  const [diplomacyExpanded, setDiplomacyExpanded] = useState<string[]>([]);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [notice, setNotice] = useState("");
  const [lang, setLang] = useState<Lang>("pt");
  const [languageSetup, setLanguageSetup] = useState(false);
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [viewerTab, setViewerTab] = useState<"nations" | "locations" | "diplomacy" | "compare" | "layers">("nations");
  const [viewerReferenceNationId, setViewerReferenceNationId] = useState("");
  const [viewerNationFilter, setViewerNationFilter] = useState<"todas" | "propria" | "amigavel" | "neutra" | "inimigas" | "alianças" | "guerras">("todas");
  const [viewerNationSearch, setViewerNationSearch] = useState("");
  const [viewerLocationSearch, setViewerLocationSearch] = useState("");
  const [flagUrl, setFlagUrl] = useState("");
  const [markerPhotoUrl, setMarkerPhotoUrl] = useState("");
  const [mapName, setMapName] = useState("Meu mundo");
  const [mapDescription, setMapDescription] = useState("");
  const [versions, setVersions] = useState<MapVersion[]>([]);
  const [deviceMode, setDeviceMode] = useState<"pc" | "celular">("pc");
  const [orientationPortrait, setOrientationPortrait] = useState(false);
  const [dialog, setDialog] = useState<AppDialog | null>(null);

  const historyRef = useRef<Data[]>([]);
  const historyIndexRef = useRef(-1);
  const restoringHistoryRef = useRef(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);

  const t = DICTS[lang];
  const tx = (pt: string, en: string, es = en) => lang === "pt" ? pt : lang === "es" ? es : en;
  const REL: Record<Relation, string> = { propria: t.rel_propria, amigavel: tx("Amigável", "Friendly", "Amistosa"), neutra: t.rel_neutra, inimiga: t.rel_inimiga };
  const appRef = useRef<HTMLDivElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const lastPaint = useRef<[number, number] | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [tool, setTool] = useState<Tool>("mover");
  const [brush, setBrush] = useState<string | null>(null);
  const [sel, setSel] = useState<Sel>(null);
  const [view, setView] = useState({ x: 20, y: 20, z: 0.5 });
  const [draft, setDraft] = useState<[number, number][]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const drag = useRef<{ mode: "pan" | "paint"; sx: number; sy: number; vx: number; vy: number } | { mode: "entity"; entityKind: "marker" | "comment"; id: string; sx: number; sy: number; wx: number; wy: number } | null>(null);
  const touchPoints = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<{ distance: number; zoom: number; worldX: number; worldY: number } | null>(null);

  const updateHistoryState = () => {
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  };
  const pushHistory = (snapshot: Data) => {
    if (historyRef.current[historyIndexRef.current] === snapshot) return;
    const next = historyRef.current.slice(0, historyIndexRef.current + 1);
    next.push(snapshot);
    if (next.length > 50) next.shift();
    historyRef.current = next;
    historyIndexRef.current = next.length - 1;
    updateHistoryState();
  };
  const handleUndo = () => {
    if (mode !== "edit" || historyIndexRef.current <= 0) return;
    historyIndexRef.current--;
    const snapshot = historyRef.current[historyIndexRef.current];
    if (snapshot) { restoringHistoryRef.current = true; setData(snapshot); }
    updateHistoryState();
  };
  const handleRedo = () => {
    if (mode !== "edit" || historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current++;
    const snapshot = historyRef.current[historyIndexRef.current];
    if (snapshot) { restoringHistoryRef.current = true; setData(snapshot); }
    updateHistoryState();
  };

  useEffect(() => {
    try {
      const s = localStorage.getItem(KEY);
      const stored = s ? JSON.parse(s) as Record<string, unknown> : null;
      const initial = stored ? readMap(stored["map"] ?? stored) : empty;
      if (stored && Array.isArray(stored["versions"])) setVersions(stored["versions"] as MapVersion[]);
      if (stored && typeof stored["mapName"] === "string") setMapName(stored["mapName"]);
      if (stored && typeof stored["mapDescription"] === "string") setMapDescription(stored["mapDescription"]);
      setData(initial);
      setViewerReferenceNationId(initial.playerNationId ?? "");
      historyRef.current = [initial];
      historyIndexRef.current = 0;
      updateHistoryState();
      const mobileUA = /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator.userAgent);
      const coarseSmallScreen = window.matchMedia("(pointer: coarse)").matches && window.matchMedia("(max-width: 900px)").matches;
      setIsMobileDevice(mobileUA || coarseSmallScreen);
      setDeviceMode(localStorage.getItem("worldforge-device-mode") === "celular" ? "celular" : localStorage.getItem("worldforge-device-mode") === "pc" ? "pc" : (mobileUA || coarseSmallScreen) ? "celular" : "pc");
      const savedHomeTheme = localStorage.getItem("worldforge-home-theme");
      if (savedHomeTheme && HOME_THEMES.some(theme => theme.id === savedHomeTheme)) setHomeTheme(savedHomeTheme as HomeTheme);
      const l = localStorage.getItem("atlas-lang");
      if (l === "pt" || l === "en" || l === "es") setLang(l);
      else setLanguageSetup(true);
    } catch {
      historyRef.current = [empty]; historyIndexRef.current = 0; updateHistoryState();
    }
    setLoaded(true);
  }, []);
  useEffect(() => { if (loaded) localStorage.setItem("worldforge-device-mode", deviceMode); }, [deviceMode, loaded]);
  useEffect(() => { if (loaded) localStorage.setItem("worldforge-home-theme", homeTheme); }, [homeTheme, loaded]);
  useEffect(() => { const check = () => setOrientationPortrait(window.innerHeight > window.innerWidth); check(); window.addEventListener("resize", check); window.addEventListener("orientationchange", check); return () => { window.removeEventListener("resize", check); window.removeEventListener("orientationchange", check); }; }, []);
  useEffect(() => { document.documentElement.lang = lang === "pt" ? "pt-BR" : lang; if (loaded && !languageSetup) localStorage.setItem("atlas-lang", lang); }, [lang, loaded, languageSetup]);
  useEffect(() => {
    const changed = () => {
      const active = document.fullscreenElement === appRef.current;
      setFullscreen(active);
      if (!active) screen.orientation?.unlock?.();
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      else setFullscreen(false);
      screen.orientation?.unlock?.();
    };
    document.addEventListener("fullscreenchange", changed);
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("fullscreenchange", changed); document.removeEventListener("keydown", keydown); };
  }, []);
  useEffect(() => {
    if (!loaded) return;
    if (restoringHistoryRef.current) { restoringHistoryRef.current = false; return; }
    if (drag.current?.mode === "paint") return;
    pushHistory(data);
  }, [data, loaded]);

  useEffect(() => { if (loaded && mode === "edit") try { localStorage.setItem(KEY, JSON.stringify({ map: data, mapName, mapDescription, versions })); } catch { setNotice(t.storageFull); } }, [data, mapName, mapDescription, versions, loaded, mode]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); handleUndo(); }
      else if (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey)) { e.preventDefault(); handleRedo(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode]);

  useEffect(() => {
    const el = ref.current; if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = viewRef.current;
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      const z = Math.min(4, Math.max(0.05, v.z * Math.exp(-dy * 0.0015)));
      const r = el.getBoundingClientRect(); const px = e.clientX - r.left, py = e.clientY - r.top; const k = z / v.z;
      setView({ z, x: px - (px - v.x) * k, y: py - (py - v.y) * k });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [mode]);

  const toWorld = (cx: number, cy: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return [0, 0] as [number, number];
    return [(cx - r.left - view.x) / view.z, (cy - r.top - view.y) / view.z] as [number, number];
  };
  const cellAt = (cx: number, cy: number) => {
    const [wx, wy] = toWorld(cx, cy); const x = Math.floor(wx / CELL), y = Math.floor(wy / CELL);
    return x >= 0 && y >= 0 && x < COLS && y < ROWS ? [x, y] as [number, number] : null;
  };
  const paint = useCallback((cx: number, cy: number) => {
    const [wx, wy] = toWorld(cx, cy);
    const current: [number, number] = [wx / CELL, wy / CELL];
    const cells = strokeCells(lastPaint.current ?? current, current, brushSize - 1);
    lastPaint.current = current;
    setData(d => {
      if (tool === "regiao") {
        const region = (d.regions ?? []).find(item => item.id === selectedRegionId);
        if (!region) return d;
        const regionTiles = { ...(d.regionTiles ?? {}) };
        for (const cell of cells) if (d.tiles[cell] === region.nationId) regionTiles[cell] = region.id;
        return { ...d, regionTiles };
      }
      const tiles = { ...d.tiles };
      const regionTiles = { ...(d.regionTiles ?? {}) };
      for (const cell of cells) {
        if (tool === "apagar") { delete tiles[cell]; delete regionTiles[cell]; }
        else if (brush) { tiles[cell] = brush; const assignedRegion = (d.regions ?? []).find(region => region.id === regionTiles[cell]); if (assignedRegion && assignedRegion.nationId !== brush) delete regionTiles[cell]; }
      }
      return { ...d, tiles, regionTiles };
    });
  }, [tool, brush, view, brushSize, selectedRegionId]);

  const stopDrag = () => {
    const finished = drag.current;
    drag.current = null;
    lastPaint.current = null;
    if (finished?.mode === "paint") pushHistory(data);
  };
  const fitMap = () => {
    const r = ref.current?.getBoundingClientRect(); if (!r) return;
    const z = Math.min((r.width - 40) / W, (r.height - 70) / H);
    setView({ z, x: (r.width - W * z) / 2, y: (r.height - H * z) / 2 });
  };
  const zoom = (factor: number) => {
    const r = ref.current?.getBoundingClientRect(); if (!r) return;
    setView(v => { const z = Math.min(4, Math.max(0.05, v.z * factor)); const k = z / v.z;
      return { z, x: r.width / 2 - (r.width / 2 - v.x) * k, y: r.height / 2 - (r.height / 2 - v.y) * k }; });
  };
  const enterFullscreen = async (lockLandscape = false) => {
    setPanelOpen(false);
    setSel(null);
    try {
      if (appRef.current?.requestFullscreen && !document.fullscreenElement) await appRef.current.requestFullscreen();
      setFullscreen(true);
      if (lockLandscape) {
        const orientation = screen.orientation as ScreenOrientation & { lock?: (value: string) => Promise<void> };
        if (orientation?.lock) await orientation.lock("landscape");
        else setNotice(t.rotate);
      }
    } catch {
      setFullscreen(true);
      setNotice(t.rotateFallback);
    }
  };
  const toggleFullscreen = async () => {
    if (fullscreen || document.fullscreenElement) {
      try { if (document.fullscreenElement) await document.exitFullscreen(); } catch { /* CSS fullscreen can still be dismissed. */ }
      screen.orientation?.unlock?.();
      setFullscreen(false);
      return;
    }
    await enterFullscreen(true);
  };

  const onDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    if (deviceMode === "celular" && e.pointerType === "touch") {
      touchPoints.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touchPoints.current.size >= 2) {
        const pts = [...touchPoints.current.values()]; const a = pts[0], b = pts[1]; const bounds = ref.current?.getBoundingClientRect();
        if (a && b) { const midX = (a.x + b.x) / 2 - (bounds?.left ?? 0), midY = (a.y + b.y) / 2 - (bounds?.top ?? 0); pinchStart.current = { distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), zoom: viewRef.current.z, worldX: (midX - viewRef.current.x) / viewRef.current.z, worldY: (midY - viewRef.current.y) / viewRef.current.z }; }
        drag.current = null; return;
      }
    }
    if (mode === "view") {
      drag.current = { mode: "pan", sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
      const c = cellAt(e.clientX, e.clientY);
      const cellKey = c ? `${c[0]},${c[1]}` : null;
      const nationId = cellKey ? data.tiles[cellKey] : undefined;
      const nation = nationId ? nationById(nationId) : undefined;
      setSel(nation ? { kind: "nation", id: nation.id } : null);
      if (nation) setViewerReferenceNationId(nation.id);
      return;
    }
    if (e.button === 1 || e.button === 2 || tool === "mover") {
      drag.current = { mode: "pan", sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
      if (tool === "mover" && e.button === 0) {
        const c = cellAt(e.clientX, e.clientY);
        const cellKey = c ? `${c[0]},${c[1]}` : null;
        const n = cellKey && data.tiles[cellKey];
        const nation = n ? nationById(n) : undefined;
        setSel(nation && visibleNations.some(item => item.id === nation.id) ? { kind: "nation", id: nation.id } : null);
      }
      return;
    }
    const [wx, wy] = toWorld(e.clientX, e.clientY);
    if (tool === "comentario") {
      setDialog({ type: "text", title: tx("Texto sobre o mapa", "Text on map", "Texto en el mapa"), value: "", onSubmit: value => { if (value.trim()) setData(d => ({ ...d, comments: [...d.comments, { id: uid(), x: wx, y: wy, text: value.trim(), createdAt: new Date().toISOString(), size: 18, fontFamily: "Arial", rotation: 0 }] })); } });
    } else if (tool === "pintar" || tool === "apagar" || tool === "regiao") {
      if (tool === "pintar" && !brush) { setPanelOpen(true); setNotice(data.nations.length ? t.pickNation : t.createFirst); return; }
      if (tool === "regiao" && !(data.regions ?? []).some(region => region.id === selectedRegionId)) { setPanelOpen(true); setNotice(tx("Crie ou selecione uma região primeiro.", "Create or select a region first.", "Crea o selecciona una región primero.")); return; }
      drag.current = { mode: "paint", sx: 0, sy: 0, vx: 0, vy: 0 }; paint(e.clientX, e.clientY);
    } else if (tool === "balde") {
      if (!brush) { setPanelOpen(true); setNotice(data.nations.length ? t.pickNation : t.createFirst); return; }
      const c = cellAt(e.clientX, e.clientY);
      if (c) {
        setData(d => { const tiles = floodFill(c[0], c[1], brush, d.tiles); return { ...d, tiles }; });
      }
    } else if (tool === "capital" || tool === "cidade" || tool === "forte" || tool === "porto") {
      const m: Marker = { id: uid(), type: tool, shape: tool === "capital" ? "star" : tool === "cidade" ? "circle" : tool === "forte" ? "square" : "diamond", x: wx, y: wy, name: t.newMarker, notes: "", npcs: 100, grossIncome: 50, expenses: 20, foodProduction: 0, foodConsumption: 0, production: "" };
      setData(d => ({ ...d, markers: [...d.markers, m] })); setSel({ kind: "marker", id: m.id });
    } else {
      setDraft(p => [...p, [wx, wy]]);
    }
  };
  const onMove = (e: React.PointerEvent) => {
    if (deviceMode === "celular" && e.pointerType === "touch" && touchPoints.current.has(e.pointerId)) {
      touchPoints.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pts = [...touchPoints.current.values()]; const a = pts[0], b = pts[1], initial = pinchStart.current; const bounds = ref.current?.getBoundingClientRect();
      if (pts.length >= 2 && a && b && initial) { const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)); const z = Math.max(0.05, Math.min(4, initial.zoom * distance / initial.distance)); const midX = (a.x + b.x) / 2 - (bounds?.left ?? 0), midY = (a.y + b.y) / 2 - (bounds?.top ?? 0); setView({ z, x: midX - initial.worldX * z, y: midY - initial.worldY * z }); return; }
    }
    const [wx, wy] = toWorld(e.clientX, e.clientY);
    setCursorPos({ x: (Math.floor(wx / CELL) + 0.5) * CELL, y: (Math.floor(wy / CELL) + 0.5) * CELL });
    const d = drag.current; if (!d) return;
    if (d.mode === "pan") setView(v => ({ ...v, x: d.vx + e.clientX - d.sx, y: d.vy + e.clientY - d.sy }));
    else if (d.mode === "paint") paint(e.clientX, e.clientY);
    else if (d.mode === "entity") {
      const x = d.wx + (e.clientX - d.sx) / viewRef.current.z;
      const y = d.wy + (e.clientY - d.sy) / viewRef.current.z;
      if (d.entityKind === "marker") upMarker(d.id, { x, y });
      else setData(current => ({ ...current, comments: current.comments.map(c => c.id === d.id ? { ...c, x, y } : c) }));
    }
  };
  const finishLine = () => {
    if (mode !== "edit") return;
    if (draft.length >= 2 && (tool === "estrada" || tool === "rota")) {
      const l: Line = { id: uid(), type: tool, points: draft };
      setData(d => ({ ...d, lines: [...d.lines, l] })); setSel({ kind: "line", id: l.id });
    }
    setDraft([]);
  };

  const addNation = () => {
    const n: Nation = { id: uid(), name: t.newNationName, color: `hsl(${Math.floor(Math.random() * 360)} 55% 50%)`, relation: data.nations.length ? "neutra" : "propria", ruler: "", treaties: "", notes: "" };
    setData(d => ({ ...d, nations: [...d.nations, n] })); setBrush(n.id); setRegionNationId(n.id); setSel({ kind: "nation", id: n.id }); setTool("pintar"); setNotice("");
  };
  const upNation = (id: string, p: Partial<Nation>) => {
    const current = data.nations.find(n => n.id === id); if (!current) return;
    const overlord = Object.prototype.hasOwnProperty.call(p, "overlordId") ? p.overlordId : current.overlordId;
    if (overlord === id) { setNotice(tx("Uma nação não pode ser vassala de si mesma.", "A nation cannot be its own vassal.", "Una nación no puede ser vasalla de sí misma.")); return; }
    if (overlord) { let cursor: string | undefined = overlord; const seen = new Set<string>([id]); while (cursor) { if (seen.has(cursor)) { setNotice(tx("Essa relação criaria um ciclo de vassalagem.", "This relationship would create a vassalage cycle.", "Esta relación crearía un ciclo de vasallaje.")); return; } seen.add(cursor); cursor = data.nations.find(n => n.id === cursor)?.overlordId; } }
    setData(d => ({ ...d, nations: d.nations.map(n => n.id === id ? { ...n, ...p, overlordId: overlord || undefined } : n) }));
  };
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
        canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d"); if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        apply(canvas.toDataURL("image/webp", 0.85));
      };
      img.onerror = () => setNotice(t.imageFail);
      img.src = reader.result;
    };
    reader.readAsDataURL(f);
  };
  const onBg = (f?: File) => onImage(f, bg => setData(d => ({ ...d, bg })));

  const exportJson = () => setDialog({ type: "save", name: mapName, description: mapDescription, filename: mapName || "meu-mundo" });
  const exportPng = () => {
    const mapWidth = 1800, mapHeight = Math.round(1800 * H / W), margin = 48, header = 112, footer = 180;
    const canvas = document.createElement("canvas");
    canvas.width = mapWidth + margin * 2; canvas.height = header + mapHeight + footer + margin;
    const ctx = canvas.getContext("2d");
    if (!ctx) { setNotice(tx("Não foi possível preparar a imagem.", "Could not prepare the image.", "No se pudo preparar la imagen.")); return; }
    const sx = mapWidth / W, sy = mapHeight / H, ox = margin, oy = header;
    ctx.fillStyle = "#f8fafc"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#0f172a"; ctx.font = "bold 34px Arial"; ctx.fillText(mapName || "Meu mundo", margin, 50);
    ctx.fillStyle = "#475569"; ctx.font = "16px Arial"; ctx.fillText(mapDescription.trim() || tx("Mapa político", "Political map", "Mapa político"), margin, 80);
    ctx.textAlign = "right"; ctx.fillText(new Date().toLocaleDateString("pt-BR"), canvas.width - margin, 50); ctx.textAlign = "left";
    ctx.fillStyle = "#e2e8f0"; ctx.fillRect(ox, oy, mapWidth, mapHeight);
    const drawLayers = () => {
      for (const [key, id] of Object.entries(data.tiles)) {
        const [x, y] = key.split(",").map(Number), nation = data.nations.find(n => n.id === id);
        if (!nation) continue;
        ctx.fillStyle = nation.color.startsWith("hsl") ? toHex(nation.color) : nation.color;
        ctx.fillRect(ox + x * CELL * sx, oy + y * CELL * sy, CELL * sx + 0.4, CELL * sy + 0.4);
      }
      if (showRegions) {
        const regionById = new Map((data.regions ?? []).map(region => [region.id, region]));
        const assignments = data.regionTiles ?? {};
        for (const [key, regionId] of Object.entries(assignments)) {
          const region = regionById.get(regionId);
          if (!region || data.tiles[key] !== region.nationId) continue;
          const [x = 0, y = 0] = key.split(",").map(Number);
          ctx.strokeStyle = toHex(region.color); ctx.lineWidth = Math.max(1, 2 * Math.min(sx, sy)); ctx.beginPath();
          if (assignments[x + "," + (y - 1)] !== regionId) { ctx.moveTo(ox + x * CELL * sx, oy + y * CELL * sy); ctx.lineTo(ox + (x + 1) * CELL * sx, oy + y * CELL * sy); }
          if (assignments[(x + 1) + "," + y] !== regionId) { ctx.moveTo(ox + (x + 1) * CELL * sx, oy + y * CELL * sy); ctx.lineTo(ox + (x + 1) * CELL * sx, oy + (y + 1) * CELL * sy); }
          if (assignments[x + "," + (y + 1)] !== regionId) { ctx.moveTo(ox + x * CELL * sx, oy + (y + 1) * CELL * sy); ctx.lineTo(ox + (x + 1) * CELL * sx, oy + (y + 1) * CELL * sy); }
          if (assignments[(x - 1) + "," + y] !== regionId) { ctx.moveTo(ox + x * CELL * sx, oy + y * CELL * sy); ctx.lineTo(ox + x * CELL * sx, oy + (y + 1) * CELL * sy); }
          ctx.stroke();
        }
      }
      if (data.showGrid) {
        ctx.strokeStyle = "rgba(15,23,42,.12)"; ctx.lineWidth = 0.5;
        for (let x = 0; x <= COLS; x++) { ctx.beginPath(); ctx.moveTo(ox + x * CELL * sx, oy); ctx.lineTo(ox + x * CELL * sx, oy + mapHeight); ctx.stroke(); }
        for (let y = 0; y <= ROWS; y++) { ctx.beginPath(); ctx.moveTo(ox, oy + y * CELL * sy); ctx.lineTo(ox + mapWidth, oy + y * CELL * sy); ctx.stroke(); }
      }
      for (const line of data.lines) {
        if (line.points.length < 2) continue;
        ctx.beginPath(); ctx.moveTo(ox + line.points[0]![0] * sx, oy + line.points[0]![1] * sy);
        for (const point of line.points.slice(1)) ctx.lineTo(ox + point[0] * sx, oy + point[1] * sy);
        ctx.strokeStyle = line.type === "estrada" ? "#334155" : "#0e7490"; ctx.lineWidth = 3;
        if (line.type === "rota") ctx.setLineDash([8, 6]); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.textAlign = "center";
      for (const marker of data.markers) {
        const x = ox + marker.x * sx, y = oy + marker.y * sy;
        ctx.beginPath(); ctx.arc(x, y, marker.type === "capital" ? 9 : 6, 0, Math.PI * 2);
        ctx.fillStyle = marker.color ?? "#ffffff"; ctx.fill(); ctx.strokeStyle = "#0f172a"; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = "#0f172a"; ctx.font = "bold 15px Arial"; ctx.fillText(marker.name, x, y + 24);
      }
      for (const nation of data.nations) {
        const cells = Object.entries(data.tiles).filter(([, id]) => id === nation.id).map(([key]) => key);
        if (!cells.length) continue;
        let x = 0, y = 0;
        for (const key of cells) { const [cx, cy] = key.split(",").map(Number); x += (cx + 0.5) * CELL; y += (cy + 0.5) * CELL; }
        x = ox + x / cells.length * sx; y = oy + y / cells.length * sy;
        ctx.font = "bold 20px Arial"; ctx.lineWidth = 4; ctx.strokeStyle = "#f8fafc"; ctx.strokeText(nation.name, x, y); ctx.fillStyle = "#0f172a"; ctx.fillText(nation.name, x, y);
      }
      for (const comment of data.comments) {
        ctx.save(); ctx.translate(ox + comment.x * sx, oy + comment.y * sy); ctx.rotate((comment.rotation ?? 0) * Math.PI / 180);
        ctx.font = `bold ${Math.max(12, (comment.size ?? 18) * 0.75)}px ${comment.fontFamily ?? "Arial"}`;
        ctx.textAlign = "center"; ctx.lineWidth = 4; ctx.strokeStyle = "#f8fafc"; ctx.strokeText(comment.text, 0, 0); ctx.fillStyle = comment.color ?? "#0f172a"; ctx.fillText(comment.text, 0, 0); ctx.restore();
      }
      ctx.strokeStyle = "#64748b"; ctx.lineWidth = 2; ctx.strokeRect(ox, oy, mapWidth, mapHeight);
      const fy = oy + mapHeight + 36;
      ctx.textAlign = "left"; ctx.fillStyle = "#0f172a"; ctx.font = "bold 18px Arial"; ctx.fillText(tx("LEGENDA", "LEGEND", "LEYENDA"), margin, fy);
      data.nations.slice(0, 12).forEach((nation, i) => {
        const col = i % 4, row = Math.floor(i / 4), lx = margin + col * (mapWidth / 4), ly = fy + 28 + row * 27;
        ctx.fillStyle = nation.color.startsWith("hsl") ? toHex(nation.color) : nation.color; ctx.fillRect(lx, ly - 13, 18, 18);
        ctx.fillStyle = "#0f172a"; ctx.font = "14px Arial"; ctx.fillText(nation.name.slice(0, 28), lx + 26, ly + 1);
      });
      if (data.nations.length > 12) { ctx.fillStyle = "#475569"; ctx.font = "13px Arial"; ctx.fillText(`+ ${data.nations.length - 12} ${tx("nações adicionais", "additional nations", "naciones adicionales")}`, margin, fy + 28 + 3 * 27); }
      const scaleY = oy + mapHeight - 24, scaleX = ox + mapWidth - 210;
      ctx.strokeStyle = "#0f172a"; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(scaleX, scaleY); ctx.lineTo(scaleX + 150, scaleY); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(scaleX, scaleY - 7); ctx.lineTo(scaleX, scaleY + 7); ctx.moveTo(scaleX + 150, scaleY - 7); ctx.lineTo(scaleX + 150, scaleY + 7); ctx.stroke();
      ctx.fillStyle = "#0f172a"; ctx.font = "13px Arial"; ctx.textAlign = "center"; ctx.fillText(tx("Escala gráfica · 150 unidades", "Graphic scale · 150 units", "Escala gráfica · 150 unidades"), scaleX + 75, scaleY - 12);
      canvas.toBlob(blob => {
        if (!blob) { setNotice(tx("Falha ao gerar o PNG.", "Failed to generate PNG.", "No se pudo generar el PNG.")); return; }
        const url = URL.createObjectURL(blob), a = document.createElement("a");
        const safe = (mapName || "meu-mundo").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "meu-mundo";
        a.href = url; a.download = `${safe}-mapa.png`; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        setNotice(tx("Mapa exportado em PNG com título, legenda e escala.", "Map exported as PNG with title, legend, and scale.", "Mapa exportado como PNG con título, leyenda y escala."));
      }, "image/png");
    };
    if (data.bg) {
      const img = new Image();
      img.onload = () => {
        ctx.save(); ctx.globalAlpha = data.bgOpacity;
        const ratio = data.bgFit === "stretch" ? null : (data.bgFit === "cover" ? Math.max(mapWidth / img.width, mapHeight / img.height) : Math.min(mapWidth / img.width, mapHeight / img.height));
        const iw = ratio === null ? mapWidth : img.width * ratio, ih = ratio === null ? mapHeight : img.height * ratio;
        ctx.translate(ox + mapWidth / 2 + data.bgX * sx, oy + mapHeight / 2 + data.bgY * sy);
        ctx.rotate(data.bgRotation * Math.PI / 180); ctx.scale(data.bgScale, data.bgScale);
        ctx.drawImage(img, -iw / 2, -ih / 2, iw, ih); ctx.restore(); drawLayers();
      };
      img.onerror = drawLayers; img.src = data.bg;
    } else drawLayers();
  };

  const completeExport = (name: string, description: string, requestedFile: string) => {
    const now = new Date().toISOString(); const snapshot: MapVersion = { id: uid(), name: name.trim() || "Meu mundo", description: description.trim(), createdAt: now, data: JSON.parse(JSON.stringify(data)) as Data };
    const nextVersions = [...versions, snapshot].slice(-30); setMapName(snapshot.name); setMapDescription(snapshot.description); setVersions(nextVersions);
    const payload = { format: "worldforge-map", version: 3, metadata: { name: snapshot.name, description: snapshot.description, updatedAt: now }, map: data, versions: nextVersions };
    const safe = (requestedFile.trim() || snapshot.name).replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "meu-mundo";
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })); const a = document.createElement("a"); a.href = url; a.download = `${safe}.json`; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(tx("Mapa e histórico exportados em JSON.", "Map and history exported as JSON.", "Mapa e historial exportados en JSON."));
  };
  const restoreVersion = (version: MapVersion) => setDialog({ type: "confirm", title: tx("Restaurar versão", "Restore version", "Restaurar versión"), message: tx(`Restaurar "${version.name}"?`, `Restore "${version.name}"?`, `¿Restaurar "${version.name}"?`), onSubmit: () => { setData(readMap(version.data)); setMapName(version.name); setMapDescription(version.description); setNotice(tx("Versão restaurada.", "Version restored.", "Versión restaurada.")); } });
  const importJson = async (f?: File) => {
    if (!f) { setPendingViewer(false); return; }
    try {
      const parsed = JSON.parse(await f.text()) as Record<string, unknown>;
      const next = readMap(parsed["map"] ?? parsed);
      const meta = parsed["metadata"] as { name?: string; description?: string } | undefined;
      if (mode === "home" || mode === "view" || pendingViewer) {
        setData(next); setViewerReferenceNationId(next.playerNationId ?? ""); if (typeof meta?.name === "string") setMapName(meta.name); if (typeof meta?.description === "string") setMapDescription(meta.description);
        setSel(null); setBrush(null); setDraft([]); setFilter("todas"); setTool("mover"); setMode("view"); setPendingViewer(false); setNotice(t.imported); window.setTimeout(fitMap, 0); return;
      }
      setDialog({ type: "confirm", title: t.importWorld, message: t.confirmImport, onSubmit: () => { setData(next); if (typeof meta?.name === "string") setMapName(meta.name); if (typeof meta?.description === "string") setMapDescription(meta.description); if (Array.isArray(parsed["versions"])) setVersions(parsed["versions"] as MapVersion[]); setSel(null); setBrush(null); setDraft([]); setFilter("todas"); fitMap(); setNotice(t.imported); } }); return;
    } catch { setNotice(t.invalidFile); }
  };

  const saveDialog = dialog?.type === "save" ? dialog : null;
  const historyDialog = dialog?.type === "history" ? dialog : null;
  const selNation = sel?.kind === "nation" ? nationById(sel.id) : undefined;
  const selMarker = sel?.kind === "marker" ? data.markers.find(m => m.id === sel.id) : undefined;
  const selLine = sel?.kind === "line" ? data.lines.find(m => m.id === sel.id) : undefined;
  const selComment = sel?.kind === "comment" ? data.comments.find(c => c.id === sel.id) : undefined;
  const tileCount = (id: string) => Object.values(data.tiles).filter(t => t === id).length;
  const regionTileCount = (id: string) => Object.values(data.regionTiles ?? {}).filter(regionId => regionId === id).length;
  const createRegion = () => {
    const nation = data.nations.find(item => item.id === regionNationId);
    if (!nation || !regionName.trim()) return;
    const region: Region = { id: uid(), name: regionName.trim(), nationId: nation.id, color: `hsl(${Math.floor(Math.random() * 360)} 65% 45%)` };
    setData(d => ({ ...d, regions: [...(d.regions ?? []), region] }));
    setSelectedRegionId(region.id); setRegionName(""); setShowRegions(true); setTool("regiao"); setNotice(tx("Região criada. Pinte as células pertencentes ao país escolhido.", "Region created. Paint cells belonging to the selected nation.", "Región creada. Pinta las celdas pertenecientes al país seleccionado."));
  };
  const worldStats = useMemo(() => data.markers.reduce((a, m) => ({ population: a.population + (m.npcs ?? 0), income: a.income + (m.grossIncome ?? 0), expenses: a.expenses + (m.expenses ?? 0), foodProduction: a.foodProduction + (m.foodProduction ?? 0), foodConsumption: a.foodConsumption + (m.foodConsumption ?? 0) }), { population: 0, income: 0, expenses: 0, foodProduction: 0, foodConsumption: 0 }), [data.markers]);
  const worldBalance = worldStats.income - worldStats.expenses;
  const foodBalance = worldStats.foodProduction - worldStats.foodConsumption;
  const alliances = data.alliances ?? [];
  const wars = data.wars ?? [];
  const focusedNation = sel?.kind === "nation" ? data.nations.find(n => n.id === sel.id) : undefined;
  const relationToPlayer = (nation: Nation): Relation => nation.id === data.playerNationId ? "propria" : nation.relations?.[data.playerNationId ?? ""] ?? nation.relation;
  const viewerReferenceId = viewerReferenceNationId;
  const relationToViewerReference = (nation: Nation): Relation => !viewerReferenceId ? nation.relation : nation.id === viewerReferenceId ? "propria" : nation.relations?.[viewerReferenceId] ?? nation.relation;
  const viewerVisibleNations = data.nations.filter(n => {
    const q = viewerNationSearch.trim().toLocaleLowerCase();
    if (q && !n.name.toLocaleLowerCase().includes(q) && !(n.ruler ?? "").toLocaleLowerCase().includes(q)) return false;
    if (viewerNationFilter === "todas") return true;
    if (viewerNationFilter === "alianças") return alliances.some(a => a.nationIds.includes(n.id));
    if (viewerNationFilter === "guerras") return wars.some(w => w.active && [...w.attackers, ...w.defenders].includes(n.id));
    if (viewerNationFilter === "inimigas") return relationToViewerReference(n) === "inimiga" || (n.enemyIds ?? []).includes(viewerReferenceId) || data.nations.some(other => other.id === viewerReferenceId && (other.enemyIds ?? []).includes(n.id));
    return relationToViewerReference(n) === viewerNationFilter;
  });
  const viewerVisibleLocations = data.markers.filter(m => {
    const q = viewerLocationSearch.trim().toLocaleLowerCase();
    return !q || m.name.toLocaleLowerCase().includes(q) || m.notes.toLocaleLowerCase().includes(q) || (m.production ?? "").toLocaleLowerCase().includes(q);
  });
  const visibleNations = data.nations.filter(n => {
    const referenceId = mode === "view" ? viewerReferenceId : data.playerNationId ?? "";
    const relation = mode === "view" ? relationToViewerReference(n) : relationToPlayer(n);
    if (filter === "todas") return true;
    if (filter === "alianças") return alliances.some(a => a.nationIds.includes(n.id));
    if (filter === "guerras") return wars.some(w => w.active && [...w.attackers, ...w.defenders].includes(n.id));
    if (filter === "inimigas") return relation === "inimiga" || (n.enemyIds ?? []).includes(referenceId) || data.nations.some(other => other.id === referenceId && (other.enemyIds ?? []).includes(n.id));
    return relation === filter;
  });
  const regionTerritories = useMemo(() => (data.regions ?? []).map(region => {
    const keys = Object.entries(data.regionTiles ?? {}).filter(([key, id]) => id === region.id && data.tiles[key] === region.nationId).map(([key]) => key);
    return { region, keys, path: territoryPath(keys, data.smooth) };
  }), [data.regions, data.regionTiles, data.tiles, data.smooth]);
  const territories = useMemo(() => data.nations.map(n => {
    const keys = Object.entries(data.tiles).filter(([, id]) => id === n.id).map(([key]) => key);
    return { nation: n, keys, path: territoryPath(keys, data.smooth) };
  }), [data.nations, data.tiles, data.smooth]);
  const tutorialSteps = [
    { title: tx("1. Navegação", "1. Navigation", "1. Navegación"), body: tx("Arraste o mapa com a ferramenta Mover / Selecionar. Use a roda do mouse; no celular, use dois dedos.", "Drag the map with Move / Select. Use the mouse wheel; on mobile, use two fingers.", "Arrastra el mapa con Mover / Seleccionar. Usa la rueda del ratón; en el móvil, usa dos dedos.") },
    { title: tx("2. Países e territórios", "2. Nations and territories", "2. Naciones y territorios"), body: tx("Crie uma nação no painel lateral, escolha a cor e use Pintar território ou Preencher área. O filtro de relações e as camadas ajudam a isolar informações.", "Create a nation in the side panel, choose a color, then use Paint Territory or Fill Area. Relation filters and layers help isolate information.", "Crea una nación en el panel lateral, elige un color y usa Pintar territorio o Rellenar área. Los filtros y las capas ayudan a aislar información.") },
    { title: tx("3. Cidades e rotas", "3. Cities and routes", "3. Ciudades y rutas"), body: tx("Escolha Capital, Cidade, Forte ou Porto e clique no mapa. Use Estrada ou Rota marítima para desenhar conexões; dê duplo clique ou use Concluir traçado.", "Choose Capital, City, Fort, or Port and click the map. Use Road or Sea Route to draw connections; double-click or select Finish Path.", "Elige Capital, Ciudad, Fuerte o Puerto y haz clic en el mapa. Usa Camino o Ruta marítima para dibujar conexiones; haz doble clic o selecciona Terminar trazado.") },
    { title: tx("4. Dados e comparação", "4. Data and comparison", "4. Datos y comparación"), body: tx("Selecione uma localidade para editar população, receitas, gastos e alimentos. Abra Status do mundo para os totais e Comparar para analisar várias nações e cidades.", "Select a location to edit population, income, expenses, and food. Open World Status for totals and Compare to analyze multiple nations and cities.", "Selecciona una localidad para editar población, ingresos, gastos y alimentos. Abre Estado del mundo para ver los totales y Comparar para analizar varias naciones y ciudades.") },
    { title: tx("5. Salvar e recuperar", "5. Save and restore", "5. Guardar y recuperar"), body: tx("Salvar mapa exporta um arquivo JSON com os dados e histórico. Importe esse arquivo em outro dispositivo para continuar a edição.", "Save Map exports a JSON file containing the data and history. Import it on another device to continue editing.", "Guardar mapa exporta un archivo JSON con los datos y el historial. Impórtalo en otro dispositivo para seguir editando.") },
  ];

  const activeHomeTheme = HOME_THEMES.find(theme => theme.id === homeTheme) ?? HOME_THEMES[0]!;

  if (mode === "home") return (
    <div className={`min-h-screen flex items-center justify-center p-4 sm:p-6 ${activeHomeTheme.background} ${activeHomeTheme.foreground} transition-colors`}>
      <div className={`w-full max-w-2xl rounded-2xl border p-5 shadow-xl sm:p-8 ${activeHomeTheme.panel}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h1 className={`font-display text-3xl font-bold ${activeHomeTheme.accent}`}>{t.appName}</h1>
            <p className={`mt-2 ${activeHomeTheme.muted}`}>{tx("Escolha como deseja usar o mapa.", "Choose how to use the map.", "Elige cómo usar el mapa.")}</p></div>
          <div className="flex gap-2">{languageSetup && LANGS.map(option => <Button key={option.id} size="sm" variant={lang === option.id ? "default" : "outline"} onClick={() => { setLang(option.id); localStorage.setItem("atlas-lang", option.id); setLanguageSetup(false); }}>{option.label}</Button>)}</div>
        </div>
        <div className="mt-6">
          <p className={`mb-2 text-xs font-semibold uppercase tracking-wider ${activeHomeTheme.muted}`}>{tx("Tema da tela inicial", "Home screen theme", "Tema de la pantalla inicial")}</p>
          <div className="flex flex-wrap gap-2">{HOME_THEMES.map(theme => <button type="button" key={theme.id} aria-pressed={homeTheme === theme.id} onClick={() => setHomeTheme(theme.id)} className={`rounded-full border px-3 py-1.5 text-sm transition ${homeTheme === theme.id ? "border-primary ring-2 ring-primary/30" : "border-current/20"} ${theme.id === "midnight" ? "bg-slate-900 text-slate-100" : theme.id === "parchment" ? "bg-amber-100 text-amber-950" : theme.id === "ocean" ? "bg-sky-900 text-sky-100" : theme.id === "forest" ? "bg-emerald-900 text-emerald-100" : "bg-background text-foreground"}`}>{theme.id === "atlas" ? tx("Atlas", "Atlas", "Atlas") : theme.id === "midnight" ? tx("Noturno", "Midnight", "Nocturno") : theme.id === "parchment" ? tx("Pergaminho", "Parchment", "Pergamino") : theme.id === "ocean" ? tx("Oceano", "Ocean", "Océano") : tx("Floresta", "Forest", "Bosque")}</button>)}</div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button type="button" className={`min-h-32 rounded-xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${activeHomeTheme.card}`} onClick={() => { try { const saved = localStorage.getItem(KEY); if (saved) { const stored = JSON.parse(saved) as Record<string, unknown>; setData(readMap(stored["map"] ?? stored)); if (typeof stored["mapName"] === "string") setMapName(stored["mapName"]); if (typeof stored["mapDescription"] === "string") setMapDescription(stored["mapDescription"]); if (Array.isArray(stored["versions"])) setVersions(stored["versions"] as MapVersion[]); } else { setData(empty); setMapName("Meu mundo"); setMapDescription(""); } } catch { setData(empty); } setTool("mover"); setSel(null); setPanelOpen(false); setMode("edit"); }}>
            <span className={`mb-3 inline-flex rounded-lg border border-current/20 p-2 ${activeHomeTheme.accent}`}><Pencil className="h-5 w-5" /></span>
            <strong className="block">{tx("Modo de edição", "Editing mode", "Modo de edición")}</strong><p className={`mt-2 text-sm ${activeHomeTheme.muted}`}>{tx("Criar, editar e salvar mapas.", "Create, edit and save maps.", "Crear, editar y guardar mapas.")}</p>
          </button>
          <button type="button" className={`min-h-32 rounded-xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${activeHomeTheme.card}`} onClick={() => { setPendingViewer(true); importRef.current?.click(); }}>
            <span className={`mb-3 inline-flex rounded-lg border border-current/20 p-2 ${activeHomeTheme.accent}`}><Eye className="h-5 w-5" /></span>
            <strong className="block">{tx("Modo de visualização", "View-only mode", "Modo de visualización")}</strong><p className={`mt-2 text-sm ${activeHomeTheme.muted}`}>{tx("Abrir um JSON para explorar o mapa sem alterar o original.", "Open a JSON map to explore it without changing the original.", "Abrir un mapa JSON para explorarlo sin cambiar el original.")}</p>
          </button>
        </div>
        <p className={`mt-4 text-xs ${activeHomeTheme.muted}`}>{tx("O tema escolhido fica salvo neste dispositivo. A visualização não grava alterações no mapa.", "Your theme is saved on this device. View mode does not save map changes.", "El tema se guarda en este dispositivo. La vista no guarda cambios en el mapa.")}</p>
      </div>
      <input ref={importRef} type="file" accept=".json,application/json" hidden onChange={e => { void importJson(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
  );

  return (
    <div ref={appRef} className={`atlas-app relative flex w-full overflow-hidden ${activeHomeTheme.background} ${activeHomeTheme.foreground} ${fullscreen ? "atlas-fullscreen" : ""}`} data-theme={homeTheme}>
      {isMobileDevice && orientationPortrait && !languageSetup && <div className="absolute inset-0 z-[200] flex items-center justify-center bg-background p-6 text-center"><div className="max-w-sm"><Smartphone className="mx-auto mb-4 h-12 w-12" /><h2 className="font-display text-2xl">{lang === "pt" ? "Gire o celular" : lang === "es" ? "Gira el móvil" : "Rotate your phone"}</h2><p className="mt-2 text-sm text-muted-foreground">{lang === "pt" ? "O WorldForge Maps funciona no celular apenas na orientação horizontal. Gire o aparelho para continuar." : lang === "es" ? "WorldForge Maps en móviles solo funciona en orientación horizontal. Gira el dispositivo para continuar." : "WorldForge Maps on phones only works in landscape orientation. Rotate your device to continue."}</p><Button className="mt-4" onClick={() => void enterFullscreen(true)}>{lang === "pt" ? "Ativar paisagem" : lang === "es" ? "Activar horizontal" : "Enable landscape"}</Button></div></div>}
      {languageSetup && <div className="fixed inset-0 z-[300] flex items-center justify-center bg-background p-6"><div className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center shadow-xl"><h2 className="font-display text-2xl font-semibold">{lang === "pt" ? "Escolha seu idioma" : lang === "es" ? "Elige tu idioma" : "Choose your language"}</h2><p className="mt-2 text-sm text-muted-foreground">{lang === "pt" ? "Selecione o idioma para usar o WorldForge Maps. Você poderá alterá-lo nas configurações." : lang === "es" ? "Selecciona el idioma de WorldForge Maps. Podrás cambiarlo en la configuración." : "Select the language for WorldForge Maps. You can change it later in Settings."}</p><div className="mt-5 grid gap-2">{LANGS.map(option => <Button key={option.id} variant={lang === option.id ? "default" : "outline"} className="w-full" onClick={() => setLang(option.id)}>{option.label}</Button>)}</div><Button className="mt-4 w-full" onClick={() => { localStorage.setItem("atlas-lang", lang); setLanguageSetup(false); }}>{lang === "pt" ? "Continuar" : lang === "es" ? "Continuar" : "Continue"}</Button></div></div>}
      <input ref={importRef} type="file" accept=".json,application/json" hidden onChange={e => { void importJson(e.target.files?.[0]); e.target.value = ""; }} />
      {mode === "view" ? <aside className={`flex w-80 max-w-[45vw] shrink-0 flex-col gap-3 overflow-y-auto border-r p-3 sm:p-4 ${activeHomeTheme.panel}`}>
        <div className="flex items-center justify-between gap-2"><div className="min-w-0"><h2 className="truncate font-semibold">{mapName}</h2><p className="text-xs opacity-75">{tx("Modo somente leitura", "Read-only mode", "Modo de solo lectura")}</p></div><Button size="sm" variant="ghost" onClick={() => { setMode("home"); setSettingsOpen(false); }}>{tx("Sair", "Exit", "Salir")}</Button></div>
        {mapDescription && <p className="text-sm opacity-80">{mapDescription}</p>}
        <Button variant="outline" size="sm" onClick={() => { setPendingViewer(true); importRef.current?.click(); }}>{tx("Carregar outro mapa", "Load another map", "Cargar otro mapa")}</Button>
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-current/15 p-2 text-xs">
          <div><p className="opacity-70">{tx("População", "Population", "Población")}</p><strong>{worldStats.population.toLocaleString(lang === "pt" ? "pt-BR" : lang === "es" ? "es-ES" : "en-US")}</strong></div>
          <div><p className="opacity-70">{tx("Saldo econômico", "Economic balance", "Balance económico")}</p><strong className={worldBalance < 0 ? "text-destructive" : "text-emerald-600"}>{worldBalance.toLocaleString(lang === "pt" ? "pt-BR" : lang === "es" ? "es-ES" : "en-US")}</strong></div>
        </div>
        <label className="label">{tx("País de referência diplomática", "Diplomatic reference country", "País de referencia diplomática")}
          <select className="field mt-1" value={viewerReferenceId} onChange={e => { setViewerReferenceNationId(e.target.value); setFilter("todas"); setViewerNationFilter("todas"); }}>
            <option value="">{tx("Usar relação padrão do mapa", "Use map default relation", "Usar relación predeterminada del mapa")}</option>
            {data.nations.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-1" role="tablist" aria-label={tx("Abas de informações", "Information tabs", "Pestañas de información")}>
          {([{id:"nations",label:tx("Nações","Nations","Naciones")},{id:"locations",label:tx("Localidades","Locations","Localidades")},{id:"diplomacy",label:tx("Diplomacia","Diplomacy","Diplomacia")},{id:"compare",label:tx("Comparação","Comparison","Comparación")},{id:"layers",label:tx("Camadas visíveis","Visible layers","Capas visibles")}] as const).map(tab => <Button key={tab.id} role="tab" aria-selected={viewerTab === tab.id} variant={viewerTab === tab.id ? "default" : "outline"} size="sm" className="h-auto min-h-9 whitespace-normal px-2 py-2 text-xs" onClick={() => setViewerTab(tab.id)}>{tab.label}</Button>)}
        </div>
        {viewerTab === "nations" && <section className="grid gap-3" role="tabpanel">
          <h3 className="font-semibold">{tx("Países e relações","Nations and relations","Países y relaciones")}</h3>
          <input className="field" value={viewerNationSearch} onChange={e => setViewerNationSearch(e.target.value)} placeholder={tx("Buscar país ou governante...", "Search nation or ruler...", "Buscar país o gobernante...")} />
          <select className="field" value={viewerNationFilter} onChange={e => { const next = e.target.value as typeof viewerNationFilter; setViewerNationFilter(next); setFilter(next); }} aria-label={tx("Filtrar países no mapa e na lista", "Filter nations on map and list", "Filtrar países en el mapa y la lista")}>
            <option value="todas">{tx("Todos os países", "All nations", "Todos los países")}</option>
            <option value="propria">{tx("País de referência", "Reference country", "País de referencia")}</option>
            <option value="amigavel">{tx("Amigáveis", "Friendly", "Amistosos")}</option>
            <option value="neutra">{tx("Neutros", "Neutral", "Neutrales")}</option>
            <option value="inimigas">{tx("Inimigos", "Enemies", "Enemigos")}</option>
            <option value="alianças">{tx("Alianças formais", "Formal alliances", "Alianzas formales")}</option>
            <option value="guerras">{tx("Guerras ativas", "Active wars", "Guerras activas")}</option>
          </select>
          <label className="flex items-center gap-2 rounded border border-current/10 p-2 text-sm"><input type="checkbox" checked={showRegions} onChange={e => setShowRegions(e.target.checked)} />{tx("Mostrar estados e regiões", "Show states and regions", "Mostrar estados y regiones")}</label>
           {viewerVisibleNations.length ? viewerVisibleNations.map(n => <button key={n.id} onClick={() => { setSel({kind:"nation",id:n.id}); setViewerReferenceNationId(n.id); }} className={`rounded-lg border p-3 text-left ${selNation?.id === n.id ? "border-primary bg-accent/50" : "border-current/15 hover:bg-accent/30"}`}>
            <div className="flex items-center gap-2">{n.flag ? <img src={n.flag} alt={tx("Bandeira de","Flag of","Bandera de")+" "+n.name} className="h-7 w-10 shrink-0 rounded border object-contain" /> : <span className="h-4 w-4 shrink-0 rounded-sm" style={{background:n.color}}/>}<strong className="min-w-0 flex-1 truncate">{n.name}</strong></div>
            <p className="mt-2 text-xs">{t.relation}: <span className={`rel-${relationToPlayer(n)}`}>{REL[relationToViewerReference(n)]}</span></p>
            {n.ruler && <p className="mt-1 text-sm">{tx("Governante:","Ruler:","Gobernante:")} {n.ruler}</p>}
            {n.overlordId && <p className="mt-1 text-sm">{tx("Suserano:","Overlord:","Señor:")} {nationById(n.overlordId)?.name ?? "—"}</p>}
            {n.treaties && <p className="mt-2 whitespace-pre-wrap text-sm">{n.treaties}</p>}
            {n.notes && <p className="mt-2 whitespace-pre-wrap text-sm opacity-80">{n.notes}</p>}
            <p className="mt-2 text-xs opacity-70">{tileCount(n.id)} {tx("territórios","territories","territorios")} · {tx("Vassalos","Vassals","Vasallos")}: {data.nations.filter(v=>v.overlordId===n.id).length}</p>
          </button>) : <p className="text-sm opacity-70">{t.noNations}</p>}
        </section>}
        {viewerTab === "locations" && <section className="grid gap-3" role="tabpanel">
          <h3 className="font-semibold">{tx("População, economia, notas e fotos","Population, economy, notes and photos","Población, economía, notas y fotos")}</h3>
          <input className="field" value={viewerLocationSearch} onChange={e => setViewerLocationSearch(e.target.value)} placeholder={tx("Buscar localidade...", "Search location...", "Buscar localidad...")} />
          {viewerVisibleLocations.length ? viewerVisibleLocations.map(m => <button key={m.id} onClick={() => setSel({kind:"marker",id:m.id})} className={`rounded-lg border p-3 text-left ${selMarker?.id === m.id ? "border-primary bg-accent/50" : "border-current/15 hover:bg-accent/30"}`}>
            <div className="flex items-start gap-3">{m.photo && <img src={m.photo} alt={tx("Foto de","Photo of","Foto de")+" "+m.name} className="h-20 w-24 shrink-0 rounded border object-cover" />}<div className="min-w-0"><strong>{m.name}</strong><p className="text-xs opacity-70">{t[`m_${m.type}`]}</p><p className="mt-1 text-sm">{tx("População:","Population:","Población:")} {(m.npcs??0).toLocaleString(lang === "pt" ? "pt-BR" : lang === "es" ? "es-ES" : "en-US")}</p><p className="text-sm">{tx("Saldo:","Balance:","Balance:")} {((m.grossIncome??0)-(m.expenses??0)).toLocaleString(lang === "pt" ? "pt-BR" : lang === "es" ? "es-ES" : "en-US")}</p></div></div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs"><span>{tx("Receita:","Income:","Ingresos:")} {(m.grossIncome??0).toLocaleString()}</span><span>{tx("Gastos:","Expenses:","Gastos:")} {(m.expenses??0).toLocaleString()}</span><span>{tx("Produção alimentar:","Food production:","Producción alimentaria:")} {m.foodProduction??0}</span><span>{tx("Consumo alimentar:","Food consumption:","Consumo alimentario:")} {m.foodConsumption??0}</span></div>
            {m.production && <p className="mt-2 text-sm">{tx("Produção:","Production:","Producción:")} {m.production}</p>}
            {m.notes && <p className="mt-2 whitespace-pre-wrap text-sm opacity-80">{m.notes}</p>}
          </button>) : <p className="text-sm opacity-70">{tx("Nenhuma localidade cadastrada.","No locations registered.","No hay localidades registradas.")}</p>}
        </section>}
        {viewerTab === "diplomacy" && <section className="grid gap-4" role="tabpanel">
          <div><h3 className="mb-2 font-semibold">{tx("Alianças","Alliances","Alianzas")} ({alliances.length})</h3>{alliances.length ? alliances.map(a => <article key={a.id} className="mb-2 rounded-lg border border-current/15 p-3"><div className="flex items-center gap-2">{a.image && <img src={a.image} alt={tx("Emblema de","Emblem of","Emblema de")+" "+a.name} className="h-9 w-12 object-contain"/>}<span className="h-3 w-3 rounded-sm" style={{background:a.color}}/><strong>{a.name}</strong></div><p className="mt-2 text-sm">{a.nationIds.map(id=>nationById(id)?.name).filter(Boolean).join(", ") || "—"}</p></article>) : <p className="text-sm opacity-70">{tx("Nenhuma aliança registrada.","No alliances recorded.","No hay alianzas registradas.")}</p>}</div>
          <div><h3 className="mb-2 font-semibold">{tx("Guerras","Wars","Guerras")} ({wars.filter(w=>w.active).length} {tx("ativas","active","activas")})</h3>{wars.length ? wars.map(w => <article key={w.id} className="mb-2 rounded-lg border border-current/15 p-3"><strong>{w.name}</strong><p className="mt-1 text-sm">{w.attackers.map(id=>nationById(id)?.name).filter(Boolean).join(", ")} × {w.defenders.map(id=>nationById(id)?.name).filter(Boolean).join(", ")}</p><p className={`mt-1 text-xs ${w.active ? "text-destructive" : "opacity-70"}`}>{w.active ? tx("Ativa","Active","Activa") : tx("Encerrada","Ended","Finalizada")}</p></article>) : <p className="text-sm opacity-70">{tx("Nenhuma guerra registrada.","No wars recorded.","No hay guerras registradas.")}</p>}</div>
          <div><h3 className="mb-2 font-semibold">{tx("Inimigos declarados","Declared enemies","Enemigos declarados")}</h3>{data.nations.filter(n=>(n.enemyIds??[]).length).map(n=><p key={n.id} className="border-b border-current/10 py-2 text-sm"><strong>{n.name}:</strong> {(n.enemyIds??[]).map(id=>nationById(id)?.name).filter(Boolean).join(", ")}</p>)}{!data.nations.some(n=>(n.enemyIds??[]).length)&&<p className="text-sm opacity-70">{tx("Nenhum inimigo declarado.","No declared enemies.","No hay enemigos declarados.")}</p>}</div>
        </section>}
        {viewerTab === "compare" && <section className="grid gap-3" role="tabpanel">
          <h3 className="font-semibold">{tx("Comparar nações e localidades","Compare nations and locations","Comparar naciones y localidades")}</h3>
          <div className="rounded-lg border border-current/15 p-2"><h4 className="mb-2 text-sm font-semibold">{tx("Nações","Nations","Naciones")}</h4>{data.nations.map(n=><label key={n.id} className="flex items-center gap-2 py-1 text-sm"><input type="checkbox" checked={compareNations.includes(n.id)} onChange={e=>setCompareNations(cur=>e.target.checked?[...cur,n.id]:cur.filter(id=>id!==n.id))}/>{n.flag&&<img src={n.flag} alt="" className="h-4 w-6 object-contain"/>}<span>{n.name}</span></label>)}</div>
          <div className="rounded-lg border border-current/15 p-2"><h4 className="mb-2 text-sm font-semibold">{tx("Localidades","Locations","Localidades")}</h4>{data.markers.map(m=><label key={m.id} className="flex items-center gap-2 py-1 text-sm"><input type="checkbox" checked={compareMarkers.includes(m.id)} onChange={e=>setCompareMarkers(cur=>e.target.checked?[...cur,m.id]:cur.filter(id=>id!==m.id))}/><span>{m.name}</span></label>)}</div>
          {(compareNations.length+compareMarkers.length)>0 && <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b border-current/20"><th className="p-2">{tx("Elemento","Item","Elemento")}</th><th className="p-2">{tx("Tipo","Type","Tipo")}</th><th className="p-2">{tx("Dados","Data","Datos")}</th></tr></thead><tbody>
            {data.nations.filter(n=>compareNations.includes(n.id)).map(n=><tr key={n.id} className="border-b border-current/10"><td className="p-2">{n.name}</td><td className="p-2">{tx("Nação","Nation","Nación")}</td><td className="p-2">{REL[relationToPlayer(n)]} · {tileCount(n.id)} {tx("territórios","territories","territorios")} · {n.ruler||"—"}</td></tr>)}
            {data.markers.filter(m=>compareMarkers.includes(m.id)).map(m=><tr key={m.id} className="border-b border-current/10"><td className="p-2">{m.name}</td><td className="p-2">{t[`m_${m.type}`]}</td><td className="p-2">{tx("População:","Population:","Población:")} {m.npcs??0} · {tx("Receita:","Income:","Ingresos:")} {m.grossIncome??0} · {tx("Gastos:","Expenses:","Gastos:")} {m.expenses??0} · {tx("Saldo alimentar:","Food balance:","Balance alimentario:")} {(m.foodProduction??0)-(m.foodConsumption??0)}</td></tr>)}
          </tbody></table></div>}
        </section>}
        {viewerTab === "layers" && <section className="grid gap-3" role="tabpanel">
          <h3 className="font-semibold"><Layers className="mr-1 inline h-4 w-4"/>{tx("Camadas visíveis","Visible layers","Capas visibles")}</h3>
          <p className="text-xs opacity-70">{tx("Ative ou oculte elementos do mapa. Isso altera apenas a visualização, não os dados do arquivo.","Show or hide map elements. This changes only the view, not the file data.","Muestra u oculta elementos del mapa. Esto solo cambia la vista, no los datos del archivo.")}</p>
          {([{key:"background",label:tx("Mapa de fundo","Background map","Mapa de fondo")},{key:"territories",label:tx("Territórios","Territories","Territorios")},{key:"labels",label:tx("Nomes e bandeiras","Names and flags","Nombres y banderas")},{key:"markers",label:tx("Localidades e símbolos","Locations and symbols","Localidades y símbolos")},{key:"routes",label:tx("Estradas e rotas","Roads and routes","Caminos y rutas")},{key:"comments",label:tx("Textos e notas no mapa","Map text and notes","Textos y notas del mapa")},{key:"grid",label:tx("Grade","Grid","Cuadrícula")}] as const).map(layer=><label key={layer.key} className="flex items-center gap-2 rounded border border-current/10 p-2 text-sm"><input type="checkbox" checked={layers[layer.key]} onChange={e=>setLayers(cur=>({...cur,[layer.key]:e.target.checked}))}/>{layer.label}</label>)}
          <div className="grid grid-cols-2 gap-2"><Button size="sm" variant="outline" onClick={()=>setLayers({background:true,territories:true,labels:true,markers:true,routes:true,comments:true,grid:true})}>{tx("Mostrar tudo","Show all","Mostrar todo")}</Button><Button size="sm" variant="outline" onClick={()=>setLayers({background:false,territories:false,labels:false,markers:false,routes:false,comments:false,grid:false})}>{tx("Ocultar tudo","Hide all","Ocultar todo")}</Button></div>
        </section>}
      </aside> : <aside className={`map-tools-panel flex min-h-0 shrink-0 flex-col gap-4 overflow-y-auto p-4 ${activeHomeTheme.panel} ${panelOpen ? "" : "panel-closed"}`}>
        <div className="flex items-center justify-between gap-2"><h1 className="font-display text-2xl leading-none text-primary">{t.appName}</h1><Button size="icon" variant="ghost" className="min-[901px]:hidden" aria-label={t.close} onClick={() => setPanelOpen(false)}><X /></Button></div>
        <section className="rounded-md border border-border p-2">
          <h2 className="label">{tx("Ações rápidas", "Quick actions", "Acciones rápidas")}</h2>
          <div className="mb-2 grid grid-cols-2 gap-1"><Button variant="outline" size="sm" onClick={() => { setTutorialStep(0); setDialog({ type: "tutorial" }); }}><GraduationCap className="h-4 w-4" />{tx("Tutorial", "Tutorial", "Tutorial")}</Button><Button variant="outline" size="sm" onClick={() => setDialog({ type: "compare" })}><GitCompareArrows className="h-4 w-4" />{tx("Comparar", "Compare", "Comparar")}</Button><Button variant="outline" size="sm" onClick={() => { setDiplomacyExpanded([]); setDialog({ type: "diplomacy" }); }}><Users className="h-4 w-4" />{tx("Diplomacia", "Diplomacy", "Diplomacia")}</Button><Button variant="outline" size="sm" onClick={exportPng}><Download className="h-4 w-4" />{tx("Exportar PNG", "Export PNG", "Exportar PNG")}</Button></div>
        </section>
        <details open className="rounded-md border border-border p-2"><summary className="cursor-pointer select-none font-semibold">{t.tools}</summary><section className="mt-3">
          <h2 className="label">{tx("Ferramentas do mapa", "Map tools", "Herramientas del mapa")}</h2>
          <div className="grid gap-1">
            {TOOLS.map(id => (
              <Button variant="ghost" key={id} onClick={() => { setTool(id); setDraft([]); if ((id === "pintar" || id === "balde") && !brush) { const first = visibleNations[0] ?? data.nations[0]; if (first) setBrush(first.id); else setNotice(t.createFirst); } }}
                className={`justify-start rounded px-2 py-1 text-left text-sm transition ${tool === id ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}>{id === "comentario" ? tx("Texto no mapa", "Map text", "Texto en el mapa") : (t as Record<string, string>)[id]}</Button>
            ))}
          </div>
          {(tool === "pintar" || tool === "apagar" || tool === "regiao") && <div className="mt-3"><label htmlFor="brush-size" className="label">{t.brushSize} · {brushSize}</label><input id="brush-size" type="range" min={1} max={10} value={brushSize} onChange={e => setBrushSize(+e.target.value)} className="w-full" /></div>}
          <div className="mt-3 grid gap-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={data.smooth} onChange={e => setData(d => ({ ...d, smooth: e.target.checked }))} />{t.smooth}</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={data.showGrid} onChange={e => setData(d => ({ ...d, showGrid: e.target.checked }))} />{t.grid}</label></div>
          <div className="mt-3 rounded-md border border-border p-2"><h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Layers className="h-4 w-4" />{tx("Camadas visíveis", "Visible layers", "Capas visibles")}</h3>{([{ key: "background", label: tx("Mapa de fundo", "Background map", "Mapa de fondo") }, { key: "territories", label: tx("Territórios", "Territories", "Territorios") }, { key: "labels", label: tx("Nomes e bandeiras", "Names and flags", "Nombres y banderas") }, { key: "markers", label: tx("Cidades e símbolos", "Cities and symbols", "Ciudades y símbolos") }, { key: "routes", label: tx("Estradas e rotas", "Roads and routes", "Caminos y rutas") }, { key: "comments", label: tx("Textos no mapa", "Map text", "Textos en el mapa") }, { key: "grid", label: tx("Grade", "Grid", "Cuadrícula") }] as const).map(layer => <label key={layer.key} className="flex items-center gap-2 py-1 text-sm"><input type="checkbox" checked={layers[layer.key]} onChange={e => setLayers(current => ({ ...current, [layer.key]: e.target.checked }))} />{layer.label}</label>)}</div>
          {(tool === "estrada" || tool === "rota") && <Button variant="outline" size="sm" className="mt-2 w-full" disabled={draft.length < 2} onClick={finishLine}>{t.finishLine}</Button>}
          {(tool === "pintar" || tool === "balde") && (brush && nationById(brush) ? <p className="mt-2 text-sm">{t.paintingWith}: <span style={{ color: nationById(brush)?.color }}>■</span> {nationById(brush)?.name}</p> : <div className="mt-2 grid gap-1"><p className="text-sm text-destructive">{data.nations.length ? t.pickNation : t.createFirst}</p>{!data.nations.length && <Button size="sm" onClick={addNation}>{t.createNation}</Button></div>)}
          {tool === "regiao" && <p className="mt-2 text-sm">{tx("Delimitando região:", "Delimiting region:", "Delimitando región:")} <strong>{(data.regions ?? []).find(region => region.id === selectedRegionId)?.name ?? tx("Nenhuma selecionada", "None selected", "Ninguna seleccionada")}</strong></p>}
        </section></details>
        <details open className="rounded-md border border-border p-2"><summary className="cursor-pointer select-none font-semibold">{t.nations}</summary><section className="mt-3">
          <div className="mb-1 flex items-center justify-between"><h2 className="label !mb-0">{t.nations}</h2><Button variant="ghost" size="sm" onClick={addNation} className="text-sm text-primary hover:underline">{t.newNation}</Button></div>
          <label htmlFor="player-nation" className="label">{tx("Meu país / referência diplomática", "My nation / diplomatic reference", "Mi país / referencia diplomática")}</label><select id="player-nation" className="field mb-2" value={data.playerNationId ?? ""} onChange={e => { setData(d => ({ ...d, playerNationId: e.target.value || undefined })); setFilter("todas"); }}><option value="">{tx("Selecionar país de referência", "Select reference nation", "Seleccionar país de referencia")}</option>{data.nations.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}</select><label htmlFor="relation-filter" className="label">{t.filter}</label><select id="relation-filter" aria-label={t.filter} className="field mb-2" value={filter} onChange={e => setFilter(e.target.value as typeof filter)}><option value="todas">{tx("Universal — todas as nações", "All — all nations", "Universal — todas las naciones")}</option><option value="propria">{tx("Meu país", "My nation", "Mi país")}</option><option value="amigavel">{tx("Amigáveis", "Friendly", "Amistosas")}</option><option value="neutra">{tx("Neutras", "Neutral", "Neutrales")}</option><option value="inimigas">{tx("Inimigas", "Enemies", "Enemigas")}</option><option value="alianças">{tx("Alianças formais", "Formal alliances", "Alianzas formales")}</option><option value="guerras">{tx("Guerras ativas", "Active wars", "Guerras activas")}</option></select>
          <div className="mt-2 rounded-md border border-border p-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showRegions} onChange={e => setShowRegions(e.target.checked)} />{tx("Mostrar estados e regiões", "Show states and regions", "Mostrar estados y regiones")}</label><p className="mt-1 text-xs text-muted-foreground">{tx("As divisões internas ficam ocultas até ativar este filtro.", "Internal divisions stay hidden until this filter is enabled.", "Las divisiones internas permanecen ocultas hasta activar este filtro.")}</p></div>
          <div className="mt-3 grid gap-2 rounded-md border border-border p-2"><h3 className="text-sm font-semibold">{tx("Estados e regiões", "States and regions", "Estados y regiones")}</h3><label className="label">{tx("País proprietário", "Parent country", "País propietario")}<select className="field mt-1" value={regionNationId} onChange={e => setRegionNationId(e.target.value)}><option value="">{tx("Selecionar país", "Select country", "Seleccionar país")}</option>{data.nations.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}</select></label><input className="field" value={regionName} onChange={e => setRegionName(e.target.value)} placeholder={tx("Nome do estado/região", "State/region name", "Nombre del estado/región")} aria-label={tx("Nome do estado/região", "State/region name", "Nombre del estado/región")} /><Button size="sm" disabled={!regionNationId || !regionName.trim()} onClick={createRegion}>{tx("Criar região", "Create region", "Crear región")}</Button>{(data.regions ?? []).length > 0 && <div className="max-h-40 space-y-1 overflow-y-auto">{(data.regions ?? []).map(region => <div key={region.id} className={`flex items-center gap-2 rounded border p-2 ${selectedRegionId === region.id ? "border-primary bg-accent/30" : "border-current/10"}`}><button type="button" aria-label={tx("Selecionar região", "Select region", "Seleccionar región")} className="h-7 w-7 shrink-0 rounded border text-sm" onClick={() => { setSelectedRegionId(region.id); setRegionNationId(region.nationId); setTool("regiao"); setShowRegions(true); }}>▧</button><div className="min-w-0 flex-1"><input className="field min-w-0" aria-label={tx("Nome da região", "Region name", "Nombre de la región")} value={region.name} onChange={e => setData(d => ({ ...d, regions: (d.regions ?? []).map(item => item.id === region.id ? { ...item, name: e.target.value } : item) }))} /><p className="mt-1 truncate text-xs opacity-70">{nationById(region.nationId)?.name ?? "—"} · {regionTileCount(region.id)} {tx("células", "cells", "celdas")}</p></div><input type="color" aria-label={tx("Cor da região", "Region color", "Color de la región")} className="h-8 w-8 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0" value={toHex(region.color)} onChange={e => setData(d => ({ ...d, regions: (d.regions ?? []).map(item => item.id === region.id ? { ...item, color: e.target.value } : item) }))} /><Button variant="ghost" size="sm" onClick={() => setDialog({ type: "confirm", title: tx("Excluir região", "Delete region", "Eliminar región"), message: tx(`Excluir a região “${region.name}”?`, `Delete the region “${region.name}”?`, `¿Eliminar la región “${region.name}”?`), onSubmit: () => { setData(d => ({ ...d, regions: (d.regions ?? []).filter(item => item.id !== region.id), regionTiles: Object.fromEntries(Object.entries(d.regionTiles ?? {}).filter(([, id]) => id !== region.id)) })); if (selectedRegionId === region.id) setSelectedRegionId(""); } })}>{tx("Excluir", "Delete", "Eliminar")}</Button></div>)}</div>}<Button variant="outline" size="sm" disabled={tool !== "regiao" || !selectedRegionId} onClick={() => { setTool("mover"); setSelectedRegionId(""); }}>{tx("Concluir delimitação", "Finish delimiting", "Terminar delimitación")}</Button></div>
          {visibleNations.length === 0 && <p className="text-xs text-muted-foreground">{t.noNations}</p>}
          <div className="grid gap-1">
            {visibleNations.map(n => (
              <Button variant="ghost" key={n.id} onClick={() => { setBrush(n.id); setSel({ kind: "nation", id: n.id }); }}
                className={`h-auto min-h-9 flex-wrap items-center gap-2 rounded px-2 py-1 text-left text-sm ${brush === n.id ? "ring-1 ring-primary" : ""} hover:bg-accent`}>
                {n.flag && <img src={n.flag} alt={`${t.flag} ${n.name}`} className="h-4 w-6 object-contain" />}<span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: n.color }} />
                <span className="flex-1 truncate">{n.name}</span>
                <span className={`rel-${relationToPlayer(n)} text-xs uppercase`}>{REL[relationToPlayer(n)]}</span>
              </Button>
            ))}
          </div>
        </section></details>
        <details className="rounded-md border border-border p-2"><summary className="cursor-pointer select-none font-semibold">{t.bgMap}</summary><section className="mt-3">
          <h2 className="label">{t.bgMap}</h2>
          <input type="file" aria-label={t.bgImage} accept="image/*" onChange={e => onBg(e.target.files?.[0])} className="w-full text-xs" />
          {data.bg && <>
            <label className="mt-2 block text-xs">{t.opacity}</label>
            <input type="range" min={0} max={1} step={0.05} value={data.bgOpacity} onChange={e => setData(d => ({ ...d, bgOpacity: +e.target.value }))} className="w-full" />
            <label htmlFor="bg-fit" className="label mt-2">{t.fit}</label><select id="bg-fit" className="field" value={data.bgFit} onChange={e => setData(d => ({ ...d, bgFit: e.target.value as Data["bgFit"] }))}><option value="contain">{t.fitContain}</option><option value="cover">{t.fitCover}</option><option value="stretch">{t.fitStretch}</option></select>
            {([{ key: "bgScale", label: t.scale, min: 0.2, max: 3, step: 0.05 }, { key: "bgX", label: t.posX, min: -W, max: W, step: 20 }, { key: "bgY", label: t.posY, min: -H, max: H, step: 20 }, { key: "bgRotation", label: t.rotation, min: -180, max: 180, step: 1 }] as const).map(c => <div key={c.key}><label htmlFor={c.key} className="label mt-2">{c.label} · {data[c.key]}</label><input id={c.key} className="w-full" type="range" min={c.min} max={c.max} step={c.step} value={data[c.key]} onChange={e => setData(d => ({ ...d, [c.key]: +e.target.value }))} /></div>)}
            <div className="mt-2 flex gap-1"><Button variant="outline" size="sm" onClick={() => setData(d => ({ ...d, bgFit: "contain", bgScale: 1, bgX: 0, bgY: 0, bgRotation: 0, bgOpacity: 0.6 }))}><RotateCcw />{t.reset}</Button><Button variant="ghost" size="icon" aria-label={t.removeBg} title={t.removeBg} className="text-destructive" onClick={() => setData(d => ({ ...d, bg: null }))}><Trash2 /></Button></div>
          </>}
        </section></details>
        <details className="rounded-md border border-border p-2"><summary className="cursor-pointer select-none font-semibold">{tx("Salvar, importar e versões", "Save, import and versions", "Guardar, importar y versiones")}</summary><section className="mt-3 grid gap-1 text-sm">
          <Button variant="outline" onClick={exportJson} className="rounded border border-border px-2 py-1 hover:bg-accent"><Download />{tx("Salvar mapa / versões", "Save map / versions", "Guardar mapa / versiones")}</Button>
          <Button variant="outline" onClick={exportPng}><Download />{tx("Exportar mapa em PNG", "Export map as PNG", "Exportar mapa como PNG")}</Button>
          <Button variant="outline" onClick={() => { if (!versions.length) { setNotice(tx(tx("Nenhuma versão salva ainda. Salve o mapa para criar a primeira.", "No saved versions yet. Save the map to create the first one.", "Aún no hay versiones guardadas. Guarda el mapa para crear la primera."), "No saved versions yet. Save the map to create the first one.", "Aún no hay versiones guardadas. Guarda el mapa para crear la primera.")); return; } setDialog({ type: "history", selectedId: versions[versions.length - 1]?.id ?? "" }); }}><History className="h-4 w-4" />{tx("Histórico de versões", "Version history", "Historial de versiones")}</Button>
          <Button variant="outline" onClick={() => importRef.current?.click()}><Upload />{t.importWorld}</Button>
          <Button variant="ghost" onClick={() => setDialog({ type: "confirm", title: t.clearMap, message: t.confirmClear, onSubmit: () => { setData(empty); setSel(null); setBrush(null); setDraft([]); } })} className="text-xs text-destructive">{t.clearMap}</Button>
        </section></details>
      </aside>}

      <div ref={ref} aria-label={t.mapLabel} className="relative min-w-0 flex-1 touch-none select-none overflow-hidden bg-muted"
        style={{ cursor: tool === "mover" ? "grab" : "crosshair" }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={e => { if (e.pointerType === "touch") { touchPoints.current.delete(e.pointerId); if (touchPoints.current.size < 2) pinchStart.current = null; } stopDrag(); }} onPointerCancel={e => { if (e.pointerType === "touch") { touchPoints.current.delete(e.pointerId); pinchStart.current = null; } stopDrag(); }} onLostPointerCapture={stopDrag} onPointerLeave={() => setCursorPos(null)}
        onDoubleClick={finishLine} onContextMenu={e => e.preventDefault()}>
        <svg className="absolute left-0 top-0 overflow-visible" width={W} height={H}
          style={{ transform: `translate(${view.x}px,${view.y}px) scale(${view.z})`, transformOrigin: "0 0" }}>
          <rect width={W} height={H} className="fill-background" />
          <defs><clipPath id="map-bounds"><rect width={W} height={H} /></clipPath></defs>
          {data.bg && layers.background && <g clipPath="url(#map-bounds)"><image href={data.bg} width={W} height={H} preserveAspectRatio={data.bgFit === "stretch" ? "none" : data.bgFit === "cover" ? "xMidYMid slice" : "xMidYMid meet"} opacity={data.bgOpacity} transform={`translate(${data.bgX + W / 2},${data.bgY + H / 2}) rotate(${data.bgRotation}) scale(${data.bgScale}) translate(${-W / 2},${-H / 2})`} pointerEvents="none" /></g>}
          <defs><pattern id="g" width={CELL} height={CELL} patternUnits="userSpaceOnUse"><path d={`M${CELL} 0H0V${CELL}`} fill="none" className="stroke-border" strokeWidth={0.5} /></pattern></defs>
          {layers.territories && territories.filter(t => visibleNations.some(n => n.id === t.nation.id)).map(t => { const alliance = filter === "alianças" ? alliances.find(a => a.nationIds.includes(t.nation.id)) : undefined; return <path key={t.nation.id} data-territory={t.nation.id} d={t.path} fill={alliance?.color ?? t.nation.color} fillRule="evenodd" opacity={selNation?.id === t.nation.id ? 0.85 : 0.6} />; })}
          {showRegions && layers.territories && regionTerritories.filter(item => visibleNations.some(n => n.id === item.region.nationId) && item.keys.length > 0).map(({ region, path }) => <g key={region.id} pointerEvents="none"><path data-region={region.id} d={path} fill={region.color} fillOpacity={0.14} stroke={region.color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" fillRule="evenodd" /><title>{region.name}</title></g>)}
          {data.showGrid && layers.grid && <rect width={W} height={H} fill="url(#g)" pointerEvents="none" />}
          
          {layers.comments && data.comments.map(comment => <text key={comment.id} x={comment.x} y={comment.y} textAnchor="middle" fontSize={comment.size ?? 18} fontFamily={comment.fontFamily ?? "Arial"} fontWeight={600} fill={comment.color ?? "var(--foreground)"} opacity={selComment?.id === comment.id ? 1 : 0.95} transform={`rotate(${comment.rotation ?? 0} ${comment.x} ${comment.y})`} paintOrder="stroke" stroke="var(--background)" strokeWidth={4} style={{ cursor: tool === "mover" ? "move" : "pointer", userSelect: "none" }} onPointerDown={e => { if (mode === "view") { e.stopPropagation(); return; } if (tool === "mover") { e.stopPropagation(); ref.current?.setPointerCapture(e.pointerId); setSel({ kind: "comment", id: comment.id }); drag.current = { mode: "entity", entityKind: "comment", id: comment.id, sx: e.clientX, sy: e.clientY, wx: comment.x, wy: comment.y }; } else if (tool === "apagar") { e.stopPropagation(); setData(d => ({ ...d, comments: d.comments.filter(c => c.id !== comment.id) })); } }}>{comment.text}</text>)}
          {layers.routes && data.lines.map(l => (
            <polyline key={l.id} points={l.points.map(p => p.join(",")).join(" ")} fill="none"
              className={l.type === "estrada" ? "stroke-foreground" : "stroke-chart-3"} strokeWidth={selLine?.id === l.id ? 5 : 3}
              strokeDasharray={l.type === "rota" ? "8 6" : undefined} strokeLinecap="round" strokeLinejoin="round"
              onPointerDown={e => { if (mode === "view") { e.stopPropagation(); return; } if (tool === "mover") { e.stopPropagation(); setSel({ kind: "line", id: l.id }); } else if (tool === "apagar") { e.stopPropagation(); setData(d => ({ ...d, lines: d.lines.filter(x => x.id !== l.id) })); } }} style={{ cursor: "pointer" }} />
          ))}
          {draft.length > 0 && <polyline points={draft.map(p => p.join(",")).join(" ")} fill="none" className="stroke-primary" strokeWidth={2} strokeDasharray="4 4" />}
          
          {/* Cidades e marcadores com Campo de Visão por aproximação */}
          {layers.markers && data.markers.map(m => {
            const isCapital = m.type === "capital";
            // Capitais aparecem com zoom a partir de 0.35; outras cidades/portos/fortes só aparecem de perto (zoom >= 0.75)
            const isVisible = isCapital ? view.z >= 0.2 : view.z >= 0.25;
            if (!isVisible) return null;
            const r = isCapital ? 9 : 6;

            return (
              <g key={m.id} transform={`translate(${m.x},${m.y})`} style={{ cursor: tool === "mover" ? "move" : "pointer" }}
                onPointerDown={e => { if (mode === "view") { e.stopPropagation(); setSel({ kind: "marker", id: m.id }); return; } if (tool === "mover") { e.stopPropagation(); ref.current?.setPointerCapture(e.pointerId); setSel({ kind: "marker", id: m.id }); drag.current = { mode: "entity", entityKind: "marker", id: m.id, sx: e.clientX, sy: e.clientY, wx: m.x, wy: m.y }; } else if (tool === "apagar") { e.stopPropagation(); setData(d => ({ ...d, markers: d.markers.filter(x => x.id !== m.id) })); } }}>
                <g transform={`rotate(${m.rotation ?? 0}) scale(${m.size ?? 1})`}>
                  {(() => { const shape = m.shape ?? (m.type === "capital" ? "star" : m.type === "forte" ? "square" : m.type === "porto" ? "diamond" : "circle"); const fill = m.color ?? (selMarker?.id === m.id ? "var(--primary)" : "var(--card)"); const stroke = "var(--foreground)"; const pts = shape === "triangle" ? "0,-9 9,8 -9,8" : shape === "diamond" ? "0,-9 9,0 0,9 -9,0" : shape === "hexagon" ? "-8,-5 0,-9 8,-5 8,5 0,9 -8,5" : shape === "cross" ? "-3,-9 3,-9 3,-3 9,-3 9,3 3,3 3,9 -3,9 -3,3 -9,3 -9,-3 -3,-3" : ""; return shape === "circle" ? <circle r={r} fill={fill} stroke={stroke} strokeWidth={1.5} /> : shape === "square" ? <rect x={-r} y={-r} width={r*2} height={r*2} fill={fill} stroke={stroke} strokeWidth={1.5} /> : shape === "star" ? <polygon points="0,-10 2.8,-3.2 9.5,-3.1 4.2,1.2 6.2,8 0,4.2 -6.2,8 -4.2,1.2 -9.5,-3.1 -2.8,-3.2" fill={fill} stroke={stroke} strokeWidth={1.5} /> : <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={1.5} />; })()}
                  <text textAnchor="middle" dy="0.32em" fontSize={isCapital ? 10 : 7} fill={m.color ? "#ffffff" : "var(--foreground)"} className="font-bold">{ICON[m.type]}</text>
                </g>
                <text y={isCapital ? 18 : 14} textAnchor="middle" fontSize={m.labelSize ?? (isCapital ? 12 : 10)} className="fill-foreground font-display" paintOrder="stroke" stroke="var(--background)" strokeWidth={3}>{m.name}</text>
              </g>
            );
          })}

          {/* Nomes dos países com tamanho dinâmico pelo território e limite de zoom */}
          {showRegions && layers.labels && regionTerritories.filter(item => visibleNations.some(n => n.id === item.region.nationId) && item.keys.length > 0).map(({ region, keys }) => { let sx = 0, sy = 0; for (const key of keys) { const [x = 0, y = 0] = key.split(",").map(Number); sx += x; sy += y; } const x = (sx / keys.length + 0.5) * CELL, y = (sy / keys.length + 0.5) * CELL; return <text key={`region-label-${region.id}`} x={x} y={y} textAnchor="middle" fontSize={Math.max(10, Math.min(20, 9 + Math.sqrt(keys.length) * 0.15))} fontWeight={700} fill="var(--foreground)" paintOrder="stroke" stroke="var(--background)" strokeWidth={3} pointerEvents="none">{region.name}</text>; })}
          {layers.labels && filter !== "alianças" && territories.filter(t => visibleNations.some(n => n.id === t.nation.id)).map(({ nation: n, keys: ks }) => {
            if (!ks.length) return null;
            let sx = 0, sy = 0; ks.forEach(k => { const [x = 0, y = 0] = k.split(",").map(Number); sx += x; sy += y; });
            const x = (sx / ks.length + 0.5) * CELL, y = (sy / ks.length + 0.5) * CELL;

            // Escala conforme tamanho da área territorial (com teto para não ficar gigante)
            const area = ks.length;
            const baseFontSize = Math.max(12, Math.min(36, Math.round(10 + Math.sqrt(area) * 0.12)));
            // Quando a visualização estiver de longe, comprime a escala para manter o mapa legível
            const clampedFontSize = Math.max(10, Math.min(baseFontSize, Math.round(baseFontSize * Math.min(1, Math.max(0.4, view.z * 1.4)))));
            const flagScale = clampedFontSize / 24;

            return (
              <g key={n.id} pointerEvents="none">
                {n.flag && <image href={n.flag} x={x - 20 * flagScale} y={y - 36 * flagScale} width={40 * flagScale} height={24 * flagScale} preserveAspectRatio="xMidYMid meet" />}
                <text x={x} y={y} textAnchor="middle" fontSize={clampedFontSize} className="fill-foreground font-display uppercase" opacity={0.85} paintOrder="stroke" stroke="var(--background)" strokeWidth={3}>{n.name}</text>
              </g>
            );
          })}
          {layers.labels && filter === "alianças" && alliances.map(a => { const cells = Object.entries(data.tiles).filter(([, id]) => a.nationIds.includes(id)).map(([key]) => key); if (!cells.length) return null; let sx = 0, sy = 0; for (const key of cells) { const [cx, cy] = key.split(",").map(Number); sx += (cx + 0.5) * CELL; sy += (cy + 0.5) * CELL; } const x = sx / cells.length, y = sy / cells.length; return <g key={a.id} pointerEvents="none">{a.image && <image href={a.image} x={x - 24} y={y - 54} width={48} height={32} preserveAspectRatio="xMidYMid meet" />}<text x={x} y={y} textAnchor="middle" fontSize={Math.max(12, Math.min(28, 10 + Math.sqrt(cells.length) * 0.12))} className="fill-foreground font-display uppercase" paintOrder="stroke" stroke="var(--background)" strokeWidth={4}>{a.name}</text></g>; })}
          {cursorPos && (tool === "pintar" || tool === "apagar") && (
            <circle cx={cursorPos.x} cy={cursorPos.y}
              r={Math.max(CELL / 2, (brushSize - 0.5) * CELL)}
              fill={tool === "apagar" ? "#ef4444" : (brush ? nationById(brush)?.color ?? "#ffffff" : "#ffffff")}
              fillOpacity={0.08}
              stroke={tool === "apagar" ? "#ef4444" : (brush ? nationById(brush)?.color ?? "#ffffff" : "#ffffff")}
              strokeOpacity={0.9} strokeWidth={1.5} vectorEffect="non-scaling-stroke" pointerEvents="none" />
          )}
        </svg>

        <div className="map-toolbar" onPointerDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
          {mode === "view" && <><Button variant="ghost" size="icon" aria-label={t.settings} title={t.settings} onClick={() => setSettingsOpen(v => !v)}><Settings /></Button><Button variant="ghost" size="icon" aria-label={tx("Voltar ao início", "Back to home", "Volver al inicio")} title={tx("Voltar ao início", "Back to home", "Volver al inicio")} onClick={() => setMode("home")}><X /></Button></>}
          {mode === "edit" && <>
          <Button variant="ghost" size="icon" aria-label={tx("Alternar para visualização", "Switch to view mode", "Cambiar a visualización")} title={tx("Alternar para visualização", "Switch to view mode", "Cambiar a visualización")} onClick={() => { setSel(null); setPanelOpen(false); setMode("view"); }}><Eye /></Button>
          <Button variant="ghost" size="icon" className="min-[901px]:hidden" aria-label={t.tools} title={t.tools} onClick={() => setPanelOpen(v => !v)}><Menu /></Button>
          <Button variant="ghost" size="icon" disabled={!canUndo} aria-label={t.undo} title={t.undo} onClick={handleUndo}><Undo className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" disabled={!canRedo} aria-label={t.redo} title={t.redo} onClick={handleRedo}><Redo className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" aria-label={fullscreen ? t.exitFullscreen : t.fullscreen} title={fullscreen ? t.exitFullscreen : t.fullscreen} onClick={() => void toggleFullscreen()}>{fullscreen ? <Minimize /> : <Maximize />}</Button>
          <Button variant="ghost" size="icon" aria-label={tx("Status do mundo", "World status", "Estado del mundo")} title={tx("Status do mundo", "World status", "Estado del mundo")} onClick={() => setDialog({ type: "status" })}><BarChart3 /></Button>
          <Button variant="ghost" size="icon" aria-label={tx("Comparar países e cidades", "Compare nations and cities", "Comparar países y ciudades")} title={tx("Comparar países e cidades", "Compare nations and cities", "Comparar países y ciudades")} onClick={() => setDialog({ type: "compare" })}><GitCompareArrows /></Button>
          <Button variant="ghost" size="icon" aria-label={tx("Editor diplomático", "Diplomacy editor", "Editor diplomático")} title={tx("Editor diplomático", "Diplomacy editor", "Editor diplomático")} onClick={() => { setDiplomacyExpanded([]); setDialog({ type: "diplomacy" }); }}><Users /></Button>
          <Button variant="ghost" size="icon" aria-label={tx("Exportar mapa em PNG", "Export map as PNG", "Exportar mapa como PNG")} title={tx("Exportar mapa em PNG", "Export map as PNG", "Exportar mapa como PNG")} onClick={exportPng}><Download /></Button>
          <Button variant="ghost" size="icon" aria-label={t.settings} title={t.settings} onClick={() => setSettingsOpen(v => !v)}><Settings /></Button></>}
        </div>
        <div className="pointer-events-none absolute bottom-3 left-3 rounded border border-border bg-card px-2 py-1 text-xs text-muted-foreground">{Math.round(view.z * 100)}% · {t[tool]}</div>
        <div className="absolute bottom-3 left-1/2 z-10 grid w-max max-w-[calc(100%-7rem)] -translate-x-1/2 grid-cols-2 gap-x-3 gap-y-1 rounded-lg border border-border bg-card/95 p-2 text-xs shadow-sm sm:grid-cols-4 sm:max-w-[calc(100%-10rem)] sm:p-3"><span>{tx("População", "Population", "Población")} <b>{worldStats.population.toLocaleString("pt-BR")}</b></span><span>{tx("Saldo", "Balance", "Balance")} <b className={worldBalance >= 0 ? "text-emerald-600" : "text-destructive"}>{worldBalance.toLocaleString("pt-BR")}</b></span><span>{tx("Comida", "Food", "Alimentos")} <b className={foodBalance >= 0 ? "text-emerald-600" : "text-destructive"}>{foodBalance.toLocaleString("pt-BR")}</b></span><span>{tx("Localidades", "Locations", "Localidades")} <b>{data.markers.length}</b></span></div>

        {settingsOpen && <div role="dialog" aria-label={t.settings} className={`absolute right-3 top-16 z-30 w-64 rounded p-4 shadow-lg ${activeHomeTheme.panel}`} onPointerDown={e => e.stopPropagation()}><div className="mb-2 flex items-center justify-between"><h2 className="font-display text-xl">{t.settings}</h2><Button variant="ghost" size="icon" aria-label={t.close} onClick={() => setSettingsOpen(false)}><X /></Button></div><label htmlFor="app-theme" className="label">{tx("Tema da interface", "Interface theme", "Tema de la interfaz")}</label><select id="app-theme" className="field mb-3" value={homeTheme} onChange={e => setHomeTheme(e.target.value as HomeTheme)}>{HOME_THEMES.map(theme => <option key={theme.id} value={theme.id}>{theme.id === "atlas" ? "Atlas" : theme.id === "midnight" ? tx("Noturno", "Midnight", "Nocturno") : theme.id === "parchment" ? tx("Pergaminho", "Parchment", "Pergamino") : theme.id === "ocean" ? tx("Oceano", "Ocean", "Océano") : tx("Floresta", "Forest", "Bosque")}</option>)}</select><label htmlFor="device-mode" className="label">{tx("Dispositivo", "Device", "Dispositivo")}</label><select id="device-mode" className="field mb-3" value={deviceMode} onChange={e => setDeviceMode(e.target.value as "pc" | "celular")}><option value="pc">{tx("Computador / PC", "Computer / PC", "Ordenador / PC")}</option><option value="celular">{tx("Celular", "Mobile phone", "Móvil")}</option></select>{deviceMode === "celular" && <p className="mb-3 text-xs text-muted-foreground">{tx("No celular: use dois dedos para aproximar/afastar. O editor exige orientação paisagem.", "On mobile, use two fingers to zoom. The editor requires landscape orientation.", "En el móvil, usa dos dedos para acercar o alejar. El editor requiere orientación horizontal.")}</p>}<label htmlFor="lang" className="label">{t.language}</label><select id="lang" className="field" value={lang} onChange={e => setLang(e.target.value as Lang)}>{LANGS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}</select></div>}
        {notice && <div role="status" className="absolute bottom-12 left-3 right-3 flex items-center justify-between gap-2 rounded border border-border bg-card p-3 text-sm" onPointerDown={e => e.stopPropagation()}>{notice}<Button variant="ghost" size="icon" aria-label={t.close} onClick={() => setNotice("")}><X /></Button></div>}
      </div>

      {mode === "edit" && (selNation || selMarker || selLine || selComment) && (
        <aside className="map-details-panel shrink-0 overflow-y-auto border-l border-border bg-card p-4">
          <div className="mb-3 flex justify-end"><Button variant="ghost" size="icon" aria-label={t.close} onClick={() => setSel(null)} className="text-muted-foreground"><X /></Button></div>
          {selNation && <div className="grid gap-3">
            <div className="rounded border border-border p-3"><h3 className="font-semibold">{tx("Diplomacia de", "Diplomacy of", "Diplomacia de")} {selNation.name}</h3><p className="mt-2 text-sm">{tx("Alianças:", "Alliances:", "Alianzas:")} {alliances.filter(a => a.nationIds.includes(selNation.id)).map(a => a.name).join(", ") || tx("Nenhuma", "None", "Ninguna")}</p><p className="mt-1 text-sm">{tx("Guerras ativas:", "Active wars:", "Guerras activas:")} {wars.filter(w => w.active && [...w.attackers, ...w.defenders].includes(selNation.id)).map(w => w.name).join(", ") || "Nenhuma"}</p><p className="mt-1 text-sm">{tx("Inimigos declarados:", "Declared enemies:", "Enemigos declarados:")} {(selNation.enemyIds ?? []).map(id => data.nations.find(n => n.id === id)?.name).filter(Boolean).join(", ") || tx("Nenhum registrado", "None recorded", "Ninguno registrado")}</p><Button className="mt-2" variant="outline" onClick={() => setDialog({ type: "diplomacy" })}>{tx("Gerenciar alianças e guerras", "Manage alliances and wars", "Gestionar alianzas y guerras")}</Button></div>
            <input aria-label={t.nationName} value={selNation.name} onChange={e => upNation(selNation.id, { name: e.target.value })} className="field font-display text-xl" />
            <details className="rounded-lg border border-border p-3"><summary className="cursor-pointer select-none font-semibold">{tx("Identidade visual", "Visual identity", "Identidad visual")}</summary><div className="mt-3 grid gap-3"><div className="flex items-center gap-2"><label className="label !mb-0">{t.color}</label>
              <input type="color" value={toHex(selNation.color)} onChange={e => upNation(selNation.id, { color: e.target.value })} />
              <span className="text-xs text-muted-foreground">{tileCount(selNation.id)} {t.territories}</span></div>
            </div></details><details className="rounded-lg border border-border p-3"><summary className="cursor-pointer select-none font-semibold">{t.flag}</summary><div className="mt-3"><label className="label">{t.flag}</label>{selNation.flag && <div className="mb-2 flex items-center gap-3"><img src={selNation.flag} alt={`${t.flag} ${selNation.name}`} className="h-16 w-24 border border-border object-contain" /><Button variant="ghost" size="icon" aria-label={t.removeFlag} onClick={() => upNation(selNation.id, { flag: undefined })}><Trash2 /></Button></div>}
              <label className="inline-flex cursor-pointer items-center gap-2 rounded border border-border bg-accent px-3 py-1 text-sm"><Upload className="h-4 w-4" />{t.uploadFlag}<input aria-label={t.uploadFlag} type="file" accept="image/*" hidden onChange={e => { onImage(e.target.files?.[0], flag => upNation(selNation.id, { flag }), 400); e.target.value = ""; }} /></label>
              <div className="mt-2 flex gap-1"><input aria-label={t.flagUrl} placeholder={t.flagUrl} value={flagUrl} onChange={e => setFlagUrl(e.target.value)} className="field" /><Button size="sm" variant="outline" disabled={!/^https:\/\//.test(flagUrl.trim())} onClick={() => { upNation(selNation.id, { flag: flagUrl.trim() }); setFlagUrl(""); }}>OK</Button></div>
            </div></details><details className="rounded-lg border border-border p-3"><summary className="cursor-pointer select-none font-semibold">{tx("Relações e governo", "Relations and government", "Relaciones y gobierno")}</summary><div className="mt-3 grid gap-3"><div><label className="label">{t.relation}</label>
              <p className="mb-2 text-xs text-muted-foreground">{data.playerNationId ? tx("Estas opções alteram apenas a relação bilateral com o país escolhido no menu principal.", "These options change only the bilateral relation with the nation selected in the main menu.", "Estas opciones solo cambian la relación bilateral con el país elegido en el menú principal.") : tx("Selecione primeiro seu país de referência no menu principal.", "First select your reference nation in the main menu.", "Primero selecciona tu país de referencia en el menú principal.")}</p><div className="grid grid-cols-2 gap-1">{RELS.filter(r => r !== "propria").map(r => (<Button variant="outline" size="sm" key={r} disabled={!data.playerNationId || selNation.id === data.playerNationId} onClick={() => setDialog({ type: "confirm", title: tx("Confirmar mudança diplomática", "Confirm diplomatic change", "Confirmar cambio diplomático"), message: tx(`Definir a relação de ${selNation.name} com ${nationById(data.playerNationId ?? "")?.name ?? "seu país"} como “${REL[r]}”?`, `Set ${selNation.name}'s relation to ${nationById(data.playerNationId ?? "")?.name ?? "your nation"} to “${REL[r]}”?`, `¿Establecer la relación de ${selNation.name} con ${nationById(data.playerNationId ?? "")?.name ?? "tu país"} como “${REL[r]}”?`), onSubmit: () => { setData(d => ({ ...d, nations: d.nations.map(n => n.id === selNation.id ? { ...n, relations: { ...(n.relations ?? {}), [d.playerNationId!]: r } } : n) })); setDialog(null); } })} className={`rounded border px-2 py-1 text-xs rel-${r} ${(selNation.id === data.playerNationId ? "propria" : relationToPlayer(selNation)) === r ? "border-current font-bold" : "border-border"}`}>{REL[r]}</Button>))}</div></div>
            <div><label className="label">{t.ruler}</label><input value={selNation.ruler} onChange={e => upNation(selNation.id, { ruler: e.target.value })} className="field" /></div>
            <div><label className="label">{tx("Suserano / nação superior", "Overlord / superior nation", "Señor / nación superior")}</label><select className="field" value={selNation.overlordId ?? ""} onChange={e => upNation(selNation.id, { overlordId: e.target.value || undefined })}><option value="">{tx("Nenhum (independente)", "None (independent)", "Ninguno (independiente)")}</option>{data.nations.filter(n => n.id !== selNation.id).map(n => <option key={n.id} value={n.id}>{n.name}</option>)}</select><p className="mt-1 text-xs text-muted-foreground">{tx("Vassalos:", "Vassals:", "Vasallos:")} {data.nations.filter(n => n.overlordId === selNation.id).map(n => n.name).join(", ") || "nenhum"}</p></div>
            <div><label className="label">{t.treaties}</label><textarea rows={4} value={selNation.treaties} onChange={e => upNation(selNation.id, { treaties: e.target.value })} className="field" /></div>
            <div><label className="label">{t.notes}</label><textarea rows={6} value={selNation.notes} onChange={e => upNation(selNation.id, { notes: e.target.value })} className="field" /></div></div></details>
            <Button onClick={() => { setBrush(selNation.id); setTool("pintar"); setSel(null); setPanelOpen(false); }} className="h-auto whitespace-normal rounded bg-primary px-2 py-2 text-sm text-primary-foreground">{t.paintThis}</Button>
            <Button variant="ghost" onClick={() => setDialog({ type: "confirm", title: t.deleteNation, message: t.confirmDeleteNation, onSubmit: () => { setData(d => ({ ...d, nations: d.nations.filter(n => n.id !== selNation.id).map(n => ({ ...n, ...(n.overlordId === selNation.id ? { overlordId: undefined } : {}), enemyIds: (n.enemyIds ?? []).filter(id => id !== selNation.id) })), alliances: (d.alliances ?? []).map(a => ({ ...a, nationIds: a.nationIds.filter(id => id !== selNation.id) })).filter(a => a.nationIds.length >= 2), wars: (d.wars ?? []).map(w => ({ ...w, attackers: w.attackers.filter(id => id !== selNation.id), defenders: w.defenders.filter(id => id !== selNation.id) })).filter(w => w.attackers.length && w.defenders.length), tiles: Object.fromEntries(Object.entries(d.tiles).filter(([, v]) => v !== selNation.id)), regions: (d.regions ?? []).filter(region => region.nationId !== selNation.id), regionTiles: Object.fromEntries(Object.entries(d.regionTiles ?? {}).filter(([key, regionId]) => d.tiles[key] !== selNation.id && (d.regions ?? []).some(region => region.id === regionId && region.nationId !== selNation.id))) })); setSel(null); } })} className="text-sm text-destructive">{t.deleteNation}</Button>
          </div>}

          {/* Detalhes expandidos para Cidades, Capitais, Fortes e Portos */}
          {selMarker && <div className="grid gap-3">
            <span className="label">{ICON[selMarker.type]} {t[`m_${selMarker.type}`]}</span>
            <input value={selMarker.name} onChange={e => upMarker(selMarker.id, { name: e.target.value })} className="field font-display text-xl" />
            <select value={selMarker.type} onChange={e => upMarker(selMarker.id, { type: e.target.value as MarkerType })} className="field">
              {(Object.keys(ICON) as MarkerType[]).map(k => <option key={k} value={k}>{t[`m_${k}`]}</option>)}</select>
            <details className="rounded-lg border border-border p-3"><summary className="cursor-pointer select-none font-semibold">{tx("Aparência", "Appearance", "Apariencia")}</summary><div className="mt-3 grid gap-3"><div><label className="label">{tx("Forma do símbolo", "Symbol shape", "Forma del símbolo")}</label><select value={selMarker.shape ?? (selMarker.type === "capital" ? "star" : selMarker.type === "forte" ? "square" : selMarker.type === "porto" ? "diamond" : "circle")} onChange={e => upMarker(selMarker.id, { shape: e.target.value as MarkerShape })} className="field">{SHAPES.map(shape => <option key={shape.id} value={shape.id}>{tx(shape.label, ({circle:"Circle",square:"Square",triangle:"Triangle",star:"Star",diamond:"Diamond",hexagon:"Hexagon",cross:"Cross"} as Record<MarkerShape,string>)[shape.id], ({circle:"Círculo",square:"Cuadrado",triangle:"Triángulo",star:"Estrella",diamond:"Rombo",hexagon:"Hexágono",cross:"Cruz"} as Record<MarkerShape,string>)[shape.id])}</option>)}</select></div>
            <div className="grid grid-cols-2 gap-2"><label className="label">{tx("Cor do símbolo", "Symbol color", "Color del símbolo")}<input aria-label={tx("Cor do símbolo", "Symbol color", "Color del símbolo")} type="color" value={toHex(selMarker.color ?? "#ffffff")} onChange={e => upMarker(selMarker.id, { color: e.target.value })} className="field mt-1 h-10 p-1" /></label><label className="label">{tx("Tamanho do símbolo", "Symbol size", "Tamaño del símbolo")} · {Math.round((selMarker.size ?? 1) * 100)}%<input aria-label={tx("Tamanho do símbolo", "Symbol size", "Tamaño del símbolo")} type="range" min={0.5} max={3} step={0.1} value={selMarker.size ?? 1} onChange={e => upMarker(selMarker.id, { size: +e.target.value })} className="mt-3 w-full" /></label></div>
            <div className="grid grid-cols-2 gap-2"><label className="label">{tx("Rotação", "Rotation", "Rotación")} · {selMarker.rotation ?? 0}°<input aria-label={tx("Rotação do símbolo", "Symbol rotation", "Rotación del símbolo")} type="range" min={0} max={359} value={selMarker.rotation ?? 0} onChange={e => upMarker(selMarker.id, { rotation: +e.target.value })} className="mt-3 w-full" /></label><label className="label">{tx("Tamanho do nome", "Label size", "Tamaño de la etiqueta")}<input aria-label={tx("Tamanho do nome", "Label size", "Tamaño de la etiqueta")} type="number" min={6} max={40} value={selMarker.labelSize ?? (selMarker.type === "capital" ? 12 : 10)} onChange={e => upMarker(selMarker.id, { labelSize: Math.max(6, Math.min(40, +e.target.value || 6)) })} className="field mt-1" /></label></div></div></details>
            <details className="rounded-lg border border-border p-3"><summary className="cursor-pointer select-none font-semibold">{tx("Posição", "Position", "Posición")} <span className="text-xs font-normal text-muted-foreground">— {tx("modificações da posição", "position adjustments", "ajustes de posición")}</span></summary><div className="mt-3 grid gap-2"><div className="grid grid-cols-2 gap-2"><label className="label">{tx("Posição X", "X position", "Posición X")}<input aria-label={tx("Posição X", "X position", "Posición X")} type="number" value={Math.round(selMarker.x)} onChange={e => upMarker(selMarker.id, { x: +e.target.value || 0 })} className="field mt-1" /></label><label className="label">{tx("Posição Y", "Y position", "Posición Y")}<input aria-label={tx("Posição Y", "Y position", "Posición Y")} type="number" value={Math.round(selMarker.y)} onChange={e => upMarker(selMarker.id, { y: +e.target.value || 0 })} className="field mt-1" /></label></div><p className="text-xs text-muted-foreground">{tx("Arraste a localidade no mapa para reposicioná-la.", "Drag the location on the map to reposition it.", "Arrastra la localidad en el mapa para cambiar su posición.")}</p></div></details>

            <details className="rounded-lg border border-border p-3"><summary className="cursor-pointer select-none font-semibold">{t.photo}</summary><div className="mt-3 grid gap-2">
            {/* Foto do local */}
            <div>
              <label className="label">{t.photo}</label>
              {selMarker.photo && (
                <div className="mb-2 flex items-center gap-3">
                  <img src={selMarker.photo} alt={selMarker.name} className="h-20 w-32 rounded border border-border object-cover" />
                  <Button variant="ghost" size="icon" aria-label={t.removePhoto} onClick={() => upMarker(selMarker.id, { photo: undefined })}><Trash2 /></Button>
                </div>
              )}
              <label className="inline-flex cursor-pointer items-center gap-2 rounded border border-border bg-accent px-3 py-1 text-sm">
                <Upload className="h-4 w-4" />{tx("Inserir imagem", "Upload image", "Insertar imagen")}
                <input type="file" accept="image/*" hidden onChange={e => { onImage(e.target.files?.[0], photo => upMarker(selMarker.id, { photo }), 600); e.target.value = ""; }} />
              </label>
              <div className="mt-2 flex gap-1">
                <input placeholder={t.photoUrl} value={markerPhotoUrl} onChange={e => setMarkerPhotoUrl(e.target.value)} className="field text-xs" />
                <Button size="sm" variant="outline" disabled={!/^https:\/\//.test(markerPhotoUrl.trim())} onClick={() => { upMarker(selMarker.id, { photo: markerPhotoUrl.trim() }); setMarkerPhotoUrl(""); }}>OK</Button>
              </div>
            </div>

            </div></details><details className="rounded-lg border border-border p-3"><summary className="cursor-pointer select-none font-semibold">{tx("População e economia", "Population and economy", "Población y economía")}</summary><div className="mt-3 grid gap-3">
            {/* População e economia */}
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
              <input placeholder={tx("Ex.: Trigo, Minério de Ferro, Madeira...", "E.g. Wheat, Iron Ore, Wood...", "Ej.: Trigo, mineral de hierro, madera...")} value={selMarker.production ?? ""} onChange={e => upMarker(selMarker.id, { production: e.target.value })} className="field" />
            </div>

            <div className="grid grid-cols-2 gap-2"><div><label className="label flex items-center gap-1"><Wheat className="h-3 w-3" />{tx("Produção de comida", "Food production", "Producción de alimentos")}</label><input type="number" min={0} value={selMarker.foodProduction ?? 0} onChange={e => upMarker(selMarker.id, { foodProduction: Math.max(0, +e.target.value) })} className="field" /></div><div><label className="label">{tx("Consumo de comida", "Food consumption", "Consumo de alimentos")}</label><input type="number" min={0} value={selMarker.foodConsumption ?? 0} onChange={e => upMarker(selMarker.id, { foodConsumption: Math.max(0, +e.target.value) })} className="field" /></div></div>
            </div></details><details className="rounded-lg border border-border p-3"><summary className="cursor-pointer select-none font-semibold">{t.notes}</summary><div className="mt-3"><textarea rows={4} value={selMarker.notes} onChange={e => upMarker(selMarker.id, { notes: e.target.value })} className="field" /></div></details>
            <Button variant="ghost" onClick={() => { setData(d => ({ ...d, markers: d.markers.filter(m => m.id !== selMarker.id) })); setSel(null); }} className="text-sm text-destructive">{t.delete}</Button>
          </div>}

          {selComment && <div className="grid gap-3">
            <span className="label">{tx("Texto no mapa", "Map text", "Texto en el mapa")}</span>
            <textarea aria-label={tx("Texto do comentário", "Comment text", "Texto del comentario")} rows={4} value={selComment.text} onChange={e => setData(d => ({ ...d, comments: d.comments.map(c => c.id === selComment.id ? { ...c, text: e.target.value } : c) }))} className="field" />
            <details className="rounded-lg border border-border p-3"><summary className="cursor-pointer select-none font-semibold">{tx("Aparência", "Appearance", "Apariencia")}</summary><div className="mt-3 grid gap-3"><div className="grid grid-cols-2 gap-2"><label className="label">{tx("Tamanho", "Size", "Tamaño")} · {selComment.size ?? 18}px<input aria-label={tx("Tamanho do texto", "Text size", "Tamaño del texto")} type="range" min={8} max={64} value={selComment.size ?? 18} onChange={e => setData(d => ({ ...d, comments: d.comments.map(c => c.id === selComment.id ? { ...c, size: +e.target.value } : c) }))} className="mt-2 w-full" /></label><label className="label">{tx("Rotação", "Rotation", "Rotación")} · {selComment.rotation ?? 0}°<input aria-label={tx("Rotação do texto", "Text rotation", "Rotación del texto")} type="range" min={-180} max={180} value={selComment.rotation ?? 0} onChange={e => setData(d => ({ ...d, comments: d.comments.map(c => c.id === selComment.id ? { ...c, rotation: +e.target.value } : c) }))} className="mt-2 w-full" /></label></div>
            <label className="label">{tx("Fonte", "Font", "Fuente")}<select aria-label={tx("Fonte do texto", "Text font", "Fuente del texto")} value={selComment.fontFamily ?? "Arial"} onChange={e => setData(d => ({ ...d, comments: d.comments.map(c => c.id === selComment.id ? { ...c, fontFamily: e.target.value } : c) }))} className="field mt-1"><option>Arial</option><option>Georgia</option><option>Times New Roman</option><option>Verdana</option><option>Courier New</option><option>Trebuchet MS</option></select></label>
            <label className="label">{tx("Cor do texto", "Text color", "Color del texto")}<input aria-label={tx("Cor do texto", "Text color", "Color del texto")} type="color" value={toHex(selComment.color ?? "#222222")} onChange={e => setData(d => ({ ...d, comments: d.comments.map(c => c.id === selComment.id ? { ...c, color: e.target.value } : c) }))} className="field mt-1 h-10 p-1" /></label></div></details>
            <details className="rounded-lg border border-border p-3"><summary className="cursor-pointer select-none font-semibold">{tx("Posição", "Position", "Posición")} <span className="text-xs font-normal text-muted-foreground">— {tx("modificações da posição", "position adjustments", "ajustes de posición")}</span></summary><div className="mt-3 grid gap-2"><div className="grid grid-cols-2 gap-2"><label className="label">{tx("Posição X", "X position", "Posición X")}<input aria-label={tx("Posição X do texto", "Text X position", "Posición X del texto")} type="number" value={Math.round(selComment.x)} onChange={e => setData(d => ({ ...d, comments: d.comments.map(c => c.id === selComment.id ? { ...c, x: +e.target.value || 0 } : c) }))} className="field mt-1" /></label><label className="label">{tx("Posição Y", "Y position", "Posición Y")}<input aria-label={tx("Posição Y do texto", "Text Y position", "Posición Y del texto")} type="number" value={Math.round(selComment.y)} onChange={e => setData(d => ({ ...d, comments: d.comments.map(c => c.id === selComment.id ? { ...c, y: +e.target.value || 0 } : c) }))} className="field mt-1" /></label></div><p className="text-xs text-muted-foreground">{tx("Arraste o texto no mapa para reposicioná-lo.", "Drag the text on the map to reposition it.", "Arrastra el texto en el mapa para cambiar su posición.")}</p></div></details>
            <Button variant="ghost" onClick={() => { setData(d => ({ ...d, comments: d.comments.filter(c => c.id !== selComment.id) })); setSel(null); }} className="text-sm text-destructive">{tx("Excluir texto", "Delete text", "Eliminar texto")}</Button>
          </div>}
          {selLine && <div className="grid gap-3">
            <span className="label">{t[`l_${selLine.type}`]} · {selLine.points.length} {t.points}</span>
            <Button variant="ghost" onClick={() => { setData(d => ({ ...d, lines: d.lines.filter(m => m.id !== selLine.id) })); setSel(null); }} className="text-sm text-destructive">{t.deleteLine}</Button>
          </div>}
        </aside>
      )}
      {dialog && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" role="presentation" onPointerDown={e => { if (e.target === e.currentTarget) setDialog(null); }}><section role="dialog" aria-modal="true" aria-label={dialog.type === "save" ? tx("Salvar mapa", "Save map", "Guardar mapa") : dialog.type === "history" ? tx("Histórico de versões", "Version history", "Historial de versiones") : dialog.type === "status" ? tx("Status do mundo", "World status", "Estado del mundo") : dialog.type === "compare" ? tx("Comparar países e cidades", "Compare nations and cities", "Comparar países y ciudades") : dialog.type === "diplomacy" ? tx("Editor diplomático", "Diplomacy editor", "Editor diplomático") : dialog.type === "tutorial" ? tx("Tutorial interativo", "Interactive tutorial", "Tutorial interactivo") : dialog.title} className="w-full max-w-lg rounded-lg border border-border bg-card p-5 text-card-foreground shadow-xl"><div className="mb-4 flex items-center justify-between"><h2 className="font-display text-xl">{dialog.type === "save" ? tx("Salvar mapa e criar versão", "Save map and create version", "Guardar mapa y crear versión") : dialog.type === "history" ? tx("Histórico de versões", "Version history", "Historial de versiones") : dialog.type === "status" ? tx("Status do mundo", "World status", "Estado del mundo") : dialog.type === "compare" ? tx("Comparar países e cidades", "Compare nations and cities", "Comparar países y ciudades") : dialog.type === "diplomacy" ? tx("Editor diplomático", "Diplomacy editor", "Editor diplomático") : dialog.type === "tutorial" ? tx("Tutorial interativo", "Interactive tutorial", "Tutorial interactivo") : dialog.title}</h2><Button variant="ghost" size="icon" aria-label={t.close} onClick={() => setDialog(null)}><X /></Button></div>{dialog.type === "text" && <div className="grid gap-3"><textarea autoFocus rows={4} value={dialog.value} onChange={e => setDialog(d => d?.type === "text" ? { ...d, value: e.target.value } : d)} className="field" placeholder={tx("Digite o texto...", "Enter text...", "Escribe el texto...")} /><p className="text-xs text-muted-foreground">{tx("Deixe vazio para excluir um texto existente.", "Leave empty to delete existing text.", "Déjalo vacío para eliminar el texto existente.")}</p><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setDialog(null)}>{tx("Cancelar", "Cancel", "Cancelar")}</Button><Button onClick={() => { const current = dialog; if (current.type === "text") current.onSubmit(current.value); setDialog(null); }}>{tx("Aplicar", "Apply", "Aplicar")}</Button></div></div>}{dialog.type === "status" && <div className="grid gap-3"><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{[{label:tx("População total","Total population","Población total"),value:worldStats.population},{label:tx("Receita total","Total income","Ingresos totales"),value:worldStats.income},{label:tx("Gastos totais","Total expenses","Gastos totales"),value:worldStats.expenses},{label:tx("Saldo econômico","Economic balance","Balance económico"),value:worldBalance},{label:tx("Produção de comida","Food production","Producción de alimentos"),value:worldStats.foodProduction},{label:tx("Consumo de comida","Food consumption","Consumo de alimentos"),value:worldStats.foodConsumption},{label:tx("Saldo de comida","Food balance","Balance alimentario"),value:foodBalance},{label:tx("Localidades","Locations","Localidades"),value:data.markers.length},{label:tx("Nações","Nations","Naciones"),value:data.nations.length}].map(item => <div key={item.label} className="rounded-lg border border-border bg-accent/30 p-3"><p className="text-xs text-muted-foreground">{item.label}</p><p className="mt-1 text-lg font-semibold tabular-nums">{item.value.toLocaleString("pt-BR")}</p></div>)}</div><p className="text-xs text-muted-foreground">{tx("Os totais são somas dos valores cadastrados em todas as localidades. O saldo econômico é receita menos gastos; o saldo alimentar é produção menos consumo.", "Totals sum the values entered for all locations. Economic balance is income minus expenses; food balance is production minus consumption.", "Los totales suman los valores registrados en todas las localidades. El balance económico es ingresos menos gastos; el alimentario es producción menos consumo.")}</p><div className="grid gap-2"><h3 className="font-semibold">{tx("Território por nação", "Territory by nation", "Territorio por nación")}</h3>{data.nations.length ? data.nations.map(n => <div key={n.id} className="flex items-center justify-between gap-3 border-b border-border/60 py-1 text-sm"><span className="flex min-w-0 items-center gap-2"><span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: n.color }} /><span className="truncate">{n.name}</span></span><span className="shrink-0 tabular-nums">{tileCount(n.id)} {tx("territórios", "tiles", "territorios")}</span></div>) : <p className="text-sm text-muted-foreground">{tx("Nenhuma nação cadastrada.", "No nations registered.", "No hay naciones registradas.")}</p>}<h3 className="mt-2 font-semibold">{tx("Localidades", "Locations", "Localidades")}</h3>{data.markers.length ? data.markers.map(m => <div key={m.id} className="grid grid-cols-2 gap-2 border-b border-border/60 py-1 text-sm"><span className="truncate font-medium">{m.name}</span><span className="text-right text-muted-foreground">{t[`m_${m.type}`]}</span><span>{tx("População:", "Population:", "Población:")} {(m.npcs ?? 0).toLocaleString(lang === "pt" ? "pt-BR" : lang === "es" ? "es-ES" : "en-US")}</span><span className="text-right">{tx("Saldo:", "Balance:", "Balance:")} {(m.grossIncome ?? 0) - (m.expenses ?? 0)}</span></div>) : <p className="text-sm text-muted-foreground">{tx("Nenhuma localidade cadastrada.", "No locations registered.", "No hay localidades registradas.")}</p>}</div></div>}{dialog.type === "compare" && <div className="grid gap-4"><p className="text-sm text-muted-foreground">{tx("Marque duas ou mais nações e/ou localidades para comparar os dados cadastrados.", "Select two or more nations and/or locations to compare their saved data.", "Selecciona dos o más naciones o localidades para comparar los datos registrados.")}</p><div className="grid gap-3 sm:grid-cols-2"><div className="min-w-0"><h3 className="mb-2 font-semibold">{tx("Nações", "Nations", "Naciones")} ({compareNations.length} {tx("selecionadas", "selected", "seleccionadas")})</h3><div className="max-h-48 space-y-1 overflow-y-auto rounded border border-border p-2">{data.nations.length ? data.nations.map(n => <label key={n.id} className="flex items-center gap-2 py-1 text-sm"><input type="checkbox" checked={compareNations.includes(n.id)} onChange={e => setCompareNations(current => e.target.checked ? [...current, n.id] : current.filter(id => id !== n.id))} /><span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: n.color }} /><span className="min-w-0 flex-1 truncate">{n.name}</span></label>) : <p className="text-xs text-muted-foreground">{tx("Nenhuma nação criada.", "No nations created.", "No se han creado naciones.")}</p>}</div></div><div className="min-w-0"><h3 className="mb-2 font-semibold">{tx("Cidades e locais", "Cities and locations", "Ciudades y lugares")} ({compareMarkers.length} {tx("selecionados", "selected", "seleccionados")})</h3><div className="max-h-48 space-y-1 overflow-y-auto rounded border border-border p-2">{data.markers.length ? data.markers.map(m => <label key={m.id} className="flex items-center gap-2 py-1 text-sm"><input type="checkbox" checked={compareMarkers.includes(m.id)} onChange={e => setCompareMarkers(current => e.target.checked ? [...current, m.id] : current.filter(id => id !== m.id))} /><span className="min-w-0 flex-1 truncate">{m.name}</span><span className="text-xs text-muted-foreground">{t[`m_${m.type}`]}</span></label>) : <p className="text-xs text-muted-foreground">{tx("Nenhuma localidade criada.", "No locations created.", "No se han creado localidades.")}</p>}</div></div></div>{(compareNations.length > 0 || compareMarkers.length > 0) && <div className="max-h-[42vh] space-y-3 overflow-auto"><h3 className="font-semibold">{tx("Comparação", "Comparison", "Comparación")}</h3>{compareNations.length > 0 && <div className="overflow-x-auto"><table className="w-full min-w-[480px] text-left text-xs"><thead><tr className="border-b border-border"><th className="p-2">{tx("Nação", "Nation", "Nación")}</th><th className="p-2">{tx("Territórios", "Territories", "Territorios")}</th><th className="p-2">{t.relation}</th><th className="p-2">{t.ruler}</th><th className="p-2">{tx("Vassalos", "Vassals", "Vasallos")}</th></tr></thead><tbody>{data.nations.filter(n => compareNations.includes(n.id)).map(n => <tr key={n.id} className="border-b border-border/60"><td className="p-2 font-medium">{n.name}</td><td className="p-2 tabular-nums">{tileCount(n.id)}</td><td className="p-2">{REL[relationToPlayer(n)]}</td><td className="p-2">{n.ruler || "—"}</td><td className="p-2">{data.nations.filter(v => v.overlordId === n.id).length}</td></tr>)}</tbody></table></div>}{compareMarkers.length > 0 && <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-xs"><thead><tr className="border-b border-border"><th className="p-2">{tx("Localidade", "Location", "Localidad")}</th><th className="p-2">{tx("Tipo", "Type", "Tipo")}</th><th className="p-2">{tx("População", "Population", "Población")}</th><th className="p-2">{tx("Receita", "Income", "Ingresos")}</th><th className="p-2">{tx("Gastos", "Expenses", "Gastos")}</th><th className="p-2">{tx("Saldo", "Balance", "Balance")}</th><th className="p-2">{tx("Saldo alimentar", "Food balance", "Balance alimentario")}</th></tr></thead><tbody>{data.markers.filter(m => compareMarkers.includes(m.id)).map(m => <tr key={m.id} className="border-b border-border/60"><td className="p-2 font-medium">{m.name}</td><td className="p-2">{t[`m_${m.type}`]}</td><td className="p-2 tabular-nums">{(m.npcs ?? 0).toLocaleString("pt-BR")}</td><td className="p-2 tabular-nums">{m.grossIncome ?? 0}</td><td className="p-2 tabular-nums">{m.expenses ?? 0}</td><td className="p-2 tabular-nums">{(m.grossIncome ?? 0) - (m.expenses ?? 0)}</td><td className="p-2 tabular-nums">{(m.foodProduction ?? 0) - (m.foodConsumption ?? 0)}</td></tr>)}</tbody></table></div>}</div>}<div className="flex flex-wrap justify-between gap-2"><Button variant="outline" onClick={() => { setCompareNations([]); setCompareMarkers([]); }}>{tx("Limpar seleção", "Clear selection", "Borrar selección")}</Button><Button onClick={() => setDialog(null)}>{tx("Concluir", "Done", "Finalizar")}</Button></div></div>}{dialog.type === "diplomacy" && <div className="grid max-h-[70vh] gap-3 overflow-y-auto">
        <p className="text-sm text-muted-foreground">{tx("Registre alianças e guerras para visualizá-las pelos filtros. A unificação visual das alianças só aparece no filtro “Alianças (unificadas)”. Alterações diplomáticas importantes exigem confirmação.", "Register alliances and wars to view them through the filters. Alliances appear visually unified only in the “Alliances (unified)” filter. Important diplomatic changes require confirmation.", "Registra alianzas y guerras para verlas mediante los filtros. Las alianzas solo se unifican visualmente en el filtro “Alianzas (unificadas)”. Los cambios diplomáticos importantes requieren confirmación.")}</p>
        <div className="rounded-lg border border-border p-3"><h3 className="font-semibold">{tx("Criar aliança", "Create alliance", "Crear alianza")}</h3><div className="mt-2 grid gap-2"><input className="field" value={allianceName} onChange={e => setAllianceName(e.target.value)} placeholder={tx("Nome da aliança", "Alliance name", "Nombre de la alianza")} aria-label={tx("Nome da aliança", "Alliance name", "Nombre de la alianza")} /><div className="grid grid-cols-2 gap-2"><label className="label">{tx("Cor da aliança", "Alliance color", "Color de la alianza")}<input className="mt-1 h-9 w-full" type="color" value={allianceColor} onChange={e => setAllianceColor(e.target.value)} /></label><label className="label">{tx("Imagem / emblema", "Image / emblem", "Imagen / emblema")}<input className="mt-1 block w-full text-xs" type="file" accept="image/*" onChange={e => { onImage(e.target.files?.[0], setAllianceImage, 600); e.target.value = ""; }} /></label></div>{allianceImage && <div className="flex items-center gap-2"><img src={allianceImage} alt={tx("Prévia do emblema da aliança", "Alliance emblem preview", "Vista previa del emblema de la alianza")} className="h-12 w-16 rounded border object-contain" /><Button variant="ghost" size="sm" onClick={() => setAllianceImage(undefined)}>{tx("Remover imagem", "Remove image", "Eliminar imagen")}</Button></div>}<div className="max-h-32 space-y-1 overflow-y-auto rounded border border-border p-2">{data.nations.map(n => <label key={n.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={allianceMembers.includes(n.id)} onChange={e => setAllianceMembers(cur => e.target.checked ? [...cur, n.id] : cur.filter(id => id !== n.id))} /><span className="h-3 w-3 rounded-sm" style={{ background: n.color }} />{n.name}</label>)}</div><Button disabled={!allianceName.trim() || allianceMembers.length < 2} onClick={() => setDialog({ type: "confirm", title: tx("Confirmar criação da aliança", "Confirm alliance creation", "Confirmar creación de alianza"), message: tx(`Criar a aliança “${allianceName.trim()}” com ${allianceMembers.map(id => data.nations.find(n => n.id === id)?.name).filter(Boolean).join(", ")}?`, `Create the alliance “${allianceName.trim()}” with ${allianceMembers.map(id => data.nations.find(n => n.id === id)?.name).filter(Boolean).join(", ")}?`, `¿Crear la alianza “${allianceName.trim()}” con ${allianceMembers.map(id => data.nations.find(n => n.id === id)?.name).filter(Boolean).join(", ")}?`), onSubmit: () => { const alliance: Alliance = { id: uid(), name: allianceName.trim(), nationIds: [...allianceMembers], color: allianceColor, image: allianceImage }; setData(d => ({ ...d, alliances: [...(d.alliances ?? []), alliance] })); setAllianceName(""); setAllianceMembers([]); setAllianceImage(undefined); setNotice(tx("Aliança criada.", "Alliance created.", "Alianza creada.")); setDialog({ type: "diplomacy" }); } })}>{tx("Criar aliança (confirmar)", "Create alliance (confirm)", "Crear alianza (confirmar)")}</Button></div></div>
        <div className="rounded-lg border border-border p-3"><h3 className="font-semibold">{tx("Registrar guerra", "Register war", "Registrar guerra")}</h3><div className="mt-2 grid gap-2"><input className="field" value={warName} onChange={e => setWarName(e.target.value)} placeholder={tx("Nome da guerra", "War name", "Nombre de la guerra")} aria-label={tx("Nome da guerra", "War name", "Nombre de la guerra")} /><div className="grid gap-2 sm:grid-cols-2"><div><p className="label">{tx("Atacantes", "Attackers", "Atacantes")}</p><div className="max-h-32 space-y-1 overflow-y-auto rounded border border-border p-2">{data.nations.map(n => <label key={n.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={warAttackers.includes(n.id)} onChange={e => setWarAttackers(cur => e.target.checked ? [...cur, n.id] : cur.filter(id => id !== n.id))} />{n.name}</label>)}</div></div><div><p className="label">{tx("Defensores", "Defenders", "Defensores")}</p><div className="max-h-32 space-y-1 overflow-y-auto rounded border border-border p-2">{data.nations.map(n => <label key={n.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={warDefenders.includes(n.id)} onChange={e => setWarDefenders(cur => e.target.checked ? [...cur, n.id] : cur.filter(id => id !== n.id))} />{n.name}</label>)}</div></div></div><Button disabled={!warName.trim() || !warAttackers.length || !warDefenders.length || warAttackers.some(id => warDefenders.includes(id))} onClick={() => setDialog({ type: "confirm", title: tx("Confirmar declaração de guerra", "Confirm war declaration", "Confirmar declaración de guerra"), message: tx(`Registrar “${warName.trim()}” entre ${warAttackers.map(id => data.nations.find(n => n.id === id)?.name).filter(Boolean).join(", ")} e ${warDefenders.map(id => data.nations.find(n => n.id === id)?.name).filter(Boolean).join(", ")}?`, `Register “${warName.trim()}” between ${warAttackers.map(id => data.nations.find(n => n.id === id)?.name).filter(Boolean).join(", ")} and ${warDefenders.map(id => data.nations.find(n => n.id === id)?.name).filter(Boolean).join(", ")}?`, `¿Registrar “${warName.trim()}” entre ${warAttackers.map(id => data.nations.find(n => n.id === id)?.name).filter(Boolean).join(", ")} y ${warDefenders.map(id => data.nations.find(n => n.id === id)?.name).filter(Boolean).join(", ")}?`), onSubmit: () => { const war: War = { id: uid(), name: warName.trim(), attackers: [...warAttackers], defenders: [...warDefenders], active: true, startedAt: new Date().toISOString() }; setData(d => ({ ...d, wars: [...(d.wars ?? []), war] })); setWarName(""); setWarAttackers([]); setWarDefenders([]); setNotice(tx("Guerra registrada.", "War recorded.", "Guerra registrada.")); setDialog({ type: "diplomacy" }); } })}>{tx("Registrar guerra (confirmar)", "Register war (confirm)", "Registrar guerra (confirmar)")}</Button></div></div>
        <div className="grid gap-2"><h3 className="font-semibold">{tx("Alianças registradas", "Registered alliances", "Alianzas registradas")} ({alliances.length})</h3>{alliances.map(a => <article key={a.id} className="flex items-center gap-3 rounded border border-border p-2">{a.image && <img src={a.image} alt={tx(`Emblema de ${a.name}`, `${a.name} emblem`, `Emblema de ${a.name}`)} className="h-10 w-14 object-contain" />}<span className="h-4 w-4 shrink-0 rounded" style={{ background: a.color }} /><div className="min-w-0 flex-1"><p className="font-medium">{a.name}</p><p className="text-xs text-muted-foreground">{a.nationIds.map(id => data.nations.find(n => n.id === id)?.name).filter(Boolean).join(", ")}</p></div><Button variant="outline" size="sm" onClick={() => setDialog({ type: "confirm", title: tx("Confirmar exclusão da aliança", "Confirm alliance deletion", "Confirmar eliminación de alianza"), message: tx(`Excluir a aliança “${a.name}”? Os países continuarão no mapa normalmente.`, `Delete the alliance “${a.name}”? The nations will remain on the map.`, `¿Eliminar la alianza “${a.name}”? Las naciones seguirán en el mapa.`), onSubmit: () => { setData(d => ({ ...d, alliances: (d.alliances ?? []).filter(item => item.id !== a.id) })); setDialog({ type: "diplomacy" }); } })}>{tx("Excluir", "Delete", "Eliminar")}</Button></article>)}{!alliances.length && <p className="text-xs text-muted-foreground">{tx("Nenhuma aliança cadastrada.", "No alliances registered.", "No hay alianzas registradas.")}</p>}</div>
        <div className="grid gap-2"><h3 className="font-semibold">{tx("Guerras", "Wars", "Guerras")} ({wars.filter(w => w.active).length} {tx("ativas", "active", "activas")})</h3>{wars.map(w => <article key={w.id} className="flex flex-wrap items-center gap-2 rounded border border-border p-2"><div className="min-w-0 flex-1"><p className="font-medium">{w.name} {w.active ? <span className="text-destructive">· {tx("ATIVA", "ACTIVE", "ACTIVA")}</span> : <span className="text-muted-foreground">· {tx("Encerrada", "Ended", "Finalizada")}</span>}</p><p className="text-xs text-muted-foreground">{w.attackers.map(id => data.nations.find(n => n.id === id)?.name).filter(Boolean).join(", ")} × {w.defenders.map(id => data.nations.find(n => n.id === id)?.name).filter(Boolean).join(", ")}</p></div>{w.active && <Button variant="outline" size="sm" onClick={() => setDialog({ type: "confirm", title: tx("Confirmar fim da guerra", "Confirm end of war", "Confirmar fin de la guerra"), message: tx(`Encerrar a guerra “${w.name}”?`, `End the war “${w.name}”?`, `¿Finalizar la guerra “${w.name}”?`), onSubmit: () => { setData(d => ({ ...d, wars: (d.wars ?? []).map(item => item.id === w.id ? { ...item, active: false, endedAt: new Date().toISOString() } : item) })); setDialog({ type: "diplomacy" }); } })}>{tx("Encerrar guerra", "End war", "Finalizar guerra")}</Button>}</article>)}{!wars.length && <p className="text-xs text-muted-foreground">{tx("Nenhuma guerra registrada.", "No wars registered.", "No hay guerras registradas.")}</p>}</div>
        {!data.nations.length && <p className="rounded border border-border p-4 text-sm">{tx("Crie pelo menos uma nação para usar o editor diplomático.", "Create at least one nation to use the diplomacy editor.", "Crea al menos una nación para usar el editor diplomático.")}</p>}
        {data.nations.map(n => {
          const expanded = diplomacyExpanded.includes(n.id);
          return <article key={n.id} className="rounded-lg border border-border p-3">
            <button type="button" className="flex w-full items-center gap-2 text-left" onClick={() => setDiplomacyExpanded(current => expanded ? current.filter(id => id !== n.id) : [...current, n.id])}>
              <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: n.color }} />
              <span className="min-w-0 flex-1 truncate font-semibold">{n.name}</span>
              <span className="text-xs text-muted-foreground">{REL[relationToPlayer(n)]}</span><span className="text-xs">{expanded ? "−" : "+"}</span>
            </button>
            {expanded && <div className="mt-3 grid gap-3">
              <label className="label">{tx("Relação com meu país de referência", "Relation to my reference nation", "Relación con mi país de referencia")}<select className="field mt-1" disabled={!data.playerNationId || n.id === data.playerNationId} value={relationToPlayer(n)} onChange={e => { const next = e.target.value as Relation; setDialog({ type: "confirm", title: tx("Confirmar mudança diplomática", "Confirm diplomatic change", "Confirmar cambio diplomático"), message: tx("Alterar a relação bilateral com o país de referência?", "Change the bilateral relation with the reference nation?", "¿Cambiar la relación bilateral con el país de referencia?"), onSubmit: () => { setData(d => ({ ...d, nations: d.nations.map(item => item.id === n.id ? { ...item, relations: { ...(item.relations ?? {}), [d.playerNationId!]: next } } : item) })); setDialog({ type: "diplomacy" }); } }); }}>{RELS.filter(r => r !== "propria").map(r => <option key={r} value={r}>{REL[r]}</option>)}</select></label>
              <div><p className="label">{tx("Inimigos declarados por", "Enemies declared by", "Enemigos declarados por")} {n.name}</p><div className="max-h-32 space-y-1 overflow-y-auto rounded border border-border p-2">{data.nations.filter(other => other.id !== n.id).map(other => { const isEnemy = (n.enemyIds ?? []).includes(other.id); return <label key={other.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isEnemy} onChange={e => { const next = e.target.checked ? [...(n.enemyIds ?? []), other.id] : (n.enemyIds ?? []).filter(id => id !== other.id); setDialog({ type: "confirm", title: tx("Confirmar alteração de inimigos", "Confirm enemy change", "Confirmar cambio de enemigos"), message: tx(`${e.target.checked ? "Declarar" : "Remover"} ${other.name} como inimigo de ${n.name}? Esta alteração não muda automaticamente a diplomacia da outra nação.`, `${e.target.checked ? "Declare" : "Remove"} ${other.name} as an enemy of ${n.name}? This does not automatically change the other nation's diplomacy.`, `${e.target.checked ? "Declarar" : "Eliminar"} a ${other.name} como enemigo de ${n.name}? Esto no cambia automáticamente la diplomacia de la otra nación.`), onSubmit: () => { upNation(n.id, { enemyIds: next }); setDialog({ type: "diplomacy" }); } }); }} />{other.name}</label>; })}</div><p className="mt-1 text-xs text-muted-foreground">{tx("A relação é independente: declarar um país como inimigo não o declara automaticamente como seu inimigo.", "Relations are independent: declaring a country an enemy does not automatically make you its enemy.", "Las relaciones son independientes: declarar enemigo a un país no hace que te declare enemigo automáticamente.")}</p></div>
              <label className="label">{tx("Governante", "Ruler", "Gobernante")}<input className="field mt-1" value={n.ruler} onChange={e => upNation(n.id, { ruler: e.target.value })} placeholder={tx("Nome do governante", "Ruler name", "Nombre del gobernante")} /></label>
              <label className="label">{tx("Suserano / nação superior", "Overlord / superior nation", "Señor / nación superior")}<select className="field mt-1" value={n.overlordId ?? ""} onChange={e => upNation(n.id, { overlordId: e.target.value || undefined })}><option value="">{tx("Independente", "Independent", "Independiente")}</option>{data.nations.filter(other => other.id !== n.id).map(other => <option key={other.id} value={other.id}>{other.name}</option>)}</select></label>
              <label className="label">{tx("Tratados e acordos", "Treaties and agreements", "Tratados y acuerdos")}<textarea className="field mt-1" rows={3} value={n.treaties} onChange={e => upNation(n.id, { treaties: e.target.value })} placeholder={tx("Alianças, pactos, tréguas, comércio...", "Alliances, pacts, truces, trade...", "Alianzas, pactos, treguas, comercio...")} /></label>
              <label className="label">{tx("Notas diplomáticas", "Diplomatic notes", "Notas diplomáticas")}<textarea className="field mt-1" rows={3} value={n.notes} onChange={e => upNation(n.id, { notes: e.target.value })} placeholder={tx("Disputas, reivindicações, tensões...", "Disputes, claims, tensions...", "Disputas, reclamaciones, tensiones...")} /></label>
              <div className="flex flex-wrap gap-1">{RELS.map(r => <Button key={r} size="sm" variant="outline" className={n.relation === r ? "border-primary font-semibold" : ""} onClick={() => setDialog({ type: "confirm", title: tx("Confirmar mudança diplomática", "Confirm diplomatic change", "Confirmar cambio diplomático"), message: tx(`Alterar a relação de ${n.name} para “${REL[r]}”?`, `Change the relation for ${n.name} to “${REL[r]}”?`, `¿Cambiar la relación de ${n.name} a “${REL[r]}”?`), onSubmit: () => { upNation(n.id, { relation: r }); setDialog({ type: "diplomacy" }); } })}>{REL[r]}</Button>)}</div>
            </div>}
          </article>;
        })}
        <div className="flex justify-end"><Button onClick={() => setDialog(null)}>{tx("Concluir", "Done", "Terminar")}</Button></div>
      </div>}{dialog.type === "tutorial" && <div className="grid gap-4"><div className="h-1.5 overflow-hidden rounded bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${((tutorialStep + 1) / tutorialSteps.length) * 100}%` }} /></div><article className="min-h-32 rounded-lg border border-border bg-accent/20 p-4"><h3 className="text-lg font-semibold">{tutorialSteps[tutorialStep]?.title}</h3><p className="mt-2 text-sm leading-relaxed">{tutorialSteps[tutorialStep]?.body}</p></article><p className="text-xs text-muted-foreground">{tx("Etapa", "Step", "Paso")} {tutorialStep + 1} {tx("de", "of", "de")} {tutorialSteps.length}</p><div className="flex justify-between gap-2"><Button variant="outline" disabled={tutorialStep === 0} onClick={() => setTutorialStep(step => Math.max(0, step - 1))}>{tx("Anterior", "Previous", "Anterior")}</Button>{tutorialStep < tutorialSteps.length - 1 ? <Button onClick={() => setTutorialStep(step => Math.min(tutorialSteps.length - 1, step + 1))}>{tx("Próxima", "Next", "Siguiente")}</Button> : <Button onClick={() => setDialog(null)}>{tx("Concluir tutorial", "Finish tutorial", "Terminar tutorial")}</Button>}</div></div>}{dialog.type === "confirm" && <div className="grid gap-4"><p>{dialog.message}</p><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setDialog(null)}>{tx("Cancelar", "Cancel", "Cancelar")}</Button><Button onClick={() => { const current = dialog; setDialog(null); if (current.type === "confirm") current.onSubmit(); }}>{tx("Confirmar", "Confirm", "Confirmar")}</Button></div></div>}{saveDialog && <div className="grid gap-3"><label className="label">{tx("Nome do mapa", "Map name", "Nombre del mapa")}<input className="field mt-1" value={saveDialog.name} onChange={e => setDialog(d => d?.type === "save" ? { ...d, name: e.target.value } : d)} /></label><label className="label">{tx("Descrição / observações", "Description / notes", "Descripción / notas")}<textarea rows={3} className="field mt-1" value={saveDialog.description} onChange={e => setDialog(d => d?.type === "save" ? { ...d, description: e.target.value } : d)} /></label><label className="label">{tx("Nome do arquivo (sem .json)", "File name (without .json)", "Nombre del archivo (sin .json")}<input className="field mt-1" value={saveDialog.filename} onChange={e => setDialog(d => d?.type === "save" ? { ...d, filename: e.target.value } : d)} /></label><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setDialog(null)}>{tx("Cancelar", "Cancel", "Cancelar")}</Button><Button onClick={() => { completeExport(saveDialog.name, saveDialog.description, saveDialog.filename); setDialog(null); }}>{tx("Salvar e exportar", "Save and export", "Guardar y exportar")}</Button></div></div>}{historyDialog && <div className="grid gap-3"><label className="label">{tx("Escolha uma versão", "Choose a version", "Elige una versión")}<select className="field mt-1" value={historyDialog.selectedId} onChange={e => setDialog(d => d?.type === "history" ? { ...d, selectedId: e.target.value } : d)}>{[...versions].reverse().map(v => <option key={v.id} value={v.id}>{v.name} — {new Date(v.createdAt).toLocaleString()}</option>)}</select></label><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setDialog(null)}>{tx("Cancelar", "Cancel", "Cancelar")}</Button><Button onClick={() => { const version = versions.find(v => v.id === historyDialog.selectedId); if (version) restoreVersion(version); setDialog(null); }}>{tx("Restaurar versão", "Restore version", "Restaurar versión")}</Button></div></div>}</section></div>}
    </div>
  );
}

function toHex(c: string) {
  if (c.startsWith("#")) return c;
  const m = c.match(/hsl\((\d+)\s+(\d+)%\s+(\d+)%\)/); if (!m) return "#888888";
  const h = Number(m[1]), s = Number(m[2]) / 100, l = Number(m[3]) / 100; const a = s * Math.min(l, 1 - l);
  const f = (n: number) => { const k = (n + h / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, "0"); };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function readMap(input: unknown): Data {
  if (!input || typeof input !== "object") throw new Error("Invalid map");
  const d = input as Record<string, unknown>;
  if (!Array.isArray(d["nations"]) || !Array.isArray(d["markers"]) || !Array.isArray(d["lines"]) || !d["tiles"] || typeof d["tiles"] !== "object" || Array.isArray(d["tiles"])) throw new Error("Invalid map");
  const text = (value: unknown) => typeof value === "string" ? value : "";
  const num = (value: unknown, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
  const finite = (value: unknown, fallback: number, min: number, max: number) => typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
  const image = (value: unknown) => typeof value === "string" && /^data:image\/(png|jpeg|webp|gif|avif);base64,/.test(value) ? value : undefined;
  const flagImage = (value: unknown) => image(value) ?? (typeof value === "string" && /^https:\/\/\S+$/.test(value) ? value : undefined);
  // Imported files are untrusted: clamp legacy cell sizes before expanding tiles.
  const oldCell = typeof d["cellSize"] === "number" && Number.isFinite(d["cellSize"]) ? Math.max(CELL, Math.min(40, d["cellSize"])) : 20;
  const factor = Math.max(1, Math.min(20, Math.round(oldCell / CELL)));
  const nations: Nation[] = d["nations"].map((n: Nation) => {
    if (!n || typeof n !== "object") throw new Error("Invalid nation");
    const rawRelation = n.relation as Relation | "aliada";
    const relation: Relation = rawRelation === "aliada" ? "amigavel" : rawRelation;
    if (typeof n.id !== "string" || !n.id || typeof n.name !== "string" || !RELS.includes(relation)) throw new Error("Invalid nation");
    const relations = n.relations && typeof n.relations === "object" ? Object.fromEntries(Object.entries(n.relations).filter(([id, value]) => typeof id === "string" && RELS.includes(value as Relation)).map(([id, value]) => [id, value as Relation])) : undefined;
    return { id: n.id, name: n.name, color: typeof n.color === "string" && (/^#[0-9a-f]{6}$/i.test(n.color) || /^hsl\(\d+\s+\d+%\s+\d+%\)$/.test(n.color)) ? n.color : "#888888", relation, relations, ruler: text(n.ruler), treaties: text(n.treaties), notes: text(n.notes), flag: flagImage(n.flag), overlordId: typeof n.overlordId === "string" && n.overlordId !== n.id ? n.overlordId : undefined, enemyIds: Array.isArray(n.enemyIds) ? n.enemyIds.filter((id): id is string => typeof id === "string" && id !== n.id) : [] };
  });
  if (new Set(nations.map(n => n.id)).size !== nations.length) throw new Error("Duplicate nation");
  const ids = new Set(nations.map(n => n.id));
  const regions: Region[] = Array.isArray(d["regions"]) ? (d["regions"] as Region[]).filter(region => region && typeof region.id === "string" && !!region.id && typeof region.name === "string" && !!region.name.trim() && typeof region.nationId === "string" && ids.has(region.nationId)).map(region => ({ id: region.id, name: region.name.trim(), nationId: region.nationId, color: typeof region.color === "string" && (/^#[0-9a-f]{6}$/i.test(region.color) || /^hsl\(\d+\s+\d+%\s+\d+%\)$/.test(region.color)) ? region.color : "#64748b" })) : [];
  const tiles: Record<string, string> = {};
  for (const [key, id] of Object.entries(expandTiles(d["tiles"] as Record<string, string>, factor))) {
    if (!/^\d+,\d+$/.test(key) || typeof id !== "string" || !ids.has(id)) throw new Error("Invalid territory");
    const [x = 0, y = 0] = key.split(",").map(Number);
    if (x >= COLS || y >= ROWS) throw new Error("Invalid cell");
    tiles[key] = id;
  }
  const regionTiles: Record<string, string> = {};
  if (d["regionTiles"] && typeof d["regionTiles"] === "object" && !Array.isArray(d["regionTiles"])) for (const [key, regionId] of Object.entries(d["regionTiles"] as Record<string, unknown>)) {
    const region = typeof regionId === "string" ? regions.find(item => item.id === regionId) : undefined;
    if (/^\d+,\d+$/.test(key) && region && tiles[key] === region.nationId) { const [x = 0, y = 0] = key.split(",").map(Number); if (x >= 0 && y >= 0 && x < COLS && y < ROWS) regionTiles[key] = region.id; }
  }
  const markers: Marker[] = d["markers"].map((m: any) => {
    if (!m || typeof m.id !== "string" || !Object.prototype.hasOwnProperty.call(ICON, m.type) || !Number.isFinite(m.x) || !Number.isFinite(m.y)) throw new Error("Invalid marker");
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
      foodProduction: num(m.foodProduction, 0),
      foodConsumption: num(m.foodConsumption, 0),
      production: text(m.production),
      photo: flagImage(m.photo),
      shape: ["circle", "square", "triangle", "star", "diamond", "hexagon", "cross"].includes(m.shape) ? m.shape : (m.type === "capital" ? "star" : m.type === "forte" ? "square" : m.type === "porto" ? "diamond" : "circle"),
      color: typeof m.color === "string" && /^#[0-9a-f]{6}$/i.test(m.color) ? m.color : undefined,
      size: finite(m.size, 1, 0.5, 3),
      labelSize: finite(m.labelSize, m.type === "capital" ? 12 : 10, 6, 40),
      rotation: finite(m.rotation, 0, 0, 359),
    };
  });
  const lines: Line[] = d["lines"].map((l: Line) => {
    if (!l || typeof l.id !== "string" || !["estrada", "rota"].includes(l.type) || !Array.isArray(l.points) || l.points.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite))) throw new Error("Invalid line");
    return { id: l.id, type: l.type, points: l.points };
  });
  const comments: MapComment[] = Array.isArray(d["comments"]) ? (d["comments"] as MapComment[]).filter(c => c && typeof c.id === "string" && Number.isFinite(c.x) && Number.isFinite(c.y) && typeof c.text === "string").map(c => ({ id: c.id, x: c.x, y: c.y, text: c.text, createdAt: typeof c.createdAt === "string" ? c.createdAt : new Date().toISOString(), size: finite(c.size, 18, 8, 64), fontFamily: typeof c.fontFamily === "string" && ["Arial", "Georgia", "Times New Roman", "Verdana", "Courier New", "Trebuchet MS"].includes(c.fontFamily) ? c.fontFamily : "Arial", color: typeof c.color === "string" && /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : undefined, rotation: finite(c.rotation, 0, -180, 180) })) : [];
  const validNationIds = new Set(nations.map(n => n.id));
  for (const nation of nations) {
    if (nation.overlordId && !validNationIds.has(nation.overlordId)) nation.overlordId = undefined;
    nation.enemyIds = (nation.enemyIds ?? []).filter(id => validNationIds.has(id));
  }
  const alliances: Alliance[] = Array.isArray(d["alliances"]) ? (d["alliances"] as Alliance[]).filter(a => a && typeof a.id === "string" && typeof a.name === "string").map(a => ({ id: a.id, name: a.name, nationIds: Array.isArray(a.nationIds) ? a.nationIds.filter(id => typeof id === "string" && validNationIds.has(id)) : [], color: typeof a.color === "string" && /^#[0-9a-f]{6}$/i.test(a.color) ? a.color : "#64748b", image: flagImage(a.image) })) : [];
  const wars: War[] = Array.isArray(d["wars"]) ? (d["wars"] as War[]).filter(w => w && typeof w.id === "string" && typeof w.name === "string").map(w => ({ id: w.id, name: w.name, attackers: Array.isArray(w.attackers) ? w.attackers.filter(id => typeof id === "string" && validNationIds.has(id)) : [], defenders: Array.isArray(w.defenders) ? w.defenders.filter(id => typeof id === "string" && validNationIds.has(id)) : [], active: typeof w.active === "boolean" ? w.active : false, startedAt: typeof w.startedAt === "string" ? w.startedAt : new Date().toISOString(), endedAt: typeof w.endedAt === "string" ? w.endedAt : undefined })) : [];
  for (const nation of nations) { let cursor = nation.overlordId; const seen = new Set([nation.id]); while (cursor) { if (seen.has(cursor)) { nation.overlordId = undefined; break; } seen.add(cursor); cursor = nations.find(n => n.id === cursor)?.overlordId; } }
  return { ...empty, cellSize: CELL, nations, regions, regionTiles, playerNationId: typeof d["playerNationId"] === "string" && nations.some(n => n.id === d["playerNationId"]) ? d["playerNationId"] : undefined, tiles, markers, lines, comments, alliances, wars, bg: image(d["bg"]) ?? null,
    bgOpacity: finite(d["bgOpacity"], 0.6, 0, 1), bgFit: d["bgFit"] === "cover" || d["bgFit"] === "stretch" ? d["bgFit"] : "contain",
    bgScale: finite(d["bgScale"], 1, 0.2, 3), bgX: finite(d["bgX"], 0, -W, W), bgY: finite(d["bgY"], 0, -H, H), bgRotation: finite(d["bgRotation"], 0, -180, 180),
    smooth: typeof d["smooth"] === "boolean" ? d["smooth"] : true, showGrid: typeof d["showGrid"] === "boolean" ? d["showGrid"] : true };
}
