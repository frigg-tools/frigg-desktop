export default function Spinner() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5 animate-spin text-emerald-400">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
