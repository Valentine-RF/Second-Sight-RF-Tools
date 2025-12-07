# Forensic Signal Processing Web App - TODO

## Database & Backend Infrastructure
- [x] Push database schema with signal captures, annotations, processing jobs, and chat messages tables
- [x] Create database helper functions for signal captures CRUD operations
- [x] Create database helper functions for annotations CRUD operations
- [x] Create database helper functions for processing jobs management
- [x] Create database helper functions for chat messages storage

## SigMF File Processing
- [x] Implement SigMF metadata parser with schema validation
- [x] Implement SigMF data file handler with binary reading support
- [ ] Create file upload endpoint with multipart form handling
- [ ] Implement S3 upload for .sigmf-meta and .sigmf-data files
- [x] Add SHA512 integrity checking for uploaded files
- [ ] Create HTTP Range request handler for streaming large signal files

## Signal Processing Algorithms
- [ ] Implement FFT Accumulation Method (FAM) for Spectral Correlation Function
- [ ] Implement CFO estimation using power method
- [ ] Implement Costas loop for fine-tuning CFO
- [ ] Implement M2M4 SNR estimator
- [ ] Integrate TorchSig model loading for blind modulation classification
- [ ] Create demodulation pipeline with matched filter and timing recovery
- [ ] Implement Apache Arrow serialization for IQ sample transport

## WebGL Visualizations
- [x] Create WebGL spectrogram renderer with texture-based rendering
- [x] Implement tiled rendering system with multiple zoom levels
- [x] Add Viridis/Turbo colormap fragment shaders
- [x] Implement box selection for time-frequency isolation
- [x] Create WebGL constellation plot with ping-pong framebuffer
- [x] Add persistence/trail effects with opacity decay
- [ ] Optimize for 60 FPS performance with large datasets

## Three.js 3D Visualization
- [x] Create Three.js scene setup with React-Three-Fiber
- [x] Implement PlaneGeometry for SCF surface visualization
- [x] Add Z-height mapping from SCF magnitude data
- [x] Implement rotation controls with OrbitControls
- [x] Add lighting and material shaders for surface
- [ ] Create cross-section slicing functionality

## Forensic Cockpit UI Layout
- [x] Design mathematical blueprint aesthetic with white grid background
- [x] Add geometric diagrams and wireframe shapes in pastel cyan/pink
- [x] Implement bold black sans-serif headlines with monospaced technical labels
- [x] Create global timeline spectrogram component (top, full width)
- [x] Build main workspace with high-resolution spectrogram (center, dominant)
- [x] Create collapsible analysis dock with 4 tabs (bottom)
- [x] Build signal inspector sidebar (right, persistent)
- [x] Add navigation window (draggable viewport box) to timeline
- [x] Implement annotation markers as colored flags on timeline

## Main Workspace Features
- [ ] Implement box select with right-click drag for time-frequency regions
- [ ] Create context menu with "Analyze Cycles", "Classify Modulation", "Demodulate" actions
- [ ] Add semi-transparent annotation overlays on spectrogram
- [ ] Implement zoom and pan controls for spectrogram

## Analysis Dock Tabs
- [ ] Tab 1: Spectrum/FFT PSD plot with frequency axis
- [ ] Tab 2: Constellation plot with WebGL persistence
- [ ] Tab 3: Cyclostationary 3D SCF surface with Three.js
- [ ] Tab 4: Hex view for demodulated bitstream output

## Signal Inspector Sidebar
- [ ] Create metadata card displaying core:hw, core:author, core:sample_rate
- [ ] Add measurements panel with Est. SNR, Est. Baud, CFO readouts
- [ ] Create classification bar chart showing probability distribution
- [ ] Build DSP chain visualization showing processing pipeline
- [ ] Add parameter adjustment controls for filter bandwidth, decimation

## Annotation System
- [ ] Create annotation creation workflow from box selection
- [ ] Implement annotation persistence to database and SigMF format
- [ ] Add annotation editing and deletion functionality
- [ ] Create annotation export to SigMF annotations array
- [ ] Implement color picker for annotation flags

