//go:build !darwin || !cgo

package services

import (
	"context"
	"fmt"
	"os/exec"
	"runtime"
	"strings"
)

func installedFontFamilies(ctx context.Context) ([]FontFamily, error) {
	if runtime.GOOS != "linux" {
		return nil, fmt.Errorf("system font discovery is available on macOS and Linux; bundled fonts remain available")
	}
	output, err := exec.CommandContext(ctx, "fc-list", "--format=%{family[0]}\t%{spacing}\n").Output()
	if err != nil {
		return nil, fmt.Errorf("could not discover system fonts using fontconfig: %w", err)
	}
	fonts := []FontFamily{}
	for _, line := range strings.Split(string(output), "\n") {
		values := strings.SplitN(line, "\t", 2)
		if len(values) == 2 {
			fonts = append(fonts, FontFamily{Family: values[0], Monospace: values[1] == "100" || values[1] == "110"})
		}
	}
	return fonts, nil
}
