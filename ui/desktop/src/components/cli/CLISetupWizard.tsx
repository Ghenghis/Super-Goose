import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Monitor,
  Download,
  FolderOpen,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Play,
  ChevronLeft,
  X,
  Loader2,
  HardDrive,
} from 'lucide-react';
import { Button } from '../ui/button';
import { useCLI, type Platform, type Arch } from './CLIContext';

// ---------------------------------------------------------------------------
// Asset name mapping — matches GitHub release naming conventions
// ---------------------------------------------------------------------------

/** Build the release asset filename for the given platform + arch */
function getAssetName(platform: Platform, arch: Arch): string {
  switch (platform) {
    case 'windows':
      return 'goose-x86_64-pc-windows-msvc.zip';
    case 'macos':
      return arch === 'arm64'
        ? 'goose-aarch64-apple-darwin.tar.bz2'
        : 'goose-x86_64-apple-darwin.tar.bz2';
    case 'linux':
      return arch === 'arm64'
        ? 'goose-aarch64-unknown-linux-gnu.tar.bz2'
        : 'goose-x86_64-unknown-linux-gnu.tar.bz2';
  }
}

/** Human-readable platform label */
const PLATFORM_LABEL: Record<Platform, string> = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
};

/** Human-readable arch label */
const ARCH_LABEL: Record<Arch, string> = {
  x64: 'x86_64',
  arm64: 'ARM64 (Apple Silicon / aarch64)',
};

/** Default install paths per platform */
function getDefaultInstallPath(platform: Platform): string {
  switch (platform) {
    case 'windows':
      return 'C:\\Users\\Admin\\.goose\\bin\\goose.exe';
    case 'macos':
      return '/usr/local/bin/goose';
    case 'linux':
      return '/usr/local/bin/goose';
  }
}

/** Release base URL */
const RELEASE_BASE = 'https://github.com/Ghenghis/Super-Goose/releases/download';

// ---------------------------------------------------------------------------
// Step components
// ---------------------------------------------------------------------------

/** Step 1 — Platform Detection */
const StepDetect: React.FC = () => {
  const { state, setSetupStep } = useCLI();

  const assetName = getAssetName(state.platform, state.arch);
  const downloadUrl = `${RELEASE_BASE}/${state.latestVersion ?? 'latest'}/${assetName}`;

  return (
    <div className="space-y-4">
      {/* Platform badge */}
      <div className="flex items-center gap-3 p-3 rounded-lg bg-background-muted border border-border-default">
        <Monitor className="w-5 h-5 text-text-muted flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-text-default">
            {PLATFORM_LABEL[state.platform]}
          </div>
          <div className="text-xs text-text-muted">{ARCH_LABEL[state.arch]}</div>
        </div>
        <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
      </div>

      {/* Recommended asset */}
      <div className="p-3 rounded-lg bg-background-muted border border-border-default space-y-1">
        <div className="text-xs font-medium text-text-muted uppercase tracking-wide">
          Recommended Download
        </div>
        <div className="text-sm text-text-default font-mono break-all">{assetName}</div>
        <div className="text-xs text-text-muted break-all">{downloadUrl}</div>
      </div>

      {/* Install path */}
      <div className="flex items-center gap-2 p-3 rounded-lg bg-background-muted border border-border-default">
        <FolderOpen className="w-4 h-4 text-text-muted flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-xs text-text-muted">Install path</div>
          <div className="text-sm text-text-default font-mono truncate">
            {getDefaultInstallPath(state.platform)}
          </div>
        </div>
      </div>

      {/* Action */}
      <Button
        variant="default"
        size="sm"
        shape="pill"
        className="w-full"
        onClick={() => setSetupStep('download')}
      >
        <Download className="w-4 h-4" />
        Confirm &amp; Download
      </Button>
    </div>
  );
};

