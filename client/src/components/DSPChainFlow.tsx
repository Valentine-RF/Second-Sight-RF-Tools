import React, { useState, useCallback } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  MarkerType,
  BackgroundVariant,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Activity, Waves, Palette, Filter, Settings } from 'lucide-react';

/**
 * DSP Chain Visualization Component
 * 
 * Interactive flowchart showing the signal processing pipeline:
 * Input → FFT → Windowing → PSD → Colormap → Output
 * 
 * Features:
 * - Real-time parameter controls for each node
 * - Visual connection lines between processing stages
 * - Preset chains (Basic, Advanced, Custom)
 * - Export/import chain configurations
 */

interface DSPNodeData {
  label: string;
  type: 'input' | 'fft' | 'window' | 'psd' | 'colormap' | 'filter' | 'output';
  parameters?: Record<string, any>;
  icon?: React.ReactNode;
}

interface DSPChainFlowProps {
  onParameterChange?: (nodeId: string, parameter: string, value: any) => void;
}

// Custom node component with parameter controls
const DSPNode: React.FC<{ data: DSPNodeData }> = ({ data }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const getNodeColor = () => {
    switch (data.type) {
      case 'input': return 'bg-blue-500/20 border-blue-400';
      case 'fft': return 'bg-cyan-500/20 border-cyan-400';
      case 'window': return 'bg-purple-500/20 border-purple-400';
      case 'psd': return 'bg-pink-500/20 border-pink-400';
      case 'colormap': return 'bg-yellow-500/20 border-yellow-400';
      case 'filter': return 'bg-green-500/20 border-green-400';
      case 'output': return 'bg-red-500/20 border-red-400';
      default: return 'bg-gray-500/20 border-gray-400';
    }
  };

  return (
    <div className={`px-4 py-3 rounded-lg border-2 ${getNodeColor()} backdrop-blur-sm min-w-[180px]`}>
      <div className="flex items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          {data.icon}
          <div className="font-semibold text-sm">{data.label}</div>
        </div>
        {data.parameters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <Settings className="h-3 w-3" />
          </Button>
        )}
      </div>
      
      {isExpanded && data.parameters && (
        <div className="mt-2 pt-2 border-t border-gray-600 space-y-2 text-xs">
          {Object.entries(data.parameters).map(([key, value]) => (
            <div key={key} className="flex justify-between">
              <span className="text-gray-400">{key}:</span>
              <span className="font-mono text-gray-200">{String(value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const nodeTypes = {
  dspNode: DSPNode,
};

export const DSPChainFlow: React.FC<DSPChainFlowProps> = ({ onParameterChange }) => {
  const [selectedPreset, setSelectedPreset] = useState<string>('basic');
  const [fftSize, setFftSize] = useState<string>('2048');
  const [windowType, setWindowType] = useState<string>('hamming');
  const [colormap, setColormap] = useState<string>('viridis');
  const [filterEnabled, setFilterEnabled] = useState<boolean>(false);

  // Define initial nodes for basic chain
  const initialNodes: Node[] = [
    {
      id: 'input',
      type: 'dspNode',
      position: { x: 50, y: 150 },
      data: {
        label: 'IQ Input',
        type: 'input',
        icon: <Activity className="w-4 h-4 text-blue-400" />,
        parameters: {
          'Sample Rate': '2.4 MSps',
          'Center Freq': '100 MHz',
        },
      },
    },
    {
      id: 'fft',
      type: 'dspNode',
      position: { x: 280, y: 150 },
      data: {
        label: 'FFT',
        type: 'fft',
        icon: <Waves className="w-4 h-4 text-cyan-400" />,
        parameters: {
          'NFFT': fftSize,
          'Overlap': '50%',
        },
      },
    },
    {
      id: 'window',
      type: 'dspNode',
      position: { x: 510, y: 150 },
      data: {
        label: 'Windowing',
        type: 'window',
        icon: <Filter className="w-4 h-4 text-purple-400" />,
        parameters: {
          'Type': windowType,
          'Alpha': '0.5',
        },
      },
    },
    {
      id: 'psd',
      type: 'dspNode',
      position: { x: 740, y: 150 },
      data: {
        label: 'PSD',
        type: 'psd',
        icon: <Activity className="w-4 h-4 text-pink-400" />,
        parameters: {
          'Scale': 'dB',
          'Normalization': 'density',
        },
      },
    },
    {
      id: 'colormap',
      type: 'dspNode',
      position: { x: 970, y: 150 },
      data: {
        label: 'Colormap',
        type: 'colormap',
        icon: <Palette className="w-4 h-4 text-yellow-400" />,
        parameters: {
          'Type': colormap,
          'Min': '-100 dB',
          'Max': '0 dB',
        },
      },
    },
    {
      id: 'output',
      type: 'dspNode',
      position: { x: 1200, y: 150 },
      data: {
        label: 'Spectrogram',
        type: 'output',
        icon: <Activity className="w-4 h-4 text-red-400" />,
      },
    },
  ];

  // Define edges (connections between nodes)
  const initialEdges: Edge[] = [
    {
      id: 'input-fft',
      source: 'input',
      target: 'fft',
      animated: true,
      style: { stroke: '#06b6d4' },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#06b6d4' },
    },
    {
      id: 'fft-window',
      source: 'fft',
      target: 'window',
      animated: true,
      style: { stroke: '#a855f7' },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#a855f7' },
    },
    {
      id: 'window-psd',
      source: 'window',
      target: 'psd',
      animated: true,
      style: { stroke: '#ec4899' },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#ec4899' },
    },
    {
      id: 'psd-colormap',
      source: 'psd',
      target: 'colormap',
      animated: true,
      style: { stroke: '#eab308' },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#eab308' },
    },
    {
      id: 'colormap-output',
      source: 'colormap',
      target: 'output',
      animated: true,
      style: { stroke: '#ef4444' },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#ef4444' },
    },
  ];

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  // Update node parameters when controls change
  const updateNodeParameter = (nodeId: string, paramKey: string, value: any) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              parameters: {
                ...node.data.parameters,
                [paramKey]: value,
              },
            },
          };
        }
        return node;
      })
    );
    onParameterChange?.(nodeId, paramKey, value);
  };

  // Handle FFT size change
  const handleFftSizeChange = (value: string) => {
    setFftSize(value);
    updateNodeParameter('fft', 'NFFT', value);
  };

  // Handle window type change
  const handleWindowTypeChange = (value: string) => {
    setWindowType(value);
    updateNodeParameter('window', 'Type', value);
  };

  // Handle colormap change
  const handleColormapChange = (value: string) => {
    setColormap(value);
    updateNodeParameter('colormap', 'Type', value);
  };

  // Load preset chain
  const loadPreset = (preset: string) => {
    setSelectedPreset(preset);
    
    if (preset === 'basic') {
      // Already loaded
    } else if (preset === 'advanced') {
      // Add filter node
      setFilterEnabled(true);
      // Add more nodes for advanced chain
    }
  };

  return (
    <div className="space-y-4">
      {/* Control Panel */}
      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-lg">DSP Chain Configuration</h3>
          <Select value={selectedPreset} onValueChange={loadPreset}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="basic">Basic Chain</SelectItem>
              <SelectItem value="advanced">Advanced Chain</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {/* FFT Size */}
          <div className="space-y-2">
            <Label className="text-sm">FFT Size</Label>
            <Select value={fftSize} onValueChange={handleFftSizeChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="512">512</SelectItem>
                <SelectItem value="1024">1024</SelectItem>
                <SelectItem value="2048">2048</SelectItem>
                <SelectItem value="4096">4096</SelectItem>
                <SelectItem value="8192">8192</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Window Type */}
          <div className="space-y-2">
            <Label className="text-sm">Window Function</Label>
            <Select value={windowType} onValueChange={handleWindowTypeChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hamming">Hamming</SelectItem>
                <SelectItem value="hann">Hann</SelectItem>
                <SelectItem value="blackman">Blackman</SelectItem>
                <SelectItem value="kaiser">Kaiser</SelectItem>
                <SelectItem value="rectangular">Rectangular</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Colormap */}
          <div className="space-y-2">
            <Label className="text-sm">Colormap</Label>
            <Select value={colormap} onValueChange={handleColormapChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="viridis">Viridis</SelectItem>
                <SelectItem value="turbo">Turbo</SelectItem>
                <SelectItem value="plasma">Plasma</SelectItem>
                <SelectItem value="inferno">Inferno</SelectItem>
                <SelectItem value="magma">Magma</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="text-xs text-muted-foreground">
          <p>Adjust parameters to see real-time updates in the signal processing chain.</p>
          <p className="mt-1">Click the settings icon on each node to view detailed parameters.</p>
        </div>
      </Card>

      {/* Flow Diagram */}
      <Card className="p-0 overflow-hidden" style={{ height: '500px' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          className="bg-gray-950"
        >
          <Controls className="bg-gray-900 border-gray-700" />
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1}
            color="#374151"
          />
        </ReactFlow>
      </Card>
    </div>
  );
};
