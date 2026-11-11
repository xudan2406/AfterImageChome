import { Image } from 'lucide-react';

type BrandMarkProps = {
  size?: 'default' | 'small';
};

export function BrandMark({ size = 'default' }: BrandMarkProps) {
  return (
    <span className={`brand-mark ${size === 'small' ? 'brand-mark-small' : ''}`} aria-hidden="true">
      <Image size={size === 'small' ? 15 : 18} strokeWidth={2.2} />
    </span>
  );
}
