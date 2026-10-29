# Plugin Quadro Livre para ChatGPT (MCP)

**Estado:** primeira implementação em desenvolvimento, ainda **não publicada**. A versão pública do quadro em GitHub Pages continua intacta. O backend MCP fica nesta pasta, em Cloudflare Workers, e consulta apenas documentos já sincronizados no Firebase.

## O que a primeira versão oferece

- Autorização OAuth 2.1 com PKCE; ChatGPT identifica o servidor pelo metadata MCP e inicia login pelo navegador.
- Login via Firebase Authentication de e-mail e senha, com verificação de e-mail. A senha não é enviada ao Worker.
- Perfil da conta autenticada.
- Listagem de pastas, quadros e arquivos (nomes/tipos).
- Busca de texto em notas, modelos e subtópicos.
- Leitura de um quadro, com limite de dados por resposta.
- Criar notas e editar notas no Firestore com controle de revisão (evita sobrescrever edições concorrentes).
- Segurança: autorização avaliada a cada chamada; Firestore REST acessado com token de usuário; não há service account ou chave privada.
- Prévia visual de quadro **somente leitura** dentro do ChatGPT por MCP Apps: ferramenta `mostrar_quadro` e recurso `ui://quadro-livre/preview-v1.html`. A prévia suporta zoom e arrasto dos cartões; a edição completa permanece no site ou nas ferramentas `criar_nota` e `editar_nota`.
- Não entrega PDFs anexados em formato binário, porque a sincronização Firebase Storage ainda depende de habilitar Cloud Storage e faturamento.

## Pré-requisitos de ativação

1. No Firebase, confirmar que Authentication (E-mail/Senha) e Firestore estão configurados e que as **Security Rules privadas** foram implantadas. Há uma proposta separada com regras em `firebase-auth-cloud-sync`. A existência do arquivo no GitHub não publica essas regras.
2. Nesta ramificação do GitHub o Quadro Livre possui `cloud-workspace.js`: após entrar com o Firebase, abra **Conta → Enviar quadros locais**. Em outro computador entre na mesma conta e escolha **Conta → Abrir quadros da nuvem**. O esquema Firestore usa `workspaces/{user.uid}/boards/{boardId}` com `fields.payload` contendo JSON. As regras `firestore.rules` precisam estar publicadas antes do primeiro envio.
3. Ter conta Cloudflare com Workers e KV habilitados.
4. Dispor de acesso a configurar o plugin no ChatGPT. A conexão OAuth será concluída pelo usuário no navegador do ChatGPT.

## Publicar o servidor no Cloudflare (após testes)

```bash
cd mcp
npm install
npx wrangler login
npx wrangler kv namespace create OAUTH_KV
cp wrangler.example.jsonc wrangler.jsonc
```

No arquivo gerado `wrangler.jsonc`, preencher o **ID real do KV** impresso pelo comando acima, `MCP_ORIGIN` com a URL HTTPS exata do Worker e os campos públicos do Firebase Web `FIREBASE_PROJECT_ID`, `FIREBASE_AUTH_DOMAIN` e `FIREBASE_API_KEY` do aplicativo cadastrado. Não preencher com dados de service account. O `MCP_ORIGIN` precisa ser exatamente o origin público que receberá o tráfego `/mcp`; o mesmo valor será usado como emissor OAuth.

Se o Firebase não permitir operações, confira as regras e o estado do banco. Não relaxe a autorização de proprietário para tentar contornar uma falha.

```bash
npm run check
npm test
npx wrangler deploy
```

A implantação precisa ser validada via HTTPS:

- `https://SEU_WORKER/health` retorna `status: ok`.
- `https://SEU_WORKER/.well-known/oauth-protected-resource` ou `.../mcp` informa o servidor de autorização.
- `https://SEU_WORKER/.well-known/oauth-authorization-server` mostra o endpoint de OAuth e capacidade CIMD/DCR.
- `POST https://SEU_WORKER/mcp` **sem token** retorna HTTP 401 com `WWW-Authenticate`, sem expor dados.
- Autorizar uma conta Firebase de teste verificada e testar `listar_quadros` e `criar_nota` usando MCP Inspector.
- Tentar ler dados com outra conta sem permissão; o Firestore deve negar.

## Conectar no ChatGPT

No ChatGPT web, abra **Plugins → Adicionar servidor MCP personalizado**. Informe:

```
https://SEU_WORKER/mcp
```

O ChatGPT detecta OAuth a partir do servidor. Autorize somente as permissões necessárias e entre no Firebase. Nenhuma chave privada da OpenAI é necessária para esse workflow. Os controles finais de instalação/conexão no ChatGPT exigem a ação do titular da conta.

Com o plugin conectado, experimente:

- "Liste meus quadros no Quadro Livre".
- "Busque todas as notas que mencionem lipedema".
- "Abra o quadro principal e mostre os títulos das notas".
- "Crie uma nota sobre os objetivos de estudo no quadro root".

## Problemas conhecidos e limites

- **Sem Cloudflare configurado, este código não está no ar.** Não existe link MCP funcional até publicar o Worker.
- **Sem executar o primeiro envio pelo botão Conta, os quadros locais não estarão disponíveis ao plugin.** A sincronização é manual nesta etapa; um login sozinho não envia os documentos. Anexos binários permanecem em IndexedDB, mesmo após enviar o JSON do quadro.
- As ferramentas operam **somente no workspace do usuário autenticado**. Convites de editor/leitor, colaboração simultânea e revisões compartilhadas ainda não foram integrados ao conector.
- A sincronização do navegador não é tempo real: uma nota criada pelo ChatGPT precisará de recarregamento/recuperação do quadro no site. Editar simultaneamente o site e o plugin pode causar conflitos; o plugin usa controle de versão, mas o site deve usar a mesma estratégia para resolução completa.
- Limite de aproximadamente 750 kB por pasta/quadro. Para grandes documentos e PDFs é preciso Storage e um pipeline específico.
- Os tokens OAuth são mantidos no KV pelo provedor; as credenciais Firebase de sessão são protegidas no armazenamento interno do provedor. Verifique sempre o escopo OAuth na autorização; revogue concessões ao desconectar o plugin. Use uma conta exclusiva de teste antes de conectar dados reais.
- Conteúdo confidencial e documentos médicos identificáveis exigem revisão adicional de privacidade, conformidade e retenção antes de uso.
- A primeira visualização dentro do ChatGPT é uma **prévia navegável**, não um canvas Miro completo. Ela não oferece drag-and-drop persistente nem edição inline dos objetos; os controles de edição ficam nas ferramentas do conector e no site Quadro Livre.

## Testes e verificação

`npm test` valida formato de notas, busca, limites de IDs, codificação Firestore e escrita com precondição de revisão. `npm run check` valida sintaxe. **Os testes locais não substituem** ensaio ponta a ponta com Cloudflare e Firebase de verdade.

Documentação de referência:
- https://developers.openai.com/plugins/build/auth
- https://developers.openai.com/plugins/build/mcp-server
- https://github.com/cloudflare/workers-oauth-provider
- https://firebase.google.com/docs/firestore/use-rest-api

## Progresso do cliente web

Nesta branch, o site também ganhou dois controles na seção Conta: `Enviar quadros locais` e `Abrir quadros da nuvem`. `cloud-workspace.js` usa a sessão do Firebase SDK já existente, nunca uma conta administrativa. Antes de trocar quadros, o navegador salva um backup JSON local e pede confirmação. A integração precisa de testes num projeto Firestore configurado com regras privadas. Enquanto essa branch não for incorporada ao ramo público, os botões não aparecerão no site publicado.
