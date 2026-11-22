const API = import.meta.env.VITE_API_BASE_URL;
export async function apiRequest(path, options={}) {
  if (!API) throw new Error('Backend API is not configured. Set VITE_API_BASE_URL.');
  const response = await fetch(`${API}${path}`, { ...options, headers: { 'Content-Type':'application/json', ...(options.headers||{}) } });
  const data = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}
// Connect these calls to authenticated Cloud Functions before production use.