# Chateau Atlas: publicação isolada no Vercel

Este é um **roteiro de implantação**, não um registro de site publicado.

## Fonte e isolamento
- Repositório: `drthaleschateaubriand/quadro-livre-thales`.
- Ramificação de desenvolvimento: `feature/chateau-atlas-drive`.
- Diretório raiz do projeto a publicar: `chateau-atlas`.
- Tipo de aplicação: site estático, HTML puro; não requer npm, backend, build ou variáveis secretas.
- Criar **um projeto Vercel separado**, sem alterar o domínio nem a publicação do Quadro Livre existente.
- Selecionar explicitamente a ramificação `feature/chateau-atlas-drive` para a implantação de teste. Não publicar inadvertidamente a ramificação padrão do Quadro Livre.

## Autorizar acesso ao Drive
No Google Cloud Console da própria conta pessoal:
1. Selecionar ou criar um projeto para Chateau Atlas.
2. Habilitar a Google Drive API.
3. Configurar a tela de consentimento OAuth e o usuário de teste, se o aplicativo estiver em testes.
4. Criar um **OAuth Client ID para Aplicativo Web** e cadastrar a **origem HTTPS exata** do site Vercel em **Origens JavaScript autorizadas** (exemplo ilustrativo: `https://nome-atribuido-pelo-vercel.vercel.app`; utilizar a origem real retornada pelo provedor).
5. Abrir o site, usar **Conectar Drive**, inserir somente o Client ID público terminado em `.apps.googleusercontent.com` e autorizar a conta Google.

**Nunca compartilhar senhas, Client Secret, tokens OAuth ou chaves privadas no chat, no repositório ou no HTML.**

## Verificações obrigatórias antes de considerar pronto
- [ ] Página HTTPS abre o editor diagrams.net incorporado.
- [ ] Login Google solicita escopo `drive.file`.
- [ ] Pasta `Chateau Atlas` é criada no Drive.
- [ ] Arquivo `Meu Atlas.drawio` aparece na pasta.
- [ ] Uma nota/desenho é salva; ao fechar e reabrir, permanece no Drive.
- [ ] Upload de PDF, DOCX, XLSX, PPTX, imagem e arquivo arbitrário.
- [ ] Cartões apontam para os arquivos originais do Drive.
- [ ] PDF, imagem, vídeo, áudio e texto aparecem no painel de pré-visualização quando compatíveis.
- [ ] Outros formatos abrem no Drive, sem prometer pré-visualização no próprio canvas.
- [ ] Testar cancelamento do login, token expirado, falta de rede e reconexão.
- [ ] Garantir que o Quadro Livre original continua funcionando e separado.

## Limites conhecidos
O Chateau Atlas usa o **modo incorporado remoto** do diagrams.net. Ele ainda não distribui o código completo do editor nem tem identidade visual idêntica em todos os detalhes.

O escopo `drive.file` restringe o acesso aos arquivos criados/abertos por este aplicativo; ele não importa automaticamente toda a biblioteca antiga do Google Drive.

O tamanho máximo de **pré-visualização** é de 30 MB por arquivo. Esse limite não é um limite geral de armazenamento do Google Drive.

Os testes automáticos em `.github/workflows/test-chateau-atlas.yml` verificam sintaxe, mensagens e rascunhos locais, mas **não substituem os testes reais no navegador e na conta Google**.
