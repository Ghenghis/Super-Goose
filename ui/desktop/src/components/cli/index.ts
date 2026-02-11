// CLI Integration — barrel exports
export { CLIProvider, useCLI } from './CLIContext';
export type { CLIState, TerminalEntry, Platform, Arch, SetupStep } from './CLIContext';
export { default as CLIIntegrationPanel } from './CLIIntegrationPanel';
export { default as CLISetupWizard } from './CLISetupWizard';
export { default as EmbeddedTerminal } from './EmbeddedTerminal';
export { default as CLIPreferencesPanel } from './CLIPreferencesPanel';
export * from './CLIDownloadService';
