"use client";
import { useRef, useState, useEffect, type PointerEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import type { Signature } from "@/lib/field-model";
export function SignaturePad({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: Signature;
  onChange: (value: Signature | undefined) => void;
}) {
  const [fullscreen, setFullscreen] = useState(false);
  const [ink, setInk] = useState(value);
  const drawing = useRef(false),
    draft = useRef<Signature>(value || { strokes: [] });
  useEffect(() => {
    if (!drawing.current) setInk(value);
  }, [value]);
  function finish() {
    drawing.current = false;
    const strokes = draft.current.strokes.filter((stroke) => stroke.length > 1);
    const result = strokes.length ? { strokes } : undefined;
    setInk(result);
    onChange(result);
  }
  function point(event: PointerEvent<SVGSVGElement>) {
    const svg = event.currentTarget;
    const matrix = svg.getScreenCTM();
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = matrix ? point.matrixTransform(matrix.inverse()) : point;
    return [
      Math.max(0, Math.min(1, local.x / 600)),
      Math.max(0, Math.min(1, local.y / 160)),
    ];
  }
  const pad = (
    <svg
      role="img"
      aria-label={`${label} drawing area`}
      viewBox="0 0 600 160"
      className="h-auto w-full touch-none rounded-lg border bg-white text-slate-900"
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        drawing.current = true;
        draft.current = {
          strokes: [...(ink?.strokes || []), [point(event)]],
        };
        setInk(draft.current);
      }}
      onPointerMove={(event) => {
        if (!drawing.current) return;
        const strokes = draft.current.strokes;
        if (strokes.reduce((sum, s) => sum + s.length, 0) >= 4000) return;
        draft.current = {
          strokes: [
            ...strokes.slice(0, -1),
            [...strokes[strokes.length - 1], point(event)],
          ],
        };
        setInk(draft.current);
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
    >
      {(ink?.strokes || []).map((stroke, index) => (
        <polyline
          key={index}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={stroke.map(([x, y]) => `${x * 600},${y * 160}`).join(" ")}
        />
      ))}
    </svg>
  );
  const clear = (
    <button
      className="justify-self-start text-sm underline"
      type="button"
      onClick={() => {
        drawing.current = false;
        draft.current = { strokes: [] };
        setInk(undefined);
        onChange(undefined);
      }}
    >
      Clear signature
    </button>
  );
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      <button
        type="button"
        onClick={() => setFullscreen(true)}
        className="min-h-11 justify-self-end rounded-lg border px-4 text-sm"
      >
        Open fullscreen
      </button>
      {!fullscreen && pad}
      {!fullscreen && clear}
      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent className="!h-[100dvh] !w-screen !max-w-none !rounded-none flex flex-col justify-center">
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>
            Sign below. Rotate your phone for more space.
          </DialogDescription>
          <div className="signature-fullscreen-surface mx-auto w-full max-w-5xl">
            {pad}
          </div>
          <div className="flex items-center justify-between">
            {clear}
            <button
              type="button"
              className="min-h-12 rounded-lg bg-primary px-6 text-primary-foreground"
              onClick={() => setFullscreen(false)}
            >
              Done
            </button>
          </div>
        </DialogContent>
      </Dialog>
      <p className="text-xs text-muted-foreground">
        Use a pen, finger or mouse. Signing approves the customer-visible work
        shown in the preview.
      </p>
    </fieldset>
  );
}
