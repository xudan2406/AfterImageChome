import { defineBackground } from 'wxt/utils/define-background';

export default defineBackground(() => {
  const menuItems = [
    { id: 'afterimage-open', action: 'open', title: 'Open image in AfterImage' },
    { id: 'afterimage-compress', action: 'compress', title: 'Compress with AfterImage' },
    { id: 'afterimage-png', action: 'png', title: 'Convert to PNG with AfterImage' },
    { id: 'afterimage-webp', action: 'webp', title: 'Convert to WebP with AfterImage' },
    { id: 'afterimage-batch', action: 'batch', title: 'Send image to AfterImage batch workspace' },
  ] as const;

  async function registerContextMenus() {
    try {
      await chrome.contextMenus.removeAll();
      for (const item of menuItems) {
        chrome.contextMenus.create({
          id: item.id,
          title: item.title,
          contexts: ['image'],
        });
      }
    } catch (error) {
      console.error('AfterImage failed to register image context menus.', error);
    }
  }

  chrome.runtime.onInstalled.addListener(() => {
    void registerContextMenus();
  });

  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    const item = menuItems.find(({ id }) => id === info.menuItemId);
    if (!item || !info.srcUrl) return;

    let sourceUrl: URL;
    try {
      sourceUrl = new URL(info.srcUrl);
    } catch (error) {
      console.error('AfterImage ignored an invalid image URL from a context menu.', error);
      return;
    }
    if (sourceUrl.protocol !== 'https:' && sourceUrl.protocol !== 'http:') {
      console.warn('AfterImage ignored a non-web image URL from a context menu.');
      return;
    }

    try {
      const storePendingImage = chrome.storage.session.set({
        pendingImage: {
          sourceUrl: sourceUrl.href,
          pageUrl: info.pageUrl,
          action: item.action,
          capturedAt: Date.now(),
        },
      });
      const windowId = tab?.windowId;
      if (windowId === undefined) throw new Error('The source browser window is unavailable.');
      const openPanel = chrome.sidePanel.open({ windowId });
      await Promise.all([storePendingImage, openPanel]);
    } catch (error) {
      console.error('AfterImage could not open the selected image in its workspace.', error);
    }
  });
});
