# Checklist de liberação para produção

## Gate automático

- [ ] `pnpm verify` aprovado.
- [ ] `scripts/production-readiness.sh` sem bloqueios.
- [ ] `scripts/prod-regression.sh` sem falhas.
- [ ] Migrações do banco atualizadas.
- [ ] Restore do backup aprovado.
- [ ] Logs sem credenciais.
- [ ] Agente de build saudável.
- [ ] APK/AAB com assinatura, manifest e SHA-256 aprovados.

## Gate funcional

- [ ] Login, refresh, logout e biometria validados.
- [ ] Live, poster, gravação, thumbnail, playback e download validados.
- [ ] Perda/retorno da rede e câmera testados.
- [ ] Push e retomada em background testados em aparelho físico.
- [ ] Alarmes ajustados sem fadiga operacional.

## Gate operacional

- [ ] Release associado a commit/tag e árvore limpa.
- [ ] Backup externo criptografado e restore em outro host ensaiado.
- [ ] Monitoramento e responsável por incidente definidos.
- [ ] Política de privacidade e Data Safety revisadas.
- [ ] Teste fechado da Play Store concluído quando aplicável.
- [ ] Período de estabilidade de 7–14 dias sem regressão crítica.

Itens físicos, jurídicos, Play Console e backup externo exigem validação humana; os demais devem ser automatizados.
