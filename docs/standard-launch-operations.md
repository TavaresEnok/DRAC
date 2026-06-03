# DRAC Standard Launch

Este e o perfil de lancamento inicial para producao sem exigir aumento de storage,
sem IA obrigatoria e sem gravacao continua obrigatoria.

## Perfil

Configure:

```bash
DRAC_LAUNCH_PROFILE=standard
AI_AUTO_START_ENABLED=false
RECORDING_AUTO_START_ENABLED=false
```

Neste perfil:

- live WebRTC, cadastro de cameras, usuarios, playback, alertas, storage e Central sao recursos principais;
- IA fica desligada por padrao e pode ser habilitada depois;
- gravacao continua nao e obrigatoria;
- o administrador pode escolher por camera: manual, movimento, agenda ou continua;
- storage insuficiente para gravacao continua futura nao bloqueia producao enquanto continua estiver desligada.

## Prontidao Operacional

API:

```bash
GET /health/operational-readiness
```

O endpoint retorna:

- `ready`: sistema pronto no perfil atual;
- `attention`: ha ponto operacional a acompanhar;
- `blocked`: ha falha critica real.

O checklist local usa a mesma ideia:

```bash
./scripts/production-readiness.sh
```

## Atualizacao Remota

```bash
./scripts/update-drac.sh
```

O script:

- cria snapshot do `.env`;
- gera dump rapido do Postgres;
- atualiza a branch `main`;
- rebuilda API/Web;
- aplica migracoes Prisma;
- valida API, Web e readiness.

Para usar outra branch:

```bash
DRAC_UPDATE_BRANCH=main ./scripts/update-drac.sh
```

## Restore

Usando o backup mais recente:

```bash
DRAC_RESTORE_YES=true ./scripts/restore-drac.sh
```

Usando dump especifico:

```bash
DRAC_RESTORE_YES=true ./scripts/restore-drac.sh infra/backups/postgres/drac-postgres-YYYY.dump
```

Com archive de storage:

```bash
DRAC_RESTORE_YES=true ./scripts/restore-drac.sh dump.dump storage.tar.gz
```

## Diagnostico Para Suporte

```bash
./scripts/collect-diagnostics.sh
```

Gera um pacote em `diagnostics/` com:

- logs dos containers;
- health da API, Web e Central;
- Docker ps/stats;
- readiness;
- resumo sanitizado do banco;
- `.env` sanitizado sem senhas, tokens ou chaves.
