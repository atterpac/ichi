package github

import (
	"encoding/json"
	"fmt"
	"github.com/atterpac/ichi/internal/remote"
	"strconv"
	"strings"
	"time"
)

type issueJSON struct {
	ID                                   string
	Number                               int
	Title, Body, State, StateReason, URL string
	Author                               *struct{ Login string }
	CreatedAt, UpdatedAt                 time.Time
	Labels                               []struct{ Name string }
	Assignees                            []struct{ Login string }
	Milestone                            *struct{ Title string }
}

const issueFields = "id,number,title,body,state,stateReason,url,author,createdAt,updatedAt,labels,assignees,milestone"

func (v issueJSON) model() remote.Issue {
	i := remote.Issue{NodeID: v.ID, Number: v.Number, Title: v.Title, Body: v.Body, State: strings.ToLower(v.State), StateReason: v.StateReason, URL: v.URL, CreatedAt: v.CreatedAt, UpdatedAt: v.UpdatedAt, Author: "Deleted user", Labels: []string{}, Assignees: []string{}, Comments: []remote.DiscussionComment{}}
	if v.Author != nil {
		i.Author = v.Author.Login
	}
	for _, l := range v.Labels {
		i.Labels = append(i.Labels, l.Name)
	}
	for _, a := range v.Assignees {
		i.Assignees = append(i.Assignees, a.Login)
	}
	if v.Milestone != nil {
		i.Milestone = v.Milestone.Title
	}
	return i
}
func (g *GitHub) ListIssues(repo, state, search string, limit int) ([]remote.Issue, error) {
	if state == "" {
		state = "open"
	}
	if state != "open" && state != "closed" && state != "all" {
		return nil, fmt.Errorf("invalid issue state")
	}
	if limit <= 0 {
		limit = 50
	}
	if limit > 500 {
		limit = 500
	}
	args := []string{"issue", "list", "--repo", repo, "--state", state, "--limit", strconv.Itoa(limit), "--json", issueFields}
	if strings.TrimSpace(search) != "" {
		args = append(args, "--search", search)
	}
	raw, err := g.gh(args...)
	if err != nil {
		return nil, err
	}
	var values []issueJSON
	if err = json.Unmarshal(raw, &values); err != nil {
		return nil, err
	}
	result := make([]remote.Issue, 0, len(values))
	for _, v := range values {
		result = append(result, v.model())
	}
	ids := make([]string, len(values))
	for i := range values {
		ids[i] = values[i].ID
	}
	activity := g.inboxActivity(ids)
	for i := range result {
		result[i].Triage = activity[ids[i]]
	}
	return result, nil
}
func (g *GitHub) GetIssue(repo string, number int) (*remote.Issue, error) {
	owner, name, ok := strings.Cut(repo, "/")
	if !ok || owner == "" || name == "" || number <= 0 {
		return nil, fmt.Errorf("a repository and positive issue number are required")
	}
	raw, err := g.gh("issue", "view", strconv.Itoa(number), "--repo", repo, "--json", issueFields)
	if err != nil {
		return nil, err
	}
	var value issueJSON
	if err = json.Unmarshal(raw, &value); err != nil {
		return nil, err
	}
	result := value.model()
	cursor := ""
	for {
		var response struct {
			Data struct {
				Repository *struct {
					Issue *struct {
						Comments       connection[discussionComment]
						ViewerCanReact bool
						ReactionGroups []reactionGroup
					}
				}
			}
		}
		fields := []string{"-f", "owner=" + owner, "-f", "name=" + name, "-F", "number=" + strconv.Itoa(number)}
		if cursor != "" {
			fields = append(fields, "-f", "cursor="+cursor)
		}
		query := `query($owner:String!,$name:String!,$number:Int!,$cursor:String){repository(owner:$owner,name:$name){issue(number:$number){ ` + reactionFields + ` comments(first:100,after:$cursor){nodes { ` + commentFields + ` } pageInfo {hasNextPage endCursor}}}}}`
		if err = g.graphql(query, fields, &response); err != nil {
			return nil, err
		}
		if response.Data.Repository == nil || response.Data.Repository.Issue == nil {
			return nil, fmt.Errorf("issue unavailable or inaccessible")
		}
		result.CanReact = response.Data.Repository.Issue.ViewerCanReact
		result.Reactions = reactionModels(response.Data.Repository.Issue.ReactionGroups)
		comments := response.Data.Repository.Issue.Comments
		for _, c := range comments.Nodes {
			result.Comments = append(result.Comments, c.model())
		}
		cursor, err = nextCursor(comments.PageInfo, cursor)
		if err != nil {
			return nil, err
		}
		if cursor == "" {
			break
		}
	}
	return &result, nil
}
