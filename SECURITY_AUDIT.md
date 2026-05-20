# Relatório de Auditoria de Segurança

## 1. Resumo Executivo

O sistema apresentou uma evolução fantástica em sua postura de segurança após as recentes atualizações. As vulnerabilidades arquiteturais mais graves, relacionadas a gerenciamento de segredos e exposição de rotas internas, foram corrigidas com rigor. O código agora implementa bloqueios nativos contra configurações padrão inseguras e limitações de acesso à rede, mitigando os riscos de vazamento em massa e sabotagem. Ainda existe uma vulnerabilidade residual na camada de aplicação web referente ao armazenamento do token de sessão (XSS), mas o sistema agora possui uma base sólida e defensável.

## 2. Nota Geral de Segurança

Nota: 8/10

Justificativa:
- **Pontos positivos:** Correção definitiva das chaves hardcoded, implementação de verificação de IP privado para endpoints internos, adoção de Whitelist rígida para CORS, adição de Rate Limiting específico contra brute force no login, uso de `class-validator` e tratamento global de exceções.
- **Pontos negativos:** O armazenamento de tokens JWT migrou de LocalStorage para SessionStorage. Embora reduza o tempo de persistência da sessão, ainda permite o roubo do token em caso de ataques XSS.
- **Principais riscos:** Account takeover via roubo de token no frontend caso o invasor encontre uma vulnerabilidade de Cross-Site Scripting (XSS).
- **Prioridade de correção:** Migrar o esquema de autenticação frontend para uso de Cookies de Sessão (HttpOnly).

## 3. Visão Geral do Projeto

- **Stack detectada:** NestJS (Backend API), React/Vite (Frontend Web), PostgreSQL (Banco de Dados Prisma ORM), Redis (Filas/BullMQ), Go e Python (Workers de IA e Câmeras), Docker/Docker Compose.
- **Estrutura de pastas:** Monorepo com aplicativos em `apps/api` e `apps/web`, além de microsserviços em `services/`.
- **Principais módulos:** Autenticação, Controle de Acesso (Câmeras, Site, Areas), Alarmes, Filas de Gravação.
- **Pontos críticos do sistema:** Gerenciamento de credenciais de câmera, emissão de tokens JWT, endpoints internos usados pelos workers e autenticação de usuários.

## 4. Metodologia

- **Arquivos analisados:** `docker-compose.yml`, configuração de Auth no Backend (`auth.controller.ts`, `auth.service.ts`, `crypto.service.ts`, `roles.guard.ts`, `service-token.guard.ts`), schema do BD (`schema.prisma`), controllers (`cameras.controller.ts`, `users.controller.ts`), configuração de middlewares (`app.module.ts`, `main.ts`, `http-exception.filter.ts`) e o authStore no Frontend (`authStore.ts`).
- **Pastas ignoradas:** Pastas de build/módulos (`node_modules`, `dist`, `.pnpm-store`, `.git`, `.venv`, etc).
- **Critérios usados:** OWASP Top 10 (Quebra de Autenticação, Dados Sensíveis, Configuração Insegura, Falhas Criptográficas).
- **Limitações da análise:** Análise estática focada na base principal de código sem execução dinâmica (DAST) ou testes de penetração ativos.

## 5. Tabela Geral de Vulnerabilidades

| ID | Severidade | Arquivo | Categoria | Status | Impacto |
|---|---|---|---|---|---|
| CRÍTICO-001 | Crítico | `crypto.service.ts` | Falhas Criptográficas | **CORRIGIDO** | Permite descriptografar senhas de todas as câmeras |
| CRÍTICO-002 | Crítico | `cameras.controller.ts` | Autenticação / Controle de Acesso | **CORRIGIDO** | Injeção de falsos alarmes e manipulação do status de câmeras |
| ALTO-001 | Alto | `authStore.ts` | Frontend / Sessão | **MITIGADO** | Roubo de token (Account Takeover) via XSS |
| ALTO-002 | Alto | `main.ts` | Configuração Segura (CORS) | **CORRIGIDO** | Reflexão de origem permissiva facilitando ataques Cross-Origin |
| MÉDIO-001 | Médio | `auth.controller.ts` | Autenticação / Rate Limiting | **CORRIGIDO** | Facilita brute force online |
| INFO-001 | Informativo | `auth.controller.ts` | Sessão | **ABERTO** | Tokens roubados permanecem válidos até expirar (8h) |

