import { useState, type ReactNode } from 'react';
import { DEFAULT_PROXY_PORT } from '@frigg/shared';
import { useAppStore } from '../../store';

const ONBOARDED_KEY = 'frigg-onboarded';

function readOnboarded(): boolean {
  try {
    return window.localStorage.getItem(ONBOARDED_KEY) !== null;
  } catch {
    return true;
  }
}

function markOnboarded(): void {
  try {
    window.localStorage.setItem(ONBOARDED_KEY, '1');
  } catch {
    return;
  }
}

function DiagramNode({
  label,
  sub,
  accent = false,
}: {
  label: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`flex w-24 flex-col items-center gap-0.5 rounded-lg border px-2 py-3 ${
        accent ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-zinc-800 bg-zinc-900/60'
      }`}
    >
      <span
        className={`text-[11px] font-semibold tracking-wide ${
          accent ? 'font-display tracking-[0.2em] text-emerald-400' : 'text-zinc-200'
        }`}
      >
        {label}
      </span>
      <span className="font-mono text-[9px] text-zinc-500">{sub}</span>
    </div>
  );
}

function FlowArrow() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0 text-zinc-600"
    >
      <path d="M3 12h18M15 6l6 6-6 6" />
    </svg>
  );
}

function ConnectCard({ title, badge, copy }: { title: string; badge: string; copy: string }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-semibold text-zinc-200">{title}</span>
        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-px text-[8px] font-medium uppercase tracking-widest text-emerald-400">
          {badge}
        </span>
      </div>
      <p className="text-[11px] leading-relaxed text-zinc-500">{copy}</p>
    </div>
  );
}

function StepFlow({ proxyPort }: { proxyPort: number }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-2 py-2">
        <DiagramNode label="Device" sub="Android · iOS" />
        <FlowArrow />
        <DiagramNode label="FRIGG" sub={`proxy :${proxyPort}`} accent />
        <FlowArrow />
        <DiagramNode label="Internet" sub="upstream" />
      </div>
      <p className="text-[13px] leading-relaxed text-zinc-400">
        Frigg sits between your device and the internet as an HTTP(S) proxy. Every request and
        response flows through it — watch traffic live, inspect bodies, then mock the responses
        you need without touching a backend.
      </p>
    </div>
  );
}

function StepConnect() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <ConnectCard
          title="Android"
          badge="1-click"
          copy="Frigg sets the proxy and installs the CA certificate over ADB."
        />
        <ConnectCard
          title="iOS Simulator"
          badge="1-click"
          copy="CA certificate goes straight into the simulator keychain; the proxy comes from macOS."
        />
        <ConnectCard
          title="Any device"
          badge="proxy + QR"
          copy="Set a manual Wi-Fi proxy and scan the QR code on the setup page."
        />
      </div>
      <p className="text-[13px] leading-relaxed text-zinc-400">
        Emulators, simulators and physical devices all work — pick the path that matches your
        setup on the Devices screen.
      </p>
    </div>
  );
}

function StepTrust() {
  return (
    <div className="space-y-3">
      <p className="text-[13px] leading-relaxed text-zinc-400">
        To decrypt HTTPS, Frigg generates a local CA certificate and re-signs traffic with it.
        Install and trust that certificate on each device. The CA lives only on this machine —
        nothing leaves your network.
      </p>
      <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400"
        >
          <path d="M12 3 1.8 20.2h20.4L12 3Z" />
          <path d="M12 10v4.5M12 17.5v.01" />
        </svg>
        <p className="text-xs leading-relaxed text-amber-300">
          To decrypt HTTPS from <span className="font-medium">your own Android app</span> (API 24+),
          either let Frigg install a system cert (rooted device / most emulators — automatic), or add
          a <code className="font-mono">network_security_config.xml</code> trusting user CAs to its{' '}
          <span className="font-medium">debug</span> build. Frigg shows the exact snippet after setup.</p>
      </div>
    </div>
  );
}

const STEP_TITLES = ['Your device’s traffic, in the open', 'Connect anything', 'HTTPS needs trust'];

export default function OnboardingOverlay() {
  const setScreen = useAppStore((s) => s.setScreen);
  const status = useAppStore((s) => s.status);
  const [visible, setVisible] = useState(() => !readOnboarded());
  const [step, setStep] = useState(0);

  if (!visible) return null;

  const lastStep = STEP_TITLES.length - 1;
  const proxyPort = status?.proxyPort ?? DEFAULT_PROXY_PORT;

  const dismiss = () => {
    markOnboarded();
    setVisible(false);
  };

  const finish = () => {
    setScreen('devices');
    dismiss();
  };

  let body: ReactNode;
  if (step === 0) body = <StepFlow proxyPort={proxyPort} />;
  else if (step === 1) body = <StepConnect />;
  else body = <StepTrust />;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/90 p-6 backdrop-blur">
      <div className="w-full max-w-lg rounded-xl border border-zinc-800/80 bg-zinc-900/60 shadow-2xl">
        <div className="border-b border-zinc-800/80 px-6 py-5">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">
            Step {step + 1} / {STEP_TITLES.length}
          </p>
          <h2 className="mt-1 font-display text-lg font-semibold tracking-wide text-zinc-100">
            {STEP_TITLES[step]}
          </h2>
        </div>
        <div className="px-6 py-5">{body}</div>
        <div className="flex items-center gap-3 border-t border-zinc-800/80 px-6 py-4">
          <button
            type="button"
            onClick={dismiss}
            className="text-xs text-zinc-500 transition hover:text-zinc-300"
          >
            Skip
          </button>
          <div className="flex flex-1 items-center justify-center gap-1.5">
            {STEP_TITLES.map((title, index) => (
              <span
                key={title}
                className={`h-1.5 rounded-full transition-all ${
                  index === step ? 'w-5 bg-emerald-400' : 'w-1.5 bg-zinc-700'
                }`}
              />
            ))}
          </div>
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:text-zinc-200 active:scale-[0.98]"
            >
              Back
            </button>
          ) : null}
          {step < lastStep ? (
            <button
              type="button"
              onClick={() => setStep(step + 1)}
              className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 transition hover:bg-emerald-500/15 active:scale-[0.98]"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={finish}
              className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 transition hover:bg-emerald-500/15 active:scale-[0.98]"
            >
              Open Devices
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
