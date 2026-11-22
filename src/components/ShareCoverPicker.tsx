import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  type SyntheticEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Proporção recomendada pelo WhatsApp/Facebook (link preview). */
export const OG_ASPECT = 1.91;
const OUT_W = 1200;
const OUT_H = Math.round(OUT_W / OG_ASPECT);

type Props = {
  onReady: (file: File) => void;
  onCancel?: () => void;
  busy?: boolean;
  className?: string;
  /** Texto do botão de escolha quando ainda não há arquivo. */
  pickLabel?: string;
};

/**
 * Escolhe foto → enquadra em 1.91:1 (pan/zoom) → exporta JPEG pronto pra capa/OG.
 * Sem libs extras: canvas + object URL.
 */
export function ShareCoverPicker({
  onReady,
  onCancel,
  busy,
  className,
  pickLabel = "Escolher foto da capa",
}: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [fileName, setFileName] = useState("capa.jpg");
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [frameSize, setFrameSize] = useState({ w: 320, h: 168 });
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      if (src) URL.revokeObjectURL(src);
    };
  }, [src]);

  useEffect(() => {
    const el = frameRef.current;
    if (!el || !src) return;
    const sync = () => setFrameSize({ w: el.clientWidth, h: el.clientHeight });
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [src]);

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (src) URL.revokeObjectURL(src);
    setSrc(URL.createObjectURL(file));
    setFileName(file.name.replace(/\.\w+$/, "") + "-capa.jpg");
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }

  function onImgLoad(e: SyntheticEvent<HTMLImageElement>) {
    setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight });
  }

  function onPointerDown(e: ReactPointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  }

  function onPointerMove(e: ReactPointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    setOffset({ x: d.ox + (e.clientX - d.x), y: d.oy + (e.clientY - d.y) });
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  async function confirmCrop() {
    if (!src || !natural.w || !frameRef.current) return;
    const fw = frameRef.current.clientWidth;
    const fh = frameRef.current.clientHeight;
    const cover = Math.max(fw / natural.w, fh / natural.h) * zoom;
    const drawW = natural.w * cover;
    const drawH = natural.h * cover;
    const left = (fw - drawW) / 2 + offset.x;
    const top = (fh - drawH) / 2 + offset.y;

    const canvas = document.createElement("canvas");
    canvas.width = OUT_W;
    canvas.height = OUT_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.src = src;
    await img.decode();

    const sx = Math.max(0, -left / cover);
    const sy = Math.max(0, -top / cover);
    const sw = Math.min(natural.w - sx, fw / cover);
    const sh = Math.min(natural.h - sy, fh / cover);

    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, OUT_W, OUT_H);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, OUT_W, OUT_H);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.88),
    );
    if (!blob) return;
    onReady(new File([blob], fileName, { type: "image/jpeg" }));
  }

  const coverScale =
    natural.w > 0 ? Math.max(frameSize.w / natural.w, frameSize.h / natural.h) * zoom : 1;
  const drawW = natural.w * coverScale;

  if (!src) {
    return (
      <div className={cn("space-y-2", className)}>
        <label className="flex h-28 w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed text-xs text-muted-foreground hover:border-primary/50">
          <span>{pickLabel}</span>
          <span className="text-[10px] text-muted-foreground/80">Recorte 1.91:1 · ideal pro WhatsApp</span>
          <input type="file" accept="image/*" className="hidden" onChange={onPick} />
        </label>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div
        ref={frameRef}
        className="relative aspect-[1.91/1] w-full touch-none overflow-hidden rounded-md border bg-black"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <img
          src={src}
          alt=""
          draggable={false}
          onLoad={onImgLoad}
          className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
          style={{
            width: natural.w ? `${drawW}px` : "100%",
            height: "auto",
            transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
          }}
        />
        <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/40" />
      </div>
      <div className="space-y-1">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Zoom
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1"
          />
        </label>
        <p className="text-[11px] text-muted-foreground">
          Arraste pra enquadrar. A área do retângulo é o que aparece no card do WhatsApp.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={busy} onClick={() => void confirmCrop()}>
          {busy ? "Enviando..." : "Usar este recorte"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => {
            if (src) URL.revokeObjectURL(src);
            setSrc(null);
            onCancel?.();
          }}
        >
          Cancelar
        </Button>
        <label className="inline-flex cursor-pointer items-center rounded-md px-3 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground">
          Trocar foto
          <input type="file" accept="image/*" className="hidden" onChange={onPick} />
        </label>
      </div>
    </div>
  );
}
