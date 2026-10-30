/* Autorização visível, nunca redireciona para destinos construídos com dados do navegador. */
export function escapeHTML(value) {
  return String(value??'').replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
}
export function consentPage(details,handle,env) {
  const client=escapeHTML(details.clientName||'Aplicativo');
  const domain=details.clientDomain
    ? 'Publicado por '+escapeHTML(details.clientDomain)
    : 'O nome deste aplicativo não foi verificado pelo servidor.';
  const hostname=escapeHTML(details.redirectHost);
  const scopes=(details.scope||[]).map(s=>
    '<label class="scope"><input type="checkbox" name="scope" value="'+escapeHTML(s)+'" checked> '+
    escapeHTML(s==='mcp:read'?'Ler meus quadros':s==='mcp:write'?'Criar e editar notas':s)+'</label>'
  ).join('');
  const warning=details.redirectIsLoopback
    ?'<p class="warning">O acesso vai para um aplicativo local no computador. Confirme que você iniciou esse login.</p>'
    :'';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Conectar Quadro Livre ao ChatGPT</title>
<style>
:root{font:16px system-ui,sans-serif;color:#263958;background:#f3f6fc}*{box-sizing:border-box}
body{min-height:100svh;display:grid;place-items:center;margin:0;padding:18px}
main{background:#fff;width:min(450px,100%);border:1px solid #d9e2f3;box-shadow:0 15px 50px #2234551c;border-radius:19px;padding:25px}
h1{font-size:21px;margin:0 0 8px}p{color:#586b84;font-size:13px;line-height:1.6}
label:not(.scope){font-size:12px;display:block;margin-top:11px;font-weight:600}
input[type=email],input[type=password]{width:100%;border:1px solid #c5d1e4;border-radius:9px;font-size:15px;padding:12px;margin-top:5px}
.scope{display:block;margin:9px 0;font-size:13px}
button{min-height:42px;padding:11px 15px;font-size:14px;border-radius:10px;border:1px solid #cbd6e8;cursor:pointer}
button.approve{background:#4766d7;border-color:#4766d7;color:#fff;flex:1}
.actions{display:flex;gap:9px;margin-top:22px}.warning{color:#9a4834}
#error{color:#a72e40;font-weight:600}
small{color:#7485a0;font-size:11px}
</style></head>
<body><main id="firebase-settings"
 data-api-key="${escapeHTML(env.FIREBASE_API_KEY)}"
 data-auth-domain="${escapeHTML(env.FIREBASE_AUTH_DOMAIN)}"
 data-project-id="${escapeHTML(env.FIREBASE_PROJECT_ID)}">
<h1>Autorizar o Quadro Livre</h1>
<p>O aplicativo <strong>${client}</strong> quer acessar seus quadros. ${domain} O resultado será enviado para <strong>${hostname}</strong>.</p>
${warning}
<form method="post" action="/authorize" id="auth-form">
<input type="hidden" name="handle" value="${escapeHTML(handle)}">
<input type="hidden" name="id_token" id="id-token">
<input type="hidden" name="refresh_token" id="refresh-token">
<p>Permissões solicitadas:</p>${scopes}
<label for="email">E-mail Firebase</label><input type="email" id="email" required autocomplete="email">
<label for="password">Senha</label><input type="password" id="password" required autocomplete="current-password">
<p id="error" role="alert" aria-live="polite"></p>
<div class="actions"><button name="decision" value="deny" type="submit" formnovalidate>Cancelar</button>
<button class="approve" name="decision" value="approve" id="approve" type="submit">Autorizar</button></div>
</form>
<p><small>Seu login será verificado pelo Firebase. A senha não é enviada ao servidor MCP. Conceda acesso apenas ao aplicativo que você reconhece.</small></p>
</main>
<script src="https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/11.10.0/firebase-auth-compat.js"></script>
<script src="/oauth-login.js"></script></body></html>`;
}
export const browserScript=`
(() => {
 const root=document.getElementById('firebase-settings'),form=document.getElementById('auth-form');
 const btn=document.getElementById('approve'),error=document.getElementById('error');
 let authorized=false;
 form.addEventListener('submit', async e=>{
  const submitter=e.submitter;
  if(submitter?.value==='deny')return;
  if(authorized)return;
  e.preventDefault();error.textContent='';
  const email=document.getElementById('email').value.trim();
  const password=document.getElementById('password').value;
  if(!email||!password){error.textContent='Informe seu e-mail e senha.';return}
  btn.disabled=true;
  try{
   const app=firebase.apps.length?firebase.app():firebase.initializeApp({
    apiKey:root.dataset.apiKey,authDomain:root.dataset.authDomain,projectId:root.dataset.projectId
   });
   const auth=app.auth();
   await auth.setPersistence(firebase.auth.Auth.Persistence.NONE);
   const credential=await auth.signInWithEmailAndPassword(email,password);
   await credential.user.reload();
   document.getElementById('id-token').value=await credential.user.getIdToken(true);
   document.getElementById('refresh-token').value=credential.user.refreshToken;
   authorized=true;btn.disabled=false;form.requestSubmit(btn);
  }catch(ex){
   error.textContent=ex.code==='auth/invalid-credential'
    ?'E-mail ou senha incorretos.':ex.message?.startsWith('Confirme')?ex.message:'Não foi possível autenticar com Firebase.';
   btn.disabled=false;
  }
 });
})();
`;
