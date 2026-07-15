export type ActivitySection = 'blocks' | 'files' | 'problems' | 'run' | 'settings';
export type BottomTab = 'problems' | 'output' | 'types' | 'structure' | 'value' | 'machine' | 'stepper';
export type IdePerspective = 'edit' | 'debug' | 'types' | 'presentation' | 'custom';

export type IdeLayoutState = {
  activity: ActivitySection;
  sidebarVisible: boolean;
  sidebarWidth: number;
  codeVisible: boolean;
  codeWidth: number;
  codeMaximized: boolean;
  bottomVisible: boolean;
  bottomHeight: number;
  bottomTab: BottomTab;
  bottomMaximized: boolean;
  perspective: IdePerspective;
};

const STORAGE_KEY = 'block-lambda-ide-layout-v2';

export const DEFAULT_IDE_LAYOUT: IdeLayoutState = {
  activity: 'blocks',
  sidebarVisible: true,
  sidebarWidth: 276,
  codeVisible: true,
  codeWidth: 430,
  codeMaximized: false,
  bottomVisible: false,
  bottomHeight: 272,
  bottomTab: 'problems',
  bottomMaximized: false,
  perspective: 'edit'
};

const ACTIVITIES = new Set<ActivitySection>(['blocks', 'files', 'problems', 'run', 'settings']);
const BOTTOM_TABS = new Set<BottomTab>(['problems', 'output', 'types', 'structure', 'value', 'machine', 'stepper']);
const PERSPECTIVES = new Set<IdePerspective>(['edit', 'debug', 'types', 'presentation', 'custom']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function boundedNumber(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(Math.max(Math.round(value), minimum), maximum)
    : fallback;
}

export function readIdeLayoutState(): IdeLayoutState {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null') as unknown;
    if (!isRecord(parsed)) return { ...DEFAULT_IDE_LAYOUT };
    return {
      activity: typeof parsed.activity === 'string' && ACTIVITIES.has(parsed.activity as ActivitySection)
        ? parsed.activity as ActivitySection
        : DEFAULT_IDE_LAYOUT.activity,
      sidebarVisible: booleanValue(parsed.sidebarVisible, DEFAULT_IDE_LAYOUT.sidebarVisible),
      sidebarWidth: boundedNumber(parsed.sidebarWidth, DEFAULT_IDE_LAYOUT.sidebarWidth, 240, 380),
      codeVisible: booleanValue(parsed.codeVisible, DEFAULT_IDE_LAYOUT.codeVisible),
      codeWidth: boundedNumber(parsed.codeWidth, DEFAULT_IDE_LAYOUT.codeWidth, 320, 760),
      codeMaximized: booleanValue(parsed.codeMaximized, DEFAULT_IDE_LAYOUT.codeMaximized),
      bottomVisible: booleanValue(parsed.bottomVisible, DEFAULT_IDE_LAYOUT.bottomVisible),
      bottomHeight: boundedNumber(parsed.bottomHeight, DEFAULT_IDE_LAYOUT.bottomHeight, 180, 640),
      bottomTab: typeof parsed.bottomTab === 'string' && BOTTOM_TABS.has(parsed.bottomTab as BottomTab)
        ? parsed.bottomTab as BottomTab
        : DEFAULT_IDE_LAYOUT.bottomTab,
      bottomMaximized: booleanValue(parsed.bottomMaximized, DEFAULT_IDE_LAYOUT.bottomMaximized),
      perspective: typeof parsed.perspective === 'string' && PERSPECTIVES.has(parsed.perspective as IdePerspective)
        ? parsed.perspective as IdePerspective
        : DEFAULT_IDE_LAYOUT.perspective
    };
  } catch {
    return { ...DEFAULT_IDE_LAYOUT };
  }
}

export function updateIdeLayoutState(patch: Partial<IdeLayoutState>): IdeLayoutState {
  const next = { ...readIdeLayoutState(), ...patch };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // The workbench remains functional when storage is unavailable.
  }
  return next;
}
