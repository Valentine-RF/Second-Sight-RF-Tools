#!/usr/bin/env python3
"""
Blind Modulation Classification using TorchSig
GPU-accelerated ML inference with pre-trained models
"""

import sys
import json
import numpy as np
import torch
import torch.nn.functional as F

# TorchSig imports (will be available on NVIDIA backend)
try:
    from torchsig.models.iq_models import efficientnet_b4
    from torchsig.transforms import Normalize
    TORCHSIG_AVAILABLE = True
except ImportError:
    TORCHSIG_AVAILABLE = False
    print("Warning: TorchSig not available, using mock classification", file=sys.stderr)


# Modulation classes supported by TorchSig models
MODULATION_CLASSES = [
    'OOK', '4ASK', '8ASK',
    'BPSK', 'QPSK', '8PSK', '16PSK', '32PSK', '64PSK',
    '16QAM', '32QAM', '64QAM', '128QAM', '256QAM',
    '2FSK', '4FSK', '8FSK', '16FSK',
    'OFDM-64', 'OFDM-72', 'OFDM-128', 'OFDM-180', 'OFDM-256',
    '16APSK', '32APSK', '64APSK', '128APSK', '256APSK',
    'AM-SSB-WC', 'AM-SSB-SC', 'AM-DSB-WC', 'AM-DSB-SC',
    'FM', 'GMSK', 'OQPSK'
]


class ModulationClassifier:
    """TorchSig-based modulation classifier"""
    
    def __init__(self, model_path: str = None, use_gpu: bool = True):
        self.use_gpu = use_gpu and torch.cuda.is_available()
        self.device = torch.device('cuda' if self.use_gpu else 'cpu')
        
        print(f"[Classifier] Device: {self.device}", file=sys.stderr)
        
        if not TORCHSIG_AVAILABLE:
            self.model = None
            return
        
        # Load pre-trained model
        if model_path:
            self.model = torch.load(model_path, map_location=self.device)
        else:
            # Use default EfficientNet-B4 architecture
            self.model = efficientnet_b4(pretrained=False, num_classes=len(MODULATION_CLASSES))
            # In production, load pre-trained weights here
            # self.model.load_state_dict(torch.load('path/to/weights.pth'))
        
        self.model.to(self.device)
        self.model.eval()
        
        # Normalization transform
        self.normalize = Normalize(norm=np.inf)
    
    def preprocess(self, iq_samples: np.ndarray, target_length: int = 4096) -> torch.Tensor:
        """
        Preprocess IQ samples for TorchSig model
        
        Args:
            iq_samples: Complex IQ samples
            target_length: Target sample count (1024, 4096, etc.)
        
        Returns:
            Preprocessed tensor (1, 2, target_length) - batch, I/Q, samples
        """
        # Extract slice if too long
        if len(iq_samples) > target_length:
            # Take middle section
            start = (len(iq_samples) - target_length) // 2
            iq_samples = iq_samples[start:start + target_length]
        elif len(iq_samples) < target_length:
            # Zero-pad if too short
            pad_width = target_length - len(iq_samples)
            iq_samples = np.pad(iq_samples, (0, pad_width), mode='constant')
        
        # Split into I and Q channels
        i_channel = np.real(iq_samples).astype(np.float32)
        q_channel = np.imag(iq_samples).astype(np.float32)
        
        # Stack as (2, N) array
        iq_array = np.stack([i_channel, q_channel], axis=0)
        
        # Normalize to unit power
        power = np.mean(np.abs(iq_samples) ** 2)
        if power > 0:
            iq_array = iq_array / np.sqrt(power)
        
        # Convert to tensor and add batch dimension
        iq_tensor = torch.from_numpy(iq_array).unsqueeze(0)  # (1, 2, N)
        
        return iq_tensor.to(self.device)
    
    def classify(self, iq_samples: np.ndarray, top_k: int = 5) -> dict:
        """
        Classify modulation type
        
        Args:
            iq_samples: Complex IQ samples
            top_k: Number of top predictions to return
        
        Returns:
            Dictionary with classification results
        """
        if not TORCHSIG_AVAILABLE or self.model is None:
            # Mock classification for testing
            return self._mock_classify(top_k)
        
        # Preprocess
        iq_tensor = self.preprocess(iq_samples)
        
        print(f"[Classifier] Input shape: {iq_tensor.shape}", file=sys.stderr)
        
        # Inference
        with torch.no_grad():
            logits = self.model(iq_tensor)
            probabilities = F.softmax(logits, dim=1)
        
        # Get top-k predictions
        probs_np = probabilities.cpu().numpy()[0]
        top_indices = np.argsort(probs_np)[::-1][:top_k]
        
        results = {
            'predictions': [
                {
                    'modulation': MODULATION_CLASSES[idx],
                    'probability': float(probs_np[idx]),
                    'confidence': float(probs_np[idx] * 100)
                }
                for idx in top_indices
            ],
            'all_probabilities': {
                MODULATION_CLASSES[i]: float(probs_np[i])
                for i in range(len(MODULATION_CLASSES))
            }
        }
        
        print(f"[Classifier] Top prediction: {results['predictions'][0]['modulation']} "
              f"({results['predictions'][0]['confidence']:.1f}%)", file=sys.stderr)
        
        return results
    
    def _mock_classify(self, top_k: int = 5) -> dict:
        """Mock classification for testing without TorchSig"""
        # Generate random probabilities
        probs = np.random.dirichlet(np.ones(len(MODULATION_CLASSES)))
        top_indices = np.argsort(probs)[::-1][:top_k]
        
        return {
            'predictions': [
                {
                    'modulation': MODULATION_CLASSES[idx],
                    'probability': float(probs[idx]),
                    'confidence': float(probs[idx] * 100),
                    'mock': True
                }
                for idx in top_indices
            ],
            'all_probabilities': {
                MODULATION_CLASSES[i]: float(probs[i])
                for i in range(len(MODULATION_CLASSES))
            },
            'warning': 'TorchSig not available - using mock classification'
        }


def main():
    """
    CLI interface for modulation classification
    
    Input (stdin): JSON with {iq_real: [], iq_imag: [], params: {}}
    Output (stdout): JSON with classification results
    """
    # Read input from stdin
    input_data = json.load(sys.stdin)
    
    iq_real = np.array(input_data['iq_real'], dtype=np.float32)
    iq_imag = np.array(input_data['iq_imag'], dtype=np.float32)
    iq_samples = iq_real + 1j * iq_imag
    
    params = input_data.get('params', {})
    
    # Classification parameters
    model_path = params.get('model_path')
    use_gpu = params.get('use_gpu', True)
    top_k = params.get('top_k', 5)
    
    # Run classification
    classifier = ModulationClassifier(model_path=model_path, use_gpu=use_gpu)
    results = classifier.classify(iq_samples, top_k=top_k)
    
    # Output JSON to stdout
    print(json.dumps(results, indent=2))


if __name__ == '__main__':
    main()
