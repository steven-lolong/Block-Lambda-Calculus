import * as Blockly from 'blockly';

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

const THEME_STORAGE_KEY = 'block-lambda-theme-mode';

function readThemeMode(): IdeThemeMode {
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === 'light' ? 'light' : 'dark';
}

function updateBrowserThemeColor(resolvedTheme: IdeThemeMode): void {
  const metaThemeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.content = resolvedTheme === 'dark' ? '#24273a' : '#eff1f5';
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
  document.documentElement.dataset.themeMode = mode;
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

function isPhoneLayout(): boolean {
  return window.matchMedia('(max-width: 780px)').matches;
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
      document.querySelector('.topbar'),
      document.querySelector('.app-shell')
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
  const toggleToolboxPanel = document.getElementById('toggleToolboxPanel') as HTMLButtonElement | null;
  const showToolboxFromWorkspace = document.getElementById('showToolboxFromWorkspace') as HTMLButtonElement | null;
  const toggleCodePanel = document.getElementById('toggleCodePanel') as HTMLButtonElement | null;
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

  const updateLayout = () => {
    updateViewportHeightVariable();
    options.onResize();
    [0, 80, 180, 320].forEach((delay) => window.setTimeout(options.onResize, delay));
  };

  const renderToolboxToggleState = () => {
    const hidden = app?.classList.contains('toolbox-hidden') ?? false;
    if (toggleToolboxPanel) {
      toggleToolboxPanel.textContent = '◀';
      toggleToolboxPanel.setAttribute('aria-expanded', String(!hidden));
      toggleToolboxPanel.setAttribute('aria-label', 'Hide toolbox');
      toggleToolboxPanel.title = 'Hide toolbox';
    }
    if (showToolboxFromWorkspace) {
      showToolboxFromWorkspace.hidden = !hidden;
      showToolboxFromWorkspace.setAttribute('aria-expanded', String(!hidden));
      showToolboxFromWorkspace.setAttribute('aria-label', 'Show toolbox');
      showToolboxFromWorkspace.title = 'Show toolbox';
    }
  };

  const renderCodeToggleState = () => {
    const hidden = app?.classList.contains('code-hidden') ?? false;
    if (toggleCodePanel) {
      toggleCodePanel.textContent = '▶';
      toggleCodePanel.setAttribute('aria-expanded', String(!hidden));
      toggleCodePanel.setAttribute('aria-label', 'Hide generated output');
      toggleCodePanel.title = 'Hide generated output';
    }
    if (showCodeFromWorkspace) {
      showCodeFromWorkspace.hidden = !hidden;
      showCodeFromWorkspace.setAttribute('aria-expanded', String(!hidden));
      showCodeFromWorkspace.setAttribute('aria-label', 'Show generated output');
      showCodeFromWorkspace.title = 'Show generated output';
      showCodeFromWorkspace.disabled = !hidden;
    }
  };

  const toggleToolboxVisibility = () => {
    app?.classList.toggle('toolbox-hidden');
    renderToolboxToggleState();
    updateLayout();
  };

  menuToggle?.addEventListener('click', () => {
    app?.classList.toggle('menu-open');
    const isOpen = app?.classList.contains('menu-open') ?? false;
    menuToggle.setAttribute('aria-expanded', String(isOpen));
    menuToggle.innerHTML = isOpen ? '<span class="button-icon" aria-hidden="true">✕</span> Close' : '<span class="button-icon" aria-hidden="true">☰</span> Menu';
    updateLayout();
  });

  toggleToolboxPanel?.addEventListener('click', toggleToolboxVisibility);
  showToolboxFromWorkspace?.addEventListener('click', toggleToolboxVisibility);

  const setCodeVisibility = (visible: boolean, scrollToPanel = false) => {
    app?.classList.toggle('code-hidden', !visible);
    renderCodeToggleState();
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
    setCodeVisibility(hidden, hidden && isPhoneLayout());
  };

  toggleCodePanel?.addEventListener('click', toggleCodeVisibility);
  showCodeFromWorkspace?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    setCodeVisibility(true, true);
  });
  showCodeFromWorkspace?.addEventListener('pointerup', (event) => {
    if (!isPhoneLayout()) return;
    event.preventDefault();
    event.stopPropagation();
    setCodeVisibility(true, true);
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
    await navigator.clipboard.writeText(code);
    copyCode.textContent = 'Copied';
    window.setTimeout(() => {
      copyCode.textContent = 'Copy';
    }, 1200);
  });

  const savedThemeMode = readThemeMode();
  applyTheme(workspace, savedThemeMode, options.lightTheme, options.darkTheme, options.onResize, themeToggle);

  themeToggle?.addEventListener('change', () => {
    const nextMode: IdeThemeMode = themeToggle.checked ? 'dark' : 'light';
    window.localStorage.setItem(THEME_STORAGE_KEY, nextMode);
    applyTheme(workspace, nextMode, options.lightTheme, options.darkTheme, options.onResize, themeToggle);
    window.dispatchEvent(new CustomEvent('block-lambda:refresh-code'));
    window.dispatchEvent(new CustomEvent('block-lambda:theme-changed'));
    updateLayout();
  });

  renderToolboxToggleState();
  renderCodeToggleState();

  if (codePanel instanceof HTMLElement) {
    codePanel.tabIndex = -1;
  }

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
