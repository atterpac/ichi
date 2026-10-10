package github

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/atterpac/ichi/internal/remote"
)

type pageInfo struct {
	HasNextPage bool
	EndCursor   string
}
type connection[T any] struct {
	Nodes    []T
	PageInfo pageInfo
}
type discussionComment struct {
	ViewerCanUpdate, ViewerCanDelete, ViewerCanReact bool
	ReactionGroups                                   []reactionGroup
	ID, Body, URL, DiffHunk                          string
	CreatedAt                                        time.Time
	Author                                           *struct{ Login, AvatarURL string }
}

func (c discussionComment) model() remote.DiscussionComment {
	author := "Deleted user"
	avatar := ""
	if c.Author != nil {
		author = c.Author.Login
		avatar = c.Author.AvatarURL
	}
	return remote.DiscussionComment{CanUpdate: c.ViewerCanUpdate, CanDelete: c.ViewerCanDelete, CanReact: c.ViewerCanReact, Reactions: reactionModels(c.ReactionGroups), ID: c.ID, Body: c.Body, URL: c.URL, DiffHunk: c.DiffHunk, CreatedAt: c.CreatedAt, Author: author, AvatarURL: avatar}
}

type discussionReview struct {
	ViewerCanUpdate, ViewerCanDelete, ViewerCanReact bool
	ReactionGroups                                   []reactionGroup
	ID, Body, URL, State                             string
	SubmittedAt                                      time.Time
	Author                                           *struct{ Login, AvatarURL string }
}
type discussionThread struct {
	ViewerCanReply, ViewerCanResolve, ViewerCanUnresolve bool
	ID, Path, DiffSide                                   string
	Line, OriginalLine, StartLine                        int
	IsResolved, IsOutdated                               bool
	Comments                                             connection[discussionComment]
}

type reactionGroup struct {
	Content          string
	ViewerHasReacted bool
	Users            struct{ TotalCount int }
}

func reactionModels(groups []reactionGroup) []remote.ReactionGroup {
	result := make([]remote.ReactionGroup, 0, len(groups))
	for _, group := range groups {
		result = append(result, remote.ReactionGroup{Content: group.Content, Count: group.Users.TotalCount, ViewerHasReacted: group.ViewerHasReacted})
	}
	return result
}

const reactionFields = `viewerCanReact reactionGroups { content viewerHasReacted users { totalCount } }`
const permissionFields = `viewerCanUpdate viewerCanDelete ` + reactionFields
const commentFields = `id body url createdAt author { login avatarUrl(size:64) } ` + permissionFields
const threadCommentFields = commentFields + ` diffHunk`

