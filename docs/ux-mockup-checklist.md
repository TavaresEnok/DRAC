# Checklist UX vs Mockup (automatizado por similaridade de código)

Data: 2026-05-04
Método: comparação textual entre `apps/web/src/pages/*.tsx` e `mockup/artifacts/nexusguard-vms/src/pages/*.tsx` (mesmo nome de arquivo).

## Resultado por página

| Página | Similaridade | Nível |
|---|---:|---|
| AIPage.tsx | 100.0% | alto |
| AlarmsPage.tsx | 96.9% | alto |
| AuditLogsPage.tsx | 58.8% | baixo |
| CameraDetailPage.tsx | 8.6% | baixo |
| CamerasPage.tsx | 83.2% | médio |
| DashboardPage.tsx | 80.4% | médio |
| EventsPage.tsx | 97.6% | alto |
| EvidencePage.tsx | 90.0% | alto |
| InvestigationPage.tsx | 62.6% | baixo |
| LiveViewPage.tsx | 96.0% | alto |
| LoginPage.tsx | 97.6% | alto |
| MapPage.tsx | 18.4% | baixo |
| PTZPage.tsx | 3.8% | baixo |
| PlaybackPage.tsx | 2.8% | baixo |
| ReportsPage.tsx | 2.6% | baixo |
| RolesPage.tsx | 94.5% | alto |
| SettingsPage.tsx | 90.5% | alto |
| StoragePage.tsx | 88.6% | alto |
| UsersPage.tsx | 87.2% | alto |
| WallModePage.tsx | 98.1% | alto |
| not-found.tsx | 99.9% | alto |

## Interpretação prática

- **Alto (>=85%)**: visual geralmente aderente; revisar apenas detalhes finos.
- **Médio (65-84%)**: existe adaptação perceptível; ainda precisa ajuste para ficar idêntico.
- **Baixo (<65%)**: estrutura/layout divergentes do mockup.

## Prioridade sugerida para fechar “idêntico ao mockup”

1. `PTZPage.tsx`
2. `PlaybackPage.tsx`
3. `ReportsPage.tsx`
4. `CameraDetailPage.tsx`
5. `MapPage.tsx`
6. `AuditLogsPage.tsx`
7. `InvestigationPage.tsx`
8. `CamerasPage.tsx`
9. `DashboardPage.tsx`

