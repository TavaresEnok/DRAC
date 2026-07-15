# Hardening de segurança

Este documento define o baseline obrigatório de uma instalação DRAC comercial.

## Controles obrigatórios

- Expor publicamente somente HTTPS e a porta administrativa de SSH aprovada.
- Manter PostgreSQL, Redis, MediaMTX, IA, API e agente de build em redes internas.
- Usar segredos aleatórios e distintos para JWT, câmera, serviços internos, evidências, MediaMTX, Central e agente de build.
- Habilitar senha forte e substituir imediatamente credenciais iniciais.
- Manter `COOKIE_SECURE=true`, CORS restrito ao domínio real e `NODE_ENV=production`.
- Manter `usesCleartextTraffic=false`, `allowBackup=false` e sem `SYSTEM_ALERT_WINDOW` no APK final.
- Nunca registrar usuário/senha de RTSP. O readiness bloqueia o lançamento se encontrar URL com credenciais nos logs recentes.
- Executar `pnpm verify`, `bash scripts/production-readiness.sh` e `bash scripts/prod-regression.sh` antes de uma versão.

## Resposta a vazamento de credencial

1. Interromper a publicação da versão.
2. Corrigir e validar a sanitização dos logs.
3. Recriar os containers para descartar os arquivos de log antigos.
4. Trocar a senha no equipamento afetado e atualizar o cadastro criptografado no DRAC.
5. Confirmar que o readiness não detecta novas ocorrências.
6. Registrar o incidente e o período potencial de exposição.

## Verificação Android

O `build-client.sh` inspeciona o APK final e falha caso encontre permissões de overlay/storage legado, backup de dados habilitado ou tráfego HTTP liberado. Ele também valida assinatura e gera hashes SHA-256.

## Revisão periódica

- Semanal: dependências automatizadas, uso de disco e backups.
- Mensal: usuários administrativos, sessões, portas e certificados.
- Por release: checklist OWASP MASVS, manifest Android, hashes e restore.
- Anual ou após mudança de arquitetura: pentest independente.