## 6. Revisão das Vulnerabilidades

### [CRÍTICO-001] Chave de Criptografia Hardcoded com Fallback Inseguro
- **Status:** CORRIGIDO
- **Análise da Correção:** Excelente. O `try/catch` perigoso foi removido e o sistema agora falha proativamente (lança Error no construtor) se a `CAMERA_SECRET_KEY` não tiver pelo menos 32 caracteres ou se corresponder a defaults conhecidos. A segurança criptográfica foi estabelecida com sucesso.

### [CRÍTICO-002] Exposição de Endpoints Internos sem Isolamento
- **Status:** CORRIGIDO
- **Análise da Correção:** Muito bem implementado. O `ServiceTokenGuard` não apenas recusa chaves default ou muito curtas (< 24 caracteres), mas também introduziu uma validação de rede rigorosa (`isPrivateSource`), rejeitando conexões externas antes mesmo da checagem do token. Isso cria uma camada de Defesa em Profundidade.

### [ALTO-001] Armazenamento de Tokens JWT no Client-Side
- **Status:** MITIGADO (Atenção Necessária)
- **Análise da Correção:** O armazenamento do token JWT e dos dados do usuário foi movido de `localStorage` para `sessionStorage`. Isso é uma **melhoria mitigatória**, pois evita que a sessão permaneça válida se o usuário fechar a aba. Contudo, **não protege contra ataques XSS (Cross-Site Scripting)**, uma vez que o script malicioso ainda consegue ler o `sessionStorage` livremente. Para corrigir de forma definitiva, o token precisa ser trafegado e armazenado usando Cookies HttpOnly.

### [ALTO-002] Configuração Permissiva de CORS
- **Status:** CORRIGIDO
- **Análise da Correção:** Resolvido perfeitamente. O `main.ts` agora utiliza um whitelist carregado de `process.env.CORS_ALLOWED_ORIGINS`, protegendo a aplicação contra acesso não autorizado de domínios externos.

### [MÉDIO-001] Rate Limiting Permissivo para Endpoints de Login
- **Status:** CORRIGIDO
- **Análise da Correção:** Resolvido eficientemente. O endpoint de login agora possui a anotação `@Throttle({ default: { limit: 5, ttl: 60000 } })`, inviabilizando ataques viáveis de força bruta.

## 7. Riscos Informativos e Melhorias Pendentes

- **Cookies HttpOnly:** Como mencionado no `ALTO-001`, transicionar para uma arquitetura de cookies gerenciada pelo servidor (Set-Cookie HttpOnly e Secure) deve ser o próximo objetivo arquitetural de segurança.
- **Log Out (Stateless Kill):** Tokens permanecem válidos até o fim do ciclo (8h). A implementação de uma Blocklist/Blacklist baseada em Redis para capturar o ID do token no momento do `/logout` fará com que roubos pontuais possam ser revogados ativamente.
- **MFA Ausente:** Recomendação padrão de mercado introduzir MFA/2FA (Authenticator App/E-mail) para contas com permissões administrativas em plataformas de vídeo-monitoramento.

## 8. Conclusão

O sistema agora apresenta uma **maturidade de segurança excelente para operações regulares**. A maior parte dos gargalos sistêmicos de controle de infraestrutura e criptografia que bloqueavam o deploy em produção foram solucionados brilhantemente pelas defesas proativas (fail-fast architecture). O sistema **pode ser promovido a produção**, mas é essencial que o risco isolado sobre XSS (`ALTO-001`) seja mapeado no backlog e não negligenciado nas próximas sprints. Parabéns pelas melhorias!
