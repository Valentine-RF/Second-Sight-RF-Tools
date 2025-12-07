import { useAuth } from '@/_core/hooks/useAuth';
import { getLoginUrl } from '@/const';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Radio, Waves, Activity, Binary, Upload, MessageSquare } from 'lucide-react';
import { Link } from 'wouter';

/**
 * Landing Page - Forensic Signal Processing Web App
 * 
 * Mathematical blueprint aesthetic with geometric diagrams and technical labels
 */
export default function Home() {
  const { user, isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <div className="container py-16">
        <div className="max-w-4xl mx-auto text-center mb-16">
          {/* Geometric wireframe decoration */}
          <div className="relative mb-8">
            <svg className="w-full h-32 opacity-20" viewBox="0 0 800 128">
              <path
                d="M 0,64 L 200,32 L 400,96 L 600,16 L 800,80"
                className="geometric-line"
              />
              <circle cx="200" cy="32" r="4" fill="oklch(0.65 0.15 195)" />
              <circle cx="400" cy="96" r="4" fill="oklch(0.7 0.15 330)" />
              <circle cx="600" cy="16" r="4" fill="oklch(0.65 0.15 195)" />
            </svg>
          </div>

          <h1 className="mb-2">
            <span className="second-sight-logo text-6xl">Second Sight</span>
          </h1>
          <p className="valentine-rf-badge text-base mb-4">by Valentine RF</p>
               <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8 technical-label">
            Professional RF signal analysis platform with GPU-accelerated processing, WebGL visualizations, and advanced forensic capabilities.
          </p>

          {isAuthenticated ? (
            <div className="flex gap-4 justify-center">
              <Button size="lg" className="gap-2" asChild>
                <Link href="/files">
                  <Upload className="w-5 h-5" />
                  Manage Files
                </Link>
              </Button>
              <Button size="lg" variant="outline" className="gap-2" asChild>
                <Link href="/cockpit">
                  <Radio className="w-5 h-5" />
                  Open Cockpit
                </Link>
              </Button>
            </div>
          ) : (
            <Button size="lg" asChild>
              <a href={getLoginUrl()}>Sign In to Get Started</a>
            </Button>
          )}
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          <Card className="p-6 data-panel">
            <div className="wireframe-cyan w-12 h-12 rounded flex items-center justify-center mb-4">
              <Radio className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-xl font-black mb-2">SigMF Support</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Full SigMF file parser with schema validation, SHA512 integrity checking,
              and HTTP Range request support for streaming large captures.
            </p>
            <div className="technical-label">core:datatype • core:sample_rate • annotations</div>
          </Card>

          <Card className="p-6 data-panel">
            <div className="wireframe-pink w-12 h-12 rounded flex items-center justify-center mb-4">
              <Waves className="w-6 h-6 text-secondary" />
            </div>
            <h3 className="text-xl font-black mb-2">Cyclostationary Analysis</h3>
            <p className="text-sm text-muted-foreground mb-3">
              FFT Accumulation Method (FAM) for Spectral Correlation Function with
              interactive 3D surface visualization using Three.js.
            </p>
            <div className="technical-label">FAM • SCF Surface • Cycle Detection</div>
          </Card>

          <Card className="p-6 data-panel">
            <div className="wireframe-cyan w-12 h-12 rounded flex items-center justify-center mb-4">
              <Activity className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-xl font-black mb-2">WebGL Spectrogram</h3>
            <p className="text-sm text-muted-foreground mb-3">
              High-performance GPU-accelerated spectrogram with tiled rendering,
              Viridis/Turbo colormaps, and 60 FPS performance.
            </p>
            <div className="technical-label">Texture Rendering • Box Selection • Zoom</div>
          </Card>

          <Card className="p-6 data-panel">
            <div className="wireframe-pink w-12 h-12 rounded flex items-center justify-center mb-4">
              <Radio className="w-6 h-6 text-secondary" />
            </div>
            <h3 className="text-xl font-black mb-2">Modulation Classification</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Blind modulation classification using TorchSig models with confidence
              scores for QPSK, 8PSK, 16-QAM, and more.
            </p>
            <div className="technical-label">TorchSig • Deep Learning • Probability</div>
          </Card>

          <Card className="p-6 data-panel">
            <div className="wireframe-cyan w-12 h-12 rounded flex items-center justify-center mb-4">
              <Binary className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-xl font-black mb-2">Signal Measurements</h3>
            <p className="text-sm text-muted-foreground mb-3">
              M2M4 SNR estimator, CFO estimation with Costas loop, and baud rate
              detection for comprehensive signal characterization.
            </p>
            <div className="technical-label">SNR • CFO • Baud Rate</div>
          </Card>

          <Card className="p-6 data-panel">
            <div className="wireframe-pink w-12 h-12 rounded flex items-center justify-center mb-4">
              <MessageSquare className="w-6 h-6 text-secondary" />
            </div>
            <h3 className="text-xl font-black mb-2">Natural Language Interface</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Ask questions about signal characteristics, generate analysis reports,
              and get plain-language explanations of modulation schemes.
            </p>
            <div className="technical-label">LLM • Context-Aware • Reports</div>
          </Card>
        </div>

        {/* Technical Specifications */}
        <Card className="p-8 data-panel">
          <h2 className="mb-6 text-center">Technical Architecture</h2>
          
          <div className="grid md:grid-cols-3 gap-8">
            <div>
              <h3 className="text-lg font-black mb-3">Signal Processing</h3>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  <span>FFT Accumulation Method (FAM)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  <span>Power Method CFO Estimation</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  <span>Costas Loop Fine-Tuning</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  <span>M2M4 SNR Estimator</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  <span>Apache Arrow Zero-Copy Transport</span>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-black mb-3">Visualization</h3>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-secondary">•</span>
                  <span>WebGL Texture-Based Rendering</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-secondary">•</span>
                  <span>Ping-Pong Framebuffer Persistence</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-secondary">•</span>
                  <span>Three.js 3D SCF Surface</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-secondary">•</span>
                  <span>Viridis/Turbo Colormap Shaders</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-secondary">•</span>
                  <span>60 FPS Performance Target</span>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-black mb-3">Forensic Workflow</h3>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  <span>SigMF Schema Validation</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  <span>SHA512 Integrity Checking</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  <span>Annotation System with Persistence</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  <span>Real-Time Processing Updates</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  <span>S3 Storage with Range Requests</span>
                </li>
              </ul>
            </div>
          </div>
        </Card>

        {/* Mathematical Formula Decoration */}
        <div className="mt-16 text-center">
          <div className="inline-block wireframe-cyan px-8 py-4 rounded">
            <p className="font-mono text-sm italic">
              S<sub>x</sub><sup>α</sup>(f) = lim<sub>T→∞</sub> (1/T) E[X<sub>T</sub>(f + α/2) X<sub>T</sub>*(f - α/2)]
            </p>
            <p className="technical-label mt-2">Spectral Correlation Function</p>
          </div>
        </div>
      </div>
    </div>
  );
}
