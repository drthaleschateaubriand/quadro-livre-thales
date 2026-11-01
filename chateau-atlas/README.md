# Chateau Atlas | Primeira versão experimental

Esta pasta contém uma experiência separada do Quadro Livre. Os arquivos existentes na raiz do repositório continuam intactos.

## Funcionalidades implementadas no código

- Editor oficial diagrams.net incorporado por iframe e protocolo JSON, preservando ferramentas do modo incorporado.
- Autorização à conta Google via Google Identity Services, escopo limitado a drive.file.
- Pasta Chateau Atlas no Drive, arquivo Meu Atlas.drawio, sincronização das alterações por autosave.
- Envio de arquivos de diversos tipos ao Drive, lista dos arquivos enviados e cartões com links no quadro.
- Pré-visualização no próprio Chateau Atlas de PDFs, imagens, vídeos, áudio e texto (até 30 MB por arquivo de pré-visualização). Os demais formatos são abertos no Google Drive; envio de arquivos não tem esse limite específico de 30 MB.
- Rascunho local no navegador em caso de Drive desconectado.

## Configuração necessária

1. Habilitar a Google Drive API no projeto do Google Cloud Console: https://console.cloud.google.com/
2. Configurar a tela de consentimento OAuth, adicionando a própria conta como usuário de teste, se necessário.
3. Criar um OAuth Client ID do tipo Aplicativo Web. Cadastrar em Origens JavaScript autorizadas a origem HTTPS de onde será servido o Chateau Atlas (exemplo: https://seu-site.pages.dev).
4. Hospedar chateau-atlas/index.html em HTTPS, abrir a página, clicar Conectar Drive e informar apenas o OAuth Client ID público terminado em .apps.googleusercontent.com.
5. Autorizar a conta Google, adicionar arquivos e confirmar na interface que o quadro foi salvo no Drive.

Não publique senhas, código de autorização, chave privada ou Client Secret. O token do Drive não é salvo no repositório.

## Limitações importantes

- Trata-se de um protótipo com o editor remoto oficial em modo embed. Não é uma cópia autônoma do aplicativo draw.io inteiro nem garante interface pixel a pixel idêntica.
- Os arquivos são enviados ao Drive e representados **no canvas** como cartões com links. Um visualizador de PDF, imagem, vídeo, áudio e texto está disponível no painel **Arquivos**, mas ainda não existe visualização do PDF **dentro do canvas**, nem editor inline para Word/Excel/PowerPoint.
- O escopo drive.file não oferece acesso irrestrito aos arquivos antigos de toda a conta Google Drive.
- A edição concorrente entre dispositivos, a recuperação de upload interrompido, a reconciliação de versões e o fluxo de OAuth de produção ainda não foram validados.
- Ainda não houve configuração OAuth real, deploy em produção, nem teste ponta a ponta com a conta do usuário.
- O editor é o `embed.diagrams.net` oficial, e não uma cópia instalada e autônoma do código-fonte integral do draw.io. Requer internet e disponibilidade do serviço externo.
- Não usar com dados identificáveis de pacientes sem revisão das exigências legais e de segurança.

## Referências oficiais

- Fonte e licença: https://github.com/jgraph/drawio
- Incorporação: https://www.drawio.com/docs/reference/embed-mode/
- Arquivos no Drive: https://developers.google.com/workspace/drive/api/guides/create-file
- OAuth: https://developers.google.com/identity/protocols/oauth2/javascript-implicit-flow

O README original informa que o repositório público do draw.io é uma versão de teste e que há uma distribuição paga para produção. A marca e o logotipo draw.io também têm restrições próprias. A versão definitiva deve revisar licenças, atribuições e condições de serviço.

## Testes automáticos e acompanhamento

Execute a verificação sem dependências (Node.js):

```bash
node chateau-atlas/check.mjs
```

Um workflow do GitHub Actions chamado **Teste Chateau Atlas** executa a mesma verificação nos commits dessa ramificação. Trata-se de um teste estático, não de garantia de funcionamento do login ou dos uploads.

Conexão Google: somente o **OAuth Client ID público** deve ser informado no formulário do Chateau Atlas. O responsável pela conta deve habilitar Drive API e autorizar a origem HTTPS exata do aplicativo no Google Cloud; não compartilhar Client Secret, senhas ou tokens.

## Testes ainda necessários

Autorizar OAuth, criar pasta, enviar PDF e DOCX, incluir cartões, salvar e reabrir .drawio, testar sessão expirada e falha de rede.