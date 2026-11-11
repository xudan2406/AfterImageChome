import { describe, expect, it } from 'vitest';
import {
  cropFromDrag,
  createEditorHistory,
  editorHistoryReducer,
  type EditorEdits,
} from './editor-state';

const initialEdits: EditorEdits = {
  crop: { x: '0', y: '0', width: '100', height: '80' },
  rotation: 0,
  flipHorizontal: false,
  flipVertical: false,
};

describe('editor undo and redo state', () => {
  it('undoes and redoes crop, rotation, and flip edits', () => {
    const cropped = editorHistoryReducer(createEditorHistory(initialEdits), {
      type: 'set-crop',
      crop: { x: '10', y: '5', width: '60', height: '50' },
    });
    const rotated = editorHistoryReducer(cropped, { type: 'rotate', degrees: 90 });
    const flipped = editorHistoryReducer(rotated, { type: 'toggle-flip-horizontal' });

    const undoFlip = editorHistoryReducer(flipped, { type: 'undo' });
    const undoRotation = editorHistoryReducer(undoFlip, { type: 'undo' });
    const redoRotation = editorHistoryReducer(undoRotation, { type: 'redo' });

    expect(undoFlip.present.flipHorizontal).toBe(false);
    expect(undoRotation.present.rotation).toBe(0);
    expect(redoRotation.present.rotation).toBe(90);
    expect(redoRotation.present.crop).toEqual({ x: '10', y: '5', width: '60', height: '50' });
  });

  it('discards the redo branch after a new edit', () => {
    const changed = editorHistoryReducer(createEditorHistory(initialEdits), {
      type: 'rotate',
      degrees: 90,
    });
    const undone = editorHistoryReducer(changed, { type: 'undo' });
    const branched = editorHistoryReducer(undone, { type: 'toggle-flip-vertical' });

    expect(branched.future).toEqual([]);
    expect(branched.present.flipVertical).toBe(true);
    expect(editorHistoryReducer(branched, { type: 'redo' })).toBe(branched);
  });

  it('lets reset be undone without preserving edits from a replaced source', () => {
    const changed = editorHistoryReducer(createEditorHistory(initialEdits), {
      type: 'rotate',
      degrees: 90,
    });
    const reset = editorHistoryReducer(changed, {
      type: 'set-edits',
      edits: initialEdits,
    });

    expect(reset.present).toEqual(initialEdits);
    expect(editorHistoryReducer(reset, { type: 'undo' }).present.rotation).toBe(90);
  });

  it('can replace edits when a new source is loaded and bounds history', () => {
    let history = createEditorHistory(initialEdits);
    for (let index = 0; index < 60; index += 1) {
      history = editorHistoryReducer(history, { type: 'rotate', degrees: 90 });
    }

    expect(history.past).toHaveLength(50);
    const replacement = editorHistoryReducer(history, {
      type: 'replace',
      edits: { ...initialEdits, crop: { ...initialEdits.crop, width: '25' } },
    });
    expect(replacement.past).toEqual([]);
    expect(replacement.future).toEqual([]);
    expect(replacement.present.crop.width).toBe('25');
  });

  it('creates a bounded crop rectangle when dragging in any direction', () => {
    expect(cropFromDrag({ x: 18.8, y: 12.2 }, { x: 4, y: 3 }, 20, 15)).toEqual({
      x: '4',
      y: '3',
      width: '14',
      height: '9',
    });
    expect(cropFromDrag({ x: 0, y: 0 }, { x: 25, y: 18 }, 20, 15)).toEqual({
      x: '0',
      y: '0',
      width: '20',
      height: '15',
    });
  });
});
