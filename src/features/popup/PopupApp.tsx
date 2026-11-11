import { useState } from 'react';
import { ArrowUpRight, LockKeyhole, Sparkles } from 'lucide-react';
import { BrandMark } from '../../components/ui/BrandMark';
import { Button } from '../../components/ui/Button';

export function PopupApp() {
  const [error, setError] = useState('');

  async function openWorkspace() {
    setError('');
    try {
      const currentWindow = await chrome.windows.getCurrent();
      if (currentWindow.id === undefined) {
        throw new Error('The current browser window is unavailable.');
      }
      await chrome.sidePanel.open({ windowId: currentWindow.id });
      window.close();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not open the workspace.';
      setError(message);
      console.error('AfterImage could not open the side panel.', cause);
    }
  }

  return (
    <main className="popup-shell">
      <header className="popup-header">
        <BrandMark />
        <div>
          <p className="brand-name">AfterImage</p>
          <p className="brand-caption">IMAGE WORKSPACE</p>
        </div>
        <span className="version-pill">LOCAL</span>
      </header>

      <section className="popup-intro">
        <div className="eyebrow"><Sparkles size={13} /> YOUR PRIVATE STUDIO</div>
        <h1>Make more of<br />every image.</h1>
        <p>Bring your images into a focused workspace. Your files stay on this device.</p>
      </section>

      <Button variant="primary" className="popup-cta" onClick={openWorkspace}>
        Open workspace <ArrowUpRight size={16} />
      </Button>
      {error && <p className="inline-error" role="alert">{error}</p>}

      <footer className="privacy-note">
        <LockKeyhole size={14} />
        <span>Private by design. No uploads, no account.</span>
      </footer>
    </main>
  );
}
