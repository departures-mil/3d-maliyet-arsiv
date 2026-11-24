//go:build !windows

package main

import (
	"errors"
	"os"
)

// Linux/macOS (yalnız sınama): MA3D_OCR_SAHTE dosyası varsa onu döndürür.
func runOCR(img string) ([]byte, error) {
	if p := os.Getenv("MA3D_OCR_SAHTE"); p != "" {
		return os.ReadFile(p)
	}
	return nil, errors.New("OCR_YOK")
}
