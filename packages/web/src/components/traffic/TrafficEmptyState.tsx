import { useAppStore } from '../../store';

export default function TrafficEmptyState() {
  const setScreen = useAppStore((s) => s.setScreen);
  return (
    <div className="dot-grid flex h-full flex-col items-center justify-center gap-4 p-8">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-8 w-8 text-zinc-700"
      >
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
      <p className="text-sm text-zinc-500">Traffic will appear here once a device is connected</p>
      <button
        type="button"
        onClick={() => setScreen('devices')}
        className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[13px] font-medium text-emerald-400 transition hover:bg-emerald-500/15 active:scale-[0.98]"
      >
        Set up a device
      </button>
    </div>
  );
}
