import { useEffect, useRef, useState } from 'react';
import type { AppTheme } from '../../types';

export interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  theme: AppTheme;
  onThemeChange: (theme: AppTheme) => void;
  leftRailOpen: boolean;
  inspectorOpen: boolean;
  runtimeOpen: boolean;
  onToggleRail: () => void;
  onToggleInspector: () => void;
  onToggleRuntime: () => void;
  onResetPanelWidths: () => void;
  showMiniMap: boolean;
  onToggleMiniMap: () => void;
  initialGatewayUrl: string;
  initialAuthToken: string;
  onGatewayConfigApply: (url: string, token: string) => void;
  onExportProfile: () => void;
  onImportProfile: (json: string) => void;
}

export function SettingsDialog({
  open,
  onClose,
  theme,
  onThemeChange,
  leftRailOpen,
  inspectorOpen,
  runtimeOpen,
  onToggleRail,
  onToggleInspector,
  onToggleRuntime,
  onResetPanelWidths,
  showMiniMap,
  onToggleMiniMap,
  initialGatewayUrl,
  initialAuthToken,
  onGatewayConfigApply,
  onExportProfile,
  onImportProfile,
}: SettingsDialogProps) {
  const [gatewayUrl, setGatewayUrl] = useState(initialGatewayUrl);
  const [authToken, setAuthToken] = useState(initialAuthToken);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setGatewayUrl(initialGatewayUrl);
    setAuthToken(initialAuthToken);
  }, [open, initialGatewayUrl, initialAuthToken]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const applyGateway = () => {
    onGatewayConfigApply(gatewayUrl.trim(), authToken.trim());
    onClose();
  };

  return (
    <div className="modal-overlay" role="presentation" onMouseDown={onClose}>
      <div
        className="modal-dialog settings-dialog"
        role="dialog"
        aria-label="Settings"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>Settings</h2>
          <span className="modal-subtitle">Editor preferences &amp; runtime connection</span>
        </div>
        <div className="modal-body settings-body">
          <section className="settings-section">
            <h3>Appearance</h3>
            <label className="settings-row">
              <span>Color theme</span>
              <select
                className="settings-control"
                aria-label="Color theme"
                value={theme}
                onChange={(e) => onThemeChange(e.target.value as AppTheme)}
              >
                <option value="light">☀️ Light</option>
                <option value="dark">🌙 Dark</option>
                <option value="high-contrast">👁 High contrast</option>
              </select>
            </label>
            <label className="settings-row">
              <span>Mini-map on canvas</span>
              <input
                type="checkbox"
                className="settings-toggle"
                aria-label="Mini-map on canvas"
                checked={showMiniMap}
                onChange={onToggleMiniMap}
              />
            </label>
          </section>

          <section className="settings-section">
            <h3>Panels</h3>
            <label className="settings-row">
              <span>Task palette rail</span>
              <input
                type="checkbox"
                className="settings-toggle"
                aria-label="Task palette rail"
                checked={leftRailOpen}
                onChange={onToggleRail}
              />
            </label>
            <label className="settings-row">
              <span>Inspector rail</span>
              <input
                type="checkbox"
                className="settings-toggle"
                aria-label="Inspector rail"
                checked={inspectorOpen}
                onChange={onToggleInspector}
              />
            </label>
            <label className="settings-row">
              <span>Runtime console</span>
              <input
                type="checkbox"
                className="settings-toggle"
                aria-label="Runtime console"
                checked={runtimeOpen}
                onChange={onToggleRuntime}
              />
            </label>
            <div className="settings-row settings-action-row">
              <span>Panel widths</span>
              <button type="button" className="button secondary" onClick={onResetPanelWidths}>
                Reset to defaults
              </button>
            </div>
          </section>

          <section className="settings-section">
            <h3>Settings profiles</h3>
            <div className="settings-row settings-action-row">
              <span>Export / import workspace settings as JSON</span>
              <span className="settings-profile-actions">
                <button type="button" className="button secondary" onClick={onExportProfile}>
                  Export
                </button>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => importInputRef.current?.click()}
                >
                  Import
                </button>
              </span>
            </div>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              className="settings-file-input"
              aria-label="Import settings profile"
              onChange={(event) => {
                const [file] = event.target.files || [];
                event.target.value = '';
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => onImportProfile(String(reader.result || ''));
                reader.readAsText(file);
              }}
            />
            <p className="settings-hint">
              Profiles cover theme, mini-map, panels, and gateway URL. Bearer tokens are never exported.
            </p>
          </section>

          <section className="settings-section">
            <h3>Runtime gateway</h3>
            <label className="settings-field">
              <span>Gateway URL</span>
              <input
                className="settings-control"
                type="text"
                aria-label="Gateway URL"
                placeholder="https://gateway.example.com"
                value={gatewayUrl}
                onChange={(e) => setGatewayUrl(e.target.value)}
              />
            </label>
            <label className="settings-field">
              <span>Bearer token</span>
              <input
                className="settings-control"
                type="password"
                aria-label="Bearer token"
                placeholder="Optional"
                value={authToken}
                onChange={(e) => setAuthToken(e.target.value)}
              />
            </label>
            <p className="settings-hint">
              Stored locally and shared with the Runtime console. Leave empty to use the built-in engine.
            </p>
          </section>
        </div>
        <div className="modal-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="button primary" onClick={applyGateway}>
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
