import { useEffect, useRef, useState, useCallback, useMemo } from "react";

import { Button } from "@/components/ui/button";
import { Moon, Sun, Maximize, Minimize, Menu, X, Plus, Minus, Scan, Download, Upload, RotateCcw, Trash2 } from "lucide-react";
import { strokeCells, territoryPath } from "@/lib/map-tools";

type Relation = "propria" | "aliada" | "neutra" | "inimiga";
type Nation = { id: string; name: string; color: string; relation: Relation; ruler: string; treaties: string; notes: string; flag?: string | undefined };
type MarkerType = "capital" | "cidade" | "forte" | "porto";
type Marker = { id: string; type: MarkerType; x: number; y: number; name: string; notes: string };
type LineType = "estrada" | "rota";
type Line = { id: string; type: LineType; points: [number, number][] };
type Data = { nations: Nation[]; tiles: Record<string, string>; markers: Marker[]; lines: Line[]; bg: string | null; bgOpacity: number; bgFit: "contain" | "cover" | "stretch"; bgScale: number; bgX: number; bgY: number; bgRotation: number; smooth: boolean; showGrid: boolean };
type Tool = "mover" | "pintar" | "apagar" | MarkerType | LineType;

const COLS = 120, ROWS = 80, CELL = 20, W = COLS * CELL, H = ROWS * CELL;
const KEY = "atlas-nacoes-v1";
const uid = () => Math.random().toString(36).slice(2, 9);
const empty: Data = { nations: [], tiles: {}, markers: [], lines: [], bg: null, bgOpacity: 0.6, bgFit: "contain", bgScale: 1, bgX: 0, bgY: 0, bgRotation: 0, smooth: true, showGrid: true };
const REL: Record<Relation, string> = { propria: "Minha nação", aliada: "Aliada", neutra: "Neutra", inimiga: "Inimiga" };
const ICON: Record<MarkerType, string> = { capital: "★", cidade: "●", forte: "▲", porto: "⚓" };
const TOOLS: { id: Tool; label: string }[] = [
  { id: "mover", label: "✋ Mover / Selecionar" },
  { id: "pintar", label: "🖌 Pintar território" },
  { id: "apagar", label: "🧽 Apagar" },
  { id: "capital", label: "★ Capital" },
  { id: "cidade", label: "● Cidade" },
  { id: "forte", label: "▲ Forte" },
  { id: "porto", label: "⚓ Porto" },
  { id: "estrada", label: "━ Estrada" },
  { id: "rota", label: "┅ Rota marítima" },
];

type Sel = { kind: "nation"; id: string } | { kind: "marker"; id: string } | { kind: "line"; id: string } | null;

