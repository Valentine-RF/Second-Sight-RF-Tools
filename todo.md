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
