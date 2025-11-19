import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, SkipForward, RefreshCw, RotateCcw, Info, ArrowRight } from 'lucide-react';

// --- Geometry & Graph Utilities ---

const NODE_RADIUS = 25;
const WIDTH = 800;
const HEIGHT = 600;

// Generate a random graph
const generateGraph = () => {
  const nodes = [];
  const edges = [];
  const numNodes = 6; // Keep small for demo clarity
  
  // Fixed positions for Source (0) and Sink (numNodes-1)
  nodes.push({ id: 0, x: 100, y: HEIGHT / 2, type: 'source', height: 0, excess: 0 });
  
  // Middle nodes
  for (let i = 1; i < numNodes - 1; i++) {
    nodes.push({
      id: i,
      x: 250 + Math.random() * 300,
      y: 100 + Math.random() * 400,
      type: 'normal',
      height: 0,
      excess: 0
    });
  }
  
  // Sink
  nodes.push({ id: numNodes - 1, x: 700, y: HEIGHT / 2, type: 'sink', height: 0, excess: 0 });

  // Generate edges ensuring a path exists
  const connectionProbability = 0.6;
  
  // Connect source to some mids
  for (let i = 1; i < numNodes - 1; i++) {
    if (Math.random() > 0.3) {
      edges.push({ from: 0, to: i, capacity: Math.floor(Math.random() * 10) + 5, flow: 0 });
    }
  }

  // Connect mids to mids and sink
  for (let i = 1; i < numNodes - 1; i++) {
    // To Sink
    if (Math.random() > 0.3) {
      edges.push({ from: i, to: numNodes - 1, capacity: Math.floor(Math.random() * 10) + 5, flow: 0 });
    }
    // To other mids (only forward ID to prevent cycles for cleaner initial layout, though alg handles cycles)
    for (let j = i + 1; j < numNodes - 1; j++) {
      if (Math.random() < connectionProbability) {
        edges.push({ from: i, to: j, capacity: Math.floor(Math.random() * 10) + 2, flow: 0 });
      }
    }
  }

  // Ensure at least one edge from source if rng failed
  if (edges.filter(e => e.from === 0).length === 0) {
    edges.push({ from: 0, to: 1, capacity: 10, flow: 0 });
  }
  // Ensure at least one edge to sink
  if (edges.filter(e => e.to === numNodes - 1).length === 0) {
    edges.push({ from: numNodes - 2, to: numNodes - 1, capacity: 10, flow: 0 });
  }

  return { nodes, edges };
};

// --- Algorithm Logic ---

// Helper to deep copy state
const cloneState = (nodes, edges) => ({
  nodes: nodes.map(n => ({ ...n })),
  edges: edges.map(e => ({ ...e })),
});

// Get residual capacity from u to v
const getResidual = (u, v, edges) => {
  // Check forward edge
  const forward = edges.find(e => e.from === u && e.to === v);
  if (forward) return forward.capacity - forward.flow;
  
  // Check backward edge (pushing flow back)
  const backward = edges.find(e => e.from === v && e.to === u);
  if (backward) return backward.flow;
  
  return 0;
};

const pushFlow = (u, v, amount, edges) => {
  const forward = edges.find(e => e.from === u && e.to === v);
  if (forward) {
    forward.flow += amount;
    return;
  }
  const backward = edges.find(e => e.from === v && e.to === u);
  if (backward) {
    backward.flow -= amount;
    return;
  }
};

