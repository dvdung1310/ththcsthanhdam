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