## Real-time Processing & WebSocket
- [ ] Set up WebSocket server for real-time status updates
- [ ] Implement job queue for async GPU tasks
- [ ] Create WebSocket client connection in frontend
- [ ] Add progress notifications for FAM computation
- [ ] Add completion notifications for TorchSig inference
- [ ] Add status updates for demodulation tasks

## Natural Language Interface
- [x] Create chat interface component with message history
- [x] Implement LLM integration for signal analysis queries
- [ ] Add context awareness for current signal capture
- [ ] Create report generation from classification results
- [ ] Implement modulation scheme explanation in plain language
- [ ] Add anomaly detection description capabilities

## File Management
- [x] Create file upload interface with drag-and-drop
- [x] Build file list view with signal capture metadata
- [ ] Add file deletion with S3 cleanup
- [ ] Implement file download for processed results
- [ ] Create SigMF export functionality with annotations

## Testing & Validation
- [x] Write vitest tests for SigMF parser
- [x] Write vitest tests for signal processing procedures
- [x] Write vitest tests for file upload and S3 storage
- [x] Write vitest tests for annotation CRUD operations
- [x] Write vitest tests for chat message handling
- [x] Test complete workflow from upload to analysis
- [ ] Validate WebGL performance with large datasets
- [ ] Test Apache Arrow zero-copy data transport

## Deployment & Documentation
- [ ] Create comprehensive API documentation
- [ ] Write user guide for forensic workflow
- [ ] Document signal processing algorithms with mathematical formulas
- [ ] Add inline code documentation with function signatures
- [ ] Create checkpoint for production deployment

## Dark Mode Implementation
- [x] Update CSS theme with dark mode color palette (inverted blueprint)
- [x] Add theme toggle button to navigation
- [x] Enable switchable theme in ThemeProvider
- [x] Test dark mode across all pages and components
- [x] Verify WebGL visualizations work in dark mode

## Dark Mode Default Fix
- [x] Change default theme from light to dark
- [x] Verify dark mode displays on initial page load
- [x] Test theme persistence across page refreshes

## Bug Fixes
- [x] Fix nested anchor tag error in navigation (Link wrapping <a>)

## UX Improvements
- [x] Create skeleton loading components for file list
- [x] Create skeleton loading components for cockpit interface
- [x] Implement WebGL error boundary component
- [x] Create fallback UI for WebGL failures
- [x] Add file upload progress tracking with percentage
- [x] Display estimated time remaining for uploads
- [x] Add progress bar visualization for uploads

## Drag-and-Drop Upload
- [x] Create drag-and-drop upload zone component
- [x] Add visual drop target highlighting
- [x] Handle file validation on drop
- [x] Support dropping both .sigmf-meta and .sigmf-data files
- [x] Integrate drag-and-drop into FileManager upload section

## Signal Comparison Mode
- [x] Create comparison mode page component
- [x] Add multi-select UI for choosing captures to compare
- [x] Implement side-by-side spectrogram layout (2-4 captures)
- [x] Add synchronized zoom controls
- [x] Implement synchronized time alignment
- [x] Add linked panning across all spectrograms
- [x] Create comparison toolbar with sync toggle
- [x] Add individual capture metadata display
- [x] Integrate comparison mode into navigation

## Comparison Mode Enhancements
- [x] Implement keyboard shortcuts (1-4 for capture selection, Space for sync toggle, +/- for zoom, arrows for time)
- [x] Create difference visualization mode with spectral difference heatmap
- [x] Add color-coded divergence display for anomaly detection
- [x] Implement PDF export button for comparison reports
- [x] Generate PDF with side-by-side screenshots and metadata table
- [x] Add analysis notes field for PDF export

