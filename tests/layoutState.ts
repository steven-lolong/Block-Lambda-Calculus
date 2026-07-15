import assert from 'node:assert/strict';
import {
  DEFAULT_IDE_LAYOUT,
  readIdeLayoutState,
  updateIdeLayoutState
} from '../src/core/ui/layoutState';

const STORAGE_KEY = 'block-lambda-ide-layout-v2';
const values = new Map<string, string>();
let throwOnRead = false;
let throwOnWrite = false;

const localStorage = {
  getItem(key: string): string | null {
    if (throwOnRead) throw new Error('storage unavailable');
    return values.get(key) ?? null;
  },
  setItem(key: string, value: string): void {
    if (throwOnWrite) throw new Error('storage unavailable');
    values.set(key, value);
  }
};

Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: { localStorage }
});

assert.deepEqual(readIdeLayoutState(), DEFAULT_IDE_LAYOUT);

values.set(STORAGE_KEY, JSON.stringify({
  activity: 'unknown',
  sidebarVisible: 'yes',
  sidebarWidth: -20,
  codeVisible: false,
  codeWidth: 5000,
  bottomVisible: true,
  bottomHeight: 10,
  bottomTab: 'missing',
  bottomMaximized: true,
  perspective: 'missing'
}));

assert.deepEqual(readIdeLayoutState(), {
  ...DEFAULT_IDE_LAYOUT,
  sidebarWidth: 240,
  codeVisible: false,
  codeWidth: 760,
  bottomVisible: true,
  bottomHeight: 180,
  bottomMaximized: true
});

values.set(STORAGE_KEY, '{malformed');
assert.deepEqual(readIdeLayoutState(), DEFAULT_IDE_LAYOUT);

values.clear();
const updated = updateIdeLayoutState({
  activity: 'settings',
  sidebarWidth: 301,
  codeVisible: false,
  bottomTab: 'types'
});
assert.equal(updated.activity, 'settings');
assert.equal(updated.sidebarWidth, 301);
assert.equal(updated.codeVisible, false);
assert.equal(updated.bottomTab, 'types');
assert.deepEqual(readIdeLayoutState(), updated);

throwOnRead = true;
assert.deepEqual(readIdeLayoutState(), DEFAULT_IDE_LAYOUT);
throwOnRead = false;
throwOnWrite = true;
assert.doesNotThrow(() => updateIdeLayoutState({ perspective: 'debug' }));

console.log('All layout-state checks passed.');
