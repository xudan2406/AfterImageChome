# Chrome permissions

The production Manifest V3 permissions are intentionally limited to the following:

| Permission | Why AfterImage needs it |
| --- | --- |
| `activeTab` | Read image element URLs and intrinsic dimensions after the user invokes page-image discovery. |
| `contextMenus` | Add image-specific AfterImage actions to the browser's right-click menu. |
| `scripting` | Execute the self-contained image-discovery function in the user-selected active tab. |
| `sidePanel` | Open the image workspace beside the current tab. |
| `storage` | Pass the selected image URL/action to the Side Panel through session storage. |
| Optional `http://*/*`, `https://*/*` | Allow a runtime request for the exact origin of a webpage image only after the user chooses a fetch action. This permission is not requested at install time. |

AfterImage does not request `downloads`, `tabs`, `history`, `cookies`, or `webRequest`. Downloads use user-initiated Blob URLs; active-tab metadata is obtained through `activeTab`; remote fetches omit credentials and referrers.

Permission prompts and website access can be denied. In that case, the user can save the image from the website and import the local file instead. Optional host permission does not bypass CORS, network isolation, site authentication, redirects, or server policy.
