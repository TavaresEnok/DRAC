-- Câmera desativável: para de mostrar (live) e de gravar sem apagar o cadastro.
ALTER TABLE "Camera"
ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true;