## Annotation Notes & Waterfall Mode
- [x] Create database table for comparison session notes
- [x] Add backend tRPC procedures for notes CRUD operations
- [x] Implement annotation notes textarea in comparison UI
- [x] Add auto-save functionality with debouncing
- [x] Integrate notes into PDF export
- [x] Create waterfall display component with WebGL
- [x] Add waterfall/spectrogram toggle button
- [x] Implement time-domain signal evolution visualization
- [x] Add color-coded amplitude mapping for waterfall

## Advanced RF Forensic Analysis Features

### Higher-Order Statistics & Wavelet Analysis
- [x] Implement 4th and 6th order cumulant calculation for sub-noise detection
- [x] Add bispectrum and trispectrum analysis for phase coupling detection
- [x] Create wavelet packet decomposition with Daubechies (db4-db8) wavelets
- [x] Implement Morlet wavelet analysis for RF fingerprinting
- [ ] Add compressive sensing with OMP, CoSaMP, LASSO, FISTA algorithms
- [x] Create UI panel for higher-order statistics visualization

### Time-Frequency Analysis
- [ ] Implement Wigner-Ville Distribution (WVD) with cross-term mitigation
- [ ] Add Smoothed Pseudo-WVD and DMD-WVD variants
- [ ] Create Cohen's class distributions (Choi-Williams, Born-Jordan)
- [x] Implement synchrosqueezing transforms for mode extraction
- [ ] Add reassigned spectrogram visualization
- [ ] Create time-frequency analysis comparison view

### RF-DNA Fingerprinting & SEI
- [x] Implement AFIT RF-DNA feature extraction (180 features)
- [x] Add constellation-based DNA (CB-DNA) analysis
- [ ] Create bispectrum-Radon transform feature extraction
- [ ] Implement spectral regrowth analysis
- [ ] Add transient analysis with General Linear Chirplet Transform
- [ ] Create complex-valued CNN architecture for device classification
- [ ] Implement temperature-aware classification (TeRFF)
- [ ] Add cross-collection robustness mitigation
- [ ] Create RF fingerprint database and matching UI

### Protocol Identification
- [x] Implement preamble detection for 802.11, LTE, 5G NR
- [ ] Add Zadoff-Chu sequence correlation for LTE/5G
- [ ] Implement Schmidl-Cox OFDM synchronization algorithm
- [ ] Create clustering-based unknown waveform categorization
- [ ] Add DRCaG architecture for modulation + protocol classification
- [ ] Create protocol identification results panel

### Blind Source Separation
- [ ] Implement complex-valued FastICA for co-channel separation
- [ ] Add NMF spectrogram decomposition for interference detection
- [ ] Create tensor decomposition (CP/PARAFAC) for multi-dimensional data
- [ ] Implement self-interference cancellation with Volterra models
- [ ] Add blind source separation visualization

### Geolocation
- [ ] Implement TDOA with GCC-PHAT algorithm
- [ ] Add MUSIC algorithm for AOA/DOA estimation
- [ ] Create ESPRIT for efficient direction finding
- [ ] Implement hybrid TDOA/AOA fusion
- [ ] Add NLOS mitigation with ML classification
- [ ] Create geolocation map visualization with uncertainty ellipses

### ML-Based Anomaly Detection
- [x] Implement LSTM autoencoder for temporal I/Q anomaly detection
- [ ] Add variational autoencoder for spectrogram anomalies
- [ ] Create WANDA framework for unknown signal detection
- [ ] Implement XGBoost jamming detection classifier
- [ ] Add GPS spoofing detection with PCA-CNN-LSTM
- [ ] Create ADS-B spoofing detection (SODA framework)
- [ ] Implement IMSI catcher detection heuristics
- [ ] Add anomaly detection dashboard

### Advanced ML Architectures
- [ ] Implement CNN-Transformer hybrid for AMC
- [ ] Add causal attention mechanism for inference speedup
- [ ] Create prototypical networks for few-shot learning
- [ ] Implement MoCo self-supervised pre-training
- [ ] Add SimCLR contrastive learning for spectrograms
- [ ] Create complex-valued neural network layers
- [ ] Implement federated learning for distributed sensing

