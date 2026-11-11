# AfterImage Privacy Policy

**Effective date:** November 11, 2026  
**Publisher:** AfterBuy Studio  
**Contact:** chenjianyu944@gmail.com

AfterImage is a Chrome extension for local image processing. This policy describes the data the extension handles.

Any information AfterImage receives through Chrome APIs is used only to provide the extension's disclosed image-processing features and is handled in accordance with the Chrome Web Store User Data Policy, including its Limited Use requirements.

## Images and processing

Images selected from your device are inspected and processed locally in your browser. AfterImage does not upload those files to its publisher. Processing uses browser image APIs and Web Workers.

When you explicitly choose a context-menu action for a webpage image, AfterImage asks Chrome for optional access to that image's site origin. If granted, the extension requests the image from that site without cookies or a referrer and does not follow redirects. The website and its network operator may receive the request and apply their own logging and privacy policy. The site can reject the request; permission does not guarantee access.

## Local storage and retention

AfterImage stores completed output Blobs and task metadata in IndexedDB on your device so you can download recent results and create batch ZIPs. The extension retains no more than 100 records or 500 MB of output data, whichever limit is reached first; older records are removed to make room. A single output larger than 500 MB is not saved to history. Original local files are not retained in history.

You can delete individual history records or clear all history in the extension. Browser storage remains subject to Chrome's storage management and device limits.

## Other data

The extension temporarily stores a selected webpage image URL and action in `chrome.storage.session` to hand the selection from the service worker to the workspace. It does not collect account credentials, browsing history, page contents, analytics, or advertising identifiers. Page-image discovery reads image element URLs and dimensions only after you explicitly request it; it does not fetch those images.

## Permissions

Chrome permissions are used for extension UI, image context menus, temporary active-tab image discovery, and the session handoff. Optional HTTP/HTTPS host access is requested only after you choose to fetch a webpage image, and is limited to that image's origin.

## Security limitations

Remote image retrieval is not a general-purpose URL fetch service. Local and private IP literals and common local hostnames are rejected, but hostname checks cannot prevent DNS rebinding. Remote requests are user initiated and are constrained by Chrome's permission and network policies.

## Contact and changes

The current public copy of this policy is hosted at https://xudan2406.github.io/AfterImage/. Enter that URL in the Chrome Web Store Developer Dashboard. Material policy changes should be reflected in the listing and dated here.
