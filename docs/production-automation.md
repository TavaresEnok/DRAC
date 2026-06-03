# Automação de produção DRAC

Este documento reúne as rotinas que podem ser executadas sem validação manual do cliente.

## Regressão automática

```bash
./scripts/prod-regression.sh
```

Valida:

- containers essenciais em execução;
- API, Web e autenticação básica;
- banco com schema principal, câmeras e administrador ativo;
- câmeras online, live em WebRTC, live no perfil principal e analytics separado;
- MediaMTX API com credenciais internas;
- Central acessível quando o conector está ativo;
- checklist `production-readiness.sh`;
- restore temporário do backup mais recente.

Retornos:

- `0`: sem falhas e sem avisos;
- `1`: sem falhas, mas com avisos operacionais;
- `2`: falha bloqueante.

Para pular o restore temporário:

```bash
DRAC_REGRESSION_RESTORE_CHECK=false ./scripts/prod-regression.sh
```

## Verificação de restore

```bash
./scripts/verify-backup-restore.sh
```

O script restaura o dump mais recente em um banco temporário dentro do Postgres atual, confere tabelas essenciais e remove o banco temporário ao final.

Ele não altera o banco de produção.

Para testar um dump específico:

```bash
./scripts/verify-backup-restore.sh infra/backups/postgres/drac-postgres-YYYYMMDDTHHMMSSZ.dump
```

## Atualização com rollback

```bash
./scripts/update-drac.sh
```

Fluxo:

1. exige worktree limpa, salvo `DRAC_UPDATE_ALLOW_DIRTY=true`;
2. salva snapshot do `infra/.env`;
3. salva commit atual;
4. gera dump do banco antes da atualização;
5. faz `fetch` e `merge --ff-only`;
6. rebuilda API/Web;
7. aplica migrations;
8. valida health e readiness.

Se falhar após iniciar a atualização, o script tenta rollback automático:

- volta o Git para o commit anterior;
- restaura `infra/.env`;
- restaura o dump pré-update;
- recria API/Web.

O ponto de segurança fica em:

```text
infra/backups/update-YYYYMMDDTHHMMSSZ/
```

## Restore real

```bash
DRAC_RESTORE_YES=true ./scripts/restore-drac.sh
```

Restaura o banco real a partir do dump mais recente. Use apenas em recuperação operacional.

## Logs dos containers

O Compose base usa rotação de logs Docker:

```env
DOCKER_LOG_MAX_SIZE=50m
DOCKER_LOG_MAX_FILES=5
```

Isso limita crescimento de logs por container e reduz risco de disco cheio fora das gravações.
