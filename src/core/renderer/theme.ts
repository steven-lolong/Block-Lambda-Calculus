import * as Blockly from 'blockly';

export const LAMBDA_BLOCK_TYPES = [
  'lambda_variable',
  'lambda_abstraction',
  'lambda_application',
  'lambda_parentheses',
  'lambda_let',
  'lambda_letrec',
  'lambda_number',
  'lambda_boolean',
  'lambda_number_operator',
  'lambda_number_comparison',
  'lambda_boolean_operator',
  'lambda_if',
  'lambda_viz_description'
] as const;

export type LambdaBlockType = typeof LAMBDA_BLOCK_TYPES[number];

export const LAMBDA_GRAMMAR_CATEGORIES = [
  'structure',
  'bindings',
  'expressions',
  'operations',
  'control',
  'values',
  'semantics'
] as const;

export type LambdaGrammarCategory = typeof LAMBDA_GRAMMAR_CATEGORIES[number];
export type LambdaThemeMode = 'light' | 'dark';

export const LAMBDA_BLOCK_CATEGORY: Readonly<Record<LambdaBlockType, LambdaGrammarCategory>> = Object.freeze({
  lambda_variable: 'expressions',
  lambda_abstraction: 'bindings',
  lambda_application: 'expressions',
  lambda_parentheses: 'structure',
  lambda_let: 'bindings',
  lambda_letrec: 'bindings',
  lambda_number: 'values',
  lambda_boolean: 'values',
  lambda_number_operator: 'operations',
  lambda_number_comparison: 'operations',
  lambda_boolean_operator: 'operations',
  lambda_if: 'control',
  lambda_viz_description: 'semantics'
});

export const LAMBDA_CATEGORY_STYLE: Readonly<Record<LambdaGrammarCategory, string>> = Object.freeze({
  structure: 'lambda_structure',
  bindings: 'lambda_bindings',
  expressions: 'lambda_expressions',
  operations: 'lambda_operations',
  control: 'lambda_control',
  values: 'lambda_values',
  semantics: 'lambda_semantics'
});

export const LAMBDA_CATEGORY_TOKEN: Readonly<Record<LambdaGrammarCategory, string>> = Object.freeze({
  structure: '--grammar-structure',
  bindings: '--grammar-bindings',
  expressions: '--grammar-expressions',
  operations: '--grammar-operations',
  control: '--grammar-control',
  values: '--grammar-values',
  semantics: '--grammar-semantics'
});

export type LambdaBlockPalette = {
  colourPrimary: string;
  colourSecondary: string;
  colourTertiary: string;
};

export const LAMBDA_BLOCK_PALETTES: Readonly<
  Record<LambdaThemeMode, Readonly<Record<LambdaGrammarCategory, Readonly<LambdaBlockPalette>>>>
> = Object.freeze({
  light: Object.freeze({
    structure: Object.freeze({ colourPrimary: '#55606c', colourSecondary: '#444d56', colourTertiary: '#707b87' }),
    bindings: Object.freeze({ colourPrimary: '#3f6286', colourSecondary: '#324e6b', colourTertiary: '#5c7da0' }),
    expressions: Object.freeze({ colourPrimary: '#66547b', colourSecondary: '#514362', colourTertiary: '#806e94' }),
    operations: Object.freeze({ colourPrimary: '#356864', colourSecondary: '#2a5350', colourTertiary: '#52827e' }),
    control: Object.freeze({ colourPrimary: '#7a4b4e', colourSecondary: '#623c3e', colourTertiary: '#94676a' }),
    values: Object.freeze({ colourPrimary: '#735e35', colourSecondary: '#5c4b2a', colourTertiary: '#8c784f' }),
    semantics: Object.freeze({ colourPrimary: '#414c54', colourSecondary: '#343d43', colourTertiary: '#5c6870' })
  }),
  dark: Object.freeze({
    structure: Object.freeze({ colourPrimary: '#72716c', colourSecondary: '#5b5a56', colourTertiary: '#8b8b86' }),
    bindings: Object.freeze({ colourPrimary: '#486d94', colourSecondary: '#3a5776', colourTertiary: '#6486aa' }),
    expressions: Object.freeze({ colourPrimary: '#716086', colourSecondary: '#5a4d6b', colourTertiary: '#8b799f' }),
    operations: Object.freeze({ colourPrimary: '#3f7470', colourSecondary: '#325d5a', colourTertiary: '#5c8e89' }),
    control: Object.freeze({ colourPrimary: '#8b595d', colourSecondary: '#70474a', colourTertiary: '#a47477' }),
    values: Object.freeze({ colourPrimary: '#806a3d', colourSecondary: '#665531', colourTertiary: '#998254' }),
    semantics: Object.freeze({ colourPrimary: '#5c6870', colourSecondary: '#4a535a', colourTertiary: '#758189' })
  })
});

