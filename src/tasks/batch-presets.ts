import { OUTPUT_FORMATS, type OutputCapabilities, type OutputFormat } from '../engine/types';

export const BATCH_PRESETS = [
  {
    id: 'web-optimization',
    label: 'Web Optimization',
    description: 'WebP at 82% when available; dimensions stay unchanged unless you set them.',
  },
  {
    id: 'social-media',
    label: 'Social Media',
    description: 'JPEG at 88%; configure dimensions below if needed.',
  },
  {
    id: 'high-quality',
    label: 'High Quality',
    description: '95% quality in the current supported format, with no preset resizing.',
  },
  {
    id: 'small-file-size',
    label: 'Small File Size',
    description: 'WebP at 65% when available; lower quality may reduce image detail.',
  },
] as const;

export type BatchPresetId = (typeof BATCH_PRESETS)[number]['id'];
export type BatchPresetSelection = BatchPresetId | 'custom';

export type BatchPresetSettings = {
  format: OutputFormat;
  quality: number;
  width: string;
  height: string;
  keepAspectRatio: boolean;
};

export function getBatchPresetSettings(
  preset: BatchPresetId,
  capabilities: OutputCapabilities,
  currentFormat: OutputFormat,
): BatchPresetSettings {
  const supportedFormat = (
    preferred: OutputFormat,
  ): OutputFormat => {
    if (capabilities[preferred]) return preferred;
    if (capabilities[currentFormat]) return currentFormat;
    return OUTPUT_FORMATS.find((format) => capabilities[format]) ?? currentFormat;
  };

  const common = { width: '', height: '', keepAspectRatio: true };
  switch (preset) {
    case 'web-optimization':
      return { ...common, format: supportedFormat('webp'), quality: 0.82 };
    case 'social-media':
      return { ...common, format: supportedFormat('jpeg'), quality: 0.88 };
    case 'high-quality':
      return { ...common, format: supportedFormat(currentFormat), quality: 0.95 };
    case 'small-file-size':
      return { ...common, format: supportedFormat('webp'), quality: 0.65 };
  }
}
