package services

import (
	"bytes"
	"fmt"
	"strings"
	"text/template"
	"text/template/parse"
	"unicode"
)

// RefFormatRequest contains plain metadata only; templates cannot access Git or files.
type RefFormatRequest struct {
	Format  string
	Name    string
	Branch  string
	Remote  string
	Kind    string
	Current bool
}
type RefFormatResult struct {
	Text  string
	Error string
}
type refFormatData struct {
	Name, Branch, Remote, Kind string
	Current                    bool
}

// FormatRefLabels evaluates bounded, single-line Go text/templates in a batch.
// Named templates are excluded to prevent recursion. Scalar data needs no range.
func (s *PreferencesService) FormatRefLabels(requests []RefFormatRequest) ([]RefFormatResult, error) {
	if len(requests) > 512 {
		return nil, fmt.Errorf("at most 512 ref labels per batch")
	}
	results := make([]RefFormatResult, len(requests))
	compiled := map[string]*template.Template{}
	failures := map[string]string{}
	for i, r := range requests {
		t := compiled[r.Format]
		problem := failures[r.Format]
		if t == nil && problem == "" {
			var err error
			if len(r.Format) > 512 {
				err = fmt.Errorf("format exceeds 512 bytes")
			} else {
				t, err = template.New("ref").Option("missingkey=error").Parse(r.Format)
				if err == nil && len(t.Templates()) != 1 {
					err = fmt.Errorf("named templates are not supported")
				}
				if err == nil {
					err = validateRefTree(t.Tree.Root)
				}
			}
			if err != nil {
				problem = err.Error()
				failures[r.Format] = problem
			} else {
				compiled[r.Format] = t
			}
		}
		if problem != "" {
			results[i].Error = problem
			continue
		}
		if len(r.Name)+len(r.Branch)+len(r.Remote)+len(r.Kind) > 4096 {
			results[i].Error = "ref metadata exceeds 4096 bytes"
			continue
		}
		output := &refFormatWriter{}
		err := t.Execute(output, refFormatData{r.Name, r.Branch, r.Remote, r.Kind, r.Current})
		if err != nil {
			results[i].Error = err.Error()
			continue
		}
		text := strings.TrimSpace(output.String())
		if text == "" || strings.IndexFunc(output.String(), func(r rune) bool { return unicode.IsControl(r) || r == '\u2028' || r == '\u2029' }) >= 0 {
			results[i].Error = "label must contain visible, single-line text"
			continue
		}
		results[i].Text = text
	}
	return results, nil
}
func validateRefTree(node parse.Node) error {
	if node == nil {
		return nil
	}
	switch n := node.(type) {
	case *parse.ListNode:
		if n == nil {
			return nil
		}
		for _, child := range n.Nodes {
			if err := validateRefTree(child); err != nil {
				return err
			}
		}
	case *parse.ChainNode:
		return validateRefTree(n.Node)
	case *parse.ActionNode:
		return validateRefTree(n.Pipe)
	case *parse.PipeNode:
		for _, command := range n.Cmds {
			if err := validateRefTree(command); err != nil {
				return err
			}
		}
	case *parse.CommandNode:
		for _, arg := range n.Args {
			if err := validateRefTree(arg); err != nil {
				return err
			}
		}
	case *parse.IdentifierNode:
		switch n.Ident {
		case "eq", "ne", "lt", "le", "gt", "ge", "and", "or", "not", "len", "index", "slice":
		default:
			return fmt.Errorf("function %s is not supported in ref labels", n.Ident)
		}
	case *parse.IfNode:
		if err := validateRefTree(n.Pipe); err != nil {
			return err
		}
		if err := validateRefTree(n.List); err != nil {
			return err
		}
		return validateRefTree(n.ElseList)
	case *parse.WithNode:
		if err := validateRefTree(n.Pipe); err != nil {
			return err
		}
		if err := validateRefTree(n.List); err != nil {
			return err
		}
		return validateRefTree(n.ElseList)
	case *parse.TemplateNode, *parse.RangeNode:
		return fmt.Errorf("template calls and range are not supported in ref labels")
	}
	return nil
}

type refFormatWriter struct{ bytes.Buffer }

func (w *refFormatWriter) Write(p []byte) (int, error) {
	if w.Len()+len(p) > 512 {
		return 0, fmt.Errorf("formatted label exceeds 512 bytes")
	}
	return w.Buffer.Write(p)
}
