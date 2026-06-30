import { HttpException, Injectable, ServiceUnavailableException } from '@nestjs/common';

/**
 * Proxy para o AGENTE DE BUILD que roda no HOST (a API roda em container e não
 * tem o toolchain Android). Mantém o token do agente no servidor — o navegador
 * fala só com a API, autenticado pelo JWT/admin já existente.
 *
 * Config por env: APP_BUILDER_AGENT_URL (ex: http://172.17.0.1:8780),
 *                 APP_BUILDER_AGENT_TOKEN.
 */
@Injectable()
export class AppBuilderService {
  private readonly baseUrl = (process.env.APP_BUILDER_AGENT_URL || '').replace(/\/+$/, '');
  private readonly token = process.env.APP_BUILDER_AGENT_TOKEN || '';

  private async call(method: string, path: string, body?: unknown) {
    if (!this.baseUrl || !this.token) {
      throw new ServiceUnavailableException('Agente de build não configurado (APP_BUILDER_AGENT_URL/TOKEN).');
    }
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { 'content-type': 'application/json', 'x-build-token': this.token },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ServiceUnavailableException('Não foi possível contatar o agente de build.');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new HttpException((data as { error?: string }).error || 'Erro no agente de build', res.status);
    }
    return data;
  }

  listClients() {
    return this.call('GET', '/clients');
  }

  createClient(body: unknown) {
    return this.call('POST', '/clients', body);
  }

  startBuild(slug: string) {
    return this.call('POST', '/builds', { slug });
  }

  listBuilds() {
    return this.call('GET', '/builds');
  }
}
