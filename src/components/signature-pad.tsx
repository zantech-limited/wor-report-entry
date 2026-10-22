"use client";
import { useRef, type PointerEvent } from "react";
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
  const drawing = useRef(false),
    draft = useRef<Signature>(value || { strokes: [] });
  function point(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return [
      Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    ];
  }
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-medium">{label}</legend>
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
            strokes: [...(value?.strokes || []), [point(event)]],
          };
          onChange(draft.current);
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
          onChange(draft.current);
        }}
        onPointerUp={() => {
          drawing.current = false;
        }}
        onPointerCancel={() => {
          drawing.current = false;
        }}
      >
        {(value?.strokes || []).map((stroke, index) => (
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
      <button
        className="justify-self-start text-sm underline"
        type="button"
        onClick={() => {
          drawing.current = false;
          draft.current = { strokes: [] };
          onChange(undefined);
        }}
      >
        Clear signature
      </button>
      <p className="text-xs text-muted-foreground">
        Use a pen, finger or mouse. Signing approves the customer-visible work
        shown in the preview.
      </p>
    </fieldset>
  );
}
