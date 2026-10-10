package remote

import "time"

// DiscussionProvider is optional: hosts may expose different conversation APIs.
type DiscussionProvider interface {
	GetDiscussion(repo string, number int) (*Discussion, error)
}

type Discussion struct {
	SubjectID string
	CanReact  bool
	Reactions []ReactionGroup
	Comments  []DiscussionComment
	Reviews   []DiscussionReview
	Threads   []ReviewThread
}
type DiscussionComment struct {
	CanUpdate bool
	CanDelete bool
	CanReact  bool
	Reactions []ReactionGroup
	ID        string
	Author    string
	AvatarURL string
	Body      string
	URL       string
	CreatedAt time.Time
	DiffHunk  string
}
type DiscussionReview struct {
	CanUpdate bool
	CanDelete bool
	CanReact  bool
	Reactions []ReactionGroup
	ID        string
	Author    string
	AvatarURL string
	Body      string
	State     string
	URL       string
	CreatedAt time.Time
}
type ReviewThread struct {
	CanReply     bool
	CanResolve   bool
	CanUnresolve bool
	ID           string
	Path         string
	Line         int
	OriginalLine int
	StartLine    int
	Side         string
	Resolved     bool
	Outdated     bool
	Comments     []DiscussionComment
}

type ReactionGroup struct {
	Content          string
	Count            int
	ViewerHasReacted bool
}
type ConversationAction struct {
	Action    string
	SubjectID string
	Body      string
	Reaction  string
}
type ReviewDraftComment struct {
	Path string
	Line int
	Side string
	Body string
}
type ConversationReview struct {
	CommitOID string
	Event     string
	Body      string
	Comments  []ReviewDraftComment
}
type ConversationWriter interface {
	MutateConversation(repo string, number int, kind string, input ConversationAction) error
	PublishReview(repo string, number int, input ConversationReview) error
}
