import { paletteItems } from '../../taskMeta';

export type AlignmentType = 'left' | 'center' | 'top' | 'distribute-v' | 'distribute-h';

export interface CanvasToolbarProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  filterType: string;
  onFilterTypeChange: (value: string) => void;
  matchCount: number;
  onFitView: () => void;
  onExportSvg: () => void;
  onExportPng: () => void;
  onAlign?: (type: AlignmentType) => void;
  selectedCount?: number;
  /** Workflow-level layout actions (kept with the canvas, workspace head stays document-scoped). */
  onAutoLayout?: () => void;
  isLayouting?: boolean;
  layoutMode?: 'auto' | 'manual';
  onToggleLayoutMode?: () => void;
}

export function CanvasToolbar({
  searchTerm,
  onSearchChange,
  filterType,
  onFilterTypeChange,
  matchCount,
  onFitView,
  onExportSvg,
  onExportPng,
  onAlign,
  selectedCount = 0,
  onAutoLayout,
  isLayouting = false,
  layoutMode = 'manual',
  onToggleLayoutMode,
}: CanvasToolbarProps) {
  return (
    <div className="canvas-toolbar" role="toolbar" aria-label="Canvas navigation and search">
      <div className="canvas-toolbar-search">
        <span className="search-icon" aria-hidden="true">
          🔍
        </span>
        <input
          type="text"
          aria-label="Search canvas nodes"
          placeholder="Search tasks…"
          value={searchTerm}
          onChange={(event) => onSearchChange(event.target.value)}
        />
        {searchTerm && (
          <button
            type="button"
            className="search-clear-btn"
            aria-label="Clear search"
            onClick={() => onSearchChange('')}
          >
            ×
          </button>
        )}
      </div>
      <select
        className="canvas-type-filter"
        aria-label="Filter by task type"
        value={filterType}
        onChange={(event) => onFilterTypeChange(event.target.value)}
      >
        <option value="all">All task types</option>
        {paletteItems.map((item) => (
          <option key={item.type} value={item.type}>
            {item.label} ({item.type})
          </option>
        ))}
      </select>
      {(searchTerm || filterType !== 'all') && (
        <span className="canvas-match-count" aria-live="polite">
          {matchCount} {matchCount === 1 ? 'match' : 'matches'}
        </span>
      )}

      {onAlign && selectedCount >= 2 && (
        <div className="canvas-toolbar-alignment" role="group" aria-label="Node alignment tools">
          <button
            type="button"
            className="button secondary canvas-tool-button"
            onClick={() => onAlign('left')}
            title="Align selected tasks left"
            aria-label="Align selected tasks left"
          >
            ⇤ Left
          </button>
          <button
            type="button"
            className="button secondary canvas-tool-button"
            onClick={() => onAlign('center')}
            title="Align selected tasks center"
            aria-label="Align selected tasks center"
          >
            ⇹ Center
          </button>
          <button
            type="button"
            className="button secondary canvas-tool-button"
            onClick={() => onAlign('top')}
            title="Align selected tasks top"
            aria-label="Align selected tasks top"
          >
            ⤒ Top
          </button>
          <button
            type="button"
            className="button secondary canvas-tool-button"
            onClick={() => onAlign('distribute-v')}
            title="Distribute selected tasks vertically"
            aria-label="Distribute selected tasks vertically"
          >
            ↕ Distribute V
          </button>
        </div>
      )}

      <div className="canvas-toolbar-actions">
        {onAutoLayout && (
          <button
            type="button"
            className="button secondary canvas-tool-button"
            onClick={onAutoLayout}
            disabled={isLayouting}
            title="Auto-arrange the graph with ELK.js"
            aria-label="Auto layout"
          >
            {isLayouting ? 'Layout…' : 'Auto layout'}
          </button>
        )}
        {onToggleLayoutMode && (
          <button
            type="button"
            className="button secondary canvas-tool-button"
            onClick={onToggleLayoutMode}
            title="Toggle whether nodes can be repositioned"
            aria-label={layoutMode === 'manual' ? 'Manual layout' : 'Unlock layout'}
          >
            {layoutMode === 'manual' ? 'Manual layout' : 'Unlock layout'}
          </button>
        )}
        <button
          type="button"
          className="button secondary canvas-tool-button"
          onClick={onFitView}
          title="Fit graph to view (F)"
          aria-label="Fit graph to view"
        >
          Fit view
        </button>
        <button
          type="button"
          className="button secondary canvas-tool-button"
          onClick={onExportSvg}
          title="Export graph as SVG diagram"
          aria-label="Export SVG diagram"
        >
          SVG
        </button>
        <button
          type="button"
          className="button secondary canvas-tool-button"
          onClick={onExportPng}
          title="Export graph as PNG image"
          aria-label="Export PNG image"
        >
          PNG
        </button>
      </div>
    </div>
  );
}
