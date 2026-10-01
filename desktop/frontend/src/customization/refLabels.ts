import {
  PhCloud,
  PhGitFork,
  PhGithubLogo,
  PhGlobe,
  PhHardDrives,
  PhGitBranch,
  PhTag,
  PhMapPin,
  PhCheck,
  PhArrowSquareOut,
} from '@phosphor-icons/vue'

export const refIcons = {
  dot: { label: 'Dot', component: null },
  none: { label: 'No icon', component: null },
  cloud: { label: 'Cloud', component: PhCloud },
  fork: { label: 'Fork', component: PhGitFork },
  github: { label: 'GitHub', component: PhGithubLogo },
  globe: { label: 'Globe', component: PhGlobe },
  server: { label: 'Server', component: PhHardDrives },
  branch: { label: 'Branch', component: PhGitBranch },
  tag: { label: 'Tag', component: PhTag },
  pin: { label: 'Pin', component: PhMapPin },
  check: { label: 'Check', component: PhCheck },
  external: { label: 'External', component: PhArrowSquareOut },
} as const
export type RefIcon = keyof typeof refIcons
export type RefKind = 'branch' | 'remote' | 'tag' | 'head'
export interface RefStyle {
  icon: RefIcon
  compact: string
  expanded: string
}
export interface RefLabelConfig {
  kinds: Record<RefKind, RefStyle>
  remotes: Record<string, RefStyle>
}
export const defaultRefLabels: RefLabelConfig = {
  kinds: {
    branch: { icon: 'dot', compact: '{{.Name}}', expanded: '{{.Name}}' },
    remote: { icon: 'cloud', compact: '{{.Name}}', expanded: '{{.Name}}' },
    tag: { icon: 'tag', compact: '{{.Name}}', expanded: '{{.Name}}' },
    head: { icon: 'pin', compact: '{{.Name}}', expanded: '{{.Name}}' },
  },
  remotes: {},
}
const hasControls = (value: string) =>
  [...value].some((char) => {
    const code = char.codePointAt(0)!
    return code < 32 || (code >= 127 && code <= 159)
  })
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)
export function validateRefLabels(value: unknown): string | null {
  if (!object(value) || !object(value.kinds) || !object(value.remotes))
    return 'Expected ref kinds and remote overrides'
  if (Object.keys(value).some((k) => k !== 'kinds' && k !== 'remotes'))
    return 'Unknown ref label option'
  if (Object.keys(value.kinds).sort().join(',') !== 'branch,head,remote,tag')
    return 'Expected branch, remote, tag and head styles'
  if (Object.keys(value.remotes).length > 64) return 'At most 64 remote overrides'
  for (const name of Object.keys(value.remotes)) {
    if (!name.trim() || name.length > 128 || /\s/.test(name) || hasControls(name))
      return 'Remote names must be nonempty and contain no spaces'
  }
  for (const style of [...Object.values(value.kinds), ...Object.values(value.remotes)]) {
    if (
      !object(style) ||
      Object.keys(style).sort().join(',') !== 'compact,expanded,icon' ||
      typeof style.icon !== 'string' ||
      !Object.prototype.hasOwnProperty.call(refIcons, style.icon)
    )
      return 'Choose a supported ref icon'
    for (const mode of ['compact', 'expanded']) {
      const format = style[mode]
      if (
        typeof format !== 'string' ||
        !format.trim() ||
        new TextEncoder().encode(format).length > 512 ||
        hasControls(format)
      )
        return 'Formats must contain single-line text, up to 512 bytes'
    }
  }
  return null
}
export function refPresentation(
  config: RefLabelConfig,
  name: string,
  kind: string,
  current = false,
  expanded = false,
) {
  const type: RefKind = Object.prototype.hasOwnProperty.call(config.kinds, kind)
    ? (kind as RefKind)
    : 'branch'
  const override =
    type === 'remote'
      ? Object.keys(config.remotes)
          .sort((a, b) => b.length - a.length)
          .find((remote) => name.startsWith(`${remote}/`))
      : undefined
  const remote = type === 'remote' ? (override ?? name.split('/')[0]!) : ''
  const branch = type === 'remote' ? name.slice(remote.length + 1) : name
  const style = override ? config.remotes[override]! : config.kinds[type]
  return {
    icon: style.icon,
    request: {
      Format: expanded ? style.expanded : style.compact,
      Name: name,
      Branch: branch,
      Remote: remote,
      Kind: type,
      Current: current,
    },
  }
}

const styleSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['icon', 'compact', 'expanded'],
  properties: {
    icon: { type: 'string', enum: Object.keys(refIcons) },
    compact: {
      type: 'string',
      minLength: 1,
      maxLength: 512,
      pattern: '^[^\\u0000-\\u001f\\u007f-\\u009f]*$',
    },
    expanded: {
      type: 'string',
      minLength: 1,
      maxLength: 512,
      pattern: '^[^\\u0000-\\u001f\\u007f-\\u009f]*$',
    },
  },
}
export const refLabelSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['kinds', 'remotes'],
  properties: {
    kinds: {
      type: 'object',
      additionalProperties: false,
      required: ['branch', 'remote', 'tag', 'head'],
      properties: Object.fromEntries(
        ['branch', 'remote', 'tag', 'head'].map((kind) => [kind, styleSchema]),
      ),
    },
    remotes: {
      type: 'object',
      maxProperties: 64,
      propertyNames: { minLength: 1, maxLength: 128, pattern: '^\\S+$' },
      additionalProperties: styleSchema,
    },
  },
}
