import { createContext, useContext } from 'react';

export interface CanvasActionContextType {
  updateEdgeLabel: (edgeId: string, newLabel: string, color?: string, isObjection?: boolean) => void;
  deleteEdge: (edgeId: string) => void;
  duplicateNode: (nodeId?: string) => void;
  editingEdgeId: string | null;
  setEditingEdgeId: (edgeId: string | null) => void;
}

export const CanvasActionContext = createContext<CanvasActionContextType | null>(null);

export const useCanvasActions = () => {
  const context = useContext(CanvasActionContext);
  return context;
};
