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

export const isReturnEdge = (edge: CustomFlowEdge) => {
  return (
    (edge.data as any)?.isReturn === true ||
    edge.sourceHandle === 'rebuttal-accepted' ||
    edge.id === 'edge-reb-pos' ||
    edge.id === 'edge-rebuttal-book' ||
    edge.id === 'e-rebuttal-confirm' ||
    Boolean(edge.id && edge.id.includes('return'))
  );
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

  // Separate hierarchical flow edges from return/loopback edges so Dagre does not push
  // branch targets down a rank because of cross-connections (e.g. rebuttal -> action)
  const flowEdges = edges.filter((edge) => !isReturnEdge(edge));

  flowEdges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes: CustomFlowNode[] = nodes.map((node) => {
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

  // Post-layout: Strictly enforce left-to-right alignment matching router branch options
  layoutedNodes.forEach((routerNode) => {
    if (routerNode.data.type !== 'scenarioBranch' && routerNode.type !== 'scenarioBranch') {
      return;
    }

    const branches = (routerNode.data as any)?.branches || [];
    if (branches.length <= 1) return;

    // Map each branch in order (0, 1, 2, 3) to its target node
    const branchTargets: { branchIdx: number; node: CustomFlowNode; edge: CustomFlowEdge }[] = [];

    branches.forEach((br: any, idx: number) => {
      const edge = edges.find(
        (e) =>
          e.source === routerNode.id &&
          (e.sourceHandle === br.targetHandle ||
            e.sourceHandle === br.id ||
            (e.data as any)?.intent === br.intentKey ||
            (e.id && e.id.includes(`-${idx}`)))
      );
      if (edge) {
        const target = layoutedNodes.find((n) => n.id === edge.target);
        if (target) {
          branchTargets.push({ branchIdx: idx, node: target, edge });
        }
      }
    });

    if (branchTargets.length <= 1) return;

    // Check if targets share the same row level
    const firstY = branchTargets[0].node.position.y;
    const isSameRow = branchTargets.every((t) => Math.abs(t.node.position.y - firstY) < 160);

    if (isSameRow) {
      // Sort existing X coordinates in ascending order
      const xCoords = branchTargets.map((t) => t.node.position.x).sort((a, b) => a - b);

      // Sort branch targets by branchIdx (0, 1, 2, 3)
      branchTargets.sort((a, b) => a.branchIdx - b.branchIdx);

      // Assign the X coordinates so branch 0 gets xCoords[0], branch 1 gets xCoords[1], etc.
      branchTargets.forEach((t, i) => {
        const oldX = t.node.position.x;
        const newX = xCoords[i];
        const deltaX = newX - oldX;
        t.node.position.x = newX;

        // Propagate deltaX to any child nodes below this branch target (e.g. hangup nodes under action)
        if (deltaX !== 0) {
          const childEdges = edges.filter(
            (e) => e.source === t.node.id && !(e.data as any)?.isReturn && e.sourceHandle !== 'rebuttal-accepted'
          );
          childEdges.forEach((ce) => {
            const childNode = layoutedNodes.find((n) => n.id === ce.target);
            if (childNode) {
              childNode.position.x += deltaX;
            }
          });
        }
      });

      // Center the router node above its outer branch columns
      const minX = xCoords[0];
      const maxX = xCoords[xCoords.length - 1];
      const routerWidth = getNodeDimensions(routerNode).width;
      const targetWidth = getNodeDimensions(branchTargets[0].node).width;
      routerNode.position.x = Math.round((minX + maxX + targetWidth - routerWidth) / 2);
    }
  });

  return { nodes: layoutedNodes, edges };
};


