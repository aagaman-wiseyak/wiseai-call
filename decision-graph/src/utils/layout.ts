import dagre from 'dagre';
import { CustomFlowNode, CustomFlowEdge } from '../types/flow';

const NODE_WIDTH = 320;
const NODE_HEIGHT = 180;

export const getLayoutedElements = (
  nodes: CustomFlowNode[],
  edges: CustomFlowEdge[],
  direction = 'TB' // 'TB' (top to bottom) or 'LR' (left to right)
) => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: 80,
    ranksep: 100,
    marginx: 40,
    marginy: 40,
  });

  nodes.forEach((node) => {
    // Dynamic height based on node type
    let h = NODE_HEIGHT;
    if (node.data.type === 'scenarioBranch') {
      const branches = (node.data as any).branches?.length || 2;
      h = 160 + branches * 36;
    } else if (node.data.type === 'greeting') {
      h = 220;
    }
    dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: h });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - NODE_WIDTH / 2,
        y: nodeWithPosition.y - NODE_HEIGHT / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
};
