import * as Blockly from 'blockly';
import { readIdeLayoutState, updateIdeLayoutState } from './layoutState';

export type IdeThemeMode = 'light' | 'dark';

type PanelControlOptions = {
  lightTheme: Blockly.Theme;
  darkTheme: Blockly.Theme;
  onRefreshCode: () => void | Promise<void>;
  onClearWorkspace: () => void | Promise<void>;
  onSaveWorkspace: () => void | Promise<void>;
  onLoadWorkspace: () => void | Promise<void>;
  onLoadAutosave: () => void | Promise<void>;
  onResize: () => void;
};

type WorkspaceProvider = Blockly.WorkspaceSvg | (() => Blockly.WorkspaceSvg);
type LayoutResizeListener = () => void;

export type PanelController = {
  isToolboxVisible: () => boolean;
  isCodeVisible: () => boolean;
  isCodeMaximized: () => boolean;
  setToolboxVisible: (visible: boolean, persist?: boolean) => void;
  setCodeVisible: (visible: boolean, persist?: boolean) => void;
  setCodeMaximized: (maximized: boolean, persist?: boolean) => void;
  toggleToolbox: () => void;
  toggleCode: () => void;
  toggleCodeMaximized: () => void;
};

const THEME_STORAGE_KEY = 'block-lambda-theme-mode';
const CODE_PANEL_MIN_WIDTH = 320;
const CODE_PANEL_MAX_WIDTH = 760;
const WORKSPACE_PANEL_MIN_WIDTH = 340;
const RESIZE_HANDLE_WIDTH = 10;
const SIDEBAR_MIN_WIDTH = 240;
const SIDEBAR_MAX_WIDTH = 380;
const COMPACT_LAYOUT_QUERY = '(max-width: 1240px)';
const layoutResizeListeners = new Set<LayoutResizeListener>();
let layoutResizeFrame = 0;
let layoutResizeObserver: ResizeObserver | null = null;
let layoutCoordinatorInitialized = false;

function readThemeMode(): IdeThemeMode {
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === 'light' ? 'light' : 'dark';
}

function updateBrowserThemeColor(resolvedTheme: IdeThemeMode): void {
  const metaThemeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.content = resolvedTheme === 'dark' ? '#20242c' : '#e9edf2';
  }
}

function applyTheme(
  workspace: Blockly.WorkspaceSvg,
  mode: IdeThemeMode,
  lightTheme: Blockly.Theme,
  darkTheme: Blockly.Theme,
  onResize: () => void,
  themeToggle?: HTMLInputElement | null
): void {
  document.documentElement.dataset.theme = mode;
  if (themeToggle) themeToggle.checked = mode === 'dark';
  workspace.setTheme(mode === 'dark' ? darkTheme : lightTheme);
  updateBrowserThemeColor(mode);
  onResize();
  window.setTimeout(onResize, 80);
}

function updateViewportHeightVariable(): void {
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  document.documentElement.style.setProperty('--viewport-height', `${viewportHeight}px`);
}

export function registerIdeLayoutResizeListener(listener: LayoutResizeListener): () => void {
  layoutResizeListeners.add(listener);
  return () => layoutResizeListeners.delete(listener);
}

export function requestIdeLayoutResize(): void {
  updateViewportHeightVariable();
  if (layoutResizeFrame) window.cancelAnimationFrame(layoutResizeFrame);
  layoutResizeFrame = window.requestAnimationFrame(() => {
    layoutResizeFrame = 0;
    for (const listener of layoutResizeListeners) listener();
    window.dispatchEvent(new CustomEvent('block-lambda:layout-resized'));
  });
}