const computeSteps = (initialNodes, initialEdges) => {
  const steps = [];
  // Guard against empty inputs
  if (!initialNodes || initialNodes.length === 0) return steps;

  let nodes = initialNodes.map(n => ({ ...n }));
  let edges = initialEdges.map(e => ({ ...e }));
  const source = nodes[0];
  const sink = nodes[nodes.length - 1];

  // 1. Initialization
  source.height = nodes.length;
  
  steps.push({
    nodes: cloneState(nodes, edges).nodes,
    edges: cloneState(nodes, edges).edges,
    description: "Initialization: Set Source height to |V|.",
    highlightNode: source.id
  });

  // Saturate outgoing edges from source
  edges.forEach(e => {
    if (e.from === source.id) {
      const amount = e.capacity;
      e.flow = amount;
      // Ensure target exists
      const targetNode = nodes.find(n => n.id === e.to);
      if (targetNode) targetNode.excess += amount;
      source.excess -= amount;
    }
  });

  steps.push({
    nodes: cloneState(nodes, edges).nodes,
    edges: cloneState(nodes, edges).edges,
    description: "Initialization: Saturate all edges leaving the Source.",
    highlightNode: null
  });

  let activeNode = null;

  // Main Loop
  let loopCount = 0;
  while (loopCount < 2000) { // Increased safety break
    loopCount++;
    
    // Find active node (excess > 0, not source or sink)
    activeNode = nodes.find(n => n.id !== source.id && n.id !== sink.id && n.excess > 0);

    if (!activeNode) {
      steps.push({
        nodes: cloneState(nodes, edges).nodes,
        edges: cloneState(nodes, edges).edges,
        description: "Termination: No more active nodes. Max flow found.",
        highlightNode: null,
        isFinal: true
      });
      break;
    }

    // Try to Push
    let pushed = false;
    const neighbors = [
      ...edges.filter(e => e.from === activeNode.id).map(e => e.to),
      ...edges.filter(e => e.to === activeNode.id).map(e => e.from)
    ];

    // Remove duplicates and filter valid neighbors
    const uniqueNeighbors = [...new Set(neighbors)];

    for (const neighborId of uniqueNeighbors) {
      const neighbor = nodes.find(n => n.id === neighborId);
      if (!neighbor) continue;

      const residual = getResidual(activeNode.id, neighborId, edges);

      if (residual > 0 && activeNode.height === neighbor.height + 1) {
        const pushAmount = Math.min(activeNode.excess, residual);
        
        pushFlow(activeNode.id, neighborId, pushAmount, edges);
        activeNode.excess -= pushAmount;
        neighbor.excess += pushAmount;
        pushed = true;

        steps.push({
          nodes: cloneState(nodes, edges).nodes,
          edges: cloneState(nodes, edges).edges,
          description: `Push: Moved ${pushAmount} units from Node ${activeNode.id} to Node ${neighborId}.`,
          highlightNode: activeNode.id,
          highlightEdge: { from: activeNode.id, to: neighborId }
        });
        break; // Restart loop after a successful operation
      }
    }

    if (pushed) continue;

    // Relabel
    // If we are here, we have excess but couldn't push.
    // Find min height among neighbors with residual capacity > 0
    let minNeighborHeight = Infinity;
    let canRelabel = false;

    for (const neighborId of uniqueNeighbors) {
      const residual = getResidual(activeNode.id, neighborId, edges);
      if (residual > 0) {
        const neighbor = nodes.find(n => n.id === neighborId);
        if (neighbor && neighbor.height < minNeighborHeight) {
          minNeighborHeight = neighbor.height;
        }
        canRelabel = true; // We have at least one residual edge
      }
    }

    if (canRelabel && minNeighborHeight !== Infinity) {
        const oldHeight = activeNode.height;
        activeNode.height = 1 + minNeighborHeight;
        
        steps.push({
            nodes: cloneState(nodes, edges).nodes,
            edges: cloneState(nodes, edges).edges,
            description: `Relabel: Node ${activeNode.id} height increased from ${oldHeight} to ${activeNode.height} (1 + min neighbor height).`,
            highlightNode: activeNode.id
        });
    } else {
        // Algorithm stuck or finished for this component
        // For standard max flow on connected graph, this shouldn't block indefinitely
        // unless we are in a weird state. Force break to prevent infinite loops.
        if (!canRelabel) {
             // Technically if we can't push AND can't relabel (no residual edges), 
             // the excess is trapped. In P-R, this implies we might be disconnected from sink 
             // or need to push back to source.
             break;
        }
    }
  }
  
  return steps;
};


