package services

import (
	"context"
	"fmt"
	"github.com/atterpac/ichi/internal/remote"
	"time"
)

// ConversationAction also handles issue conversations using the selected remote.
func (s *PRService) ConversationAction(ctx context.Context, remoteName string, number int, kind string, input remote.ConversationAction) error {
	ctx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()
	p, repo, _, err := s.provider(ctx, remoteName)
	if err != nil {
		return err
	}
	writer, ok := p.(remote.ConversationWriter)
	if !ok {
		return fmt.Errorf("conversation actions are unavailable for this provider")
	}
	err = writer.MutateConversation(repo, number, kind, input)
	if err == nil {
		s.state.Emit(EventPRChanged, map[string]any{"remote": remoteName, "id": number, "kind": kind})
	}
	return err
}
func (s *PRService) PublishReview(ctx context.Context, remoteName string, number int, input remote.ConversationReview) error {
	ctx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()
	p, repo, _, err := s.provider(ctx, remoteName)
	if err != nil {
		return err
	}
	writer, ok := p.(remote.ConversationWriter)
	if !ok {
		return fmt.Errorf("review actions are unavailable for this provider")
	}
	err = writer.PublishReview(repo, number, input)
	if err == nil {
		s.state.Emit(EventPRChanged, map[string]any{"remote": remoteName, "id": number})
	}
	return err
}
