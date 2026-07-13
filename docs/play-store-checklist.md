# Publicação na Google Play — checklist + Segurança de Dados

App: aplicativo de câmeras (ex.: Grupo Flash). Modelo: white-label por cliente.
Este arquivo é um guia prático para preencher o Play Console. Revise com jurídico.

## 0. Antes de tudo
- **Política de privacidade (URL):** hospedar `apps/web/public/privacidade.html`.
  Depois do deploy do web fica em `http://<servidor>:5173/privacidade.html`
  (troque para **HTTPS** assim que houver domínio/certificado). Preencher os
  campos `[RAZÃO SOCIAL] / [CNPJ] / [E-MAIL] / [ENDEREÇO]` no HTML.
- **AAB:** baixar em Central → aba Apps → "Baixar AAB (Play Store)" (precisa
  gerar/atualizar o app antes).
- **Keystore:** já há backup automático diário (`infra/backup-keystores.sh`).
  **Copie os `.tar.gz` para fora do servidor.**

## 1. Formulário "Segurança de dados" (Data safety)
Declarar assim (ajuste ao que o app realmente fizer na versão publicada):

| Item | Resposta |
|---|---|
| O app coleta ou compartilha dados? | **Coleta sim; compartilha não** |
| Dados criptografados em trânsito? | **Sim na produção**. O app bloqueia HTTP por padrão; validar que a URL de cada cliente usa HTTPS antes de publicar. |
| Usuário pode pedir exclusão? | **Sim** (via e-mail de contato / admin da instalação) |

Tipos de dados a declarar:
- **Informações pessoais → Nome, E-mail:** coletado, para *Funcionalidade do app* e *Gerenciamento de conta*. Não compartilhado. Obrigatório.
- **Fotos e vídeos:** o app **acessa** vídeo/fotos das câmeras para exibir. Mídia que o usuário salva vai para a galeria do aparelho (fica no dispositivo). Uso: *Funcionalidade do app*. Não compartilhado.
- **App activity / Info do app e desempenho:** só se você adicionar analytics/crash (hoje não). Se não tiver, **não declarar**.
- **Localização, Contatos, Áudio do dispositivo, Câmera do dispositivo:** **NÃO** (o vídeo vem das câmeras remotas, não do hardware do celular).

## 2. Permissões declaradas no app (justificativa p/ o revisor)
- `INTERNET` / `ACCESS_NETWORK_STATE` — conectar ao servidor de câmeras.
- Mídia (salvar na galeria via expo-media-library) — salvar clipes/fotos que o usuário captura.
- `POST_NOTIFICATIONS` — só quando o push estiver ativo (hoje o toggle foi
  **removido** da tela até funcionar, para não confundir o revisor).

## 3. Conteúdo do app (App content)
- **Classificação de conteúdo:** responder o questionário (app utilitário/negócios, sem conteúdo sensível) → deve sair "Livre".
- **Público-alvo:** adultos/uso profissional (não direcionar a crianças).
- **Anúncios:** **Não contém anúncios.**
- **Apps de governo/financeiro/saúde:** Não.

## 4. Recomendação de faixa
1. **Teste interno** primeiro (rápido, sem revisão completa) → instalar em
   celulares reais pela Play e validar tudo.
2. Só depois **Produção**.

## 5. Bloqueios que ainda pesam (resolver antes da Produção)
- 🔴 Confirmar **HTTPS** no servidor e não usar `ALLOW_CLEARTEXT_TRAFFIC=true` no AAB de produção.
- 🟡 **Snapshots** das câmeras aparecendo (qualidade visual).
- 🟡 **Screenshots/ícone 512/descrição** da listagem.

## 6. Risco de conta (white-label)
Publicar **1 app** (Grupo Flash) na conta existente = ok. **NÃO** subir muitos
apps de clientes quase idênticos na mesma conta (risco de ban levar junto o app
que você já tem publicado). Outros clientes: conta do próprio cliente ou sideload
pela Central.
