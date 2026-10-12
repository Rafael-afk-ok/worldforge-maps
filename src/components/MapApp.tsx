import { useEffect, useRef, useState, useCallback } from "react";

type Relation = "propria" | "aliada" | "neutra" | "inimiga";
type Nation = { id: string; name: string; color: string; relation: Relation; ruler: string; treaties: string; notes: string };
type MarkerType = "capital" | "cidade" | "forte" | "porto";
type Marker = { id: string; type: MarkerType; x: number; y: number; name: string; notes: string };
type LineType = "estrada" | "rota";
type Line = { id: string; type: LineType; points: [number, number][] };
type Data = { nations: Nation[]; tiles: Record<string, string>; markers: Marker[]; lines: Line[]; bg: string | null; bgOpacity: number };
type Tool = "mover" | "pintar" | "apagar" | MarkerType | LineType;

const COLS = 120, ROWS = 80, CELL = 20, W = COLS * CELL, H = ROWS * CELL;
const KEY = "atlas-nacoes-v1";
const uid = () => Math.random().toString(36).slice(2, 9);
const empty: Data = { nations: [], tiles: {}, markers: [], lines: [], bg: null, bgOpacity: 0.6 };
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
    try { const s = localStorage.getItem(KEY); if (s) setData({ ...empty, ...JSON.parse(s) }); } catch {}
    setLoaded(true);
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
    const r = ref.current!.getBoundingClientRect();
    return [(cx - r.left - view.x) / view.z, (cy - r.top - view.y) / view.z] as [number, number];
  };
  const cellAt = (cx: number, cy: number) => {
    const [wx, wy] = toWorld(cx, cy); const x = Math.floor(wx / CELL), y = Math.floor(wy / CELL);
    return x >= 0 && y >= 0 && x < COLS && y < ROWS ? `${x},${y}` : null;
  };
  const paint = useCallback((cx: number, cy: number) => {
    const c = cellAt(cx, cy); if (!c) return;
    setData(d => {
      const tiles = { ...d.tiles };
      if (tool === "apagar") delete tiles[c]; else if (brush) tiles[c] = brush; else return d;
      return { ...d, tiles };
    });
  }, [tool, brush, view]);

  const onDown = (e: React.PointerEvent) => {
    if (e.button === 1 || e.button === 2 || tool === "mover") {
      drag.current = { mode: "pan", sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
      if (tool === "mover" && e.button === 0) {
        const c = cellAt(e.clientX, e.clientY); const n = c && data.tiles[c];
        setSel(n ? { kind: "nation", id: n } : null);
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

  const onBg = (f?: File) => {
    if (!f) return; const r = new FileReader();
    r.onload = () => setData(d => ({ ...d, bg: r.result as string })); r.readAsDataURL(f);
  };
  const exportJson = () => {
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
    a.download = "meu-mapa.json"; a.click();
  };
  const importJson = (f?: File) => { if (!f) return; f.text().then(t => { try { setData({ ...empty, ...JSON.parse(t) }); } catch { alert("Arquivo inválido"); } }); };

  const selNation = sel?.kind === "nation" ? nationById(sel.id) : undefined;
  const selMarker = sel?.kind === "marker" ? data.markers.find(m => m.id === sel.id) : undefined;
  const selLine = sel?.kind === "line" ? data.lines.find(m => m.id === sel.id) : undefined;
  const tileCount = (id: string) => Object.values(data.tiles).filter(t => t === id).length;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <aside className="flex w-64 shrink-0 flex-col gap-4 overflow-y-auto border-r border-border bg-card p-4">
        <h1 className="font-display text-2xl text-primary">Atlas das Nações</h1>
        <section>
          <h2 className="label">Ferramentas</h2>
          <div className="grid gap-1">
            {TOOLS.map(t => (
              <button key={t.id} onClick={() => { setTool(t.id); setDraft([]); }}
                className={`rounded px-2 py-1 text-left text-sm transition ${tool === t.id ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}>{t.label}</button>
            ))}
          </div>
          {(tool === "estrada" || tool === "rota") && <p className="mt-2 text-xs text-muted-foreground">Clique para adicionar pontos. {draft.length >= 2 && <button className="underline" onClick={finishLine}>Concluir traçado</button>}</p>}
        </section>
        <section>
          <div className="mb-1 flex items-center justify-between"><h2 className="label !mb-0">Nações</h2><button onClick={addNation} className="text-sm text-primary hover:underline">+ Nova</button></div>
          {data.nations.length === 0 && <p className="text-xs text-muted-foreground">Mapa limpo. Crie sua primeira nação.</p>}
          <div className="grid gap-1">
            {data.nations.map(n => (
              <button key={n.id} onClick={() => { setBrush(n.id); setSel({ kind: "nation", id: n.id }); }}
                className={`flex items-center gap-2 rounded px-2 py-1 text-left text-sm ${brush === n.id ? "ring-1 ring-primary" : ""} hover:bg-accent`}>
                <span className="h-3 w-3 rounded-sm" style={{ background: n.color }} />
                <span className="flex-1 truncate">{n.name}</span>
                <span className={`rel-${n.relation} text-[10px] uppercase`}>{REL[n.relation]}</span>
              </button>
            ))}
          </div>
        </section>
        <section>
          <h2 className="label">Mapa de fundo</h2>
          <input type="file" accept="image/*" onChange={e => onBg(e.target.files?.[0])} className="w-full text-xs" />
          {data.bg && <>
            <label className="mt-2 block text-xs">Opacidade</label>
            <input type="range" min={0} max={1} step={0.05} value={data.bgOpacity} onChange={e => setData(d => ({ ...d, bgOpacity: +e.target.value }))} className="w-full" />
            <button className="text-xs text-destructive" onClick={() => setData(d => ({ ...d, bg: null }))}>Remover fundo</button>
          </>}
        </section>
        <section className="mt-auto grid gap-1 text-sm">
          <button onClick={exportJson} className="rounded border border-border px-2 py-1 hover:bg-accent">Exportar mapa</button>
          <label className="cursor-pointer rounded border border-border px-2 py-1 text-center hover:bg-accent">Importar mapa<input type="file" accept="application/json" hidden onChange={e => importJson(e.target.files?.[0])} /></label>
          <button onClick={() => confirm("Apagar tudo?") && setData(empty)} className="text-xs text-destructive">Limpar mapa</button>
        </section>
      </aside>

      <div ref={ref} className="relative flex-1 touch-none select-none overflow-hidden bg-muted"
        style={{ cursor: tool === "mover" ? "grab" : "crosshair" }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => (drag.current = null)} onPointerLeave={() => (drag.current = null)}
        onDoubleClick={finishLine} onContextMenu={e => e.preventDefault()}>
        <svg className="absolute left-0 top-0 overflow-visible" width={W} height={H}
          style={{ transform: `translate(${view.x}px,${view.y}px) scale(${view.z})`, transformOrigin: "0 0" }}>
          <rect width={W} height={H} className="fill-background" />
          {data.bg && <image href={data.bg} width={W} height={H} preserveAspectRatio="xMidYMid slice" opacity={data.bgOpacity} />}
          <defs><pattern id="g" width={CELL} height={CELL} patternUnits="userSpaceOnUse"><path d={`M${CELL} 0H0V${CELL}`} fill="none" className="stroke-border" strokeWidth={0.5} /></pattern></defs>
          {Object.entries(data.tiles).map(([k, id]) => { const n = nationById(id); if (!n) return null; const [x = 0, y = 0] = k.split(",").map(Number);
            return <rect key={k} x={x * CELL} y={y * CELL} width={CELL} height={CELL} fill={n.color} opacity={selNation?.id === id ? 0.85 : 0.6} />; })}
          <rect width={W} height={H} fill="url(#g)" pointerEvents="none" />
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
          {data.nations.map(n => { const ks = Object.entries(data.tiles).filter(([, v]) => v === n.id); if (!ks.length) return null;
            let sx = 0, sy = 0; ks.forEach(([k]) => { const [x = 0, y = 0] = k.split(",").map(Number); sx += x; sy += y; });
            return <text key={n.id} x={(sx / ks.length + 0.5) * CELL} y={(sy / ks.length + 0.5) * CELL} textAnchor="middle" fontSize={28} pointerEvents="none"
              className="fill-foreground font-display uppercase tracking-widest" opacity={0.75} paintOrder="stroke" stroke="var(--background)" strokeWidth={3}>{n.name}</text>; })}
        </svg>
        <div className="pointer-events-none absolute bottom-3 left-3 rounded bg-card/90 px-2 py-1 text-xs text-muted-foreground">Roda: zoom · Botão direito: arrastar · Duplo clique: concluir traçado</div>
      </div>

      {(selNation || selMarker || selLine) && (
        <aside className="w-80 shrink-0 overflow-y-auto border-l border-border bg-card p-4">
          <div className="mb-3 flex justify-end"><button onClick={() => setSel(null)} className="text-muted-foreground">✕</button></div>
          {selNation && <div className="grid gap-3">
            <input value={selNation.name} onChange={e => upNation(selNation.id, { name: e.target.value })} className="field font-display text-xl" />
            <div className="flex items-center gap-2"><label className="label !mb-0">Cor</label>
              <input type="color" value={toHex(selNation.color)} onChange={e => upNation(selNation.id, { color: e.target.value })} />
              <span className="text-xs text-muted-foreground">{tileCount(selNation.id)} territórios</span></div>
            <div><label className="label">Relação</label>
              <div className="grid grid-cols-2 gap-1">{(Object.keys(REL) as Relation[]).map(r => (
                <button key={r} onClick={() => upNation(selNation.id, { relation: r })} className={`rounded border px-2 py-1 text-xs rel-${r} ${selNation.relation === r ? "border-current font-bold" : "border-border"}`}>{REL[r]}</button>))}</div></div>
            <div><label className="label">Governante</label><input value={selNation.ruler} onChange={e => upNation(selNation.id, { ruler: e.target.value })} className="field" /></div>
            <div><label className="label">Tratados</label><textarea rows={4} value={selNation.treaties} onChange={e => upNation(selNation.id, { treaties: e.target.value })} className="field" /></div>
            <div><label className="label">Observações</label><textarea rows={6} value={selNation.notes} onChange={e => upNation(selNation.id, { notes: e.target.value })} className="field" /></div>
            <button onClick={() => { setBrush(selNation.id); setTool("pintar"); }} className="rounded bg-primary px-2 py-1 text-sm text-primary-foreground">Pintar território desta nação</button>
            <button onClick={() => { if (!confirm("Excluir nação?")) return; setData(d => ({ ...d, nations: d.nations.filter(n => n.id !== selNation.id), tiles: Object.fromEntries(Object.entries(d.tiles).filter(([, v]) => v !== selNation.id)) })); setSel(null); }} className="text-sm text-destructive">Excluir nação</button>
          </div>}
          {selMarker && <div className="grid gap-3">
            <span className="label">{ICON[selMarker.type]} {selMarker.type}</span>
            <input value={selMarker.name} onChange={e => upMarker(selMarker.id, { name: e.target.value })} className="field font-display text-xl" />
            <select value={selMarker.type} onChange={e => upMarker(selMarker.id, { type: e.target.value as MarkerType })} className="field">
              {(Object.keys(ICON) as MarkerType[]).map(t => <option key={t} value={t}>{t}</option>)}</select>
            <div><label className="label">Observações</label><textarea rows={6} value={selMarker.notes} onChange={e => upMarker(selMarker.id, { notes: e.target.value })} className="field" /></div>
            <button onClick={() => { setData(d => ({ ...d, markers: d.markers.filter(m => m.id !== selMarker.id) })); setSel(null); }} className="text-sm text-destructive">Excluir</button>
          </div>}
          {selLine && <div className="grid gap-3">
            <span className="label">{selLine.type === "estrada" ? "Estrada" : "Rota marítima"} · {selLine.points.length} pontos</span>
            <button onClick={() => { setData(d => ({ ...d, lines: d.lines.filter(m => m.id !== selLine.id) })); setSel(null); }} className="text-sm text-destructive">Excluir traçado</button>
          </div>}
        </aside>
      )}
    </div>
  );
}

function toHex(c: string) {
  if (c.startsWith("#")) return c;
  const m = c.match(/hsl\((\d+)\s+(\d+)%\s+(\d+)%\)/); if (!m) return "#888888";
  const h = +m[1]!, s = +m[2]! / 100, l = +m[3]! / 100; const a = s * Math.min(l, 1 - l);
  const f = (n: number) => { const k = (n + h / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, "0"); };
  return `#${f(0)}${f(8)}${f(4)}`;
}
