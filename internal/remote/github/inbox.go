package github

import (
	"encoding/json"
	"github.com/atterpac/ichi/internal/remote"
)

type inboxNode struct {
	ID       string
	Comments struct {
		TotalCount int
		Nodes      []discussionComment
	}
	ReviewThreads connection[struct{ IsResolved bool }]
}

// Enrichment is optional and batched; full conversations load on demand.
func (g *GitHub) inboxActivity(ids []string) map[string]remote.InboxActivity {
	result := map[string]remote.InboxActivity{}
	valid := []string{}
	for _, id := range ids {
		if id != "" {
			valid = append(valid, id)
		}
	}
	for start := 0; start < len(valid); start += 50 {
		end := min(start+50, len(valid))
		encoded, _ := json.Marshal(valid[start:end])
		query := `query { nodes(ids:` + string(encoded) + `) { id ... on Issue { comments(last:3) { totalCount nodes { ` + commentFields + ` } } } ... on PullRequest { comments(last:3) { totalCount nodes { ` + commentFields + ` } } reviewThreads(first:100) { nodes { isResolved } pageInfo { hasNextPage endCursor } } } } }`
		var response struct{ Data struct{ Nodes []*inboxNode } }
		if g.graphql(query, nil, &response) != nil {
			continue
		}
		for _, node := range response.Data.Nodes {
			if node == nil {
				continue
			}
			activity := remote.InboxActivity{Known: true, CommentCount: node.Comments.TotalCount, RecentComments: []remote.DiscussionComment{}}
			for _, comment := range node.Comments.Nodes {
				activity.RecentComments = append(activity.RecentComments, comment.model())
			}
			threads := node.ReviewThreads
			cursor := ""
			for {
				for _, thread := range threads.Nodes {
					if !thread.IsResolved {
						activity.UnresolvedThreads++
					}
				}
				next, err := nextCursor(threads.PageInfo, cursor)
				if err != nil {
					break
				}
				if next == "" {
					activity.ThreadsKnown = true
					break
				}
				cursor = next
				var page struct {
					Data struct {
						Node *struct {
							ReviewThreads connection[struct{ IsResolved bool }]
						}
					}
				}
				query := `query($id:ID!,$cursor:String!) { node(id:$id) { ... on PullRequest { reviewThreads(first:100,after:$cursor) { nodes { isResolved } pageInfo { hasNextPage endCursor } } } } }`
				if g.graphql(query, []string{"-f", "id=" + node.ID, "-f", "cursor=" + cursor}, &page) != nil || page.Data.Node == nil {
					break
				}
				threads = page.Data.Node.ReviewThreads
			}
			result[node.ID] = activity
		}
	}
	return result
}
