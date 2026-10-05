export const getToken=()=>localStorage.getItem('thanhdam_token')
export const setToken=token=>token?localStorage.setItem('thanhdam_token',token):localStorage.removeItem('thanhdam_token')
export const API_BASE_URL=(import.meta.env.VITE_API_BASE_URL||'').trim().replace(/\/+$/,'')
export const apiUrl=url=>API_BASE_URL&&!/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(url)?`${API_BASE_URL}/${url.replace(/^\/+/, '')}`:url
export async function apiFetch(url,options={}){
 const {silent=false,...fetchOptions}=options
 if(!silent)window.dispatchEvent(new CustomEvent('api:loading',{detail:1}))
 try {
  const headers=new Headers(fetchOptions.headers||{}),token=getToken();if(token)headers.set('Authorization',`Bearer ${token}`)
  const response=await fetch(apiUrl(url),{...fetchOptions,headers})
  if(response.status===401&&token){setToken(null);window.dispatchEvent(new Event('auth:expired'))}
  return response
 } finally {
  if(!silent)window.dispatchEvent(new CustomEvent('api:loading',{detail:-1}))
 }
}
export async function apiJson(url,{method='GET',body}={}){
 const response=await apiFetch(url,{method,headers:{Accept:'application/json',...(body!==undefined?{'Content-Type':'application/json'}:{})},body:body!==undefined?JSON.stringify(body):undefined})
 const payload=await response.json().catch(()=>({}))
 if(!response.ok)throw Object.assign(new Error(Object.values(payload.errors??{}).flat()[0]??payload.message??'Không thể kết nối máy chủ.'),{status:response.status,payload})
 return payload
}
