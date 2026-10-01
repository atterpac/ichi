package remote

import "testing"

type namedProvider struct {
	Provider
	name string
}

func (p namedProvider) Name() string { return p.name }

func TestDetectRemoteTransportAndExactHost(t *testing.T) {
	previous := providers
	providers = map[string]func() Provider{}
	t.Cleanup(func() { providers = previous })
	for _, name := range []string{"github", "gitlab", "bitbucket"} {
		Register(name, func() Provider { return namedProvider{name: name} })
	}
	for _, test := range []struct{ url, provider, repo string }{
		{"https://github.com/owner/repo.git", "github", "owner/repo"},
		{"git@github.com:owner/repo.git", "github", "owner/repo"},
		{"ssh://git@GitHub.COM:22/owner/repo.git", "github", "owner/repo"},
		{"git://github.com/owner/repo", "github", "owner/repo"},
		{"https://gitlab.com/group/sub/repo.git", "gitlab", "group/sub/repo"},
		{"git@bitbucket.org:owner/repo", "bitbucket", "owner/repo"},
	} {
		t.Run(test.url, func(t *testing.T) {
			p, repo, err := DetectFromURL(test.url)
			if err != nil || p.Name() != test.provider || repo != test.repo {
				t.Fatalf("got %v, %q, %v", p, repo, err)
			}
		})
	}
	for _, url := range []string{
		"https://example.test/github.com/owner/repo", "https://github.com.example.test/owner/repo",
		"https://github.com@elsewhere.test/owner/repo", "https://github.com/owner", "https://github.com/owner/../repo", "https://github.com/owner//repo",
		"ssh://github.com:bad/owner/repo", "file:///github.com/owner/repo", "https://github.com/owner/repo?github.com", "https://github.com/owner%2frepo/name",
		"github.com", "/tmp/owner/repo", "C:\\owner\\repo", "git@github.com:/owner/repo", "https://github.com/group/owner/repo",
	} {
		t.Run(url, func(t *testing.T) {
			if _, _, err := DetectFromURL(url); err == nil {
				t.Fatal("malformed or unsupported remote accepted")
			}
		})
	}
}