### GPU Acceleration & Deployment
- [ ] Integrate cuSignal for GPU-accelerated signal processing
- [ ] Add TorchSig 2.0 models and datasets
- [ ] Implement TensorRT optimization for inference
- [ ] Create model quantization (FP16/INT8) pipeline
- [ ] Add ONNX Runtime backend for ML models
- [ ] Create GPU processing status monitor

### Advanced Analysis UI
- [ ] Create tabbed analysis panel (Higher-Order Stats, RF-DNA, Protocol ID, Geolocation, Anomaly Detection)
- [ ] Add parameter configuration panels for each analysis type
- [ ] Implement real-time processing progress indicators
- [ ] Create results export in multiple formats (JSON, CSV, PDF)
- [ ] Add batch processing queue for multiple captures
- [ ] Create analysis templates for common forensic workflows


## Real-Time IQ Data Pipeline
- [x] Create Web Worker for off-thread FFT computation
- [x] Implement FFT.js or KissFFT WebAssembly integration
- [x] Add windowing functions (Hamming, Hann, Blackman-Harris)
- [x] Create binary .sigmf-data file reader with ArrayBuffer
- [x] Implement HTTP Range request support for streaming large files
- [x] Add IQ sample parser for different datatypes (cf32_le, ci16_le, cu8)
- [x] Build streaming data pipeline with chunked processing
- [x] Implement backpressure handling for real-time updates
- [x] Create data transfer protocol between Worker and main thread
- [x] Connect FFT results to Spectrogram component
- [x] Connect IQ samples to ConstellationPlot component
- [x] Connect FFT results to WaterfallDisplay component
- [x] Add progress indicators for file processing
- [x] Implement pause/resume controls for streaming
- [x] Add sample rate validation against metadata
- [x] Create performance monitoring for pipeline throughput


## Comprehensive PDF Export
- [x] Create PDF generation utility with jsPDF and jsPDF-AutoTable
- [x] Implement WebGL canvas capture for spectrograms
- [x] Implement Three.js scene capture for 3D SCF surface
- [x] Implement constellation plot capture
- [x] Create professional report template with header/footer
- [x] Add metadata table section to PDF
- [x] Add signal parameters section to PDF
- [x] Add measurements section (SNR, CFO, baud rate)
- [x] Add classification results section with probability bars
- [x] Add annotations section with timeline
- [x] Embed captured visualizations in PDF
- [x] Add analysis notes/findings section
- [x] Add timestamp and analyst information
- [x] Create export button in ForensicCockpit
- [ ] Create export button in AdvancedAnalysis
- [x] Add loading indicator during PDF generation
- [x] Add success toast notification after export


## Rebranding to "Second Sight" by Valentine RF
- [x] Extract and review design tokens from provided files
- [x] Update color scheme to ExtraHop-inspired dark theme (blues, silver, red)
- [x] Update CSS variables in index.css with new color palette
- [x] Update application name from "Forensic Signal Processor" to "Second Sight"
- [x] Add "by Valentine RF" branding
- [x] Add Google Fonts (Space Grotesk, IBM Plex Mono)
- [x] Update navigation header with new branding
- [x] Update HTML title and meta description
- [x] Update landing page with new brand identity
- [x] Test dark theme across all pages
- [x] Verify color contrast and accessibility


## Theme Accent Switcher
- [x] Create CSS variables for blue, red, and silver accent variants
- [x] Implement AccentContext for managing accent state
- [x] Create accent switcher UI component with mode indicators
- [x] Add accent switcher to navigation header
- [x] Apply accent colors to primary buttons and interactive elements
- [x] Update logo gradient to match selected accent
- [x] Add visual feedback for mode changes (toast notifications)
- [x] Persist accent preference to localStorage
- [x] Test all three accent modes across all pages

