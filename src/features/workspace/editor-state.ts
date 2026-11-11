export type CropState = { x: string; y: string; width: string; height: string };

export type EditorEdits = {
  crop: CropState;
  rotation: 0 | 90 | 180 | 270;
  flipHorizontal: boolean;
  flipVertical: boolean;
};

export type EditorHistoryState = {
  past: EditorEdits[];
  present: EditorEdits;
  future: EditorEdits[];
};

export type EditorHistoryAction =
  | { type: 'replace'; edits: EditorEdits }
  | { type: 'set-edits'; edits: EditorEdits }
  | { type: 'set-crop'; crop: CropState }
  | { type: 'set-crop-field'; key: keyof CropState; value: string }
  | { type: 'rotate'; degrees: 90 | -90 }
  | { type: 'toggle-flip-horizontal' }
  | { type: 'toggle-flip-vertical' }
  | { type: 'undo' }
  | { type: 'redo' };

const MAX_UNDO_STEPS = 50;

export function createEditorHistory(edits: EditorEdits): EditorHistoryState {
  return { past: [], present: edits, future: [] };
}

export function editorHistoryReducer(
  state: EditorHistoryState,
  action: EditorHistoryAction,
): EditorHistoryState {
  if (action.type === 'undo') {
    if (!state.past.length) return state;
    return {
      past: state.past.slice(0, -1),
      present: state.past[state.past.length - 1]!,
      future: [state.present, ...state.future],
    };
  }
  if (action.type === 'redo') {
    if (!state.future.length) return state;
    return {
      past: [...state.past, state.present].slice(-MAX_UNDO_STEPS),
      present: state.future[0]!,
      future: state.future.slice(1),
    };
  }
  if (action.type === 'replace') {
    return createEditorHistory(action.edits);
  }

  const present = state.present;
  if (action.type === 'set-edits') return commitEdits(state, action.edits);
  const next: EditorEdits = (() => {
    switch (action.type) {
      case 'set-crop':
        return { ...present, crop: action.crop };
      case 'set-crop-field':
        return { ...present, crop: { ...present.crop, [action.key]: action.value } };
      case 'rotate':
        return {
          ...present,
          rotation: ((present.rotation + action.degrees + 360) % 360) as EditorEdits['rotation'],
        };
      case 'toggle-flip-horizontal':
        return { ...present, flipHorizontal: !present.flipHorizontal };
      case 'toggle-flip-vertical':
        return { ...present, flipVertical: !present.flipVertical };
    }
  })();

  return commitEdits(state, next);
}

export function cropFromDrag(
  start: { x: number; y: number },
  end: { x: number; y: number },
  imageWidth: number,
  imageHeight: number,
): CropState {
  const startX = clamp(Math.floor(start.x), 0, imageWidth - 1);
  const startY = clamp(Math.floor(start.y), 0, imageHeight - 1);
  const endX = clamp(Math.round(end.x), 0, imageWidth);
  const endY = clamp(Math.round(end.y), 0, imageHeight);
  const x = Math.min(startX, endX);
  const y = Math.min(startY, endY);
  const width = Math.min(Math.max(1, Math.abs(endX - startX)), imageWidth - x);
  const height = Math.min(Math.max(1, Math.abs(endY - startY)), imageHeight - y);
  return { x: String(x), y: String(y), width: String(width), height: String(height) };
}

function commitEdits(state: EditorHistoryState, next: EditorEdits): EditorHistoryState {
  if (editsEqual(state.present, next)) return state;
  return {
    past: [...state.past, state.present].slice(-MAX_UNDO_STEPS),
    present: next,
    future: [],
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function editsEqual(left: EditorEdits, right: EditorEdits): boolean {
  return left.rotation === right.rotation &&
    left.flipHorizontal === right.flipHorizontal &&
    left.flipVertical === right.flipVertical &&
    left.crop.x === right.crop.x &&
    left.crop.y === right.crop.y &&
    left.crop.width === right.crop.width &&
    left.crop.height === right.crop.height;
}
