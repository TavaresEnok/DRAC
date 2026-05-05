package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"time"
)

type RecordingRegistration struct {
	CameraID        string  `json:"cameraId"`
	FilePath        string  `json:"filePath"`
	StartedAt       string  `json:"startedAt"`
	EndedAt         string  `json:"endedAt"`
	DurationSeconds float64 `json:"durationSeconds"`
	SizeBytes       int64   `json:"sizeBytes"`
}

func startRecording(cam Camera, apiURL, secretToken string) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[%s] CRASH RECUPERADO: %v", cam.Name, r)
			mu.Lock()
			delete(activeRecordings, cam.ID)
			mu.Unlock()
		}
	}()
	storageRoot := os.Getenv("STORAGE_ROOT")
	if storageRoot == "" {
		storageRoot = "/storage"
	}

	for {
		// Verificar se deve continuar gravando
		mu.Lock()
		if !activeRecordings[cam.ID] {
			mu.Unlock()
			fmt.Printf("[%s] Parando loop de gravação (câmera removida).\n", cam.Name)
			return
		}
		mu.Unlock()

		now := time.Now()
		dirPath := filepath.Join(storageRoot, cam.ID, now.Format("2006/01/02"))
		if err := os.MkdirAll(dirPath, 0755); err != nil {
			log.Printf("[%s] Erro ao criar diretório: %v", cam.Name, err)
			time.Sleep(10 * time.Second)
			continue
		}

		fileName := now.Format("15-04-05") + ".mp4"
		relativeFlushPath := filepath.Join(cam.ID, now.Format("2006/01/02"), fileName)
		fullPath := filepath.Join(storageRoot, relativeFlushPath)

		password, _ := decrypt(cam.PasswordEncrypted, os.Getenv("CAMERA_SECRET_KEY"))
		rtspURL := buildRtspURL(cam, password)

		segmentSeconds := 300 // 5 minutos
		
		fmt.Printf("[%s] Iniciando segmento: %s\n", cam.Name, fileName)
		
		cmd := exec.Command("ffmpeg",
			"-rtsp_transport", "tcp",
			"-i", rtspURL,
			"-t", fmt.Sprintf("%d", segmentSeconds),
			"-c:v", "copy",
			"-c:a", "aac",
			"-movflags", "+faststart+frag_keyframe+empty_moov+default_base_moof",
			"-map", "0",
			"-y",
			fullPath,
		)

		startTime := time.Now()
		err := cmd.Run()
		endTime := time.Now()

		if err != nil {
			log.Printf("[%s] Erro na gravação: %v", cam.Name, err)
			time.Sleep(5 * time.Second)
			continue
		}

		// Registrar gravação na API
		fileInfo, _ := os.Stat(fullPath)
		size := int64(0)
		if fileInfo != nil {
			size = fileInfo.Size()
		}

		registration := RecordingRegistration{
			CameraID:        cam.ID,
			FilePath:        relativeFlushPath,
			StartedAt:       startTime.Format(time.RFC3339),
			EndedAt:         endTime.Format(time.RFC3339),
			DurationSeconds: endTime.Sub(startTime).Seconds(),
			SizeBytes:       size,
		}

		if err := registerRecording(apiURL, secretToken, registration); err != nil {
			log.Printf("[%s] Falha ao registrar gravação: %v", cam.Name, err)
		}
	}
}

func registerRecording(apiURL, secretToken string, reg RecordingRegistration) error {
	jsonData, err := json.Marshal(reg)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("POST", apiURL+"/recordings/internal/register", bytes.NewBuffer(jsonData))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Service-Token", secretToken)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		return fmt.Errorf("status erro: %d", resp.StatusCode)
	}

	return nil
}