## Raw IQ File Upload Support
- [x] Add raw IQ file upload option to FileManager (accept .iq, .dat, .bin files)
- [x] Create manual metadata entry form (datatype, sample rate, center frequency, hardware)
- [x] Implement backend SigMF metadata generator from user inputs
- [x] Auto-generate .sigmf-meta JSON file with core fields
- [x] Store both raw IQ file and generated metadata in S3
- [x] Support common datatypes: cf32_le, ci16_le, cu8, ci8
- [x] Add file format auto-detection based on file size and patterns
- [x] Update upload flow to handle both native SigMF and raw IQ files
- [x] Test raw IQ upload with HackRF/RTL-SDR captures

## Bug Fixes - Streaming Pipeline
- [x] Fix infinite loop in ForensicCockpit useEffect (pipeline dependency issue)

## Advanced DSP/ML Features - Priority Implementation

### Cyclostationary Analysis (FAM Algorithm)
- [x] Set up Python backend with child process bridge
- [x] Install CuPy for GPU acceleration (or NumPy fallback)
- [x] Implement FAM algorithm steps:
  - [x] Channelization with Hamming window
  - [x] Short-Time FFT on overlapping blocks
  - [x] Down-conversion to baseband
  - [x] Cyclic FFT along time axis
  - [x] Magnitude calculation for SCF estimate
- [x] Implement Cyclic Profile computation (max-hold along spectral frequency)
- [x] Add Apache Arrow serialization for efficient data transport
- [ ] Set up Celery/Redis task queue for async processing
- [x] Create tRPC procedure for triggering FAM analysis
- [ ] Build Three.js 3D surface plot with React-Three-Fiber
- [ ] Add PlaneGeometry with Z-height displacement for SCF magnitude
- [ ] Implement rotation, lighting, and cross-section slicing
- [ ] Wire Cyclostationary tab to display 3D surface

### Blind Modulation Classification (TorchSig ML)
- [x] Install TorchSig and PyTorch dependencies
- [x] Download pre-trained EfficientNet or XCiT model
- [x] Create inference pipeline:
  - [x] Extract IQ slice (1024 or 4096 samples)
  - [x] Normalize to unit power
  - [x] Run through TorchSig model
  - [x] Return probability distribution (Softmax)
- [x] Add tRPC procedure for classification
- [ ] Update Classification panel to display real probabilities
- [ ] Add bar chart visualization for class probabilities
- [ ] Support modulation types: BPSK, QPSK, 8PSK, 16-QAM, 64-QAM, OFDM

### Context Menu Integration
- [ ] Add right-click handler to box selection in Main Workspace
- [ ] Create "Forensic Actions" context menu
- [ ] Add "Analyze Cycles" option → triggers FAM algorithm
- [ ] Add "Classify Modulation" option → triggers TorchSig inference
- [ ] Add "Save Annotation" option → writes to SigMF annotations
- [ ] Display loading states during async operations
- [ ] Show results in respective panels when complete


## Three.js 3D Visualization & Context Menu - In Progress

### Three.js 3D SCF Surface
- [x] Install @react-three/fiber and @react-three/drei
- [x] Create SCFSurface3D component with PlaneGeometry
- [x] Map SCF magnitude to Z-height displacement
- [x] Add rotation controls (OrbitControls)
- [x] Implement lighting and material (MeshStandardMaterial)
- [x] Add colormap for magnitude visualization
- [x] Wire to Cyclostationary tab

### S3 IQ Data Fetching
- [x] Implement HTTP Range request helper in server
- [x] Calculate byte offsets for cf32_le datatype
- [x] Fetch IQ samples from S3 dataFileUrl
- [x] Parse binary data to Float32Array (I/Q channels)
- [x] Update analyzeCycles procedure to use real data
- [x] Update classifyModulation procedure to use real data

### Context Menu Integration
- [x] Create ContextMenu component with Radix UI
- [x] Add right-click handler to box selection in Spectrogram
- [x] Show "Analyze Cycles", "Classify Modulation", "Save Annotation"
- [x] Trigger tRPC mutations on menu item click
- [x] Display loading states during processing
- [x] Update Signal Inspector panels with results

