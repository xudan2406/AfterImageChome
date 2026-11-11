import type { ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'icon-action';
type ButtonSize = 'default' | 'small';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({
  variant = 'secondary',
  size = 'default',
  className = '',
  type = 'button',
  ...props
}: ButtonProps) {
  const classes = ['button', `button-${variant}`, size === 'small' ? 'button-small' : '', className]
    .filter(Boolean)
    .join(' ');

  return <button type={type} className={classes} {...props} />;
}

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

export function IconButton({ className = '', type = 'button', ...props }: IconButtonProps) {
  return <button type={type} className={['icon-button', className].filter(Boolean).join(' ')} {...props} />;
}
