import { useRef, useState, type ReactNode } from "react";
import { GripHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type WindowTab = { id: string; label: string };

export function FloatingWindow({ title, closeLabel, tabs, activeTab, onTabChange, onClose, children }: {
  title: string; closeLabel: string; tabs: WindowTab[]; activeTab: string;
  onTabChange: (id: string) => void; onClose: () => void; children: ReactNode;
}) {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  return <section role="dialog" aria-label={title} className="floating-inspector" style={position ? { left: position.x, top: position.y, right: "auto" } : undefined} onPointerDown={e => e.stopPropagation()}>
    <header className="inspector-header" onPointerDown={e => {
      if ((e.target as HTMLElement).closest("button")) return;
      const bounds = e.currentTarget.parentElement?.getBoundingClientRect();
      if (!bounds) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { x: bounds.x, y: bounds.y, startX: e.clientX, startY: e.clientY };
    }} onPointerMove={e => {
      const start = drag.current;
      const bounds = e.currentTarget.parentElement?.getBoundingClientRect();
      if (!start || !bounds) return;
      setPosition({ x: Math.max(8, Math.min(window.innerWidth - bounds.width - 8, start.x + e.clientX - start.startX)), y: Math.max(8, Math.min(window.innerHeight - bounds.height - 8, start.y + e.clientY - start.startY)) });
    }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}>
      <GripHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" />
      <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</h2>
      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={closeLabel} onClick={onClose}><X className="h-4 w-4" /></Button>
    </header>
    <nav role="tablist" aria-label={title} className="inspector-tabs">{tabs.map(tab => <Button key={tab.id} role="tab" aria-selected={activeTab === tab.id} aria-controls={`inspector-${tab.id}`} id={`tab-${tab.id}`} variant="ghost" size="sm" className={activeTab === tab.id ? "inspector-tab active" : "inspector-tab"} onClick={() => onTabChange(tab.id)}>{tab.label}</Button>)}</nav>
    <div role="tabpanel" id={`inspector-${activeTab}`} aria-labelledby={`tab-${activeTab}`} className="inspector-body">{children}</div>
  </section>;
}