// Each connection, including replies within a thread, is independently paginated.
// Errors must not turn a partially fetched discussion into an apparent empty result.
func (g *GitHub) graphql(query string, fields []string, result any) error {
	args := []string{"api", "graphql", "--hostname", "github.com", "-f", "query=" + query}
	args = append(args, fields...)
	raw, err := g.gh(args...)
	if err != nil {
		return err
	}
	var envelope struct{ Errors []struct{ Message string } }
	if err := json.Unmarshal(raw, &envelope); err != nil {
		return err
	}
	if len(envelope.Errors) > 0 {
		return fmt.Errorf("GitHub: %s", envelope.Errors[0].Message)
	}
	return json.Unmarshal(raw, result)
}
func nextCursor(info pageInfo, previous string) (string, error) {
	if !info.HasNextPage {
		return "", nil
	}
	if info.EndCursor == "" || info.EndCursor == previous {
		return "", fmt.Errorf("GitHub returned an invalid pagination cursor")
	}
	return info.EndCursor, nil
}
func (g *GitHub) GetDiscussion(repo string, number int) (*remote.Discussion, error) {
	owner, name, ok := strings.Cut(repo, "/")
	if !ok || owner == "" || name == "" || number <= 0 {
		return nil, fmt.Errorf("a repository and positive PR number are required")
	}
	result := &remote.Discussion{Comments: []remote.DiscussionComment{}, Reviews: []remote.DiscussionReview{}, Threads: []remote.ReviewThread{}}
	selections := []string{
		"comments(first:100, after:$cursor) { nodes { " + commentFields + " } pageInfo { hasNextPage endCursor } }",
		"reviews(first:100, after:$cursor) { nodes { id body url state submittedAt author { login avatarUrl(size:64) } " + permissionFields + " } pageInfo { hasNextPage endCursor } }",
		"reviewThreads(first:100, after:$cursor) { nodes { id path line originalLine startLine diffSide isResolved isOutdated viewerCanReply viewerCanResolve viewerCanUnresolve comments(first:100) { nodes { " + threadCommentFields + " } pageInfo { hasNextPage endCursor } } } pageInfo { hasNextPage endCursor } }",
	}
	for kind, selection := range selections {
		cursor := ""
		for {
			var response struct {
				Data struct {
					Repository *struct {
						PullRequest *struct {
							ID             string
							ViewerCanReact bool
							ReactionGroups []reactionGroup
							Comments       connection[discussionComment]
							Reviews        connection[discussionReview]
							ReviewThreads  connection[discussionThread]
						}
					}
				}
			}
			fields := []string{"-f", "owner=" + owner, "-f", "name=" + name, "-F", "number=" + strconv.Itoa(number)}
			if cursor != "" {
				fields = append(fields, "-f", "cursor="+cursor)
			}
			query := `query($owner:String!,$name:String!,$number:Int!,$cursor:String){ repository(owner:$owner,name:$name){ pullRequest(number:$number){ id ` + reactionFields + ` ` + selection + ` } } }`
			if err := g.graphql(query, fields, &response); err != nil {
				return nil, err
			}
			if response.Data.Repository == nil || response.Data.Repository.PullRequest == nil {
				return nil, fmt.Errorf("pull request unavailable or inaccessible")
			}
			pr := response.Data.Repository.PullRequest
			result.SubjectID = pr.ID
			result.CanReact = pr.ViewerCanReact
			result.Reactions = reactionModels(pr.ReactionGroups)
			var page pageInfo
			switch kind {
			case 0:
				page = pr.Comments.PageInfo
				for _, c := range pr.Comments.Nodes {
					result.Comments = append(result.Comments, c.model())
				}
			case 1:
				page = pr.Reviews.PageInfo
				for _, r := range pr.Reviews.Nodes {
					author := "Deleted user"
					avatar := ""
					if r.Author != nil {
						author = r.Author.Login
						avatar = r.Author.AvatarURL
					}
					result.Reviews = append(result.Reviews, remote.DiscussionReview{CanUpdate: r.ViewerCanUpdate, CanDelete: r.ViewerCanDelete, CanReact: r.ViewerCanReact, Reactions: reactionModels(r.ReactionGroups), ID: r.ID, Author: author, AvatarURL: avatar, Body: r.Body, State: r.State, URL: r.URL, CreatedAt: r.SubmittedAt})
				}
			case 2:
				page = pr.ReviewThreads.PageInfo
				for _, t := range pr.ReviewThreads.Nodes {
					thread := remote.ReviewThread{CanReply: t.ViewerCanReply, CanResolve: t.ViewerCanResolve, CanUnresolve: t.ViewerCanUnresolve, ID: t.ID, Path: t.Path, Line: t.Line, OriginalLine: t.OriginalLine, StartLine: t.StartLine, Side: t.DiffSide, Resolved: t.IsResolved, Outdated: t.IsOutdated, Comments: []remote.DiscussionComment{}}
					for _, c := range t.Comments.Nodes {
						thread.Comments = append(thread.Comments, c.model())
					}
					replyCursor, err := nextCursor(t.Comments.PageInfo, "")
					if err != nil {
						return nil, err
					}
					for replyCursor != "" {
						var replies struct {
							Data struct {
								Node *struct{ Comments connection[discussionComment] }
							}
						}
						q := `query($id:ID!,$cursor:String!){ node(id:$id){ ... on PullRequestReviewThread { comments(first:100,after:$cursor){ nodes { ` + threadCommentFields + ` } pageInfo { hasNextPage endCursor } } } } }`
						if err := g.graphql(q, []string{"-f", "id=" + t.ID, "-f", "cursor=" + replyCursor}, &replies); err != nil {
							return nil, err
						}
						if replies.Data.Node == nil {
							return nil, fmt.Errorf("review thread unavailable")
						}
						for _, c := range replies.Data.Node.Comments.Nodes {
							thread.Comments = append(thread.Comments, c.model())
						}
						replyCursor, err = nextCursor(replies.Data.Node.Comments.PageInfo, replyCursor)
						if err != nil {
							return nil, err
						}
					}
					result.Threads = append(result.Threads, thread)
				}
			}
			var err error
			cursor, err = nextCursor(page, cursor)
			if err != nil {
				return nil, err
			}
			if cursor == "" {
				break
			}
		}
	}
	return result, nil
}
