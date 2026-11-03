"use client";

export default function ProgressBar({ phase }: { phase: string }) {
  return (
    <div className="card px-6 py-10">
      <div className="mb-3 text-center text-sm text-muted">{phase}…</div>
      <div className="mx-auto h-1.5 w-full max-w-md overflow-hidden rounded-full bg-line">
        <div className="h-full w-1/3 animate-[slide_1.1s_ease-in-out_infinite] rounded-full bg-brand" />
      </div>
      <style>{`@keyframes slide{0%{margin-left:-33%}100%{margin-left:100%}}`}</style>
    </div>
  );
}
