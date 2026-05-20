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
		currentCam := cam
		if refreshed, err := fetchCameraByID(apiURL, cam.ID); err == nil && refreshed != nil {
			currentCam = *refreshed
		}

		// Verificar se deve continuar gravando
		mu.Lock()
		if !activeRecordings[currentCam.ID] {
			mu.Unlock()
			fmt.Printf("[%s] Parando loop de gravação (câmera removida).\n", currentCam.Name)
			return
		}
		mu.Unlock()

		now := time.Now()
		dirPath := filepath.Join(storageRoot, currentCam.ID, now.Format("2006/01/02"))
		if err := os.MkdirAll(dirPath, 0755); err != nil {
			log.Printf("[%s] Erro ao criar diretório: %v", currentCam.Name, err)
			time.Sleep(10 * time.Second)
			continue
		}

		fileName := now.Format("15-04-05") + ".mp4"
		relativeFlushPath := filepath.Join(currentCam.ID, now.Format("2006/01/02"), fileName)
		fullPath := filepath.Join(storageRoot, relativeFlushPath)

		password, _ := decrypt(currentCam.PasswordEncrypted, os.Getenv("CAMERA_SECRET_KEY"))
		rtspURL := buildRtspURL(currentCam, password)

		segmentSeconds := 300 // 5 minutos
		mu.Lock()
		if configured, ok := recordingSegments[currentCam.ID]; ok && configured > 0 {
			segmentSeconds = configured
		}
		mu.Unlock()
		
		fmt.Printf("[%s] Iniciando segmento: %s\n", currentCam.Name, fileName)
		
		rtspTransport := currentCam.PreferredRtspTransport
		if rtspTransport == "" {
			rtspTransport = "tcp"
		}

		// Sempre usar H.264 (libx264) para garantir compatibilidade universal com browsers
		// Isso evita HEVC/H.265 que não é suportado nativamente pela maioria dos browsers
		videoArgs := []string{
			"-c:v", "libx264",
			"-preset", "ultrafast",
			"-profile:v", "baseline",
			"-level", "3.1",
			"-pix_fmt", "yuv420p",
			"-tune", "zerolatency",
		}
		if currentCam.RecordingWidth > 0 && currentCam.RecordingHeight > 0 {
			videoArgs = append(videoArgs, "-vf", fmt.Sprintf("scale=%d:%d", currentCam.RecordingWidth, currentCam.RecordingHeight))
		}
		if currentCam.RecordingFps > 0 {
			videoArgs = append(videoArgs, "-r", fmt.Sprintf("%d", currentCam.RecordingFps))
		}
		if currentCam.RecordingBitrateKbps > 0 {
			videoArgs = append(videoArgs, "-b:v", fmt.Sprintf("%dk", currentCam.RecordingBitrateKbps), "-maxrate", fmt.Sprintf("%dk", currentCam.RecordingBitrateKbps), "-bufsize", fmt.Sprintf("%dk", currentCam.RecordingBitrateKbps*2))
		}

		args := []string{
			"-rtsp_transport", rtspTransport,
			"-i", rtspURL,
			"-t", fmt.Sprintf("%d", segmentSeconds),
		}
		args = append(args, videoArgs...)
		args = append(args,
			"-c:a", "aac",
			"-ar", "44100",
			"-ac", "1",
			"-movflags", "+faststart",
			"-map", "0:v:0",
			"-map", "0:a:0?",
			"-y",
			fullPath,
		)
		log.Printf(
			"[%s] Iniciando gravação H.264: %dx%d fps=%d bitrate=%dk transport=%s arquivo=%s",
			currentCam.Name,
			currentCam.RecordingWidth,
			currentCam.RecordingHeight,
			currentCam.RecordingFps,
			currentCam.RecordingBitrateKbps,
			rtspTransport,
			fileName,
		)

		cmd := exec.Command("ffmpeg", args...)

		startTime := time.Now()
		err := cmd.Run()
		endTime := time.Now()

		if err != nil {
			log.Printf("[%s] Erro na gravação: %v", currentCam.Name, err)
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
			CameraID:        currentCam.ID,
			FilePath:        relativeFlushPath,
			StartedAt:       startTime.Format(time.RFC3339),
			EndedAt:         endTime.Format(time.RFC3339),
			DurationSeconds: endTime.Sub(startTime).Seconds(),
			SizeBytes:       size,
		}

		if err := registerRecording(apiURL, secretToken, registration); err != nil {
			log.Printf("[%s] Falha ao registrar gravação: %v", currentCam.Name, err)
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