function hasOwnKey<T extends object>(value: T, key: PropertyKey): key is keyof T {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function getLambdaGrammarCategory(blockType: string): LambdaGrammarCategory {
  if (!hasOwnKey(LAMBDA_BLOCK_CATEGORY, blockType)) {
    throw new Error(`Blockly block type ${blockType} has no grammatical color category.`);
  }
  return LAMBDA_BLOCK_CATEGORY[blockType];
}

export function getLambdaBlockStyle(blockType: string): string {
  return LAMBDA_CATEGORY_STYLE[getLambdaGrammarCategory(blockType)];
}

function blockStylesFor(mode: LambdaThemeMode): Record<string, LambdaBlockPalette> {
  const styles: Record<string, LambdaBlockPalette> = {};
  for (const category of LAMBDA_GRAMMAR_CATEGORIES) {
    styles[LAMBDA_CATEGORY_STYLE[category]] = { ...LAMBDA_BLOCK_PALETTES[mode][category] };
  }
  return styles;
}

export const lightTheme = Blockly.Theme.defineTheme('blockLambdaLightTheme', {
  name: 'blockLambdaLightTheme',
  base: Blockly.Themes.Classic,
  fontStyle: {
    family: 'Inter, Geist, system-ui, sans-serif',
    weight: '600',
    size: 9.75
  },
  blockStyles: blockStylesFor('light'),
  componentStyles: {
    workspaceBackgroundColour: '#f7f8fa',
    toolboxBackgroundColour: '#f5f7f9',
    toolboxForegroundColour: '#20242b',
    flyoutBackgroundColour: '#ffffff',
    flyoutForegroundColour: '#20242b',
    flyoutOpacity: 1,
    scrollbarColour: '#929aa5',
    scrollbarOpacity: 0.62,
    insertionMarkerColour: '#8839ef',
    insertionMarkerOpacity: 0.30,
    cursorColour: '#8839ef',
    markerColour: '#179299'
  }
});

export const darkTheme = Blockly.Theme.defineTheme('blockLambdaDarkTheme', {
  name: 'blockLambdaDarkTheme',
  base: Blockly.Themes.Classic,
  fontStyle: {
    family: 'Inter, Geist, system-ui, sans-serif',
    weight: '600',
    size: 9.75
  },
  blockStyles: blockStylesFor('dark'),
  componentStyles: {
    workspaceBackgroundColour: '#171a20',
    toolboxBackgroundColour: '#1a1d24',
    toolboxForegroundColour: '#f1f3f5',
    flyoutBackgroundColour: '#1d2027',
    flyoutForegroundColour: '#f1f3f5',
    flyoutOpacity: 1,
    scrollbarColour: '#59616c',
    scrollbarOpacity: 0.72,
    insertionMarkerColour: '#c6a0f6',
    insertionMarkerOpacity: 0.34,
    cursorColour: '#91d7e3',
    markerColour: '#8bd5ca'
  }
});

export function applyLambdaGrammarCssTokens(
  mode: LambdaThemeMode,
  target: HTMLElement = document.documentElement
): void {
  for (const category of LAMBDA_GRAMMAR_CATEGORIES) {
    target.style.setProperty(
      LAMBDA_CATEGORY_TOKEN[category],
      LAMBDA_BLOCK_PALETTES[mode][category].colourPrimary
    );
  }
}
