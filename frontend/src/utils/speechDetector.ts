import Meyda, { MeydaAudioFeature } from "meyda";

export interface SpeechDetectionResult {
  isSpeech: boolean;
  confidence: number; // 0-1
  features: {
    spectralCentroid: number;
    spectralRolloff: number;
    mfcc: number[]; // 13 MFCC coefficients
    zcr: number; // Zero-crossing rate
    energy: number;
  };
}

export interface SpeechFrequencyBands {
  lowNoise: { start: number; end: number }; // 0-200 Hz
  fundamental: { start: number; end: number }; // 85-255 Hz
  formants: { start: number; end: number }; // 300-3400 Hz
  consonants: { start: number; end: number }; // 3400-8000 Hz
}

// SPEECH_BANDS kept for potential future use
// const SPEECH_BANDS: SpeechFrequencyBands = {
//   lowNoise: { start: 0, end: 200 },
//   fundamental: { start: 85, end: 255 },
//   formants: { start: 300, end: 3400 },
//   consonants: { start: 3400, end: 8000 },
// };

export class SpeechDetector {
  private extractor: ReturnType<typeof Meyda.createMeydaAnalyzer> | null = null;
  private audioContext: AudioContext;
  private analyser: AnalyserNode;
  private sampleRate: number;
  private frameSkip = 3; // Analyze every 3rd frame for performance
  private frameCount = 0;
  private lastResult: SpeechDetectionResult | null = null;

  constructor(
    audioContext: AudioContext,
    analyser: AnalyserNode,
    source: AudioNode,
  ) {
    this.audioContext = audioContext;
    this.analyser = analyser;
    this.sampleRate = audioContext.sampleRate;

    // Initialize Meyda extractor
    try {
      this.extractor = Meyda.createMeydaAnalyzer({
        audioContext: audioContext,
        source: source,
        bufferSize: 2048, // Good balance of resolution and performance
        featureExtractors: [
          "spectralCentroid",
          "spectralRolloff",
          "mfcc", // 13 coefficients
          "zcr",
          "energy",
          // Removed 'spectralFlux' - causes error in Meyda
        ],
        callback: () => {
          // Callback handled in detectSpeech()
        },
      });
    } catch (error) {
      console.error("Failed to initialize Meyda:", error);
    }
  }

  detectSpeech(): SpeechDetectionResult {
    this.frameCount++;

    // Skip frames for performance (analyze every 3rd frame)
    if (this.frameCount % this.frameSkip !== 0 && this.lastResult) {
      return this.lastResult;
    }

    if (!this.extractor) {
      // Fallback: return neutral result if Meyda not available
      return {
        isSpeech: false,
        confidence: 0,
        features: {
          spectralCentroid: 0,
          spectralRolloff: 0,
          mfcc: [],
          zcr: 0,
          energy: 0,
        },
      };
    }

    // Get features from Meyda
    const features = this.extractor.get([
      "spectralCentroid",
      "spectralRolloff",
      "mfcc",
      "zcr",
      "energy",
      // Removed 'spectralFlux' - causes error in Meyda
    ] as MeydaAudioFeature[]);

    if (!features) {
      return this.lastResult || this.getDefaultResult();
    }

    // Extract and normalize features
    const spectralCentroid = features.spectralCentroid || 0;
    const spectralRolloff = features.spectralRolloff || 0;
    const mfcc = features.mfcc || [];
    const zcr = features.zcr || 0;
    const energy = features.energy || 0;

    // Calculate scores for each feature
    const centroidScore = this.normalizeSpectralCentroid(spectralCentroid);
    const rolloffScore = this.normalizeSpectralRolloff(spectralRolloff);
    const mfccScore = this.calculateMFCCScore(mfcc);
    const zcrScore = this.normalizeZCR(zcr);
    const formantScore = this.detectFormantsFromMFCC(mfcc);

    // Weighted combination - balanced for better speech detection
    // Adjusted to be more sensitive to actual speech while still filtering noise
    const weights = {
      centroid: 0.15,
      rolloff: 0.1,
      mfcc: 0.25, // MFCCs are strong speech indicators
      formant: 0.3, // Formants are most important for speech
      zcr: 0.1,
      energy: 0.1, // Energy can help detect speech presence
    };

    const confidence =
      centroidScore * weights.centroid +
      rolloffScore * weights.rolloff +
      mfccScore * weights.mfcc +
      formantScore * weights.formant +
      zcrScore * weights.zcr +
      (energy > 0.01 ? 0.1 : 0) * weights.energy; // Lowered energy threshold to detect speech better

    // Balanced threshold - lowered to detect speech better
    const isSpeech = confidence >= 0.5;

    const result: SpeechDetectionResult = {
      isSpeech,
      confidence,
      features: {
        spectralCentroid,
        spectralRolloff,
        mfcc,
        zcr,
        energy,
      },
    };

    this.lastResult = result;
    return result;
  }