/** Step 2 — Download with progress */
const StepDownload: React.FC = () => {
  const { state, setSetupStep, setSetupProgress, setSetupError } = useCLI();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [bytesDownloaded, setBytesDownloaded] = useState(0);
  const totalBytes = 45_000_000; // ~45 MB mock

  // Simulate download progress
  useEffect(() => {
    setSetupProgress(0);
    setBytesDownloaded(0);

    timerRef.current = setInterval(() => {
      setBytesDownloaded((prev) => {
        const increment = Math.floor(Math.random() * 3_000_000) + 500_000;
        const next = Math.min(prev + increment, totalBytes);
        const pct = Math.round((next / totalBytes) * 100);
        setSetupProgress(pct);

        if (next >= totalBytes) {
          if (timerRef.current) clearInterval(timerRef.current);
          // Auto-advance to install step after a short pause
          setTimeout(() => setSetupStep('install'), 400);
        }
        return next;
      });
    }, 300);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pct = Math.round((bytesDownloaded / totalBytes) * 100);
  const mbDown = (bytesDownloaded / 1_000_000).toFixed(1);
  const mbTotal = (totalBytes / 1_000_000).toFixed(1);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-text-default">
        <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
        <span>Downloading CLI binary...</span>
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="w-full h-2 rounded-full bg-background-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-blue-500 transition-all duration-200"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-text-muted">
          <span>
            {mbDown} MB / {mbTotal} MB
          </span>
          <span>{pct}%</span>
        </div>
      </div>

      {/* Asset info */}
      <div className="text-xs text-text-muted font-mono break-all">
        {getAssetName(state.platform, state.arch)}
      </div>

      {/* Error state */}
      {state.setupError && (
        <div className="flex items-start gap-2 p-2 rounded-md bg-red-500/10 border border-red-500/30">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-red-400">{state.setupError}</div>
        </div>
      )}

      {state.setupError && (
        <Button
          variant="outline"
          size="sm"
          shape="pill"
          className="w-full"
          onClick={() => {
            setSetupError(null);
            setSetupStep('download');
          }}
        >
          <RefreshCw className="w-4 h-4" />
          Retry Download
        </Button>
      )}
    </div>
  );
};

/** Step 3 — Install (extract, copy binary, add to PATH) */
const StepInstall: React.FC = () => {
  const { state, setSetupStep, setSetupProgress, markInstalled, setSetupError } = useCLI();
  const [currentTask, setCurrentTask] = useState('Extracting archive...');
  const [tasks, setTasks] = useState<{ label: string; done: boolean }[]>([
    { label: 'Extract archive', done: false },
    { label: 'Copy binary to install path', done: false },
    { label: 'Add to system PATH', done: false },
    { label: 'Set executable permissions', done: false },
  ]);

  // Simulate install steps
  useEffect(() => {
    const steps = [
      { label: 'Extracting archive...', delay: 800 },
      { label: 'Copying binary to install path...', delay: 600 },
      { label: 'Adding to system PATH...', delay: 500 },
      { label: 'Setting executable permissions...', delay: 400 },
    ];

    let cancelled = false;

    const runSteps = async () => {
      for (let i = 0; i < steps.length; i++) {
        if (cancelled) return;
        setCurrentTask(steps[i].label);
        setSetupProgress(Math.round(((i + 0.5) / steps.length) * 100));

        await new Promise((resolve) => setTimeout(resolve, steps[i].delay));
        if (cancelled) return;

        setTasks((prev) => prev.map((t, idx) => (idx === i ? { ...t, done: true } : t)));
        setSetupProgress(Math.round(((i + 1) / steps.length) * 100));
      }

      if (!cancelled) {
        // Mark as installed with mock data
        const installPath = getDefaultInstallPath(state.platform);
        markInstalled(installPath, state.latestVersion ?? 'v1.24.05');
      }
    };

    runSteps();

    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-text-default">
        <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
        <span>{currentTask}</span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 rounded-full bg-background-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-blue-500 transition-all duration-200"
          style={{ width: `${state.setupProgress}%` }}
        />
      </div>

      {/* Task checklist */}
      <div className="space-y-1.5">
        {tasks.map((task, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            {task.done ? (
              <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
            ) : (
              <div className="w-3.5 h-3.5 rounded-full border border-border-default flex-shrink-0" />
            )}
            <span className={task.done ? 'text-text-default' : 'text-text-muted'}>{task.label}</span>
          </div>
        ))}
      </div>

      {/* Error state */}
      {state.setupError && (
        <div className="flex items-start gap-2 p-2 rounded-md bg-red-500/10 border border-red-500/30">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-red-400">{state.setupError}</div>
        </div>
      )}

      {state.setupError && (
        <Button
          variant="outline"
          size="sm"
          shape="pill"
          className="w-full"
          onClick={() => {
            setSetupError(null);
            setSetupStep('install');
          }}
        >
          <RefreshCw className="w-4 h-4" />
          Retry Install
        </Button>
      )}
    </div>
  );
};

/** Step 4 — Configure (verify binary, set default provider) */
const StepConfigure: React.FC = () => {
  const { state, setSetupStep, setSetupError } = useCLI();
  const [verified, setVerified] = useState(false);
  const [verifying, setVerifying] = useState(true);

  // Mock verification of `goose --version`
  useEffect(() => {
    const timer = setTimeout(() => {
      setVerifying(false);
      setVerified(true);
      // Auto-advance after verification succeeds
      setTimeout(() => setSetupStep('complete'), 600);
    }, 1200);

    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      {/* Verification status */}
      <div className="flex items-center gap-2 text-sm text-text-default">
        {verifying ? (
          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
        ) : verified ? (
          <CheckCircle className="w-4 h-4 text-green-500" />
        ) : (
          <AlertCircle className="w-4 h-4 text-red-500" />
        )}
        <span>
          {verifying
            ? 'Verifying installation...'
            : verified
              ? 'CLI verified successfully!'
              : 'Verification failed'}
        </span>
      </div>

      {/* Mock terminal output */}
      <div className="p-3 rounded-lg bg-background-muted border border-border-default font-mono text-xs space-y-1">
        <div className="text-text-muted">$ goose --version</div>
        {verifying ? (
          <div className="text-text-muted animate-pulse">Running...</div>
        ) : verified ? (
          <div className="text-green-400">
            goose {state.installedVersion ?? state.latestVersion ?? 'v1.24.05'}
          </div>
        ) : (
          <div className="text-red-400">Command not found</div>
        )}
      </div>

      {/* Provider configuration hint */}
      {verified && (
        <div className="p-3 rounded-lg bg-background-muted border border-border-default space-y-1">
          <div className="text-xs font-medium text-text-default">Default Provider</div>
          <div className="text-xs text-text-muted">
            The CLI will use the same provider configured in your desktop app settings.
          </div>
        </div>
      )}

      {/* Error retry */}
      {state.setupError && (
        <div className="flex items-start gap-2 p-2 rounded-md bg-red-500/10 border border-red-500/30">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-red-400">{state.setupError}</div>
        </div>
      )}

      {state.setupError && (
        <Button
          variant="outline"
          size="sm"
          shape="pill"
          className="w-full"
          onClick={() => {
            setSetupError(null);
            setSetupStep('configure');
          }}
        >
          <RefreshCw className="w-4 h-4" />
          Retry Verification
        </Button>
      )}
    </div>
  );
};

/** Step 5 — Complete (success summary) */
const StepComplete: React.FC = () => {
  const { state, openTerminal, cancelSetup } = useCLI();

  return (
    <div className="space-y-4">
      {/* Success banner */}
      <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
        <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
        <div>
          <div className="text-sm font-medium text-text-default">Installation Complete!</div>
          <div className="text-xs text-text-muted">
            Super-Goose CLI is ready to use.
          </div>
        </div>
      </div>

      {/* Install details */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 p-2 rounded-md bg-background-muted text-xs">
          <HardDrive className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
          <span className="text-text-muted">Version:</span>
          <span className="text-text-default font-mono">
            {state.installedVersion ?? 'v1.24.05'}
          </span>
        </div>
        <div className="flex items-center gap-2 p-2 rounded-md bg-background-muted text-xs">
          <FolderOpen className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
          <span className="text-text-muted">Path:</span>
          <span className="text-text-default font-mono truncate">
            {state.installPath ?? getDefaultInstallPath(state.platform)}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-2">
        <Button
          variant="default"
          size="sm"
          shape="pill"
          className="w-full"
          onClick={() => {
            cancelSetup(); // Return wizard to idle
            openTerminal();
          }}
        >
          <Play className="w-4 h-4" />
          Open CLI Terminal
        </Button>
        <Button
          variant="ghost"
          size="sm"
          shape="pill"
          className="w-full"
          onClick={cancelSetup}
        >
          Done
        </Button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Step metadata for the progress indicator
// ---------------------------------------------------------------------------

const STEP_META: { key: string; label: string }[] = [
  { key: 'detect', label: 'Detect' },
  { key: 'download', label: 'Download' },
  { key: 'install', label: 'Install' },
  { key: 'configure', label: 'Configure' },
  { key: 'complete', label: 'Complete' },
];

const STEP_ORDER = ['detect', 'download', 'install', 'configure', 'complete'] as const;

// ---------------------------------------------------------------------------
// Main wizard component
// ---------------------------------------------------------------------------

interface CLISetupWizardProps {
  /** Whether the wizard is rendered embedded in the sidebar (compact) vs standalone (full page) */
  embedded?: boolean;
}

const CLISetupWizard: React.FC<CLISetupWizardProps> = ({ embedded = false }) => {
  const { state, cancelSetup, setSetupStep } = useCLI();

  const currentStepIndex = STEP_ORDER.indexOf(
    state.setupStep as (typeof STEP_ORDER)[number]
  );

  // Determine if "Back" makes sense for the current step
  const canGoBack =
    state.setupStep === 'detect' || state.setupStep === 'complete';

  const handleBack = useCallback(() => {
    if (currentStepIndex > 0) {
      setSetupStep(STEP_ORDER[currentStepIndex - 1]);
    }
  }, [currentStepIndex, setSetupStep]);

  // Render the active step body
  const renderStepContent = () => {
    switch (state.setupStep) {
      case 'detect':
        return <StepDetect />;
      case 'download':
        return <StepDownload />;
      case 'install':
        return <StepInstall />;
      case 'configure':
        return <StepConfigure />;
      case 'complete':
        return <StepComplete />;
      default:
        return null;
    }
  };

  return (
    <div className={embedded ? 'space-y-3' : 'space-y-5 p-4'}>
      {/* Header with cancel */}
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-text-default">Setup Wizard</div>
        <button
          onClick={cancelSetup}
          className="p-1 rounded-md hover:bg-background-medium/50 transition-colors"
          title="Cancel setup"
        >
          <X className="w-4 h-4 text-text-muted" />
        </button>
      </div>

      {/* Step progress indicator */}
      <div className="flex items-center gap-1">
        {STEP_META.map((step, i) => {
          const isComplete = i < currentStepIndex;
          const isCurrent = i === currentStepIndex;
          return (
            <React.Fragment key={step.key}>
              <div className="flex flex-col items-center gap-0.5 flex-1 min-w-0">
                <div
                  className={`w-full h-1 rounded-full transition-colors ${
                    isComplete
                      ? 'bg-green-500'
                      : isCurrent
                        ? 'bg-blue-500'
                        : 'bg-background-muted'
                  }`}
                />
                <span
                  className={`text-[9px] truncate ${
                    isCurrent ? 'text-text-default font-medium' : 'text-text-muted'
                  }`}
                >
                  {step.label}
                </span>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* Step content */}
      {renderStepContent()}

      {/* Bottom navigation: Back + Cancel */}
      {state.setupStep !== 'idle' && (
        <div className="flex items-center gap-2 pt-1">
          {canGoBack && currentStepIndex > 0 && (
            <Button
              variant="ghost"
              size="sm"
              shape="pill"
              onClick={handleBack}
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </Button>
          )}
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            shape="pill"
            onClick={cancelSetup}
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
};

export default CLISetupWizard;