export default function MapApp() {
  const [data, setData] = useState<Data>(empty);
  const [dark, setDark] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [brushSize, setBrushSize] = useState(2);
  const [filter, setFilter] = useState<"todas" | Relation>("todas");
  const [notice, setNotice] = useState("");
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

  useEffect(() => {
    try { const s = localStorage.getItem(KEY); if (s) setData(readMap(JSON.parse(s))); setDark(localStorage.getItem("atlas-theme") === "dark"); } catch {}
    setLoaded(true);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    if (loaded) localStorage.setItem("atlas-theme", dark ? "dark" : "light");
  }, [dark, loaded]);
  useEffect(() => {
    const changed = () => { if (!document.fullscreenElement) { setFullscreen(false); screen.orientation?.unlock?.(); } };
    const keydown = (event: KeyboardEvent) => { if (event.key === "Escape") { setFullscreen(false); screen.orientation?.unlock?.(); } };
    document.addEventListener("fullscreenchange", changed);
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("fullscreenchange", changed); document.removeEventListener("keydown", keydown); };
  }, []);
  useEffect(() => { if (loaded) try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { alert("Armazenamento cheio (imagem de fundo muito grande?)"); } }, [data, loaded]);

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
    return x >= 0 && y >= 0 && x < COLS && y < ROWS ? `${x},${y}` : null;
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
      return { ...d, tiles };
    });
  }, [tool, brush, view, brushSize]);
  const stopDrag = () => { drag.current = null; lastPaint.current = null; };
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
      else setNotice("Gire o celular para usar o mapa em paisagem.");
    } catch { setNotice("Gire o celular para paisagem; a tela cheia depende do navegador."); }
  };

  const onDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    if (e.button === 1 || e.button === 2 || tool === "mover") {
      drag.current = { mode: "pan", sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
      if (tool === "mover" && e.button === 0) {
        const c = cellAt(e.clientX, e.clientY); const n = c && data.tiles[c];
        const nation = n ? nationById(n) : undefined;
        setSel(nation && (filter === "todas" || nation.relation === filter) ? { kind: "nation", id: nation.id } : null);
      }
      return;
    }
    const [wx, wy] = toWorld(e.clientX, e.clientY);
    if (tool === "pintar" || tool === "apagar") {
      if (tool === "pintar" && !brush) { alert("Crie/selecione uma nação para pintar."); return; }
      drag.current = { mode: "paint", sx: 0, sy: 0, vx: 0, vy: 0 }; paint(e.clientX, e.clientY);
    } else if (tool === "capital" || tool === "cidade" || tool === "forte" || tool === "porto") {
      const m: Marker = { id: uid(), type: tool, x: wx, y: wy, name: `Nova ${tool}`, notes: "" };
      setData(d => ({ ...d, markers: [...d.markers, m] })); setSel({ kind: "marker", id: m.id });
    } else {
      setDraft(p => [...p, [wx, wy]]);
    }
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return;
    if (d.mode === "pan") setView(v => ({ ...v, x: d.vx + e.clientX - d.sx, y: d.vy + e.clientY - d.sy }));
    else paint(e.clientX, e.clientY);
  };
  const finishLine = () => {
    if (draft.length >= 2 && (tool === "estrada" || tool === "rota")) {
      const l: Line = { id: uid(), type: tool, points: draft };
      setData(d => ({ ...d, lines: [...d.lines, l] })); setSel({ kind: "line", id: l.id });
    }
    setDraft([]);
  };

  const addNation = () => {
    const n: Nation = { id: uid(), name: "Nova nação", color: `hsl(${Math.floor(Math.random() * 360)} 55% 50%)`, relation: data.nations.length ? "neutra" : "propria", ruler: "", treaties: "", notes: "" };
    setData(d => ({ ...d, nations: [...d.nations, n] })); setBrush(n.id); setSel({ kind: "nation", id: n.id }); setTool("pintar");
  };
  const upNation = (id: string, p: Partial<Nation>) => setData(d => ({ ...d, nations: d.nations.map(n => n.id === id ? { ...n, ...p } : n) }));
  const upMarker = (id: string, p: Partial<Marker>) => setData(d => ({ ...d, markers: d.markers.map(n => n.id === id ? { ...n, ...p } : n) }));
  const nationById = (id: string) => data.nations.find(n => n.id === id);

  const onImage = (f: File | undefined, apply: (value: string) => void) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) { setNotice("Escolha uma imagem válida."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
        canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d"); if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        apply(canvas.toDataURL("image/webp", 0.85));
      };
      img.onerror = () => setNotice("Não foi possível abrir esta imagem.");
      img.src = reader.result;
    };
    reader.readAsDataURL(f);
  };
  const onBg = (f?: File) => onImage(f, bg => setData(d => ({ ...d, bg })));

  const exportJson = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ ...data, format: "atlas-nacoes", version: 2 }, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url;
    a.download = `meu-mundo-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("Cópia do mundo exportada com bandeiras e imagens.");
  };
  const importJson = async (f?: File) => {
    if (!f) return;
    try {
      const next = readMap(JSON.parse(await f.text()));
      if (!confirm("Importar este mundo substituirá o mapa atual. Deseja continuar?")) return;
      setData(next); setSel(null); setBrush(null); setDraft([]); setFilter("todas"); fitMap();
      setNotice("Mundo importado com sucesso.");
    } catch { setNotice("Arquivo inválido. Escolha uma cópia JSON exportada pelo Atlas."); }
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
        <div className="flex items-center justify-between gap-2"><h1 className="font-display text-2xl text-primary">Atlas das Nações</h1><Button size="icon" variant="ghost" className="min-[901px]:hidden" aria-label="Fechar ferramentas" onClick={() => setPanelOpen(false)}><X /></Button></div>
        <section>
          <h2 className="label">Ferramentas</h2>
          <div className="grid gap-1">
            {TOOLS.map(t => (
              <Button variant="ghost" key={t.id} onClick={() => { setTool(t.id); setDraft([]); }}
                className={`justify-start rounded px-2 py-1 text-left text-sm transition ${tool === t.id ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}>{t.label}</Button>
            ))}
          </div>
          {(tool === "pintar" || tool === "apagar") && <div className="mt-3"><label htmlFor="brush-size" className="label">Tamanho do pincel · {brushSize}</label><input id="brush-size" type="range" min={1} max={6} value={brushSize} onChange={e => setBrushSize(+e.target.value)} className="w-full" /></div>}
          <div className="mt-3 grid gap-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={data.smooth} onChange={e => setData(d => ({ ...d, smooth: e.target.checked }))} />Bordas suaves</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={data.showGrid} onChange={e => setData(d => ({ ...d, showGrid: e.target.checked }))} />Grade</label></div>
          {(tool === "estrada" || tool === "rota") && <Button variant="outline" size="sm" className="mt-2 w-full" disabled={draft.length < 2} onClick={finishLine}>Concluir traçado</Button>}
        </section>
        <section>
          <div className="mb-1 flex items-center justify-between"><h2 className="label !mb-0">Nações</h2><Button variant="ghost" size="sm" onClick={addNation} className="text-sm text-primary hover:underline">+ Nova</Button></div>
          <label htmlFor="relation-filter" className="label">Filtrar relações</label><select id="relation-filter" aria-label="Filtrar relações" className="field mb-2" value={filter} onChange={e => { setFilter(e.target.value as typeof filter); setSel(null); }}><option value="todas">Todas as nações</option>{(Object.keys(REL) as Relation[]).map(r => <option key={r} value={r}>{REL[r]}</option>)}</select>
          {visibleNations.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma nação.</p>}
          <div className="grid gap-1">
            {visibleNations.map(n => (
              <Button variant="ghost" key={n.id} onClick={() => { setBrush(n.id); setSel({ kind: "nation", id: n.id }); }}
                className={`h-auto min-h-9 flex-wrap items-center gap-2 rounded px-2 py-1 text-left text-sm ${brush === n.id ? "ring-1 ring-primary" : ""} hover:bg-accent`}>
                {n.flag && <img src={n.flag} alt={`Bandeira de ${n.name}`} className="h-4 w-6 object-contain" />}<span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: n.color }} />
                <span className="flex-1 truncate">{n.name}</span>
                <span className={`rel-${n.relation} text-xs uppercase`}>{REL[n.relation]}</span>
              </Button>
            ))}
          </div>
        </section>
        <section>
          <h2 className="label">Mapa de fundo</h2>
          <input type="file" aria-label="Imagem do mapa" accept="image/*" onChange={e => onBg(e.target.files?.[0])} className="w-full text-xs" />
          {data.bg && <>
            <label className="mt-2 block text-xs">Opacidade</label>
            <input type="range" min={0} max={1} step={0.05} value={data.bgOpacity} onChange={e => setData(d => ({ ...d, bgOpacity: +e.target.value }))} className="w-full" />
            <label htmlFor="bg-fit" className="label mt-2">Encaixe</label><select id="bg-fit" className="field" value={data.bgFit} onChange={e => setData(d => ({ ...d, bgFit: e.target.value as Data["bgFit"] }))}><option value="contain">Imagem inteira</option><option value="cover">Preencher mapa</option><option value="stretch">Esticar</option></select>
            {([{ key: "bgScale", label: "Escala", min: 0.2, max: 3, step: 0.05 }, { key: "bgX", label: "Posição horizontal", min: -W, max: W, step: 20 }, { key: "bgY", label: "Posição vertical", min: -H, max: H, step: 20 }, { key: "bgRotation", label: "Rotação", min: -180, max: 180, step: 1 }] as const).map(c => <div key={c.key}><label htmlFor={c.key} className="label mt-2">{c.label} · {data[c.key]}</label><input id={c.key} className="w-full" type="range" min={c.min} max={c.max} step={c.step} value={data[c.key]} onChange={e => setData(d => ({ ...d, [c.key]: +e.target.value }))} /></div>)}
            <div className="mt-2 flex gap-1"><Button variant="outline" size="sm" onClick={() => setData(d => ({ ...d, bgFit: "contain", bgScale: 1, bgX: 0, bgY: 0, bgRotation: 0, bgOpacity: 0.6 }))}><RotateCcw />Restaurar</Button><Button variant="ghost" size="icon" aria-label="Remover fundo" title="Remover fundo" className="text-destructive" onClick={() => setData(d => ({ ...d, bg: null }))}><Trash2 /></Button></div>
          </>}
        </section>
        <section className="mt-auto grid gap-1 text-sm">
          <Button variant="outline" onClick={exportJson} className="rounded border border-border px-2 py-1 hover:bg-accent"><Download />Exportar mundo</Button>
          <Button variant="outline" onClick={() => importRef.current?.click()}><Upload />Importar mundo</Button>
          <Button variant="ghost" onClick={() => { if (confirm("Apagar tudo?")) { setData(empty); setSel(null); setBrush(null); setDraft([]); } }} className="text-xs text-destructive">Limpar mapa</Button>
        </section>
      </aside>

      <div ref={ref} aria-label="Mapa de nações" className="relative min-w-0 flex-1 touch-none select-none overflow-hidden bg-muted"
        style={{ cursor: tool === "mover" ? "grab" : "crosshair" }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={stopDrag} onPointerCancel={stopDrag} onLostPointerCapture={stopDrag}
        onDoubleClick={finishLine} onContextMenu={e => e.preventDefault()}>
        <svg className="absolute left-0 top-0 overflow-visible" width={W} height={H}
          style={{ transform: `translate(${view.x}px,${view.y}px) scale(${view.z})`, transformOrigin: "0 0" }}>
          <rect width={W} height={H} className="fill-background" />
          <defs><clipPath id="map-bounds"><rect width={W} height={H} /></clipPath></defs>
          {data.bg && <g clipPath="url(#map-bounds)"><image href={data.bg} width={W} height={H} preserveAspectRatio={data.bgFit === "stretch" ? "none" : data.bgFit === "cover" ? "xMidYMid slice" : "xMidYMid meet"} opacity={data.bgOpacity} transform={`translate(${data.bgX + W / 2},${data.bgY + H / 2}) rotate(${data.bgRotation}) scale(${data.bgScale}) translate(${-W / 2},${-H / 2})`} pointerEvents="none" /></g>}
          <defs><pattern id="g" width={CELL} height={CELL} patternUnits="userSpaceOnUse"><path d={`M${CELL} 0H0V${CELL}`} fill="none" className="stroke-border" strokeWidth={0.5} /></pattern></defs>
          {territories.filter(t => filter === "todas" || t.nation.relation === filter).map(t => <path key={t.nation.id} data-territory={t.nation.id} d={t.path} fill={t.nation.color} fillRule="evenodd" opacity={selNation?.id === t.nation.id ? 0.85 : 0.6} />)}
          {data.showGrid && <rect width={W} height={H} fill="url(#g)" pointerEvents="none" />}
          {data.lines.map(l => (
            <polyline key={l.id} points={l.points.map(p => p.join(",")).join(" ")} fill="none"
              className={l.type === "estrada" ? "stroke-foreground" : "stroke-chart-3"} strokeWidth={selLine?.id === l.id ? 6 : 4}
              strokeDasharray={l.type === "rota" ? "12 8" : undefined} strokeLinecap="round" strokeLinejoin="round"
              onPointerDown={e => { if (tool === "mover") { e.stopPropagation(); setSel({ kind: "line", id: l.id }); } else if (tool === "apagar") { e.stopPropagation(); setData(d => ({ ...d, lines: d.lines.filter(x => x.id !== l.id) })); } }} style={{ cursor: "pointer" }} />
          ))}
          {draft.length > 0 && <polyline points={draft.map(p => p.join(",")).join(" ")} fill="none" className="stroke-primary" strokeWidth={3} strokeDasharray="4 4" />}
          {data.markers.map(m => (
            <g key={m.id} transform={`translate(${m.x},${m.y})`} style={{ cursor: "pointer" }}
              onPointerDown={e => { if (tool === "mover") { e.stopPropagation(); setSel({ kind: "marker", id: m.id }); } else if (tool === "apagar") { e.stopPropagation(); setData(d => ({ ...d, markers: d.markers.filter(x => x.id !== m.id) })); } }}>
              <circle r={m.type === "capital" ? 16 : 12} className={selMarker?.id === m.id ? "fill-primary" : "fill-card stroke-foreground"} strokeWidth={2} />
              <text textAnchor="middle" dy="0.35em" fontSize={m.type === "capital" ? 18 : 13} className="fill-foreground">{ICON[m.type]}</text>
              <text y={30} textAnchor="middle" fontSize={14} className="fill-foreground font-display" paintOrder="stroke" stroke="var(--background)" strokeWidth={4}>{m.name}</text>
            </g>
          ))}
          {territories.filter(t => filter === "todas" || t.nation.relation === filter).map(({ nation: n, keys: ks }) => { if (!ks.length) return null;
            let sx = 0, sy = 0; ks.forEach(k => { const [x = 0, y = 0] = k.split(",").map(Number); sx += x; sy += y; });
            const x = (sx / ks.length + 0.5) * CELL, y = (sy / ks.length + 0.5) * CELL;
            return <g key={n.id} pointerEvents="none">{n.flag && <image href={n.flag} x={x - 36} y={y - 65} width={72} height={44} preserveAspectRatio="xMidYMid meet" />}<text x={x} y={y} textAnchor="middle" fontSize={30} className="fill-foreground font-display uppercase" opacity={0.9} paintOrder="stroke" stroke="var(--background)" strokeWidth={3}>{n.name}</text></g>; })}
        </svg>
        <div className="map-toolbar" onPointerDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="min-[901px]:hidden" aria-label="Abrir ferramentas" title="Ferramentas" onClick={() => setPanelOpen(v => !v)}><Menu /></Button>
          <Button variant="ghost" size="icon" aria-label="Diminuir zoom" title="Diminuir zoom" onClick={() => zoom(0.8)}><Minus /></Button>
          <Button variant="ghost" size="icon" aria-label="Aumentar zoom" title="Aumentar zoom" onClick={() => zoom(1.25)}><Plus /></Button>
          <Button variant="ghost" size="icon" aria-label="Encaixar mapa" title="Encaixar mapa" onClick={fitMap}><Scan /></Button>
          <Button variant="ghost" size="icon" aria-label={dark ? "Modo claro" : "Modo escuro"} title={dark ? "Modo claro" : "Modo escuro"} onClick={() => setDark(v => !v)}>{dark ? <Sun /> : <Moon />}</Button>
          <Button variant="ghost" size="icon" aria-label={fullscreen ? "Sair da tela cheia" : "Tela cheia paisagem"} title={fullscreen ? "Sair da tela cheia" : "Tela cheia paisagem"} onClick={() => void toggleFullscreen()}>{fullscreen ? <Minimize /> : <Maximize />}</Button>
        </div>
        <div className="pointer-events-none absolute bottom-3 left-3 rounded border border-border bg-card px-2 py-1 text-xs text-muted-foreground">{Math.round(view.z * 100)}% · {TOOLS.find(t => t.id === tool)?.label}</div>
        {notice && <div role="status" className="absolute bottom-12 left-3 right-3 flex items-center justify-between gap-2 rounded border border-border bg-card p-3 text-sm" onPointerDown={e => e.stopPropagation()}>{notice}<Button variant="ghost" size="icon" aria-label="Fechar aviso" onClick={() => setNotice("")}><X /></Button></div>}
      </div>

      {(selNation || selMarker || selLine) && (
        <aside className="map-details-panel shrink-0 overflow-y-auto border-l border-border bg-card p-4">
          <div className="mb-3 flex justify-end"><Button variant="ghost" size="icon" aria-label="Fechar detalhes" onClick={() => setSel(null)} className="text-muted-foreground"><X /></Button></div>
          {selNation && <div className="grid gap-3">
            <input aria-label="Nome da nação" value={selNation.name} onChange={e => upNation(selNation.id, { name: e.target.value })} className="field font-display text-xl" />
            <div className="flex items-center gap-2"><label className="label !mb-0">Cor</label>
              <input type="color" value={toHex(selNation.color)} onChange={e => upNation(selNation.id, { color: e.target.value })} />
              <span className="text-xs text-muted-foreground">{tileCount(selNation.id)} territórios</span></div>
            <div><label className="label">Bandeira</label>{selNation.flag && <div className="mb-2 flex items-center gap-3"><img src={selNation.flag} alt={`Bandeira de ${selNation.name}`} className="h-16 w-24 object-contain" /><Button variant="ghost" size="icon" aria-label="Remover bandeira" onClick={() => upNation(selNation.id, { flag: undefined })}><Trash2 /></Button></div>}<input aria-label="Bandeira da nação" type="file" accept="image/*" className="w-full text-xs" onChange={e => onImage(e.target.files?.[0], flag => upNation(selNation.id, { flag }))} /></div>
            <div><label className="label">Relação</label>
              <div className="grid grid-cols-2 gap-1">{(Object.keys(REL) as Relation[]).map(r => (
                <Button variant="outline" size="sm" key={r} onClick={() => upNation(selNation.id, { relation: r })} className={`rounded border px-2 py-1 text-xs rel-${r} ${selNation.relation === r ? "border-current font-bold" : "border-border"}`}>{REL[r]}</Button>))}</div></div>
            <div><label className="label">Governante</label><input value={selNation.ruler} onChange={e => upNation(selNation.id, { ruler: e.target.value })} className="field" /></div>
            <div><label className="label">Tratados</label><textarea rows={4} value={selNation.treaties} onChange={e => upNation(selNation.id, { treaties: e.target.value })} className="field" /></div>
            <div><label className="label">Observações</label><textarea rows={6} value={selNation.notes} onChange={e => upNation(selNation.id, { notes: e.target.value })} className="field" /></div>
            <Button onClick={() => { setBrush(selNation.id); setTool("pintar"); setSel(null); setPanelOpen(false); }} className="h-auto whitespace-normal rounded bg-primary px-2 py-2 text-sm text-primary-foreground">Pintar território desta nação</Button>
            <Button variant="ghost" onClick={() => { if (!confirm("Excluir nação?")) return; setData(d => ({ ...d, nations: d.nations.filter(n => n.id !== selNation.id), tiles: Object.fromEntries(Object.entries(d.tiles).filter(([, v]) => v !== selNation.id)) })); setSel(null); }} className="text-sm text-destructive">Excluir nação</Button>
          </div>}
          {selMarker && <div className="grid gap-3">
            <span className="label">{ICON[selMarker.type]} {selMarker.type}</span>
            <input value={selMarker.name} onChange={e => upMarker(selMarker.id, { name: e.target.value })} className="field font-display text-xl" />
            <select value={selMarker.type} onChange={e => upMarker(selMarker.id, { type: e.target.value as MarkerType })} className="field">
              {(Object.keys(ICON) as MarkerType[]).map(t => <option key={t} value={t}>{t}</option>)}</select>
            <div><label className="label">Observações</label><textarea rows={6} value={selMarker.notes} onChange={e => upMarker(selMarker.id, { notes: e.target.value })} className="field" /></div>
            <Button variant="ghost" onClick={() => { setData(d => ({ ...d, markers: d.markers.filter(m => m.id !== selMarker.id) })); setSel(null); }} className="text-sm text-destructive">Excluir</Button>
          </div>}
          {selLine && <div className="grid gap-3">
            <span className="label">{selLine.type === "estrada" ? "Estrada" : "Rota marítima"} · {selLine.points.length} pontos</span>
            <Button variant="ghost" onClick={() => { setData(d => ({ ...d, lines: d.lines.filter(m => m.id !== selLine.id) })); setSel(null); }} className="text-sm text-destructive">Excluir traçado</Button>
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
  const finite = (value: unknown, fallback: number, min: number, max: number) => typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
  const image = (value: unknown) => typeof value === "string" && /^data:image\/(png|jpeg|webp|gif|avif);base64,/.test(value) ? value : undefined;
  const nations: Nation[] = d["nations"].map((n: Nation) => {
    if (!n || typeof n.id !== "string" || !n.id || typeof n.name !== "string" || !(n.relation in REL)) throw new Error("Invalid nation");
    return { id: n.id, name: n.name, color: /^#[0-9a-f]{6}$/i.test(n.color) || /^hsl\(\d+\s+\d+%\s+\d+%\)$/.test(n.color) ? n.color : "#888888", relation: n.relation, ruler: text(n.ruler), treaties: text(n.treaties), notes: text(n.notes), flag: image(n.flag) };
  });
  if (new Set(nations.map(n => n.id)).size !== nations.length) throw new Error("Duplicate nation");
  const ids = new Set(nations.map(n => n.id));
  const tiles: Record<string, string> = {};
  for (const [key, id] of Object.entries(d["tiles"])) {
    if (!/^\d+,\d+$/.test(key) || typeof id !== "string" || !ids.has(id)) throw new Error("Invalid territory");
    const [x = 0, y = 0] = key.split(",").map(Number);
    if (x >= COLS || y >= ROWS) throw new Error("Invalid cell");
    tiles[key] = id;
  }
  const markers: Marker[] = d["markers"].map((m: Marker) => {
    if (!m || typeof m.id !== "string" || !(m.type in ICON) || !Number.isFinite(m.x) || !Number.isFinite(m.y)) throw new Error("Invalid marker");
    return { id: m.id, type: m.type, x: m.x, y: m.y, name: text(m.name), notes: text(m.notes) };
  });
  const lines: Line[] = d["lines"].map((l: Line) => {
    if (!l || typeof l.id !== "string" || !["estrada", "rota"].includes(l.type) || !Array.isArray(l.points) || l.points.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite))) throw new Error("Invalid line");
    return { id: l.id, type: l.type, points: l.points };
  });
  return { ...empty, nations, tiles, markers, lines, bg: image(d["bg"]) ?? null,
    bgOpacity: finite(d["bgOpacity"], 0.6, 0, 1), bgFit: d["bgFit"] === "cover" || d["bgFit"] === "stretch" ? d["bgFit"] : "contain",
    bgScale: finite(d["bgScale"], 1, 0.2, 3), bgX: finite(d["bgX"], 0, -W, W), bgY: finite(d["bgY"], 0, -H, H), bgRotation: finite(d["bgRotation"], 0, -180, 180),
    smooth: typeof d["smooth"] === "boolean" ? d["smooth"] : true, showGrid: typeof d["showGrid"] === "boolean" ? d["showGrid"] : true };
}
