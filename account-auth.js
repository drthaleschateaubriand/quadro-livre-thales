/* Conta Firebase isolada: nunca altera nem envia os arquivos do IndexedDB.
   Chaves de administrador e senhas jamais são armazenadas neste arquivo. */
(() => {
 'use strict';
 const $=s=>document.querySelector(s);
 const dialog=$('#account-dialog'),toggle=$('#account-toggle');
 const loading=$('#account-loading'),unavailable=$('#account-unavailable');
 const signedOut=$('#account-logged-out'),signedIn=$('#account-logged-in');
 const message=$('#account-message');
 let auth=null,currentUser=null,ready=false;
 window.QuadroFirebaseAuth={getAuth:()=>auth,getUser:()=>currentUser};
 const reveal=(element,shown)=>{element.hidden=!shown};
 function note(text,error=false){
  message.hidden=!text;
  message.textContent=text||'';
  message.classList.toggle('is-error',!!error);
 }
 function errorText(err){
  switch(String(err?.code||'')){
   case 'auth/invalid-email': return 'Confira o endereço de e-mail.';
   case 'auth/invalid-credential':
   case 'auth/wrong-password':
   case 'auth/user-not-found': return 'Não foi possível entrar com essas credenciais.';
   case 'auth/email-already-in-use':return 'Já existe uma conta com esse e-mail.';
   case 'auth/weak-password':return 'Use uma senha mais forte (ao menos 8 caracteres).';
   case 'auth/too-many-requests':return 'Muitas tentativas. Tente novamente mais tarde.';
   case 'auth/network-request-failed':return 'Sem conexão com o Firebase. Verifique sua internet.';
   case 'auth/operation-not-allowed':return 'Login por e-mail e senha ainda não foi ativado no Firebase.';
   case 'auth/unauthorized-domain':return 'Este endereço do Quadro Livre precisa ser autorizado no Firebase.';
   default:return 'Não foi possível concluir a operação. Confira a configuração do Firebase.';
  }
 }
 function render(){
  const available=!!auth;
  reveal(loading,!ready);
  reveal(unavailable,ready&&!available);
  reveal(signedOut,ready&&available&&!currentUser);
  reveal(signedIn,ready&&available&&!!currentUser);
  toggle.classList.toggle('account-online',!!currentUser);
  toggle.title=currentUser?'Conta conectada: abrir opções e sair':'Acessar conta';
  toggle.setAttribute('aria-label',currentUser?'Conta conectada: acessar ou sair':'Acessar conta');
  $('#account-current-email').textContent=currentUser?.email||'';
  const verified=currentUser?.emailVerified;
  $('#account-verification').textContent=currentUser
    ?(verified?'E-mail verificado.':'E-mail ainda não verificado. Verifique sua caixa de entrada.')
    :'';
  $('#account-verify').hidden=!currentUser||verified;
  $('#account-refresh').hidden=!currentUser||verified;
 }
 toggle.addEventListener('click',()=>{note('');render();if(!dialog.open)dialog.showModal()});
 $('#account-close').addEventListener('click',()=>dialog.close());
 const config=window.QUADRO_FIREBASE_CONFIG;
 if(!config?.apiKey||!config?.authDomain||!config?.projectId||!config?.appId||!window.firebase?.auth){
  ready=true;render();return;
 }
 try{
  const app=firebase.apps.length?firebase.app():firebase.initializeApp(config);
  auth=app.auth();
  auth.onAuthStateChanged(user=>{
    currentUser=user;ready=true;render();window.dispatchEvent(new Event('quadro:auth-changed'));
  },err=>{
    console.warn('Falha Firebase Auth:',err?.code);auth=null;ready=true;render();note(errorText(err),true);
  });
 }catch(err){
  console.warn('Configuração Firebase Auth indisponível:',err?.code);
  ready=true;auth=null;render();note('Não foi possível carregar a autenticação Firebase.',true);
  return;
 }
 $('#account-form').addEventListener('submit',async event=>{
  event.preventDefault();
  if(!auth)return;
  note('');
  const email=$('#account-email').value.trim(),password=$('#account-password').value;
  try{
   await auth.signInWithEmailAndPassword(email,password);
   $('#account-password').value='';
   note('Entrada realizada com sucesso.');
  }catch(err){note(errorText(err),true)}
 });
 $('#account-register').addEventListener('click',async()=>{
  if(!auth)return;
  const email=$('#account-email').value.trim(),password=$('#account-password').value;
  if(!email||password.length<8){note('Informe um e-mail válido e senha com pelo menos 8 caracteres.',true);return}
  if(!confirm('Criar uma conta no Firebase para '+email+'?'))return;
  try{
   const created=await auth.createUserWithEmailAndPassword(email,password);
   $('#account-password').value='';
   await created.user.sendEmailVerification();
   note('Conta criada. Enviamos uma confirmação para seu e-mail.');
  }catch(err){note(errorText(err),true)}
 });
 $('#account-reset').addEventListener('click',async()=>{
  if(!auth)return;
  const email=$('#account-email').value.trim();
  if(!email){note('Informe seu e-mail acima antes de recuperar a senha.',true);return}
  try{await auth.sendPasswordResetEmail(email);
   note('Se a conta existir, você receberá instruções para redefinir a senha.');
  }catch(err){note(errorText(err),true)}
 });
 $('#account-verify').addEventListener('click',async()=>{
  if(!currentUser)return;
  try{await currentUser.sendEmailVerification();note('Mensagem de confirmação enviada.')}
  catch(err){note(errorText(err),true)}
 });
 $('#account-refresh').addEventListener('click',async()=>{
  if(!currentUser)return;
  try{await currentUser.reload();currentUser=auth.currentUser;await currentUser?.getIdToken(true);
   render();window.dispatchEvent(new Event('quadro:auth-changed'));note(currentUser?.emailVerified?'E-mail confirmado.':'Ainda não confirmado. Verifique o link enviado.');
  }catch(err){note(errorText(err),true)}
 });
 $('#account-signout').addEventListener('click',async()=>{
  if(!auth)return;
  try{
   await auth.signOut();
   currentUser=null;render();
   note('Você saiu da conta Firebase. Os quadros locais foram preservados.');
  }catch(err){note(errorText(err),true)}
 });
})();
