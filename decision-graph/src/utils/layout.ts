import dagre from 'dagre';
import { CustomFlowNode, CustomFlowEdge } from '../types/flow';

export const getNodeDimensions = (node: CustomFlowNode) => {
  const width = 310;
  let height = 220;

  if (node.data.type === 'scenarioBranch') {
    const branches = (node.data as any).branches?.length || 2;
    height = 180 + branches * 44;
  } else if (node.data.type === 'greeting') {
    height = 240;
  } else if (node.data.type === 'question') {
    height = 230;
  } else if (node.data.type === 'knowledge') {
    height = 240;
  } else if (node.data.type === 'action') {
    height = 210;
  } else if (node.data.type === 'hangup') {
    height = 180;
  }

  return { width, height };
};

export const getLayoutedElements = (
  nodes: CustomFlowNode[],
  edges: CustomFlowEdge[],
  direction = 'TB' // 'TB' (top to bottom) or 'LR' (left to right)
) => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: 110,
    ranksep: 130,
    marginx: 50,
    marginy: 50,
  });

  nodes.forEach((node) => {
    const { width, height } = getNodeDimensions(node);
    dagreGraph.setNode(node.id, { width, height });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    const { width, height } = getNodeDimensions(node);

    return {
      ...node,
      position: {
        x: Math.round(nodeWithPosition.x - width / 2),
        y: Math.round(nodeWithPosition.y - height / 2),
      },
    };
  });

  return { nodes: layoutedNodes, edges };
};

