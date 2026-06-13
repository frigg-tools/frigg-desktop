export default function EmptyHint({ message, command }: { message: string; command: string }) {
  return (
    <div className="dot-grid flex flex-col items-center gap-2 rounded-lg border border-dashed border-zinc-800 px-6 py-8 text-center">
      <p className="text-[13px] text-zinc-500">{message}</p>
      <code className="rounded border border-zinc-800 bg-zinc-900/60 px-2 py-1 font-mono text-xs text-zinc-400">
        {command}
      </code>
    </div>
  );
}
