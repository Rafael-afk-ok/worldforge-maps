import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Moon, Sun, Maximize, Minimize, Menu, X, Plus, Minus, Scan, Download, Upload, RotateCcw, Trash2, Settings, Users, Coins, Undo, Redo, History } from "lucide-react";
import { strokeCells, floodFill, territoryPath, expandTiles, MAP_COLS, MAP_ROWS, MAP_CELL } from "@/lib/map-tools";
import { DICTS, LANGS, type Lang } from "@/lib/i18n";

type Relation = "propria" | "aliada" | "neutra" | "inimiga";
type Nation = { id: string; name: string; color: string; relation: Relation; ruler: string; treaties: string; notes: string; flag?: string | undefined; overlordId?: string };
type MapComment = { id: string; x: number; y: number; text: string; createdAt: string };
type Region = { id: string; name: string; nationId: string; color: string; cells: string[] };
type MapVersion = { id: string; name: string; description: string; createdAt: string; data: Data };
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
type Data = { cellSize?: number; nations: Nation[]; tiles: Record<string, string>; markers: Marker[]; lines: Line[]; comments: MapComment[]; regions: Region[]; showRegions: boolean; bg: string | null; bgOpacity: number; bgFit: "contain" | "cover" | "stretch"; bgScale: number; bgX: number; bgY: number; bgRotation: number; smooth: boolean; showGrid: boolean };
type Tool = "mover" | "pintar" | "balde" | "apagar" | "comentario" | "regiao" | MarkerType | LineType;