  private normalizeSpectralCentroid(centroid: number): number {
    if (centroid < 500) return 0; // Too low, likely noise
    if (centroid > 3000) return 0.5; // Too high, might be noise or consonants
    if (centroid >= 500 && centroid <= 3000) {
      // Peak score at 1500 Hz (typical speech centroid)
      const distanceFromPeak = Math.abs(centroid - 1500);
      return Math.max(0, 1 - distanceFromPeak / 1500);
    }
    return 0;
  }

  private normalizeSpectralRolloff(rolloff: number): number {
    if (rolloff >= 2000 && rolloff <= 4000) {
      return 1.0; // Perfect speech range
    }
    if (rolloff < 2000) {
      return Math.max(0, rolloff / 2000); // Partial score
    }
    if (rolloff > 4000) {
      return Math.max(0, 1 - (rolloff - 4000) / 4000); // Partial score
    }
    return 0.5;
  }

  private calculateMFCCScore(mfcc: number[]): number {
    if (!mfcc || mfcc.length === 0) return 0;

    // MFCC coefficients for speech have specific patterns
    // C0 (energy) should be significant
    // C1-C3 capture formant information
    const c0 = Math.abs(mfcc[0] || 0);
    const c1 = Math.abs(mfcc[1] || 0);
    const c2 = Math.abs(mfcc[2] || 0);
    const c3 = Math.abs(mfcc[3] || 0);

    // Speech typically has:
    // - Significant C0 (energy)
    // - Non-zero C1-C3 (formant information)
    // Lowered thresholds to be more sensitive
    const energyScore = Math.min(1, c0 / 8); // Lowered from 10 to 8 - more sensitive
    const formantScore = Math.min(1, (c1 + c2 + c3) / 25); // Lowered from 30 to 25 - more sensitive

    return Math.min(1, energyScore * 0.5 + formantScore * 0.5);
  }

  private detectFormantsFromMFCC(mfcc: number[]): number {
    if (!mfcc || mfcc.length < 4) return 0;

    // MFCC C1-C3 capture formant information
    // If these are significant, formants are present
    const c1 = Math.abs(mfcc[1] || 0);
    const c2 = Math.abs(mfcc[2] || 0);
    const c3 = Math.abs(mfcc[3] || 0);

    // Threshold: formants present if C1-C3 have significant values
    // Lowered threshold to be more sensitive to speech
    const formantMagnitude = (c1 + c2 + c3) / 3;
    const threshold = 1.5; // Lowered from 2.0 to 1.5 - more sensitive to speech

    if (formantMagnitude > threshold) {
      return Math.min(1, formantMagnitude / (threshold * 2));
    }

    return 0;
  }

  private normalizeZCR(zcr: number): number {
    if (zcr >= 1000 && zcr <= 3000) {
      return 1.0; // Perfect speech range
    }
    if (zcr < 1000) {
      return Math.max(0, zcr / 1000); // Partial score
    }
    if (zcr > 3000) {
      // Too high might be noise, but could be consonants
      return Math.max(0, 1 - (zcr - 3000) / 3000);
    }
    return 0.5;
  }

  private getDefaultResult(): SpeechDetectionResult {
    return {
      isSpeech: false,
      confidence: 0,
      features: {
        spectralCentroid: 0,
        spectralRolloff: 0,
        mfcc: [],
        zcr: 0,
        energy: 0,
      },
    };
  }

  dispose(): void {
    if (this.extractor) {
      // Meyda doesn't have explicit dispose, but we can null the reference
      this.extractor = null;
    }
  }
}
