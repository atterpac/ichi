package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

const reviewSchema = `{"type":"object","additionalProperties":false,"required":["snapshotId","summary","steps"],"properties":{"snapshotId":{"type":"string"},"summary":{"type":"string"},"steps":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["title","explanation","diffRefs"],"properties":{"title":{"type":"string"},"explanation":{"type":"string"},"diffRefs":{"type":"array","items":{"type":"string"}}}}}}}`

// Capture a bounded prefix while continuing to drain the process pipes.
type reviewBuffer struct {
	buffer   bytes.Buffer
	limit    int
	exceeded bool
}

func (b *reviewBuffer) Len() int       { return b.buffer.Len() }
func (b *reviewBuffer) String() string { return b.buffer.String() }
func (b *reviewBuffer) Bytes() []byte  { return b.buffer.Bytes() }

func (b *reviewBuffer) Write(p []byte) (int, error) {
	n := len(p)
	remaining := b.limit - b.Len()
	if len(p) > remaining {
		b.exceeded = true
		p = p[:remaining]
	}
	_, _ = b.buffer.Write(p)
	return n, nil
}

func newReviewBackend(name string) (reviewBackend, error) {
	switch name {
	case "codex":
		return codexReviewBackend{}, nil
	case "ollama":
		return ollamaReviewBackend{url: "http://127.0.0.1:11434/api/chat"}, nil
	default:
		return nil, fmt.Errorf("choose Codex or Ollama")
	}
}

type codexReviewBackend struct{}

func (codexReviewBackend) generate(ctx context.Context, model, prompt string) ([]byte, error) {
	bin, err := exec.LookPath("codex")
	if err != nil {
		return nil, fmt.Errorf("Codex is not installed on PATH. Install the Codex CLI and run codex login first")
	}
	// No repository config, hooks, or source files are present in the working root.
	dir, err := os.MkdirTemp("", "ichi-review-")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(dir)
	schemaPath := filepath.Join(dir, "schema.json")
	if err := os.WriteFile(schemaPath, []byte(reviewSchema), 0600); err != nil {
		return nil, err
	}
	args := []string{"exec", "--ignore-user-config", "--ignore-rules", "--ephemeral", "--skip-git-repo-check", "--sandbox", "read-only", "--color", "never", "--output-schema", schemaPath,
		"-c", "approval_policy=\"never\"", "-c", "web_search=\"disabled\"", "-c", "project_doc_max_bytes=0"}
	for _, feature := range []string{"shell_tool", "unified_exec", "shell_snapshot", "apps", "plugins", "hooks", "multi_agent", "browser_use", "computer_use", "image_generation", "view_image", "code_mode", "code_mode_host", "memories", "skill_search"} {
		args = append(args, "--disable", feature)
	}
	if model != "" {
		args = append(args, "--model", model)
	}
	args = append(args, "-")
	cmd := exec.CommandContext(ctx, bin, args...)
	configureReviewProcess(cmd)
	cmd.Dir = dir
	cmd.Stdin = strings.NewReader(prompt)
	cmd.WaitDelay = time.Second
	out := &reviewBuffer{limit: 128 << 10}
	diagnostics := &reviewBuffer{limit: 4096}
	cmd.Stdout, cmd.Stderr = out, diagnostics
	if err := cmd.Run(); err != nil {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		// stderr may contain source text; never expose it to the bridge or logs.
		return nil, fmt.Errorf("Codex generation failed (%v). Check codex login and update the CLI; this integration requires --ignore-user-config and --output-schema support", err)
	}
	if out.exceeded {
		return nil, fmt.Errorf("Codex response exceeded the review size limit")
	}
	return out.Bytes(), nil
}

type ollamaReviewBackend struct{ url string }

func (b ollamaReviewBackend) generate(ctx context.Context, model, prompt string) ([]byte, error) {
	if model == "" {
		return nil, fmt.Errorf("enter an installed Ollama model name (see ollama list)")
	}
	// This adapter is explicitly local. Users must choose Codex for remote inference.
	if strings.Contains(strings.ToLower(model), "cloud") {
		return nil, fmt.Errorf("choose a local Ollama model, not a cloud model")
	}
	payload, err := json.Marshal(map[string]any{
		"model": model, "stream": false, "format": json.RawMessage(reviewSchema),
		"messages": []map[string]string{{"role": "user", "content": prompt}},
		"options":  map[string]any{"num_ctx": 65536, "num_predict": 8192, "temperature": 0.2},
	})
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, b.url, bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = nil
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: transport, Timeout: 5 * time.Minute, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	resp, err := client.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		return nil, fmt.Errorf("cannot reach local Ollama on port 11434; start ollama serve")
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Ollama returned HTTP %d; check that the model is installed and supports structured output", resp.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, (256<<10)+1))
	if err != nil {
		return nil, err
	}
	if len(data) > 256<<10 {
		return nil, fmt.Errorf("Ollama response exceeded the review size limit")
	}
	var result struct {
		Message struct {
			Content   string            `json:"content"`
			ToolCalls []json.RawMessage `json:"tool_calls"`
		} `json:"message"`
		Done       bool   `json:"done"`
		DoneReason string `json:"done_reason"`
		Error      string `json:"error"`
	}
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, fmt.Errorf("invalid Ollama response")
	}
	if !result.Done || result.DoneReason == "length" || result.Error != "" || len(result.Message.ToolCalls) > 0 {
		return nil, fmt.Errorf("Ollama did not complete the walkthrough; try another local model")
	}
	return []byte(result.Message.Content), nil
}
