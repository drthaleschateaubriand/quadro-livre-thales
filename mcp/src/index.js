import {
  OAuthAuthorizationServer, OAuthResourceServer, insufficientScope, AuthorizationError
} from '@cloudflare/workers-oauth-provider';
import { validateFirebasePair } from './firestore.js';
import { consentPage, browserScript } from './auth-ui.js';
import { mcpHandler } from './mcp-handler.js';

const NAME='Quadro Livre';
const SCOPES=['mcp:read','mcp:write','offline_access'];
const noCache={'cache-control':'no-store','x-content-type-options':'nosniff'};
function json(data,status=200,headers={}) {
  return Response.json(data,{status,headers:{...noCache,...headers}});
}
function originFromEnv(env) {
  const url=new URL(env.MCP_ORIGIN||'');
  if(url.protocol!=='https:'||url.pathname!=='/'||url.search)throw Error('MCP_ORIGIN deve ser URL HTTPS sem caminho.');
  return url.origin;
}

async function authorize(request,env,authorization) {
  const oauth=authorization.getOAuthApi(env);
  const headers={'cache-control':'no-store','content-security-policy':
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'self' https://www.gstatic.com; connect-src https://identitytoolkit.googleapis.com https://securetoken.googleapis.com; form-action 'self'; base-uri 'none'; frame-ancestors 'none'; img-src 'self'"};
  try{
    if(request.method==='GET'){
      const parsed=await oauth.parseAuthRequest(request);
      const details=await oauth.describeConsent(parsed);
      const begin=await oauth.beginConsent(parsed);
      const h=begin.headers;
      for(const [k,v] of Object.entries(headers))h.set(k,v);
      h.set('content-type','text/html; charset=utf-8');
      h.set('x-content-type-options','nosniff');
      h.set('vary','Cookie');
      return new Response(consentPage(details,begin.handle,env),{headers:h});
    }
    if(request.method==='POST'){
      const form=await request.formData();
      const handle=String(form.get('handle')||'');
      if(form.get('decision')!=='approve'){
        const denied=await oauth.denyConsent(request,handle);
        return new Response(null,{status:302,headers:denied.headers});
      }
      const idToken=String(form.get('id_token')||'');
      const refreshToken=String(form.get('refresh_token')||'');
      if(idToken.length<80||refreshToken.length<20)return new Response('Autenticação Firebase ausente.',{status:400});
      const identity=await validateFirebasePair(env,idToken,refreshToken);
      const selected=form.getAll('scope').map(String).filter(s=>SCOPES.includes(s));
      if(!selected.includes('mcp:read'))return new Response('A leitura precisa ser permitida.',{status:400});
      const approval=await oauth.approveConsent(request,handle,{scope:selected});
      const {redirectTo}=await oauth.completeAuthorization({
        request:approval.request,userId:identity.userId,metadata:{},
        scope:approval.request.scope,
        props:{userId:identity.userId,email:identity.email,firebaseRefreshToken:refreshToken}
      });
      approval.headers.set('Location',redirectTo);
      approval.headers.set('cache-control','no-store');
      return new Response(null,{status:302,headers:approval.headers});
    }
    return new Response('Método não permitido.',{status:405});
  }catch(e){
    if(e instanceof AuthorizationError && e.redirectTo)return Response.redirect(e.redirectTo,302);
    if(e instanceof AuthorizationError)return new Response(e.description,{status:400});
    return new Response('Não foi possível autenticar. Confirme o acesso Firebase e tente novamente.',{status:400});
  }
}
function assertConfigured(env){
  if(!env.MCP_ORIGIN||!env.FIREBASE_API_KEY||!env.FIREBASE_AUTH_DOMAIN||!env.FIREBASE_PROJECT_ID)throw Error('Configuração incompleta do Worker.');
}
export default {
 async fetch(request,env,ctx) {
  const route=new URL(request.url).pathname;
  if(route==='/health')return json({status:'ok',service:NAME,build:'0.1.0'});
  if(route==='/favicon.ico')return new Response(null,{status:204});
  try{assertConfigured(env)}catch{return json({status:'unconfigured',message:'Configuração do servidor pendente.'},503)}
  const origin=originFromEnv(env);
  const resource=origin+'/mcp';
  const authorization=new OAuthAuthorizationServer({
    issuer:origin,resources:[resource],scopesSupported:SCOPES,
    clientIdMetadataDocumentEnabled:true,
    clientRegistrationEndpoint:'/oauth/register'
  });
  const protectedServer=new OAuthResourceServer({
    resourceMetadata:{resource,authorization_servers:[origin],resource_name:NAME},
    requiredScopes:['mcp:read','mcp:write'],
    validateToken:(environment)=>(res,token)=>authorization.validateToken(res,token,environment),
    handler:{fetch:(request,environment,context)=>mcpHandler(request,environment,context,insufficientScope)}
  });
  if(route==='/oauth-login.js')return new Response(browserScript,{headers:{
    'content-type':'application/javascript; charset=utf-8',
    'cache-control':'public, max-age=600','x-content-type-options':'nosniff'}});
  if(route==='/authorize')return authorize(request,env,authorization);
  if(route==='/mcp'||route.startsWith('/.well-known/oauth-protected-resource'))
    return protectedServer.fetch(request,env,ctx);
  return authorization.fetch(request,env,ctx);
 }
};
