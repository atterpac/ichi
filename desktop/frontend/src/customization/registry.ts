import { defaultRefLabels, refLabelSchema, validateRefLabels } from './refLabels'
import { DEFAULT_THEME, THEMES } from '../theme/themes'
import { defaultPlaceholderStyle, placeholderStyles } from '../components/common/avatarPlaceholder'
import { toastDesigns } from '../components/overlays/toastDesigns'

export type PreferenceScope = 'user' | 'workspace' | 'repository'
export type PreferenceCategory =
  | 'general'
  | 'appearance'
  | 'graph'
  | 'diff'
  | 'changes'
  | 'branches'
  | 'stashes'
  | 'inspect'
  | 'developer'
export interface PreferenceDefinition<T = unknown> {
  default: T
  label: string
  description: string
  category: PreferenceCategory
  aliases: string[]
  scopes: PreferenceScope[]
  portable: boolean
  apply: 'immediate'
  type: 'boolean' | 'number' | 'string' | 'object'
  validate?: (value: unknown) => string | null
  schema?: Record<string, unknown>
  options?: readonly { value: string; label: string }[]
  min?: number
  max?: number
  step?: number
  maxLength?: number
  pattern?: string
}
const user: PreferenceScope[] = ['user']
const contextual: PreferenceScope[] = ['user', 'workspace', 'repository']
function meta(
  label: string,
  description: string,
  category: PreferenceCategory,
  scopes = contextual,
) {
  return {
    label,
    description,
    category,
    scopes,
    aliases: [] as string[],
    portable: true,
    apply: 'immediate' as const,
  }
}
function choice<const T extends readonly string[]>(
  values: T,
  value: T[number],
  label: string,
  description: string,
  category: PreferenceCategory,
  scopes = contextual,
): PreferenceDefinition<T[number]> {
  return {
    ...meta(label, description, category, scopes),
    default: value,
    type: 'string',
    options: values.map((value) => ({ value, label: value })),
  }
}
function flag(
  value: boolean,
  label: string,
  description: string,
  category: PreferenceCategory,
  scopes = contextual,
): PreferenceDefinition<boolean> {
  return { ...meta(label, description, category, scopes), default: value, type: 'boolean' }
}
function number(
  value: number,
  min: number,
  max: number,
  label: string,
  description: string,
  category: PreferenceCategory,
  scopes = contextual,
): PreferenceDefinition<number> {
  return {
    ...meta(label, description, category, scopes),
    default: value,
    type: 'number',
    min,
    max,
    step: 1,
  }
}
function text(
  value: string,
  label: string,
  description: string,
  pattern?: string,
): PreferenceDefinition<string> {
  return {
    ...meta(label, description, 'appearance', user),
    default: value,
    type: 'string',
    maxLength: 100,
    pattern,
  }
}