function initializeLayoutResizeCoordinator(resizeRoot: HTMLElement): void {
  if (!layoutResizeObserver && 'ResizeObserver' in window) {
    layoutResizeObserver = new ResizeObserver(requestIdeLayoutResize);
  }

  const observedElements = [
    resizeRoot,
    resizeRoot.parentElement,
    resizeRoot.closest('.workspace-panel'),
    resizeRoot.closest('.ide-grid'),
    document.getElementById('app'),
    document.querySelector('.topbar'),
    document.querySelector('.app-shell'),
    document.getElementById('vizDock'),
    document.querySelector('.statusbar')
  ];

  observedElements.forEach((element) => {
    if (element instanceof HTMLElement) layoutResizeObserver?.observe(element);
  });

  if (layoutCoordinatorInitialized) return;
  layoutCoordinatorInitialized = true;
  window.addEventListener('resize', requestIdeLayoutResize);
  window.addEventListener('orientationchange', requestIdeLayoutResize);
  window.visualViewport?.addEventListener('resize', requestIdeLayoutResize);
  window.visualViewport?.addEventListener('scroll', requestIdeLayoutResize);

  document.addEventListener('transitionend', (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('.ide-grid, .workspace-panel, .toolbox-panel, .code-panel, .topbar-actions, .viz-dock')) {
      requestIdeLayoutResize();
    }
  });
}

function isPhoneLayout(): boolean {
  return window.matchMedia('(max-width: 780px)').matches;
}

export function isCompactIdeLayout(): boolean {
  return window.matchMedia(COMPACT_LAYOUT_QUERY).matches;
}

export function setupWorkspaceAutoResize(
  workspaceProvider: WorkspaceProvider,
  resizeRoot: HTMLElement
): () => void {
  const getWorkspace = () => typeof workspaceProvider === 'function' ? workspaceProvider() : workspaceProvider;
  registerIdeLayoutResizeListener(() => Blockly.svgResize(getWorkspace()));
  initializeLayoutResizeCoordinator(resizeRoot);
  requestIdeLayoutResize();
  [80, 180, 320].forEach((delay) => window.setTimeout(requestIdeLayoutResize, delay));

  return requestIdeLayoutResize;
}

