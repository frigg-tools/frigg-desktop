import { useState, type ReactNode } from 'react';
import { DEFAULT_PROXY_PORT } from '@frigg/shared';
import { useAppStore } from '../../store';
import { useT, type TranslateFn } from '../../i18n';

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

function StepFlow({ proxyPort, t }: { proxyPort: number; t: TranslateFn }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-2 py-2">
        <DiagramNode label={t('onboarding.diagram.device.label')} sub={t('onboarding.diagram.device.sub')} />
        <FlowArrow />
        <DiagramNode
          label={t('onboarding.diagram.frigg.label')}
          sub={t('onboarding.diagram.frigg.sub', { port: proxyPort })}
          accent
        />
        <FlowArrow />
        <DiagramNode label={t('onboarding.diagram.internet.label')} sub={t('onboarding.diagram.internet.sub')} />
      </div>
      <p className="text-[13px] leading-relaxed text-zinc-400">{t('onboarding.flow.body')}</p>
    </div>
  );
}

function StepConnect({ t }: { t: TranslateFn }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <ConnectCard
          title={t('onboarding.connect.android.title')}
          badge={t('onboarding.connect.android.badge')}
          copy={t('onboarding.connect.android.copy')}
        />
        <ConnectCard
          title={t('onboarding.connect.iosSimulator.title')}
          badge={t('onboarding.connect.iosSimulator.badge')}
          copy={t('onboarding.connect.iosSimulator.copy')}
        />
        <ConnectCard
          title={t('onboarding.connect.anyDevice.title')}
          badge={t('onboarding.connect.anyDevice.badge')}
          copy={t('onboarding.connect.anyDevice.copy')}
        />
      </div>
      <p className="text-[13px] leading-relaxed text-zinc-400">{t('onboarding.connect.body')}</p>
    </div>
  );
}

function StepTrust({ t }: { t: TranslateFn }) {
  return (
    <div className="space-y-3">
      <p className="text-[13px] leading-relaxed text-zinc-400">{t('onboarding.trust.body')}</p>
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
          {t('onboarding.trust.note.intro')}{' '}
          <span className="font-medium">{t('onboarding.trust.note.ownApp')}</span>{' '}
          {t('onboarding.trust.note.middle')}{' '}
          <code className="font-mono">network_security_config.xml</code>{' '}
          {t('onboarding.trust.note.afterConfig')}{' '}
          <span className="font-medium">{t('onboarding.trust.note.debug')}</span>
          {t('onboarding.trust.note.outro')}</p>
      </div>
    </div>
  );
}

const STEP_TITLE_KEYS = ['onboarding.title.flow', 'onboarding.title.connect', 'onboarding.title.trust'];

export default function OnboardingOverlay() {
  const t = useT();
  const setScreen = useAppStore((s) => s.setScreen);
  const status = useAppStore((s) => s.status);
  const [visible, setVisible] = useState(() => !readOnboarded());
  const [step, setStep] = useState(0);

  if (!visible) return null;

  const lastStep = STEP_TITLE_KEYS.length - 1;
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
  if (step === 0) body = <StepFlow proxyPort={proxyPort} t={t} />;
  else if (step === 1) body = <StepConnect t={t} />;
  else body = <StepTrust t={t} />;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/90 p-6 backdrop-blur">
      <div className="w-full max-w-lg rounded-xl border border-zinc-800/80 bg-zinc-900/60 shadow-2xl">
        <div className="border-b border-zinc-800/80 px-6 py-5">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">
            {t('onboarding.step.counter', { current: step + 1, total: STEP_TITLE_KEYS.length })}
          </p>
          <h2 className="mt-1 font-display text-lg font-semibold tracking-wide text-zinc-100">
            {t(STEP_TITLE_KEYS[step])}
          </h2>
        </div>
        <div className="px-6 py-5">{body}</div>
        <div className="flex items-center gap-3 border-t border-zinc-800/80 px-6 py-4">
          <button
            type="button"
            onClick={dismiss}
            className="text-xs text-zinc-500 transition hover:text-zinc-300"
          >
            {t('onboarding.action.skip')}
          </button>
          <div className="flex flex-1 items-center justify-center gap-1.5">
            {STEP_TITLE_KEYS.map((titleKey, index) => (
              <span
                key={titleKey}
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
              {t('onboarding.action.back')}
            </button>
          ) : null}
          {step < lastStep ? (
            <button
              type="button"
              onClick={() => setStep(step + 1)}
              className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 transition hover:bg-emerald-500/15 active:scale-[0.98]"
            >
              {t('onboarding.action.next')}
            </button>
          ) : (
            <button
              type="button"
              onClick={finish}
              className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 transition hover:bg-emerald-500/15 active:scale-[0.98]"
            >
              {t('onboarding.action.openDevices')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
