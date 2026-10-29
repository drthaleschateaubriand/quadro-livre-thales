# Quadro Livre — autenticação e sincronização Firebase (versão de testes)

A versão está no branch `firebase-auth-cloud-sync`. **Não ativar em produção sem configurar o projeto Firebase e publicar as regras.** O site público continua na versão local estável.

## Recursos preparados

- Firebase Authentication com e-mail, senha, verificação de endereço e redefinição de senha.
- Firestore: armazenamento privado de um quadro por pasta, com a estrutura de pastas preservada.
- Escolha explícita entre **enviar os dados locais** ou **carregar os dados da nuvem**, para evitar sobregravações silenciosas.
- Gerenciamento de acesso por e-mail verificado: **proprietário**, **editor** ou **somente leitura**.
- Link compartilhável para convidados, com autorização validada pelas Security Rules.
- Cloud Storage opcional para upload/download de anexos e acesso em outros dispositivos. Não são usadas chaves administrativas no navegador.
- A versão local continua com IndexedDB e backups ZIP.

## Passos necessários para ativar

1. Acesse https://console.firebase.google.com/ e crie ou selecione **um projeto específico para o Quadro Livre** no plano Spark, sem cartão.
2. Registre um **aplicativo Web**. Copie somente o objeto **configuração pública do SDK Web** (`apiKey`, `authDomain`, `projectId`, `appId`; `storageBucket` apenas se for ativado). Nunca inclua credenciais de conta, service account, private key ou senha.
3. Em **Authentication**, ative **E-mail/Senha**, verificação de endereço e adicione `drthaleschateaubriand.github.io` à lista de domínios autorizados.
4. Em **Firestore Database**, crie o banco **padrão** em modo de produção e publique o conteúdo de `firestore.rules`. **Não use regras de teste públicas**.
5. Configure `firebase-config.js` com a configuração pública do app Web. A chave Web do Firebase não é segredo, mas as Security Rules são indispensáveis para proteger os dados.
6. Somente após conectar e validar uma conta de teste, faça o merge deste branch no padrão `Copy-of-MASTER-3-SUPABASE`.
7. Antes da primeira sincronização, exporte o backup **.quadro.zip**, entre com sua conta verificada e escolha **Enviar quadros locais**. No outro computador, faça login na mesma conta e clique em **Abrir meu quadro da nuvem**.
8. Para compartilhar, entre como proprietário, forneça o e-mail verificado do convidado e escolha **Visualizar** ou **Editar**. Envie o link copiado. O convite não envia e-mail automaticamente.

## Limitações e segurança

- **O Cloud Storage para Firebase exige plano Blaze (faturamento)** desde 2026. O plano Spark continua permitindo login e Firestore, mas **não uploads binários no Storage**. Não faça upgrade nem associe cartão sem autorização explícita.
- Sem Blaze, **PDFs, imagens e arquivos anexados continuam somente no navegador e no ZIP**. O Firestore não é substituto adequado de um repositório ilimitado de arquivos.
- Cada pasta/board é gravada em um documento Firestore. O aplicativo limita a carga a **750 kB** por quadro para respeitar o limite do Firestore de 1 MiB por documento. Quadros com imagens PDF embutidas podem exceder esse tamanho e não sincronizar, mas a cópia local continua intacta.
- O Firebase Storage opcional usa limite de **25 MiB por arquivo** nas regras. Documentos maiores precisariam de um fluxo de upload adequado, com orçamento e proteção de dados.
- O controle de acesso na nuvem é validado pelas regras do Firebase. O login visível **não criptografa nem apaga cópias já armazenadas no navegador**; não trate um dispositivo compartilhado como cofre seguro. Limpe dados locais apenas depois de confirmar o backup, se necessário.
- Colaboração simultânea e resolução avançada de conflitos ainda não implementadas. Em várias máquinas editando ao mesmo tempo, a última sincronização pode prevalecer.
- Convidados com permissão de edição podem modificar quadros existentes; **somente o proprietário** altera permissões e a estrutura de pastas sincronizada.
- Não coloque prontuários, exames identificáveis ou outros documentos sensíveis no serviço antes de uma avaliação de segurança, conformidade e retenção adequada.
- Os arquivos `firestore.rules` e `storage.rules` devem ser publicados no console Firebase antes de usar em produção; somente enviá-los ao GitHub **não os implanta**.

## Arquivos

- `index.html`: interface de conta e integração com o quadro local.
- `cloud-sync.js`: Authentication, sincronização, compartilhamento e armazenamento opcional.
- `firebase-config.js`: configuração Web inicialmente desabilitada.
- `firestore.rules`: políticas de proprietário, editor e visualizador.
- `storage.rules`: políticas de anexos, para quando o serviço Storage for ativado.

## Testes mínimos antes da publicação

1. Conta nova, verificação por e-mail, entrar e sair; recuperação de senha.
2. Criar uma nota, enviar quadro e recuperar em outro navegador sem apagar a cópia local inesperadamente.
3. Criar pastas, editar uma nota e testar leitura como convidado visualizador.
4. Convidar editor e verificar que consegue alterar quadros, mas **não** permissões.
5. Revogar convite e verificar bloqueio das leituras e gravações.
6. Tentar acessar como usuário não convidado: deve ocorrer `permission-denied`.
7. Verificar quadros maiores que 750 kB: erro claro sem apagar o conteúdo local.
8. Tentar subir anexo no Spark: mostrar aviso de faturamento e manter o arquivo local.
9. Se Storage for habilitado futuramente, testar download e regras de autorização para anexos.

Documentação oficial: https://firebase.google.com/docs/auth/web/password-auth, https://firebase.google.com/docs/firestore/security/get-started, https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024.
