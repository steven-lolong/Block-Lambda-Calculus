import * as Blockly from 'blockly';

export type IdeThemeMode = 'system' | 'light' | 'dark';

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

const THEME_STORAGE_KEY = 'block-lambda-theme-mode';

function readThemeMode(): IdeThemeMode {
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored;
  }
  return 'system';
}

function resolveThemeMode(mode: IdeThemeMode): 'light' | 'dark' {
  if (mode !== 'system') return mode;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function updateBrowserThemeColor(resolvedTheme: 'light' | 'dark'): void {
  const metaThemeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.content = resolvedTheme === 'dark' ? '#050506' : '#ffffff';
  }
}

function applyTheme(
  workspace: Blockly.WorkspaceSvg,
  mode: IdeThemeMode,
  lightTheme: Blockly.Theme,
  darkTheme: Blockly.Theme,
  onResize: () => void
): void {
  const resolved = resolveThemeMode(mode);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themeMode = mode;
  workspace.setTheme(resolved === 'dark' ? darkTheme : lightTheme);
  updateBrowserThemeColor(resolved);
  onResize();
  window.setTimeout(onResize, 80);
}

function updateViewportHeightVariable(): void {
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  document.documentElement.style.setProperty('--viewport-height', `${viewportHeight}px`);
}

export function setupWorkspaceAutoResize(
  workspace: Blockly.WorkspaceSvg,
  resizeRoot: HTMLElement
): () => void {
  let frame = 0;

  const requestResize = () => {
    updateViewportHeightVariable();
    if (frame) window.cancelAnimationFrame(frame);
    frame = window.requestAnimationFrame(() => {
      Blockly.svgResize(workspace);
      frame = 0;
    });
  };

  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(requestResize);
    const observedElements = [
      resizeRoot,
      resizeRoot.parentElement,
      resizeRoot.closest('.workspace-panel'),
      resizeRoot.closest('.ide-grid'),
      document.getElementById('app'),
      document.querySelector('.topbar')
    ];

    observedElements.forEach((element) => {
      if (element instanceof HTMLElement) observer.observe(element);
    });
  }

  window.addEventListener('resize', requestResize);
  window.addEventListener('orientationchange', requestResize);
  window.visualViewport?.addEventListener('resize', requestResize);
  window.visualViewport?.addEventListener('scroll', requestResize);

  document.addEventListener('transitionend', (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('.ide-grid, .workspace-panel, .toolbox-panel, .code-panel, .topbar-actions')) {
      requestResize();
    }
  });

  requestResize();
  [0, 80, 180, 320].forEach((delay) => window.setTimeout(requestResize, delay));

  return requestResize;
}

export function setupPanelControls(
  workspace: Blockly.WorkspaceSvg,
  options: PanelControlOptions
): void {
  const app = document.getElementById('app');
  const menuToggle = document.getElementById('menuToggle') as HTMLButtonElement | null;
  const toggleToolbox = document.getElementById('toggleToolbox') as HTMLButtonElement | null;
  const toggleCode = document.getElementById('toggleCode') as HTMLButtonElement | null;
  const refreshCode = document.getElementById('refreshCode') as HTMLButtonElement | null;
  const clearWorkspace = document.getElementById('clearWorkspace') as HTMLButtonElement | null;
  const saveWorkspace = document.getElementById('saveWorkspace') as HTMLButtonElement | null;
  const loadWorkspace = document.getElementById('loadWorkspace') as HTMLButtonElement | null;
  const loadAutosave = document.getElementById('loadAutosave') as HTMLButtonElement | null;
  const aboutApp = document.getElementById('aboutApp') as HTMLButtonElement | null;
  const aboutDialog = document.getElementById('aboutDialog') as HTMLDialogElement | null;
  const closeAboutDialog = document.getElementById('closeAboutDialog') as HTMLButtonElement | null;
  const copyCode = document.getElementById('copyCode') as HTMLButtonElement | null;
  const themeSelect = document.getElementById('themeSelect') as HTMLSelectElement | null;
  const codeOutput = document.getElementById('codeOutput');
  const codePanel = document.getElementById('codePanel');
  const resizeHandle = document.getElementById('resizeHandle');

  const updateLayout = () => {
    updateViewportHeightVariable();
    options.onResize();
    [0, 80, 180, 320].forEach((delay) => window.setTimeout(options.onResize, delay));
  };

  menuToggle?.addEventListener('click', () => {
    app?.classList.toggle('menu-open');
    const isOpen = app?.classList.contains('menu-open') ?? false;
    menuToggle.setAttribute('aria-expanded', String(isOpen));
    menuToggle.textContent = isOpen ? 'Close Menu' : 'Menu';
    updateLayout();
  });

  toggleToolbox?.addEventListener('click', () => {
    app?.classList.toggle('toolbox-hidden');
    const hidden = app?.classList.contains('toolbox-hidden') ?? false;
    toggleToolbox.textContent = hidden ? 'Show Toolbox' : 'Hide Toolbox';
    toggleToolbox.setAttribute('aria-expanded', String(!hidden));
    updateLayout();
  });

  toggleCode?.addEventListener('click', () => {
    app?.classList.toggle('code-hidden');
    const hidden = app?.classList.contains('code-hidden') ?? false;
    toggleCode.textContent = hidden ? 'Show Code' : 'Hide Code';
    toggleCode.setAttribute('aria-expanded', String(!hidden));
    updateLayout();
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
    const code = codeOutput?.textContent ?? '';
    await navigator.clipboard.writeText(code);
    copyCode.textContent = 'Copied';
    window.setTimeout(() => {
      copyCode.textContent = 'Copy';
    }, 1200);
  });

  const savedThemeMode = readThemeMode();
  if (themeSelect) themeSelect.value = savedThemeMode;
  applyTheme(workspace, savedThemeMode, options.lightTheme, options.darkTheme, options.onResize);

  themeSelect?.addEventListener('change', () => {
    const nextMode = themeSelect.value as IdeThemeMode;
    window.localStorage.setItem(THEME_STORAGE_KEY, nextMode);
    applyTheme(workspace, nextMode, options.lightTheme, options.darkTheme, options.onResize);
    window.dispatchEvent(new CustomEvent('block-lambda:refresh-code'));
    updateLayout();
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const currentMode = readThemeMode();
    if (currentMode === 'system') {
      applyTheme(workspace, 'system', options.lightTheme, options.darkTheme, options.onResize);
      window.dispatchEvent(new CustomEvent('block-lambda:refresh-code'));
      updateLayout();
    }
  });

  if (!codePanel || !resizeHandle) return;

  let dragging = false;

  const onPointerMove = (event: PointerEvent) => {
    if (!dragging) return;
    const nextWidth = Math.min(Math.max(window.innerWidth - event.clientX, 280), 760);
    document.documentElement.style.setProperty('--code-panel-width', `${nextWidth}px`);
    updateLayout();
  };

  const stopDragging = () => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove('resizing-code-panel');
    updateLayout();
  };

  resizeHandle.addEventListener('pointerdown', (event) => {
    dragging = true;
    resizeHandle.setPointerCapture(event.pointerId);
    document.body.classList.add('resizing-code-panel');
    event.preventDefault();
  });

  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', stopDragging);
}
