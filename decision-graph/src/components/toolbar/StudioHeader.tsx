import React from 'react';
import {
  LayoutGrid,
  Download,
  Upload,
  Play,
  CheckCircle2,
  AlertTriangle,
  FolderOpen,
} from 'lucide-react';
import { CAMPAIGN_TEMPLATES } from '../../templates/campaignTemplates';
import { WiseBrandLogo } from '../brand/WiseBrandLogo';

interface StudioHeaderProps {
  currentCampaignId: string;
  onSelectCampaign: (id: string) => void;
  onAutoLayout: () => void;
  onExportJson: () => void;
  onImportJson: () => void;
  onToggleSimulator: () => void;
  isSimulatorOpen: boolean;
  nodeCount: number;
  edgeCount: number;
  isValid: boolean;
}

export const StudioHeader: React.FC<StudioHeaderProps> = ({
  currentCampaignId,
  onSelectCampaign,
  onAutoLayout,
  onExportJson,
  onImportJson,
  onToggleSimulator,
  isSimulatorOpen,
  nodeCount,
  edgeCount,
  isValid,
}) => {
  return (
    <header className="studio-header">
      {/* Brand / Logo */}
      <div className="header-left">
        <WiseBrandLogo size="sm" showTagline={false} />

        {/* Campaign Selector */}
        <div className="campaign-select-wrap">
          <FolderOpen size={15} className="select-icon" />
          <select
            className="campaign-select"
            value={currentCampaignId}
            onChange={(e) => onSelectCampaign(e.target.value)}
          >
            {CAMPAIGN_TEMPLATES.map((camp) => (
              <option key={camp.id} value={camp.id}>
                {camp.name} ({camp.category})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Center Graph Metrics & Status */}
      <div className="header-center">
        <div className="graph-stats-chip">
          <span>{nodeCount} Nodes</span>
          <span className="divider">•</span>
          <span>{edgeCount} Edges</span>
        </div>

        <div className={`validation-chip ${isValid ? 'valid' : 'warning'}`}>
          {isValid ? (
            <>
              <CheckCircle2 size={13} />
              <span>Flow Validated</span>
            </>
          ) : (
            <>
              <AlertTriangle size={13} />
              <span>Incomplete Branches</span>
            </>
          )}
        </div>
      </div>

      {/* Right Action Buttons */}
      <div className="header-right">
        <button
          className="btn-toolbar"
          onClick={onAutoLayout}
          title="Auto-arrange nodes hierarchically"
        >
          <LayoutGrid size={15} />
          <span>Auto Layout</span>
        </button>

        <button
          className="btn-toolbar"
          onClick={onExportJson}
          title="Export flow schema as JSON"
        >
          <Download size={15} />
          <span>Export</span>
        </button>

        <button
          className="btn-toolbar"
          onClick={onImportJson}
          title="Import flow schema"
        >
          <Upload size={15} />
          <span>Import</span>
        </button>

        {/* Call Simulator Toggle Button */}
        <button
          className={`btn-simulator ${isSimulatorOpen ? 'active' : ''}`}
          onClick={onToggleSimulator}
        >
          <Play size={15} className="play-icon" />
          <span>{isSimulatorOpen ? 'Hide Simulator' : 'Test Call Simulator'}</span>
        </button>
      </div>
    </header>
  );
};
