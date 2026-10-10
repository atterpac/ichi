import type {
  Issue,
  PullRequest,
  InboxActivity,
} from '../../bindings/github.com/atterpac/ichi/internal/remote'
export type InboxItem = {
  number: number
  title: string
  author: string
  state: string
  body: string
  labels: string[]
  updated: string
  context: string
  signal: string
  danger: boolean
  checks?: string
  triage: InboxActivity
  url: string
}
export function issueItem(issue: Issue): InboxItem {
  return {
    number: issue.Number,
    title: issue.Title,
    author: issue.Author,
    state: issue.State,
    body: issue.Body,
    labels: [...issue.Labels].sort(
      (a, b) =>
        Number(/^(p0|p1|critical|urgent|priority: ?high)$/i.test(b)) -
        Number(/^(p0|p1|critical|urgent|priority: ?high)$/i.test(a)),
    ),
    updated: issue.UpdatedAt,
    url: issue.URL,
    context: issue.Milestone ? `Milestone · ${issue.Milestone}` : '',
    signal: issue.Assignees.length ? issue.Assignees.join(', ') : 'Unassigned',
    danger: issue.Labels.some((l) => /^(p0|p1|critical|urgent|priority: ?high)$/i.test(l)),
    triage: issue.Triage,
  }
}
export function prItem(pr: PullRequest): InboxItem {
  const checks = pr.Checks ?? []
  const failed = checks.filter((c) =>
    ['failure', 'timed_out', 'action_required', 'startup_failure'].includes(c.Conclusion),
  ).length
  const pending = checks.filter((c) => c.Status !== 'completed' && !c.Conclusion).length
  const passed = checks.filter((c) => c.Conclusion === 'success').length
  const other = checks.length - failed - pending - passed
  return {
    number: pr.Number,
    title: pr.Title,
    author: pr.Author.Login,
    state: pr.State === 'open' && pr.Draft ? 'draft' : pr.State,
    body: pr.Body,
    labels: pr.Labels,
    updated: pr.UpdatedAt,
    url: pr.URL,
    context: `${pr.HeadBranch} → ${pr.BaseBranch}`,
    signal:
      pr.State !== 'open'
        ? pr.State
        : pr.Draft
          ? 'Draft'
          : pr.ReviewDecision === 'APPROVED'
            ? 'Approved'
            : pr.ReviewDecision === 'CHANGES_REQUESTED'
              ? 'Changes requested'
              : pr.State === 'open'
                ? 'Awaiting review'
                : pr.State,
    checks: !checks.length
      ? 'No checks'
      : [
          failed && `${failed} failed`,
          pending && `${pending} pending`,
          passed && `${passed} passed`,
          other && `${other} skipped / other`,
        ]
          .filter(Boolean)
          .join(' · '),
    danger: failed > 0 || pr.ReviewDecision === 'CHANGES_REQUESTED',
    triage: pr.Triage,
  }
}
