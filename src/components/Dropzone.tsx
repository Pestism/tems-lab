"use client";
import { useCallback, useRef, useState } from "react";

export default function Dropzone({ onFiles, disabled }: { onFiles: (f: File[]) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const pick = useCallback(
    (files: FileList | null) => {
      const list = files ? [...files] : [];
      if (list.length) onFiles(list);
    },
    [onFiles]
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled) pick(e.dataTransfer.files);
      }}
      onClick={() => !disabled && input.current?.click()}
      className={`card flex cursor-pointer flex-col items-center justify-center gap-3 px-6 py-14 text-center transition ${
        over ? "border-brand ring-2 ring-brand/30" : ""
      } ${disabled ? "cursor-default opacity-60" : "hover:border-brand/60"}`}
    >
      <input
        ref={input}
        type="file"
        accept=".trp"
        multiple
        className="hidden"
        onChange={(e) => pick(e.target.files)}
      />
      <div className="text-5xl" aria-hidden>
        📡
      </div>
      <div className="text-lg font-semibold">Drop your TEMS <code>.trp</code> logfile here</div>
      <div className="text-sm text-muted">or click to choose — drop several if one run split into parts</div>
      <div className="mt-2 max-w-md text-xs text-muted">
        Your file is decoded entirely in this browser — it is never uploaded to any server.
      </div>
    </div>
  );
}