// --- Main Component ---

export default function PushRelabelViz() {
  const [graph, setGraph] = useState({ nodes: [], edges: [] });
  const [steps, setSteps] = useState([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1000);

  // Initial Load
  useEffect(() => {
    handleNewGraph();
  }, []);

  // Generate Graph and Pre-compute Steps
  const handleNewGraph = () => {
    const newGraph = generateGraph();
    setGraph(newGraph);
    
    // Compute algorithm immediately so we can step through it
    const algoSteps = computeSteps(newGraph.nodes, newGraph.edges);
    
    // Add initial state as step 0
    const initialStep = {
      nodes: newGraph.nodes,
      edges: newGraph.edges,
      description: "Start: Graph generated. Ready to run Push-Relabel.",
      highlightNode: null
    };
    
    setSteps([initialStep, ...algoSteps]);
    setCurrentStepIndex(0);
    setIsPlaying(false);
  };

  const handleReset = () => {
    setCurrentStepIndex(0);
    setIsPlaying(false);
  };

  // Auto Play Logic
  useEffect(() => {
    let interval;
    if (isPlaying && currentStepIndex < steps.length - 1) {
      interval = setInterval(() => {
        setCurrentStepIndex(prev => {
          if (prev >= steps.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, playbackSpeed);
    } else {
      setIsPlaying(false);
    }
    return () => clearInterval(interval);
  }, [isPlaying, currentStepIndex, steps.length, playbackSpeed]);


  // Render Helpers
  const currentStep = steps[currentStepIndex];
  const displayNodes = currentStep ? currentStep.nodes : graph.nodes;
  const displayEdges = currentStep ? currentStep.edges : graph.edges;
  const logText = currentStep ? currentStep.description : "";
  const highlightNodeId = currentStep ? currentStep.highlightNode : null;
  const highlightEdge = currentStep?.highlightEdge;

  const getTotalFlow = () => {
      // SAFETY CHECK: If nodes aren't loaded yet, return 0 to prevent crash
      if (!displayEdges || !displayNodes || displayNodes.length === 0) return 0;
      
      const sink = displayNodes[displayNodes.length - 1];
      if (!sink) return 0;

      const sinkId = sink.id;
      return displayEdges
        .filter(e => e.to === sinkId)
        .reduce((acc, curr) => acc + curr.flow, 0);
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-800 font-sans overflow-hidden">
      {/* Header */}
      <header className="bg-blue-700 text-white p-4 shadow-md flex justify-between items-center shrink-0">
        <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
                <ArrowRight className="w-6 h-6" />
                Goldberg-Tarjan Algorithm
            </h1>
            <p className="text-blue-200 text-sm">Push-Relabel Maximum Flow Visualizer</p>
        </div>
        <div className="flex items-center gap-4">
             <div className="bg-blue-800 px-4 py-2 rounded-lg text-center">
                <span className="block text-xs text-blue-300 uppercase tracking-wider">Current Max Flow</span>
                <span className="text-xl font-bold">{getTotalFlow()}</span>
             </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* Left Panel: Controls & Logs */}
        <div className="w-80 bg-white border-r border-slate-200 flex flex-col shadow-lg z-10 shrink-0">
          
          {/* Controls */}
          <div className="p-4 border-b border-slate-200 bg-slate-50">
            <div className="flex justify-between mb-4">
                <button onClick={handleNewGraph} className="flex items-center gap-1 text-xs font-medium bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-2 rounded transition">
                    <RefreshCw size={14} /> New Graph
                </button>
                <button onClick={handleReset} className="flex items-center gap-1 text-xs font-medium bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-2 rounded transition">
                    <RotateCcw size={14} /> Reset
                </button>
            </div>

            <div className="flex items-center justify-center gap-2 mb-4">
              <button 
                onClick={() => setIsPlaying(!isPlaying)}
                className={`flex items-center gap-2 px-6 py-2 rounded-full text-white font-bold shadow-md transition-transform active:scale-95 ${
                    isPlaying ? 'bg-amber-500 hover:bg-amber-600' : 'bg-green-600 hover:bg-green-700'
                }`}
              >
                {isPlaying ? <><Pause size={18} /> Pause</> : <><Play size={18} /> Auto Play</>}
              </button>
              
              <button 
                onClick={() => {
                    setIsPlaying(false);
                    setCurrentStepIndex(Math.min(steps.length - 1, currentStepIndex + 1));
                }}
                disabled={currentStepIndex >= steps.length - 1}
                className="p-2 bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200 disabled:opacity-50 transition"
              >
                <SkipForward size={20} />
              </button>
            </div>
            
            <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Speed</span>
                <input 
                    type="range" 
                    min="100" 
                    max="2000" 
                    step="100"
                    value={2100 - playbackSpeed} // Invert so right is faster
                    onChange={(e) => setPlaybackSpeed(2100 - parseInt(e.target.value))}
                    className="w-24"
                />
            </div>
          </div>

          {/* Step Info */}
          <div className="p-4 flex-1 overflow-y-auto">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Execution Log</h3>
            <div className="flex flex-col gap-2">
                {steps.slice(0, currentStepIndex + 1).reverse().map((step, idx) => {
                    const realIdx = currentStepIndex - idx;
                    const isCurrent = realIdx === currentStepIndex;
                    return (
                        <div key={realIdx} className={`p-3 rounded border text-sm ${
                            isCurrent 
                            ? 'bg-blue-50 border-blue-200 text-blue-900 shadow-sm border-l-4 border-l-blue-500' 
                            : 'bg-white border-slate-100 text-slate-400'
                        }`}>
                            <div className="flex justify-between mb-1">
                                <span className="font-mono text-xs opacity-70">Step {realIdx}</span>
                                {isCurrent && <span className="text-xs bg-blue-200 text-blue-800 px-1.5 rounded">Active</span>}
                            </div>
                            <p>{step.description}</p>
                        </div>
                    )
                })}
            </div>
          </div>

          {/* Legend */}
          <div className="p-4 border-t border-slate-200 bg-slate-50 text-xs text-slate-600">
            <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-blue-500"></div> Source/Sink
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-amber-400"></div> Active Node
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-white border border-slate-400"></div> Inactive
                </div>
                <div className="flex items-center gap-2">
                    <span className="font-bold">H:</span> Height (Label)
                </div>
                <div className="flex items-center gap-2">
                    <span className="font-bold">E:</span> Excess Flow
                </div>
            </div>
          </div>
        </div>

        {/* Right Panel: SVG Visualization */}
        <div className="flex-1 bg-slate-100 relative overflow-hidden">
          {/* SVG Canvas */}
          <svg 
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`} 
            className="w-full h-full"
            style={{ userSelect: 'none' }}
          >
            <defs>
              <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="28" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="#94a3b8" />
              </marker>
              <marker id="arrowhead-active" markerWidth="10" markerHeight="7" refX="28" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6" />
              </marker>
            </defs>

            {/* Edges */}
            {displayEdges.map((edge, idx) => {
              const startNode = displayNodes.find(n => n.id === edge.from);
              const endNode = displayNodes.find(n => n.id === edge.to);
              
              if (!startNode || !endNode) return null;

              const isFull = edge.flow === edge.capacity;
              const isActiveEdge = highlightEdge && highlightEdge.from === edge.from && highlightEdge.to === edge.to;
              
              // Calculate midpoint for label
              const midX = (startNode.x + endNode.x) / 2;
              const midY = (startNode.y + endNode.y) / 2;

              return (
                <g key={`edge-${idx}`}>
                  {/* Line */}
                  <line
                    x1={startNode.x}
                    y1={startNode.y}
                    x2={endNode.x}
                    y2={endNode.y}
                    stroke={isActiveEdge ? "#3b82f6" : isFull ? "#cbd5e1" : "#94a3b8"}
                    strokeWidth={isActiveEdge ? 4 : 2}
                    markerEnd={isActiveEdge ? "url(#arrowhead-active)" : "url(#arrowhead)"}
                    opacity={isFull ? 0.5 : 1}
                  />
                  
                  {/* Edge Label Background */}
                  <rect 
                    x={midX - 18} 
                    y={midY - 10} 
                    width="36" 
                    height="20" 
                    rx="4" 
                    fill="white" 
                    stroke={isActiveEdge ? "#3b82f6" : "#e2e8f0"}
                    strokeWidth="1"
                  />
                  
                  {/* Edge Label Text */}
                  <text
                    x={midX}
                    y={midY}
                    dy=".35em"
                    textAnchor="middle"
                    fontSize="10"
                    fill={isFull ? "#ef4444" : "#1e293b"}
                    fontWeight="bold"
                  >
                    {edge.flow}/{edge.capacity}
                  </text>
                </g>
              );
            })}

            {/* Nodes */}
            {displayNodes.map((node) => {
              const isActive = node.id === highlightNodeId;
              const isSourceOrSink = node.type !== 'normal';
              const hasExcess = node.excess > 0 && node.type !== 'source' && node.type !== 'sink';
              
              let fillColor = "#ffffff"; // Default white
              if (isSourceOrSink) fillColor = "#bfdbfe"; // Light blue
              if (hasExcess) fillColor = "#fcd34d"; // Yellow (Active w/ excess)
              if (isActive) fillColor = "#fbbf24"; // Darker Yellow (Current operation)

              let strokeColor = "#64748b";
              if (isActive) strokeColor = "#d97706";
              if (hasExcess) strokeColor = "#b45309";

              return (
                <g key={`node-${node.id}`}>
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={NODE_RADIUS}
                    fill={fillColor}
                    stroke={strokeColor}
                    strokeWidth={isActive ? 3 : 2}
                    className="transition-colors duration-300"
                  />
                  
                  {/* Node ID */}
                  <text
                    x={node.x}
                    y={node.y - 5}
                    textAnchor="middle"
                    fontSize="12"
                    fontWeight="bold"
                    fill="#1e293b"
                  >
                    {node.type === 'source' ? 'S' : node.type === 'sink' ? 'T' : node.id}
                  </text>

                  {/* Height / Excess Indicators */}
                  <text
                    x={node.x}
                    y={node.y + 12}
                    textAnchor="middle"
                    fontSize="10"
                    fill="#475569"
                  >
                    H:{node.height}
                  </text>
                </g>
              );
            })}
            
            {/* Excess Bubbles (Separate to sit on top of lines) */}
            {displayNodes.map((node) => {
                if (node.excess <= 0 && node.type === 'normal') return null;
                if (node.type !== 'normal' && node.excess === 0) return null;
                
                return (
                    <g key={`excess-${node.id}`} transform={`translate(${node.x + 20}, ${node.y - 20})`}>
                        <circle r="12" fill={node.excess > 0 ? "#ef4444" : "#3b82f6"} stroke="white" strokeWidth="2" />
                        <text dy=".35em" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">
                            {node.excess}
                        </text>
                    </g>
                )
            })}
          </svg>

          {/* Overlay Instructions */}
          {steps.length > 0 && currentStepIndex === steps.length - 1 && (
            <div className="absolute inset-0 bg-black/10 flex items-center justify-center pointer-events-none">
                <div className="bg-white p-6 rounded-xl shadow-2xl text-center animate-bounce">
                    <h2 className="text-2xl font-bold text-green-600 mb-2">Algorithm Complete!</h2>
                    <p className="text-slate-600">Max Flow found: <span className="font-bold text-slate-900">{getTotalFlow()}</span></p>
                </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}