export const preferenceRegistry = {
  'review.backend': choice(['codex', 'ollama'], 'codex', 'Review backend', 'Assistant used to generate branch review walkthroughs.', 'diff', user),
  'review.codexModel': {
    ...text('', 'Codex review model', 'Leave empty to use the Codex default model.'),
    category: 'diff',
  } as PreferenceDefinition<string>,
  'review.ollamaModel': {
    ...text('', 'Ollama review model', 'Name of a locally installed Ollama model.'),
    category: 'diff',
  } as PreferenceDefinition<string>,
  'graph.refLabels': {
    ...meta(
      'Ref labels',
      'Icons and Go template formats for branches, tags, and individual remotes. Edit in Graph settings.',
      'graph',
    ),
    default: defaultRefLabels,
    type: 'object',
    validate: validateRefLabels,
    schema: refLabelSchema,
  } as PreferenceDefinition<typeof defaultRefLabels>,
  'notifications.style': choice(
    toastDesigns.map((item) => item.id),
    'card',
    'Notification style',
    'Choose the appearance of notifications throughout the app.',
    'appearance',
    user,
  ),
  'developer.enabled': flag(
    false,
    'Developer mode',
    'Enable interface previews and sample notifications.',
    'developer',
    user,
  ),
  'appearance.theme': {
    ...choice(
      THEMES.map((item) => item.id),
      DEFAULT_THEME,
      'Theme',
      'Choose the app color palette.',
      'appearance',
      user,
    ),
    options: THEMES.map((item) => ({ value: item.id, label: item.label })),
    aliases: ['palette', 'colors', 'light', 'dark'],
  },
  'appearance.avatarPlaceholder': choice(
    placeholderStyles.map((item) => item.id),
    defaultPlaceholderStyle,
    'Avatar placeholder',
    'Choose the generated portrait used when an author photo is unavailable.',
    'appearance',
    user,
  ),
  'appearance.uiFont': {
    ...text(
      'Inter Variable',
      'UI font',
      'Use a bundled font, system-ui, or an installed font family.',
    ),
    aliases: ['typography', 'typeface'],
  },
  'appearance.codeFont': text(
    'JetBrains Mono',
    'Code font',
    'Use a bundled font, ui-monospace, or an installed monospace family.',
  ),
  'appearance.textScale': {
    ...number(
      100,
      85,
      125,
      'Text scale (%)',
      'Scale UI text sizes. Graph row density controls row height separately.',
      'appearance',
      user,
    ),
    aliases: ['zoom', 'size', 'typography'],
  },
  'appearance.radius': number(
    5,
    0,
    14,
    'Corner radius',
    'Adjust the roundness of controls and surfaces.',
    'appearance',
    user,
  ),
  'appearance.accent': text(
    '',
    'Accent override',
    'Optional six-digit hex color. Clear to use the theme.',
    '^$|^#[0-9a-fA-F]{6}$',
  ),
  'appearance.background': text(
    '',
    'Background override',
    'Optional six-digit hex color for the app canvas.',
    '^$|^#[0-9a-fA-F]{6}$',
  ),
  'appearance.surface': text(
    '',
    'Surface override',
    'Optional six-digit hex color for panels.',
    '^$|^#[0-9a-fA-F]{6}$',
  ),
  'appearance.text': text(
    '',
    'Text override',
    'Optional six-digit hex color for primary text.',
    '^$|^#[0-9a-fA-F]{6}$',
  ),
  'graph.limit': number(
    120,
    20,
    5000,
    'History limit',
    'Maximum number of commits to load into the graph.',
    'graph',
  ),
  'graph.showStashes': flag(
    true,
    'Stashes in graph',
    'Show stashes beside the commit they were made from.',
    'graph',
  ),
  'graph.showAuthor': flag(
    true,
    'Author column',
    'Show commit authors in the graph table.',
    'graph',
  ),
  'graph.authorAvatars': flag(
    true,
    'Author avatars as nodes',
    'Render author portraits at commit nodes.',
    'graph',
  ),
  'graph.rowDensity': choice(
    ['compact', 'comfortable', 'spacious'],
    'comfortable',
    'Graph row density',
    'Choose the height of commit rows.',
    'graph',
  ),
  'graph.detailPosition': choice(
    ['right', 'bottom', 'hidden'],
    'right',
    'Inspector position',
    'Place the commit inspector beside or below history, or hide it.',
    'graph',
  ),
  'graph.detailWidth': number(
    370,
    320,
    640,
    'Inspector width',
    'Width in pixels of the right-hand commit inspector.',
    'graph',
  ),
  'graph.detailHash': choice(
    ['short', 'full'],
    'short',
    'Inspector hash format',
    'Show short or full commit hashes in the inspector.',
    'graph',
  ),
  'graph.detailShowAuthorDate': flag(
    true,
    'Inspector author date',
    'Show the author timestamp in commit details.',
    'graph',
  ),
  'graph.renderStyle': choice(
    ['classic', 'fine', 'bold', 'neon', 'mono', 'angular'],
    'classic',
    'Graph rendering style',
    'Choose the line weight and visual character of graph rails.',
    'graph',
  ),
  'graph.bendStyle': choice(
    ['elbow', 'rounded', 'curve', 'diagonal'],
    'elbow',
    'Graph bends',
    'Choose how branch paths turn.',
    'graph',
  ),
  'graph.collisionStyle': choice(
    ['cross', 'bridge', 'gap', 'fade'],
    'cross',
    'Graph crossings',
    'Choose how unrelated branch paths cross.',
    'graph',
  ),
  'graph.nodeGlyph': choice(
    ['semantic', 'circle', 'diamond', 'square', 'ring', 'terminal'],
    'semantic',
    'Commit node shape',
    'Choose node markers when avatars are not used.',
    'graph',
  ),
  'diff.layout': choice(
    ['unified', 'split', 'inline', 'changes', 'result'],
    'unified',
    'Diff layout',
    'Choose how additions, deletions, and resulting files are shown.',
    'diff',
  ),
  'diff.wordHighlights': flag(
    true,
    'Word highlights',
    'Highlight changes within individual lines.',
    'diff',
  ),
  'diff.density': choice(
    ['compact', 'comfortable', 'relaxed'],
    'comfortable',
    'Diff row density',
    'Choose spacing between diff lines.',
    'diff',
  ),
  'inspect.mode': choice(
    ['log', 'blame', 'inspector'],
    'log',
    'File inspection mode',
    'Choose the default file history view.',
    'inspect',
  ),
  'inspect.scrubber': flag(false, 'History scrubber', 'Show the file-history scrubber.', 'inspect'),
  'changes.groupByDir': choice(
    ['auto', 'always', 'never'],
    'auto',
    'Directory grouping',
    'Group changed files by directory; Auto groups lists with 15 or more files.',
    'changes',
  ),
  'branches.grouped': flag(false, 'Group branches', 'Group branches by name prefix.', 'branches'),
  'branches.detailVisible': flag(
    true,
    'Branch inspector',
    'Show the selected branch detail pane.',
    'branches',
  ),
  'stashes.detailVisible': flag(
    true,
    'Stash inspector',
    'Show the selected stash detail pane.',
    'stashes',
  ),
  'operations.confirmDestructive': flag(
    true,
    'Confirm destructive actions',
    'Confirm before discarding, dropping, resetting, or forcing operations.',
    'general',
    user,
  ),
}
export type PreferenceId = keyof typeof preferenceRegistry
export type PreferenceValues = { [K in PreferenceId]: (typeof preferenceRegistry)[K]['default'] }
export type PreferenceOverrides = Partial<PreferenceValues>
export const preferenceIds = Object.keys(preferenceRegistry) as PreferenceId[]
export const preferenceDefaults = Object.fromEntries(
  preferenceIds.map((id) => [id, preferenceRegistry[id].default]),
) as PreferenceValues
// The same control-character policy is serialized into the settings schema.
const printableStringPattern = '^[^\\u0000-\\u001f]*$'
const printableString = new RegExp(printableStringPattern)
export function isPreferenceId(id: string): id is PreferenceId {
  return Object.prototype.hasOwnProperty.call(preferenceRegistry, id)
}
export function validatePreference(id: PreferenceId, value: unknown): string | null {
  const definition: PreferenceDefinition = preferenceRegistry[id]
  if (typeof value !== definition.type) return `${definition.label}: expected ${definition.type}`
  if (definition.validate) return definition.validate(value)
  if (definition.options && !definition.options.some((option) => option.value === value))
    return `${definition.label}: unsupported option ${String(value)}`
  if (
    typeof value === 'number' &&
    (!Number.isFinite(value) ||
      !Number.isInteger(value) ||
      value < definition.min! ||
      value > definition.max!)
  )
    return `${definition.label}: choose an integer from ${definition.min} to ${definition.max}`
  if (
    typeof value === 'string' &&
    (value.length > (definition.maxLength ?? Infinity) ||
      !printableString.test(value) ||
      (definition.pattern && !new RegExp(definition.pattern).test(value)))
  )
    return `${definition.label}: invalid value`
  return null
}
export function preferenceSchema() {
  const overrides = (scope: PreferenceScope) => ({
    type: 'object',
    additionalProperties: false,
    properties: Object.fromEntries(
      preferenceIds
        .filter((id) => preferenceRegistry[id].scopes.includes(scope))
        .map((id) => {
          const d: PreferenceDefinition = preferenceRegistry[id]
          return [
            id,
            {
              ...d.schema,
              type: d.type === 'number' ? 'integer' : d.type,
              title: d.label,
              description: d.description,
              default: d.default,
              ...(d.options ? { enum: d.options.map((o) => o.value) } : {}),
              ...(d.min !== undefined ? { minimum: d.min, maximum: d.max } : {}),
              ...(d.maxLength ? { maxLength: d.maxLength } : {}),
              ...(d.pattern
                ? { pattern: d.pattern }
                : d.type === 'string'
                  ? { pattern: printableStringPattern }
                  : {}),
            },
          ]
        }),
    ),
  })
  const scopes = (scope: PreferenceScope) => ({
    type: 'object',
    propertyNames: { pattern: '\\S' },
    additionalProperties: overrides(scope),
  })
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'Ichi preferences',
    type: 'object',
    required: [
      'version',
      'user',
      'workspaces',
      'repositories',
      'profiles',
      'selectedProfile',
      'extensions',
    ],
    additionalProperties: false,
    properties: {
      version: { const: 1 },
      user: overrides('user'),
      workspaces: scopes('workspace'),
      repositories: scopes('repository'),
      profiles: scopes('user'),
      selectedProfile: { type: ['string', 'null'], pattern: '\\S' },
      extensions: { type: 'object' },
    },
  }
}
