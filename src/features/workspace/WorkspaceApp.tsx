import { useEffect, useState } from 'react';
import {
  Archive,
  ArrowDownToLine,
  Check,
  ChevronDown,
  Clock3,
  Crop,
  Image,
  Images,
  PanelLeftClose,
  Settings2,
  WandSparkles,
} from 'lucide-react';
import { BrandMark } from '../../components/ui/BrandMark';
import { IconButton } from '../../components/ui/Button';
import { ImageStudio, type PendingImage } from './ImageStudio';
import { BatchStudio } from './BatchStudio';
import { EditorStudio } from './EditorStudio';
import { HistoryStudio } from './HistoryStudio';
import type { HomeMode } from './home-mode';

type ViewId = 'home' | 'batch' | 'editor' | 'history' | 'settings';

const navigationGroups: { label: string; items: { id: ViewId | HomeMode; label: string; icon: typeof Image }[] }[] = [
  { label: 'WORKSPACE', items: [{ id: 'home', label: 'Home', icon: Image }, { id: 'batch', label: 'Batch', icon: Images }] },
  { label: 'TOOLS', items: [
    { id: 'convert', label: 'Convert', icon: ArrowDownToLine },
    { id: 'compress', label: 'Compress', icon: Archive },
    { id: 'resize', label: 'Resize', icon: Crop },
    { id: 'editor', label: 'Editor', icon: WandSparkles },
  ] },
  { label: 'LIBRARY', items: [{ id: 'history', label: 'History', icon: Clock3 }] },
  { label: 'PREFERENCES', items: [{ id: 'settings', label: 'Settings', icon: Settings2 }] },
];

export function WorkspaceApp() {
  const [activeView, setActiveView] = useState<ViewId>('home');
  const [homeMode, setHomeMode] = useState<HomeMode>('convert');
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [navigationCollapsed, setNavigationCollapsed] = useState(false);

  useEffect(() => {
    void chrome.storage.session.get('pendingImage').then((stored) => {
      const nextImage = (stored.pendingImage as PendingImage | undefined) ?? null;
      setPendingImage(nextImage);
      if (nextImage) setActiveView(nextImage.action === 'batch' ? 'batch' : 'home');
      if (nextImage?.action === 'compress') setHomeMode('compress');
      else if (nextImage?.action === 'png' || nextImage?.action === 'webp') setHomeMode('convert');
    }).catch((cause: unknown) => {
      console.error('AfterImage could not read the selected page image.', cause);
    });

    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
      if (area === 'session' && changes.pendingImage) {
        const nextImage = (changes.pendingImage.newValue as PendingImage | undefined) ?? null;
        setPendingImage(nextImage);
        if (nextImage) setActiveView(nextImage.action === 'batch' ? 'batch' : 'home');
        if (nextImage?.action === 'compress') setHomeMode('compress');
        else if (nextImage?.action === 'png' || nextImage?.action === 'webp') setHomeMode('convert');
      }
    };
    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  async function clearPendingImage() {
    setPendingImage(null);
    try {
      await chrome.storage.session.remove('pendingImage');
    } catch (cause) {
      console.error('AfterImage could not clear the selected page image.', cause);
    }
  }

  return (
    <div className={`workspace ${navigationCollapsed ? 'is-nav-collapsed' : ''}`}>
      <aside className="rail" aria-label="Main navigation">
        <div className="rail-brand" title="AfterImage"><BrandMark /></div>
        <nav className="rail-nav">
          {navigationGroups.map((group) => (
            <div className="rail-nav-group" key={group.label}>
              <span className="rail-group-label">{group.label}</span>
              {group.items.map(({ id, label, icon: Icon }) => {
                const isMode = id === 'convert' || id === 'compress' || id === 'resize';
                const active = isMode ? activeView === 'home' && homeMode === id : activeView === id;
                return (
                  <button
                    key={id}
                    className={`rail-link ${active ? 'is-active' : ''}`}
                    onClick={() => {
                      if (isMode) {
                        setHomeMode(id);
                        setActiveView('home');
                      } else {
                        setActiveView(id);
                      }
                    }}
                    aria-current={active ? 'page' : undefined}
                    title={label}
                    aria-label={label}
                  >
                    <Icon size={17} strokeWidth={1.8} />
                    <span>{label}</span>
                    {active && <Check size={14} className="rail-active-check" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      <main className="workspace-main">
        <header className="workspace-header">
          <div className="header-brand">
            <BrandMark size="small" />
            <span>AfterImage</span>
            <ChevronDown size={13} className="muted-icon" />
          </div>
          <div className="header-actions">
            <span className="local-badge"><span /> LOCAL</span>
            <IconButton
              onClick={() => setNavigationCollapsed((collapsed) => !collapsed)}
              aria-label={navigationCollapsed ? 'Expand workspace navigation' : 'Collapse workspace navigation'}
              aria-expanded={!navigationCollapsed}
              title={navigationCollapsed ? 'Expand navigation' : 'Collapse navigation'}
            >
              <PanelLeftClose size={16} />
            </IconButton>
          </div>
        </header>

        <section className="workspace-content">
          <div hidden={activeView !== 'home'}>
            <ImageStudio
              mode={homeMode}
              onModeChange={setHomeMode}
              pendingImage={pendingImage}
              onClearPendingImage={() => void clearPendingImage()}
            />
          </div>
          <div hidden={activeView !== 'batch'}>
            <BatchStudio pendingImage={pendingImage} onClearPendingImage={() => void clearPendingImage()} />
          </div>
          {activeView === 'history' && <HistoryStudio />}
          <div hidden={activeView !== 'editor'}>
            <EditorStudio />
          </div>
          {activeView === 'settings' && (
            <section className="coming-soon">
              <div className="coming-icon"><Settings2 size={21} /></div>
              <p className="eyebrow">PREFERENCES</p>
              <h1>Settings</h1>
              <p>Settings are not available yet. Image processing currently uses your browser’s light or dark appearance.</p>
            </section>
          )}
        </section>
      </main>
    </div>
  );
}
