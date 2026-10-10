//go:build darwin && cgo

package services

/*
#cgo LDFLAGS: -framework CoreText -framework CoreFoundation
#include <CoreText/CoreText.h>
#include <stdlib.h>
static char* ichiFontFamily(CFArrayRef families, CFIndex index) {
 CFStringRef name = (CFStringRef)CFArrayGetValueAtIndex(families,index);
 CFIndex size = CFStringGetMaximumSizeForEncoding(CFStringGetLength(name),kCFStringEncodingUTF8)+1;
 char *result = malloc(size);
 if (result && !CFStringGetCString(name,result,size,kCFStringEncodingUTF8)) { free(result); return NULL; }
 return result;
}
static int ichiFontMonospaced(CFArrayRef families, CFIndex index) {
 CFStringRef name = (CFStringRef)CFArrayGetValueAtIndex(families,index);
 CTFontRef font = CTFontCreateWithName(name,12,NULL);
 if (!font) return 0;
 int mono = (CTFontGetSymbolicTraits(font) & kCTFontMonoSpaceTrait) != 0;
 CFRelease(font);
 return mono;
}
*/
import "C"
import (
	"context"
	"fmt"
	"unsafe"
)

func installedFontFamilies(ctx context.Context) ([]FontFamily, error) {
	families := C.CTFontManagerCopyAvailableFontFamilyNames()
	if families == 0 {
		return nil, fmt.Errorf("macOS could not list installed fonts")
	}
	defer C.CFRelease(C.CFTypeRef(families))
	result := []FontFamily{}
	for i, count := C.CFIndex(0), C.CFArrayGetCount(families); i < count; i++ {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		name := C.ichiFontFamily(families, i)
		if name == nil {
			continue
		}
		family := C.GoString(name)
		C.free(unsafe.Pointer(name))
		result = append(result, FontFamily{Family: family, Monospace: C.ichiFontMonospaced(families, i) != 0})
	}
	return result, nil
}