const COLS = MAP_COLS, ROWS = MAP_ROWS, CELL = MAP_CELL, W = COLS * CELL, H = ROWS * CELL;
const KEY = "atlas-nacoes-v1";
const uid = () => Math.random().toString(36).slice(2, 9);
const empty: Data = { cellSize: MAP_CELL, nations: [], tiles: {}, markers: [], lines: [], comments: [], regions: [], showRegions: true, bg: null, bgOpacity: 0.6, bgFit: "contain", bgScale: 1, bgX: 0, bgY: 0, bgRotation: 0, smooth: true, showGrid: true };
const RELS: Relation[] = ["propria", "aliada", "neutra", "inimiga"];
const ICON: Record<MarkerType, string> = { capital: "★", cidade: "●", forte: "▲", porto: "⚓" };
const TOOLS: Tool[] = ["mover", "pintar", "balde", "apagar", "comentario", "regiao", "capital", "cidade", "forte", "porto", "estrada", "rota"];

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
  const [mapName, setMapName] = useState("Meu mundo");
  const [mapDescription, setMapDescription] = useState("");
  const [versions, setVersions] = useState<MapVersion[]>([]);
  const [selectedRegionId, setSelectedRegionId] = useState("");

  const historyRef = useRef<Data[]>([]);
  const historyIndexRef = useRef(-1);
  const restoringHistoryRef = useRef(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
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
  const [view, setView] = useState({ x: 20, y: 20, z: 0.5 });
  const [draft, setDraft] = useState<[number, number][]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const drag = useRef<{ mode: "pan" | "paint"; sx: number; sy: number; vx: number; vy: number } | null>(null);

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
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current--;
    const snapshot = historyRef.current[historyIndexRef.current];
    if (snapshot) { restoringHistoryRef.current = true; setData(snapshot); }
    updateHistoryState();
  };
  const handleRedo = () => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
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
      historyRef.current = [initial];
      historyIndexRef.current = 0;
      updateHistoryState();
      setDark(localStorage.getItem("atlas-theme") === "dark");
      const l = localStorage.getItem("atlas-lang"); if (l === "pt" || l === "en" || l === "es") setLang(l);
    } catch {
      historyRef.current = [empty]; historyIndexRef.current = 0; updateHistoryState();
    }
    setLoaded(true);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    if (loaded) localStorage.setItem("atlas-theme", dark ? "dark" : "light");
  }, [dark, loaded]);
  useEffect(() => { document.documentElement.lang = lang === "pt" ? "pt-BR" : lang; if (loaded) localStorage.setItem("atlas-lang", lang); }, [lang, loaded]);
  useEffect(() => {
    const changed = () => { if (!document.fullscreenElement) { setFullscreen(false); screen.orientation?.unlock?.(); } };
    const keydown = (event: KeyboardEvent) => { if (event.key === "Escape") { setFullscreen(false); screen.orientation?.unlock?.(); } };
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

  useEffect(() => { if (loaded) try { localStorage.setItem(KEY, JSON.stringify({ map: data, mapName, mapDescription, versions })); } catch { setNotice(t.storageFull); } }, [data, mapName, mapDescription, versions, loaded]);

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
  }, []);

  useEffect(() => {
    const el = ref.current; if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = viewRef.current;
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      const z = Math.min(4, Math.max(0.15, v.z * Math.exp(-dy * 0.0015)));
      const r = el.getBoundingClientRect(); const px = e.clientX - r.left, py = e.clientY - r.top; const k = z / v.z;
      setView({ z, x: px - (px - v.x) * k, y: py - (py - v.y) * k });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

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
      const tiles = { ...d.tiles };
      for (const cell of cells) {
        if (tool === "apagar") delete tiles[cell]; else if (brush) tiles[cell] = brush;
      }
      return { ...d, tiles, regions: d.regions.map(region => ({ ...region, cells: region.cells.filter(cell => tiles[cell] === region.nationId) })) };
    });
  }, [tool, brush, view, brushSize]);

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
    setView(v => { const z = Math.min(4, Math.max(0.1, v.z * factor)); const k = z / v.z;
      return { z, x: r.width / 2 - (r.width / 2 - v.x) * k, y: r.height / 2 - (r.height / 2 - v.y) * k }; });
  };
  const toggleFullscreen = async () => {
    if (fullscreen) {
      if (document.fullscreenElement) await document.exitFullscreen();
      screen.orientation?.unlock?.(); setFullscreen(false); return;
    }
    setFullscreen(true); setPanelOpen(false); setSel(null);
    try {
      await appRef.current?.requestFullscreen?.();
      const orientation = screen.orientation as ScreenOrientation & { lock?: (value: string) => Promise<void> };
      if (orientation?.lock) await orientation.lock("landscape");
      else setNotice(t.rotate);
    } catch { setNotice(t.rotateFallback); }
  };

  const onDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
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
    if (tool === "comentario") {
      const text = window.prompt(lang === "pt" ? "Texto do comentário:" : lang === "es" ? "Texto del comentario:" : "Comment text:");
      if (text?.trim()) setData(d => ({ ...d, comments: [...d.comments, { id: uid(), x: wx, y: wy, text: text.trim(), createdAt: new Date().toISOString() }] }));
    } else if (tool === "regiao") {
      const c = cellAt(e.clientX, e.clientY);
      if (!selectedRegionId) { setNotice(lang === "pt" ? "Crie ou selecione uma região no painel." : "Select a region first."); return; }
      if (c) { const region = data.regions.find(q => q.id === selectedRegionId); if (!region) { setNotice("Selecione uma região primeiro."); return; } const cells = [...strokeCells([c[0] + 0.5, c[1] + 0.5], [c[0] + 0.5, c[1] + 0.5], brushSize - 1)].filter(key => data.tiles[key] === region.nationId); if (!cells.length) { setNotice(lang === "pt" ? "Pinte primeiro o território da nação desta região." : "Paint this nation territory first."); return; } const assigned = new Set(cells); setData(d => ({ ...d, regions: d.regions.map(q => q.id === selectedRegionId ? { ...q, cells: [...new Set([...q.cells, ...cells])] } : { ...q, cells: q.cells.filter(cell => !assigned.has(cell)) }) })); }
    } else if (tool === "pintar" || tool === "apagar") {
      if (tool === "pintar" && !brush) { setPanelOpen(true); setNotice(data.nations.length ? t.pickNation : t.createFirst); return; }
      drag.current = { mode: "paint", sx: 0, sy: 0, vx: 0, vy: 0 }; paint(e.clientX, e.clientY);
    } else if (tool === "balde") {
      if (!brush) { setPanelOpen(true); setNotice(data.nations.length ? t.pickNation : t.createFirst); return; }
      const c = cellAt(e.clientX, e.clientY);
      if (c) {
        setData(d => { const tiles = floodFill(c[0], c[1], brush, d.tiles); return { ...d, tiles, regions: d.regions.map(region => ({ ...region, cells: region.cells.filter(cell => tiles[cell] === region.nationId) })) }; });
      }
    } else if (tool === "capital" || tool === "cidade" || tool === "forte" || tool === "porto") {
      const m: Marker = { id: uid(), type: tool, x: wx, y: wy, name: t.newMarker, notes: "", npcs: 100, grossIncome: 50, expenses: 20, production: "" };
      setData(d => ({ ...d, markers: [...d.markers, m] })); setSel({ kind: "marker", id: m.id });
    } else {
      setDraft(p => [...p, [wx, wy]]);
    }
  };
  const onMove = (e: React.PointerEvent) => {
    const [wx, wy] = toWorld(e.clientX, e.clientY);
    setCursorPos({ x: (Math.floor(wx / CELL) + 0.5) * CELL, y: (Math.floor(wy / CELL) + 0.5) * CELL });
    const d = drag.current; if (!d) return;
    if (d.mode === "pan") setView(v => ({ ...v, x: d.vx + e.clientX - d.sx, y: d.vy + e.clientY - d.sy }));
    else if (d.mode === "paint") paint(e.clientX, e.clientY);
  };
  const finishLine = () => {
    if (draft.length >= 2 && (tool === "estrada" || tool === "rota")) {
      const l: Line = { id: uid(), type: tool, points: draft };
      setData(d => ({ ...d, lines: [...d.lines, l] })); setSel({ kind: "line", id: l.id });
    }
    setDraft([]);
  };

  const addNation = () => {
    const n: Nation = { id: uid(), name: t.newNationName, color: `hsl(${Math.floor(Math.random() * 360)} 55% 50%)`, relation: data.nations.length ? "neutra" : "propria", ruler: "", treaties: "", notes: "" };
    setData(d => ({ ...d, nations: [...d.nations, n] })); setBrush(n.id); setSel({ kind: "nation", id: n.id }); setTool("pintar"); setNotice("");
  };
  const upNation = (id: string, p: Partial<Nation>) => {
    const current = data.nations.find(n => n.id === id); if (!current) return;
    const overlord = Object.prototype.hasOwnProperty.call(p, "overlordId") ? p.overlordId : current.overlordId;
    if (overlord === id) { setNotice("Uma nação não pode ser vassala de si mesma."); return; }
    if (overlord) { let cursor: string | undefined = overlord; const seen = new Set<string>([id]); while (cursor) { if (seen.has(cursor)) { setNotice("Essa relação criaria um ciclo de vassalagem."); return; } seen.add(cursor); cursor = data.nations.find(n => n.id === cursor)?.overlordId; } }
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

  const exportJson = () => {
    const name = window.prompt(lang === "pt" ? "Nome do mapa:" : "Map name:", mapName); if (name === null) return;
    const description = window.prompt(lang === "pt" ? "Descrição / observações:" : "Description / notes:", mapDescription); if (description === null) return;
    const requestedFile = window.prompt(lang === "pt" ? "Nome do arquivo (sem .json):" : "File name (without .json):", name || "meu-mundo"); if (requestedFile === null) return;
    const now = new Date().toISOString(); const snapshot: MapVersion = { id: uid(), name: name.trim() || "Meu mundo", description: description.trim(), createdAt: now, data: JSON.parse(JSON.stringify(data)) as Data };
    const nextVersions = [...versions, snapshot].slice(-30); setMapName(snapshot.name); setMapDescription(snapshot.description); setVersions(nextVersions);
    const payload = { format: "worldforge-map", version: 3, metadata: { name: snapshot.name, description: snapshot.description, updatedAt: now }, map: data, versions: nextVersions };
    const safe = (requestedFile.trim() || snapshot.name).replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "meu-mundo";
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })); const a = document.createElement("a"); a.href = url; a.download = `${safe}.json`; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(lang === "pt" ? "Mapa e histórico exportados em JSON." : "Map and history exported as JSON.");
  };
  const restoreVersion = (version: MapVersion) => { if (!window.confirm(`Restaurar "${version.name}"?`)) return; setData(readMap(version.data)); setMapName(version.name); setMapDescription(version.description); setNotice("Versão restaurada."); };
  const importJson = async (f?: File) => {
    if (!f) return;
    try {
      const parsed = JSON.parse(await f.text()) as Record<string, unknown>;
      const next = readMap(parsed["map"] ?? parsed);
      if (!confirm(t.confirmImport)) return;
      const meta = parsed["metadata"] as { name?: string; description?: string } | undefined;
      setData(next); if (typeof meta?.name === "string") setMapName(meta.name); if (typeof meta?.description === "string") setMapDescription(meta.description);
      if (Array.isArray(parsed["versions"])) setVersions(parsed["versions"] as MapVersion[]);
      setSel(null); setBrush(null); setDraft([]); setFilter("todas"); setSelectedRegionId(""); fitMap();
      setNotice(t.imported);
    } catch { setNotice(t.invalidFile); }
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

  return (
    <div ref={appRef} className={`atlas-app relative flex w-full overflow-hidden bg-background text-foreground ${fullscreen ? "atlas-fullscreen" : ""}`}>
      <input ref={importRef} type="file" accept=".json,application/json" hidden onChange={e => { void importJson(e.target.files?.[0]); e.target.value = ""; }} />
      <aside className={`map-tools-panel flex shrink-0 flex-col gap-4 overflow-y-auto border-r border-border bg-card p-4 ${panelOpen ? "" : "panel-closed"}`}>
        <div className="flex items-center justify-between gap-2"><h1 className="font-display text-2xl leading-none text-primary">{t.appName}</h1><Button size="icon" variant="ghost" className="min-[901px]:hidden" aria-label={t.close} onClick={() => setPanelOpen(false)}><X /></Button></div>
        <section>
          <h2 className="label">{t.tools}</h2>
          <div className="grid gap-1">
            {TOOLS.map(id => (
              <Button variant="ghost" key={id} onClick={() => { setTool(id); setDraft([]); if ((id === "pintar" || id === "balde") && !brush) { const first = visibleNations[0] ?? data.nations[0]; if (first) setBrush(first.id); else setNotice(t.createFirst); } }}
                className={`justify-start rounded px-2 py-1 text-left text-sm transition ${tool === id ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}>{({ comentario: "Comentário fixado", regiao: "Editar regiões" } as Record<string, string>)[id] ?? (t as Record<string, string>)[id]}</Button>
            ))}
          </div>
          {(tool === "pintar" || tool === "apagar" || tool === "regiao") && <div className="mt-3"><label htmlFor="brush-size" className="label">{t.brushSize} · {brushSize}</label><input id="brush-size" type="range" min={1} max={10} value={brushSize} onChange={e => setBrushSize(+e.target.value)} className="w-full" /></div>}
          <div className="mt-3 grid gap-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={data.smooth} onChange={e => setData(d => ({ ...d, smooth: e.target.checked }))} />{t.smooth}</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={data.showGrid} onChange={e => setData(d => ({ ...d, showGrid: e.target.checked }))} />{t.grid}</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={data.showRegions} onChange={e => setData(d => ({ ...d, showRegions: e.target.checked }))} />Mostrar fronteiras regionais</label></div>
          {(tool === "estrada" || tool === "rota") && <Button variant="outline" size="sm" className="mt-2 w-full" disabled={draft.length < 2} onClick={finishLine}>{t.finishLine}</Button>}
          {(tool === "pintar" || tool === "balde") && (brush && nationById(brush) ? <p className="mt-2 text-sm">{t.paintingWith}: <span style={{ color: nationById(brush)?.color }}>■</span> {nationById(brush)?.name}</p> : <div className="mt-2 grid gap-1"><p className="text-sm text-destructive">{data.nations.length ? t.pickNation : t.createFirst}</p>{!data.nations.length && <Button size="sm" onClick={addNation}>{t.createNation}</Button>}</div>)}
        </section>
        <section>
          <div className="mb-1 flex items-center justify-between"><h2 className="label !mb-0">{t.nations}</h2><Button variant="ghost" size="sm" onClick={addNation} className="text-sm text-primary hover:underline">{t.newNation}</Button></div>
          <label htmlFor="relation-filter" className="label">{t.filter}</label><select id="relation-filter" aria-label={t.filter} className="field mb-2" value={filter} onChange={e => { setFilter(e.target.value as typeof filter); setSel(null); }}><option value="todas">{t.allNations}</option>{RELS.map(r => <option key={r} value={r}>{REL[r]}</option>)}</select>
          {visibleNations.length === 0 && <p className="text-xs text-muted-foreground">{t.noNations}</p>}
          <div className="grid gap-1">
            {visibleNations.map(n => (
              <Button variant="ghost" key={n.id} onClick={() => { setBrush(n.id); setSel({ kind: "nation", id: n.id }); }}
                className={`h-auto min-h-9 flex-wrap items-center gap-2 rounded px-2 py-1 text-left text-sm ${brush === n.id ? "ring-1 ring-primary" : ""} hover:bg-accent`}>
                {n.flag && <img src={n.flag} alt={`${t.flag} ${n.name}`} className="h-4 w-6 object-contain" />}<span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: n.color }} />
                <span className="flex-1 truncate">{n.name}</span>
                <span className={`rel-${n.relation} text-xs uppercase`}>{REL[n.relation]}</span>
              </Button>
            ))}
          </div>
        </section>
        <section>
          <div className="mb-2 flex items-center justify-between"><h2 className="label !mb-0">Regiões</h2><Button size="sm" variant="outline" onClick={() => { const name = window.prompt("Nome da região:"); if (!name?.trim()) return; const owner = selNation ?? data.nations[0]; if (!owner) { setNotice("Crie uma nação antes de criar regiões."); return; } const region: Region = { id: uid(), name: name.trim(), nationId: owner.id, color: owner.color, cells: [] }; setData(d => ({ ...d, regions: [...d.regions, region] })); setSelectedRegionId(region.id); setTool("regiao"); }}><Plus className="h-3 w-3" />Nova região</Button></div>
          <p className="mb-2 text-xs text-muted-foreground">Selecione uma região e clique nas células da nação para atribuí-las.</p>
          <select className="field mb-2" value={selectedRegionId} onChange={e => setSelectedRegionId(e.target.value)}><option value="">Todas as regiões</option>{data.regions.map(q => <option key={q.id} value={q.id}>{q.name} — {nationById(q.nationId)?.name ?? "?"}</option>)}</select>
          {data.regions.map(q => <div key={q.id} className="mb-1 flex items-center gap-1 text-xs"><span className="h-3 w-3 rounded-sm" style={{ background: q.color }} /><button className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => { setSelectedRegionId(q.id); setTool("regiao"); }}>{q.name} ({q.cells.length})</button><button onClick={() => { const n = window.prompt("Novo nome:", q.name); if (n?.trim()) setData(d => ({ ...d, regions: d.regions.map(v => v.id === q.id ? { ...v, name: n.trim() } : v) })); }}>✎</button><button onClick={() => { if (confirm("Excluir região?")) { setData(d => ({ ...d, regions: d.regions.filter(v => v.id !== q.id) })); if (selectedRegionId === q.id) setSelectedRegionId(""); } }}>×</button></div>)}
        </section>
        <section>
          <h2 className="label">{t.bgMap}</h2>
          <input type="file" aria-label={t.bgImage} accept="image/*" onChange={e => onBg(e.target.files?.[0])} className="w-full text-xs" />
          {data.bg && <>
            <label className="mt-2 block text-xs">{t.opacity}</label>
            <input type="range" min={0} max={1} step={0.05} value={data.bgOpacity} onChange={e => setData(d => ({ ...d, bgOpacity: +e.target.value }))} className="w-full" />
            <label htmlFor="bg-fit" className="label mt-2">{t.fit}</label><select id="bg-fit" className="field" value={data.bgFit} onChange={e => setData(d => ({ ...d, bgFit: e.target.value as Data["bgFit"] }))}><option value="contain">{t.fitContain}</option><option value="cover">{t.fitCover}</option><option value="stretch">{t.fitStretch}</option></select>
            {([{ key: "bgScale", label: t.scale, min: 0.2, max: 3, step: 0.05 }, { key: "bgX", label: t.posX, min: -W, max: W, step: 20 }, { key: "bgY", label: t.posY, min: -H, max: H, step: 20 }, { key: "bgRotation", label: t.rotation, min: -180, max: 180, step: 1 }] as const).map(c => <div key={c.key}><label htmlFor={c.key} className="label mt-2">{c.label} · {data[c.key]}</label><input id={c.key} className="w-full" type="range" min={c.min} max={c.max} step={c.step} value={data[c.key]} onChange={e => setData(d => ({ ...d, [c.key]: +e.target.value }))} /></div>)}
            <div className="mt-2 flex gap-1"><Button variant="outline" size="sm" onClick={() => setData(d => ({ ...d, bgFit: "contain", bgScale: 1, bgX: 0, bgY: 0, bgRotation: 0, bgOpacity: 0.6 }))}><RotateCcw />{t.reset}</Button><Button variant="ghost" size="icon" aria-label={t.removeBg} title={t.removeBg} className="text-destructive" onClick={() => setData(d => ({ ...d, bg: null }))}><Trash2 /></Button></div>
          </>}
        </section>
        <section className="mt-auto grid gap-1 text-sm">
          <Button variant="outline" onClick={exportJson} className="rounded border border-border px-2 py-1 hover:bg-accent"><Download />Salvar mapa / versões</Button>
          <Button variant="outline" onClick={() => { if (!versions.length) { alert("Nenhuma versão salva ainda. Salve o mapa para criar a primeira."); return; } const list = [...versions].reverse(); alert(list.map((v, i) => `${i + 1}. ${v.name} — ${new Date(v.createdAt).toLocaleString()}`).join("\n")); const choice = Number(prompt("Número da versão para restaurar (Cancelar para sair):")); if (Number.isInteger(choice) && choice >= 1 && choice <= list.length) restoreVersion(list[choice - 1]); }}><History className="h-4 w-4" />Histórico de versões</Button>
          <Button variant="outline" onClick={() => importRef.current?.click()}><Upload />{t.importWorld}</Button>
          <Button variant="ghost" onClick={() => { if (confirm(t.confirmClear)) { setData(empty); setSel(null); setBrush(null); setDraft([]); } }} className="text-xs text-destructive">{t.clearMap}</Button>
        </section>
      </aside>

      <div ref={ref} aria-label={t.mapLabel} className="relative min-w-0 flex-1 touch-none select-none overflow-hidden bg-muted"
        style={{ cursor: tool === "mover" ? "grab" : "crosshair" }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={stopDrag} onPointerCancel={stopDrag} onLostPointerCapture={stopDrag} onPointerLeave={() => setCursorPos(null)}
        onDoubleClick={finishLine} onContextMenu={e => e.preventDefault()}>
        <svg className="absolute left-0 top-0 overflow-visible" width={W} height={H}
          style={{ transform: `translate(${view.x}px,${view.y}px) scale(${view.z})`, transformOrigin: "0 0" }}>
          <rect width={W} height={H} className="fill-background" />
          <defs><clipPath id="map-bounds"><rect width={W} height={H} /></clipPath></defs>
          {data.bg && <g clipPath="url(#map-bounds)"><image href={data.bg} width={W} height={H} preserveAspectRatio={data.bgFit === "stretch" ? "none" : data.bgFit === "cover" ? "xMidYMid slice" : "xMidYMid meet"} opacity={data.bgOpacity} transform={`translate(${data.bgX + W / 2},${data.bgY + H / 2}) rotate(${data.bgRotation}) scale(${data.bgScale}) translate(${-W / 2},${-H / 2})`} pointerEvents="none" /></g>}
          <defs><pattern id="g" width={CELL} height={CELL} patternUnits="userSpaceOnUse"><path d={`M${CELL} 0H0V${CELL}`} fill="none" className="stroke-border" strokeWidth={0.5} /></pattern></defs>
          {territories.filter(t => filter === "todas" || t.nation.relation === filter).map(t => <path key={t.nation.id} data-territory={t.nation.id} d={t.path} fill={t.nation.color} fillRule="evenodd" opacity={selNation?.id === t.nation.id ? 0.85 : 0.6} />)}
          {data.showGrid && <rect width={W} height={H} fill="url(#g)" pointerEvents="none" />}
          {data.showRegions && data.regions.filter(q => !selectedRegionId || q.id === selectedRegionId).map(q => q.cells.map(key => { const [x, y] = key.split(",").map(Number); return <rect key={`${q.id}-${key}`} x={x * CELL} y={y * CELL} width={CELL} height={CELL} fill={q.color} fillOpacity={0.18} stroke={q.color} strokeWidth={0.7} pointerEvents="none" />; }))}
          {data.comments.map(comment => <g key={comment.id} transform={`translate(${comment.x},${comment.y})`} style={{ cursor: "pointer" }} onPointerDown={e => { if (tool === "mover") { e.stopPropagation(); const next = prompt("Editar comentário (vazio exclui):", comment.text); if (next === null) return; if (!next.trim()) setData(d => ({ ...d, comments: d.comments.filter(c => c.id !== comment.id) })); else setData(d => ({ ...d, comments: d.comments.map(c => c.id === comment.id ? { ...c, text: next.trim() } : c) })); } }}><circle r={8} fill="#f59e0b" stroke="#78350f" strokeWidth={1.5} /><text textAnchor="middle" dy="0.32em" fontSize={10} fill="#111827">!</text><title>{comment.text}</title></g>)}
          {data.lines.map(l => (
            <polyline key={l.id} points={l.points.map(p => p.join(",")).join(" ")} fill="none"
              className={l.type === "estrada" ? "stroke-foreground" : "stroke-chart-3"} strokeWidth={selLine?.id === l.id ? 5 : 3}
              strokeDasharray={l.type === "rota" ? "8 6" : undefined} strokeLinecap="round" strokeLinejoin="round"
              onPointerDown={e => { if (tool === "mover") { e.stopPropagation(); setSel({ kind: "line", id: l.id }); } else if (tool === "apagar") { e.stopPropagation(); setData(d => ({ ...d, lines: d.lines.filter(x => x.id !== l.id) })); } }} style={{ cursor: "pointer" }} />
          ))}
          {draft.length > 0 && <polyline points={draft.map(p => p.join(",")).join(" ")} fill="none" className="stroke-primary" strokeWidth={2} strokeDasharray="4 4" />}
          
          {/* Cidades e marcadores com Campo de Visão por aproximação */}
          {data.markers.map(m => {
            const isCapital = m.type === "capital";
            // Capitais aparecem com zoom a partir de 0.35; outras cidades/portos/fortes só aparecem de perto (zoom >= 0.75)
            const isVisible = isCapital ? view.z >= 0.35 : view.z >= 0.75;
            if (!isVisible) return null;
            const r = isCapital ? 9 : 6;

            return (
              <g key={m.id} transform={`translate(${m.x},${m.y})`} style={{ cursor: "pointer" }}
                onPointerDown={e => { if (tool === "mover") { e.stopPropagation(); setSel({ kind: "marker", id: m.id }); } else if (tool === "apagar") { e.stopPropagation(); setData(d => ({ ...d, markers: d.markers.filter(x => x.id !== m.id) })); } }}>
                <circle r={r} className={selMarker?.id === m.id ? "fill-primary" : "fill-card stroke-foreground"} strokeWidth={1.5} />
                <text textAnchor="middle" dy="0.32em" fontSize={isCapital ? 10 : 7} className="fill-foreground font-bold">{ICON[m.type]}</text>
                <text y={isCapital ? 18 : 14} textAnchor="middle" fontSize={isCapital ? 12 : 10} className="fill-foreground font-display" paintOrder="stroke" stroke="var(--background)" strokeWidth={3}>{m.name}</text>
              </g>
            );
          })}

          {/* Nomes dos países com tamanho dinâmico pelo território e limite de zoom */}
          {territories.filter(t => filter === "todas" || t.nation.relation === filter).map(({ nation: n, keys: ks }) => {
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
          <Button variant="ghost" size="icon" className="min-[901px]:hidden" aria-label={t.tools} title={t.tools} onClick={() => setPanelOpen(v => !v)}><Menu /></Button>
          <Button variant="ghost" size="icon" disabled={!canUndo} aria-label={t.undo} title={t.undo} onClick={handleUndo}><Undo className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" disabled={!canRedo} aria-label={t.redo} title={t.redo} onClick={handleRedo}><Redo className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" aria-label={t.zoomOut} title={t.zoomOut} onClick={() => zoom(0.8)}><Minus /></Button>
          <Button variant="ghost" size="icon" aria-label={t.zoomIn} title={t.zoomIn} onClick={() => zoom(1.25)}><Plus /></Button>
          <Button variant="ghost" size="icon" aria-label={t.fitMap} title={t.fitMap} onClick={fitMap}><Scan /></Button>
          <Button variant="ghost" size="icon" aria-label={dark ? t.light : t.dark} title={dark ? t.light : t.dark} onClick={() => setDark(v => !v)}>{dark ? <Sun /> : <Moon />}</Button>
          <Button variant="ghost" size="icon" aria-label={fullscreen ? t.exitFullscreen : t.fullscreen} title={fullscreen ? t.exitFullscreen : t.fullscreen} onClick={() => void toggleFullscreen()}>{fullscreen ? <Minimize /> : <Maximize />}</Button>
          <Button variant="ghost" size="icon" aria-label={t.settings} title={t.settings} onClick={() => setSettingsOpen(v => !v)}><Settings /></Button>
        </div>
        <div className="pointer-events-none absolute bottom-3 left-3 rounded border border-border bg-card px-2 py-1 text-xs text-muted-foreground">{Math.round(view.z * 100)}% · {t[tool]}</div>
        {settingsOpen && <div role="dialog" aria-label={t.settings} className="absolute right-3 top-16 z-30 w-64 rounded border border-border bg-card p-4 shadow-lg" onPointerDown={e => e.stopPropagation()}><div className="mb-2 flex items-center justify-between"><h2 className="font-display text-xl">{t.settings}</h2><Button variant="ghost" size="icon" aria-label={t.close} onClick={() => setSettingsOpen(false)}><X /></Button></div><label htmlFor="lang" className="label">{t.language}</label><select id="lang" className="field" value={lang} onChange={e => setLang(e.target.value as Lang)}>{LANGS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}</select></div>}
        {notice && <div role="status" className="absolute bottom-12 left-3 right-3 flex items-center justify-between gap-2 rounded border border-border bg-card p-3 text-sm" onPointerDown={e => e.stopPropagation()}>{notice}<Button variant="ghost" size="icon" aria-label={t.close} onClick={() => setNotice("")}><X /></Button></div>}
      </div>

      {(selNation || selMarker || selLine) && (
        <aside className="map-details-panel shrink-0 overflow-y-auto border-l border-border bg-card p-4">
          <div className="mb-3 flex justify-end"><Button variant="ghost" size="icon" aria-label={t.close} onClick={() => setSel(null)} className="text-muted-foreground"><X /></Button></div>
          {selNation && <div className="grid gap-3">
            <input aria-label={t.nationName} value={selNation.name} onChange={e => upNation(selNation.id, { name: e.target.value })} className="field font-display text-xl" />
            <div className="flex items-center gap-2"><label className="label !mb-0">{t.color}</label>
              <input type="color" value={toHex(selNation.color)} onChange={e => upNation(selNation.id, { color: e.target.value })} />
              <span className="text-xs text-muted-foreground">{tileCount(selNation.id)} {t.territories}</span></div>
            <div><label className="label">{t.flag}</label>{selNation.flag && <div className="mb-2 flex items-center gap-3"><img src={selNation.flag} alt={`${t.flag} ${selNation.name}`} className="h-16 w-24 border border-border object-contain" /><Button variant="ghost" size="icon" aria-label={t.removeFlag} onClick={() => upNation(selNation.id, { flag: undefined })}><Trash2 /></Button></div>}
              <label className="inline-flex cursor-pointer items-center gap-2 rounded border border-border bg-accent px-3 py-1 text-sm"><Upload className="h-4 w-4" />{t.uploadFlag}<input aria-label={t.uploadFlag} type="file" accept="image/*" hidden onChange={e => { onImage(e.target.files?.[0], flag => upNation(selNation.id, { flag }), 400); e.target.value = ""; }} /></label>
              <div className="mt-2 flex gap-1"><input aria-label={t.flagUrl} placeholder={t.flagUrl} value={flagUrl} onChange={e => setFlagUrl(e.target.value)} className="field" /><Button size="sm" variant="outline" disabled={!/^https:\/\//.test(flagUrl.trim())} onClick={() => { upNation(selNation.id, { flag: flagUrl.trim() }); setFlagUrl(""); }}>OK</Button></div></div>
            <div><label className="label">{t.relation}</label>
              <div className="grid grid-cols-2 gap-1">{RELS.map(r => (
                <Button variant="outline" size="sm" key={r} onClick={() => upNation(selNation.id, { relation: r })} className={`rounded border px-2 py-1 text-xs rel-${r} ${selNation.relation === r ? "border-current font-bold" : "border-border"}`}>{REL[r]}</Button>))}</div></div>
            <div><label className="label">{t.ruler}</label><input value={selNation.ruler} onChange={e => upNation(selNation.id, { ruler: e.target.value })} className="field" /></div>
            <div><label className="label">Suserano / nação superior</label><select className="field" value={selNation.overlordId ?? ""} onChange={e => upNation(selNation.id, { overlordId: e.target.value || undefined })}><option value="">Nenhum (independente)</option>{data.nations.filter(n => n.id !== selNation.id).map(n => <option key={n.id} value={n.id}>{n.name}</option>)}</select><p className="mt-1 text-xs text-muted-foreground">Vassalos: {data.nations.filter(n => n.overlordId === selNation.id).map(n => n.name).join(", ") || "nenhum"}</p></div>
            <div><label className="label">{t.treaties}</label><textarea rows={4} value={selNation.treaties} onChange={e => upNation(selNation.id, { treaties: e.target.value })} className="field" /></div>
            <div><label className="label">{t.notes}</label><textarea rows={6} value={selNation.notes} onChange={e => upNation(selNation.id, { notes: e.target.value })} className="field" /></div>
            <Button onClick={() => { setBrush(selNation.id); setTool("pintar"); setSel(null); setPanelOpen(false); }} className="h-auto whitespace-normal rounded bg-primary px-2 py-2 text-sm text-primary-foreground">{t.paintThis}</Button>
            <Button variant="ghost" onClick={() => { if (!confirm(t.confirmDeleteNation)) return; setData(d => ({ ...d, nations: d.nations.filter(n => n.id !== selNation.id).map(n => n.overlordId === selNation.id ? { ...n, overlordId: undefined } : n), tiles: Object.fromEntries(Object.entries(d.tiles).filter(([, v]) => v !== selNation.id)), regions: d.regions.filter(r => r.nationId !== selNation.id) })); setSel(null); }} className="text-sm text-destructive">{t.deleteNation}</Button>
          </div>}

          {/* Detalhes expandidos para Cidades, Capitais, Fortes e Portos */}
          {selMarker && <div className="grid gap-3">
            <span className="label">{ICON[selMarker.type]} {t[`m_${selMarker.type}`]}</span>
            <input value={selMarker.name} onChange={e => upMarker(selMarker.id, { name: e.target.value })} className="field font-display text-xl" />
            <select value={selMarker.type} onChange={e => upMarker(selMarker.id, { type: e.target.value as MarkerType })} className="field">
              {(Object.keys(ICON) as MarkerType[]).map(k => <option key={k} value={k}>{t[`m_${k}`]}</option>)}</select>

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
                <Upload className="h-4 w-4" />{t.uploadPhoto}
                <input type="file" accept="image/*" hidden onChange={e => { onImage(e.target.files?.[0], photo => upMarker(selMarker.id, { photo }), 600); e.target.value = ""; }} />
              </label>
              <div className="mt-2 flex gap-1">
                <input placeholder={t.photoUrl} value={markerPhotoUrl} onChange={e => setMarkerPhotoUrl(e.target.value)} className="field text-xs" />
                <Button size="sm" variant="outline" disabled={!/^https:\/\//.test(markerPhotoUrl.trim())} onClick={() => { upMarker(selMarker.id, { photo: markerPhotoUrl.trim() }); setMarkerPhotoUrl(""); }}>OK</Button>
              </div>
            </div>

            {/* População e Economia em Esmeraldas */}
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
          </div>}

          {selLine && <div className="grid gap-3">
            <span className="label">{t[`l_${selLine.type}`]} · {selLine.points.length} {t.points}</span>
            <Button variant="ghost" onClick={() => { setData(d => ({ ...d, lines: d.lines.filter(m => m.id !== selLine.id) })); setSel(null); }} className="text-sm text-destructive">{t.deleteLine}</Button>
          </div>}
        </aside>
      )}
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
  const oldCell = typeof d["cellSize"] === "number" ? d["cellSize"] : 20;
  const factor = Math.max(1, Math.round(oldCell / CELL));
  const nations: Nation[] = d["nations"].map((n: Nation) => {
    if (!n || typeof n.id !== "string" || !n.id || typeof n.name !== "string" || !RELS.includes(n.relation)) throw new Error("Invalid nation");
    return { id: n.id, name: n.name, color: /^#[0-9a-f]{6}$/i.test(n.color) || /^hsl\(\d+\s+\d+%\s+\d+%\)$/.test(n.color) ? n.color : "#888888", relation: n.relation, ruler: text(n.ruler), treaties: text(n.treaties), notes: text(n.notes), flag: flagImage(n.flag), overlordId: typeof n.overlordId === "string" && n.overlordId !== n.id ? n.overlordId : undefined };
  });
  if (new Set(nations.map(n => n.id)).size !== nations.length) throw new Error("Duplicate nation");
  const ids = new Set(nations.map(n => n.id));
  const tiles: Record<string, string> = {};
  for (const [key, id] of Object.entries(expandTiles(d["tiles"] as Record<string, string>, factor))) {
    if (!/^\d+,\d+$/.test(key) || typeof id !== "string" || !ids.has(id)) throw new Error("Invalid territory");
    const [x = 0, y = 0] = key.split(",").map(Number);
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
  const comments: MapComment[] = Array.isArray(d["comments"]) ? (d["comments"] as MapComment[]).filter(c => c && typeof c.id === "string" && Number.isFinite(c.x) && Number.isFinite(c.y) && typeof c.text === "string").map(c => ({ id: c.id, x: c.x, y: c.y, text: c.text, createdAt: typeof c.createdAt === "string" ? c.createdAt : new Date().toISOString() })) : [];
  const regions: Region[] = Array.isArray(d["regions"]) ? (d["regions"] as Region[]).filter(q => q && typeof q.id === "string" && typeof q.name === "string" && ids.has(q.nationId) && Array.isArray(q.cells)).map(q => ({ id: q.id, name: q.name, nationId: q.nationId, color: typeof q.color === "string" ? q.color : nations.find(n => n.id === q.nationId)?.color ?? "#888888", cells: [...new Set(q.cells.filter((cell: unknown) => typeof cell === "string" && /^\d+,\d+$/.test(cell) && !!tiles[cell] && tiles[cell] === q.nationId))] })) : [];
  const validNationIds = new Set(nations.map(n => n.id)); for (const nation of nations) if (nation.overlordId && !validNationIds.has(nation.overlordId)) nation.overlordId = undefined;
  for (const nation of nations) { let cursor = nation.overlordId; const seen = new Set([nation.id]); while (cursor) { if (seen.has(cursor)) { nation.overlordId = undefined; break; } seen.add(cursor); cursor = nations.find(n => n.id === cursor)?.overlordId; } }
  return { ...empty, cellSize: CELL, nations, tiles, markers, lines, comments, regions, showRegions: typeof d["showRegions"] === "boolean" ? d["showRegions"] : true, bg: image(d["bg"]) ?? null,
    bgOpacity: finite(d["bgOpacity"], 0.6, 0, 1), bgFit: d["bgFit"] === "cover" || d["bgFit"] === "stretch" ? d["bgFit"] : "contain",
    bgScale: finite(d["bgScale"], 1, 0.2, 3), bgX: finite(d["bgX"], 0, -W, W), bgY: finite(d["bgY"], 0, -H, H), bgRotation: finite(d["bgRotation"], 0, -180, 180),
    smooth: typeof d["smooth"] === "boolean" ? d["smooth"] : true, showGrid: typeof d["showGrid"] === "boolean" ? d["showGrid"] : true };
}