export function setupPanelControls(
  workspaceProvider: WorkspaceProvider,
  options: PanelControlOptions
): PanelController {
  const getWorkspace = () => typeof workspaceProvider === 'function' ? workspaceProvider() : workspaceProvider;
  const app = document.getElementById('app');
  const menuToggle = document.getElementById('menuToggle') as HTMLButtonElement | null;
  const toggleToolboxPanel = document.getElementById('toggleToolboxPanel') as HTMLButtonElement | null;
  const showToolboxFromWorkspace = document.getElementById('showToolboxFromWorkspace') as HTMLButtonElement | null;
  const toggleCodePanel = document.getElementById('toggleCodePanel') as HTMLButtonElement | null;
  const maximizeCodePanel = document.getElementById('maximizeCodePanel') as HTMLButtonElement | null;
  const showCodeFromWorkspace = document.getElementById('showCodeFromWorkspace') as HTMLButtonElement | null;
  const refreshCode = document.getElementById('refreshCode') as HTMLButtonElement | null;
  const clearWorkspace = document.getElementById('clearWorkspace') as HTMLButtonElement | null;
  const saveWorkspace = document.getElementById('saveWorkspace') as HTMLButtonElement | null;
  const loadWorkspace = document.getElementById('loadWorkspace') as HTMLButtonElement | null;
  const loadAutosave = document.getElementById('loadAutosave') as HTMLButtonElement | null;
  const aboutApp = document.getElementById('aboutApp') as HTMLButtonElement | null;
  const aboutDialog = document.getElementById('aboutDialog') as HTMLDialogElement | null;
  const closeAboutDialog = document.getElementById('closeAboutDialog') as HTMLButtonElement | null;
  const copyCode = document.getElementById('copyCode') as HTMLButtonElement | null;
  const themeToggle = document.getElementById('themeToggle') as HTMLInputElement | null;
  const codeOutput = document.getElementById('codeOutput');
  const codePanel = document.getElementById('codePanel');
  const resizeHandle = document.getElementById('resizeHandle');
  const sidebarResizeHandle = document.getElementById('sidebarResizeHandle');
  const toolboxPanel = document.getElementById('toolboxPanel');
  const activityBar = document.querySelector<HTMLElement>('.activity-bar');
  const ideGrid = codePanel?.closest<HTMLElement>('.ide-grid') ?? null;
  const compactLayout = window.matchMedia(COMPACT_LAYOUT_QUERY);
  const storedLayout = readIdeLayoutState();

  document.documentElement.style.setProperty('--ide-primary-sidebar-width', `${storedLayout.sidebarWidth}px`);
  document.documentElement.style.setProperty('--ide-code-panel-width', `${storedLayout.codeWidth}px`);

  const applyStoredPanelVisibility = () => {
    const saved = readIdeLayoutState();
    const codeMaximized = saved.codeVisible && saved.codeMaximized;
    const suppressCompetingOverlays = compactLayout.matches && saved.sidebarVisible && saved.codeVisible && !codeMaximized;
    app?.classList.toggle('toolbox-hidden', suppressCompetingOverlays || !saved.sidebarVisible);
    app?.classList.toggle('code-hidden', suppressCompetingOverlays || !saved.codeVisible);
    app?.classList.toggle('code-maximized', codeMaximized);
  };

  applyStoredPanelVisibility();

  const parsePixelValue = (value: string): number => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const syncResizeHandlePosition = () => {
    if (!(codePanel instanceof HTMLElement) || !(resizeHandle instanceof HTMLElement) || !ideGrid) return;
    if (getComputedStyle(resizeHandle).display === 'none' || getComputedStyle(codePanel).display === 'none') return;

    const gridRect = ideGrid.getBoundingClientRect();
    const codeRect = codePanel.getBoundingClientRect();
    const handleWidth = resizeHandle.getBoundingClientRect().width || RESIZE_HANDLE_WIDTH;
    ideGrid.style.setProperty('--resize-handle-left', `${Math.max(0, codeRect.left - gridRect.left - handleWidth / 2)}px`);
  };

  const getMaxCodePanelWidth = (): number => {
    if (!ideGrid) return CODE_PANEL_MAX_WIDTH;

    const gridStyle = getComputedStyle(ideGrid);
    const gridRect = ideGrid.getBoundingClientRect();
    const columnGap = parsePixelValue(gridStyle.columnGap || gridStyle.gap);
    const contentWidth = gridRect.width - parsePixelValue(gridStyle.paddingLeft) - parsePixelValue(gridStyle.paddingRight);
    const toolboxVisible = toolboxPanel instanceof HTMLElement && getComputedStyle(toolboxPanel).display !== 'none';
    const toolboxWidth = toolboxVisible && toolboxPanel instanceof HTMLElement ? toolboxPanel.getBoundingClientRect().width : 0;
    const toolboxGap = toolboxVisible ? columnGap : 0;
    const activityWidth = activityBar?.getBoundingClientRect().width ?? 0;
    const maxPanelWidth = contentWidth - activityWidth - toolboxWidth - toolboxGap - WORKSPACE_PANEL_MIN_WIDTH - columnGap;

    return Math.max(CODE_PANEL_MIN_WIDTH, Math.min(CODE_PANEL_MAX_WIDTH, maxPanelWidth));
  };

  const updateLayout = () => {
    options.onResize();
  };

  registerIdeLayoutResizeListener(syncResizeHandlePosition);

  const renderToolboxToggleState = () => {
    const hidden = app?.classList.contains('toolbox-hidden') ?? false;
    if (toggleToolboxPanel) {
      toggleToolboxPanel.setAttribute('aria-expanded', String(!hidden));
      toggleToolboxPanel.setAttribute('aria-label', 'Close primary sidebar');
      toggleToolboxPanel.title = 'Close Sidebar';
    }
    if (showToolboxFromWorkspace) {
      showToolboxFromWorkspace.hidden = !hidden;
      showToolboxFromWorkspace.setAttribute('aria-expanded', String(!hidden));
      showToolboxFromWorkspace.setAttribute('aria-label', 'Show primary sidebar');
      showToolboxFromWorkspace.title = 'Show Sidebar';
    }
  };

  const renderCodeToggleState = () => {
    const hidden = app?.classList.contains('code-hidden') ?? false;
    if (toggleCodePanel) {
      toggleCodePanel.setAttribute('aria-expanded', String(!hidden));
      toggleCodePanel.setAttribute('aria-label', 'Hide code and inspector');
      toggleCodePanel.title = 'Hide Code / Inspector';
    }
    if (showCodeFromWorkspace) {
      showCodeFromWorkspace.hidden = !hidden;
      showCodeFromWorkspace.setAttribute('aria-expanded', String(!hidden));
      showCodeFromWorkspace.setAttribute('aria-label', 'Show code and inspector');
      showCodeFromWorkspace.title = 'Show Code / Inspector';
      showCodeFromWorkspace.disabled = !hidden;
    }
  };

  const renderCodeMaximizeState = () => {
    if (!maximizeCodePanel) return;
    const maximized = app?.classList.contains('code-maximized') ?? false;
    maximizeCodePanel.setAttribute('aria-pressed', String(maximized));
    maximizeCodePanel.setAttribute('aria-label', maximized ? 'Restore code and inspector' : 'Maximize code and inspector');
    maximizeCodePanel.title = maximized ? 'Restore Code & Inspector' : 'Maximize Code & Inspector';
  };

  const setToolboxVisibility = (visible: boolean, persist = true) => {
    const hideCodeOverlay = visible && compactLayout.matches;
    app?.classList.toggle('toolbox-hidden', !visible);
    if (hideCodeOverlay) app?.classList.add('code-hidden');
    renderToolboxToggleState();
    if (hideCodeOverlay) renderCodeToggleState();
    if (persist) {
      updateIdeLayoutState({
        sidebarVisible: visible,
        ...(hideCodeOverlay ? { codeVisible: false } : {}),
        perspective: 'custom'
      });
      window.dispatchEvent(new CustomEvent('block-lambda:layout-state-changed'));
    }
    updateLayout();
  };

  const toggleToolboxVisibility = () => setToolboxVisibility(app?.classList.contains('toolbox-hidden') ?? false);

  menuToggle?.addEventListener('click', () => {
    app?.classList.toggle('menu-open');
    const isOpen = app?.classList.contains('menu-open') ?? false;
    menuToggle.setAttribute('aria-expanded', String(isOpen));
    menuToggle.setAttribute('aria-label', isOpen ? 'Close application menu' : 'Open application menu');
    updateLayout();
  });

  toggleToolboxPanel?.addEventListener('click', toggleToolboxVisibility);
  showToolboxFromWorkspace?.addEventListener('click', toggleToolboxVisibility);

  const setCodeVisibility = (visible: boolean, persist = true, scrollToPanel = false) => {
    const hideSidebarOverlay = visible && compactLayout.matches;
    const wasMaximized = app?.classList.contains('code-maximized') ?? false;
    if (!visible && wasMaximized) app?.classList.remove('code-maximized');
    app?.classList.toggle('code-hidden', !visible);
    if (hideSidebarOverlay) app?.classList.add('toolbox-hidden');
    renderCodeToggleState();
    renderCodeMaximizeState();
    if (hideSidebarOverlay) renderToolboxToggleState();
    if (persist) {
      updateIdeLayoutState({
        codeVisible: visible,
        ...(!visible && wasMaximized ? { codeMaximized: false } : {}),
        ...(hideSidebarOverlay ? { sidebarVisible: false } : {}),
        perspective: 'custom'
      });
      window.dispatchEvent(new CustomEvent('block-lambda:layout-state-changed'));
    }
    updateLayout();

    if (visible && scrollToPanel && codePanel instanceof HTMLElement) {
      window.setTimeout(() => {
        codePanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        codePanel.focus({ preventScroll: true });
      }, isPhoneLayout() ? 80 : 0);
    }
  };

  const toggleCodeVisibility = () => {
    const hidden = app?.classList.contains('code-hidden') ?? false;
    setCodeVisibility(hidden, true, hidden && isPhoneLayout());
  };

  const setCodeMaximized = (maximized: boolean, persist = true) => {
    if (maximized) app?.classList.remove('code-hidden');
    app?.classList.toggle('code-maximized', maximized);
    renderCodeToggleState();
    renderCodeMaximizeState();
    if (persist) {
      updateIdeLayoutState({ codeVisible: true, codeMaximized: maximized, perspective: 'custom' });
      window.dispatchEvent(new CustomEvent('block-lambda:layout-state-changed'));
    }
    updateLayout();
    window.setTimeout(updateLayout, 100);
  };

  const toggleCodeMaximized = () => setCodeMaximized(!(app?.classList.contains('code-maximized') ?? false));

  toggleCodePanel?.addEventListener('click', toggleCodeVisibility);
  maximizeCodePanel?.addEventListener('click', toggleCodeMaximized);
  showCodeFromWorkspace?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    setCodeVisibility(true, true, true);
  });
  showCodeFromWorkspace?.addEventListener('pointerup', (event) => {
    if (!isPhoneLayout()) return;
    event.preventDefault();
    event.stopPropagation();
    setCodeVisibility(true, true, true);
  });

  refreshCode?.addEventListener('click', () => {
    options.onRefreshCode();
    updateLayout();
  });

  clearWorkspace?.addEventListener('click', () => {
    options.onClearWorkspace();
    updateLayout();
  });

  saveWorkspace?.addEventListener('click', () => {
    options.onSaveWorkspace();
  });

  loadWorkspace?.addEventListener('click', () => {
    options.onLoadWorkspace();
    updateLayout();
  });

  loadAutosave?.addEventListener('click', () => {
    options.onLoadAutosave();
    updateLayout();
  });

  aboutApp?.addEventListener('click', () => {
    if (aboutDialog?.showModal) {
      aboutDialog.showModal();
      closeAboutDialog?.focus();
      return;
    }

    aboutDialog?.setAttribute('open', '');
    closeAboutDialog?.focus();
  });

  aboutDialog?.addEventListener('click', (event) => {
    if (event.target === aboutDialog) {
      aboutDialog.close();
    }
  });

  copyCode?.addEventListener('click', async () => {
    const code = codeOutput instanceof HTMLElement ? (codeOutput.dataset.rawCode ?? codeOutput.textContent ?? '') : '';
    const copyIcon = copyCode.querySelector<HTMLElement>('[aria-hidden="true"]');
    const setCopyButtonState = (icon: string, label: string) => {
      if (copyIcon) copyIcon.textContent = icon;
      else copyCode.textContent = icon;
      copyCode.setAttribute('aria-label', label);
      copyCode.title = label;
    };
    await navigator.clipboard.writeText(code);
    setCopyButtonState('✓', 'Copied generated output');
    window.setTimeout(() => {
      setCopyButtonState('⧉', 'Copy generated output');
    }, 1200);
  });

  const savedThemeMode = readThemeMode();
  applyTheme(getWorkspace(), savedThemeMode, options.lightTheme, options.darkTheme, options.onResize, themeToggle);

  themeToggle?.addEventListener('change', () => {
    const nextMode: IdeThemeMode = themeToggle.checked ? 'dark' : 'light';
    window.localStorage.setItem(THEME_STORAGE_KEY, nextMode);
    applyTheme(getWorkspace(), nextMode, options.lightTheme, options.darkTheme, options.onResize, themeToggle);
    window.dispatchEvent(new CustomEvent('block-lambda:refresh-code'));
    window.dispatchEvent(new CustomEvent('block-lambda:theme-changed'));
    updateLayout();
  });

  renderToolboxToggleState();
  renderCodeToggleState();
  renderCodeMaximizeState();

  compactLayout.addEventListener('change', () => {
    applyStoredPanelVisibility();
    renderToolboxToggleState();
    renderCodeToggleState();
    renderCodeMaximizeState();
    updateLayout();
  });

  if (codePanel instanceof HTMLElement) {
    codePanel.tabIndex = -1;
  }

  let dragging = false;

  const onPointerMove = (event: PointerEvent) => {
    if (!dragging || !codePanel) return;
    const codePanelRight = codePanel.getBoundingClientRect().right;
    const nextWidth = Math.min(Math.max(codePanelRight - event.clientX, CODE_PANEL_MIN_WIDTH), getMaxCodePanelWidth());
    document.documentElement.style.setProperty('--ide-code-panel-width', `${nextWidth}px`);
    updateLayout();
  };

  const stopDragging = () => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove('resizing-code-panel');
    const width = codePanel?.getBoundingClientRect().width;
    if (width) {
      const roundedWidth = Math.round(width);
      updateIdeLayoutState({ codeWidth: roundedWidth });
      resizeHandle?.setAttribute('aria-valuenow', String(roundedWidth));
    }
    updateLayout();
  };

  resizeHandle?.addEventListener('pointerdown', (event) => {
    dragging = true;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    document.body.classList.add('resizing-code-panel');
    event.preventDefault();
  });

  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', stopDragging);

  resizeHandle?.addEventListener('keydown', (event) => {
    const direction = event.key === 'ArrowLeft' ? 1 : event.key === 'ArrowRight' ? -1 : 0;
    if (!direction || !codePanel) return;
    event.preventDefault();
    const width = Math.min(Math.max(codePanel.getBoundingClientRect().width + direction * 16, CODE_PANEL_MIN_WIDTH), getMaxCodePanelWidth());
    document.documentElement.style.setProperty('--ide-code-panel-width', `${width}px`);
    updateIdeLayoutState({ codeWidth: Math.round(width) });
    resizeHandle.setAttribute('aria-valuenow', String(Math.round(width)));
    updateLayout();
  });

  let draggingSidebar = false;
  const updateSidebarWidth = (clientX: number) => {
    if (!ideGrid) return;
    const gridLeft = ideGrid.getBoundingClientRect().left;
    const activityWidth = activityBar?.getBoundingClientRect().width ?? 0;
    const width = Math.min(Math.max(clientX - gridLeft - activityWidth, SIDEBAR_MIN_WIDTH), SIDEBAR_MAX_WIDTH);
    document.documentElement.style.setProperty('--ide-primary-sidebar-width', `${width}px`);
    updateLayout();
  };
  const stopSidebarDragging = () => {
    if (!draggingSidebar) return;
    draggingSidebar = false;
    document.body.classList.remove('resizing-sidebar');
    const width = toolboxPanel?.getBoundingClientRect().width;
    if (width) {
      const roundedWidth = Math.round(width);
      updateIdeLayoutState({ sidebarWidth: roundedWidth });
      sidebarResizeHandle?.setAttribute('aria-valuenow', String(roundedWidth));
    }
    updateLayout();
  };

  sidebarResizeHandle?.addEventListener('pointerdown', (event) => {
    draggingSidebar = true;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    document.body.classList.add('resizing-sidebar');
    event.preventDefault();
  });
  window.addEventListener('pointermove', (event) => {
    if (draggingSidebar) updateSidebarWidth(event.clientX);
  });
  window.addEventListener('pointerup', stopSidebarDragging);
  sidebarResizeHandle?.addEventListener('keydown', (event) => {
    const direction = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
    if (!direction || !toolboxPanel) return;
    event.preventDefault();
    const width = Math.min(Math.max(toolboxPanel.getBoundingClientRect().width + direction * 16, SIDEBAR_MIN_WIDTH), SIDEBAR_MAX_WIDTH);
    document.documentElement.style.setProperty('--ide-primary-sidebar-width', `${width}px`);
    updateIdeLayoutState({ sidebarWidth: Math.round(width) });
    sidebarResizeHandle.setAttribute('aria-valuenow', String(Math.round(width)));
    updateLayout();
  });

  resizeHandle?.setAttribute('aria-valuemin', String(CODE_PANEL_MIN_WIDTH));
  resizeHandle?.setAttribute('aria-valuemax', String(CODE_PANEL_MAX_WIDTH));
  resizeHandle?.setAttribute('aria-valuenow', String(storedLayout.codeWidth));
  sidebarResizeHandle?.setAttribute('aria-valuemin', String(SIDEBAR_MIN_WIDTH));
  sidebarResizeHandle?.setAttribute('aria-valuemax', String(SIDEBAR_MAX_WIDTH));
  sidebarResizeHandle?.setAttribute('aria-valuenow', String(storedLayout.sidebarWidth));

  updateLayout();

  return {
    isToolboxVisible: () => !(app?.classList.contains('toolbox-hidden') ?? false),
    isCodeVisible: () => !(app?.classList.contains('code-hidden') ?? false),
    isCodeMaximized: () => app?.classList.contains('code-maximized') ?? false,
    setToolboxVisible: setToolboxVisibility,
    setCodeVisible: (visible, persist = true) => setCodeVisibility(visible, persist, visible && isPhoneLayout()),
    setCodeMaximized,
    toggleToolbox: toggleToolboxVisibility,
    toggleCode: toggleCodeVisibility,
    toggleCodeMaximized
  };
}
