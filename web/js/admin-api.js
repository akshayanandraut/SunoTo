const base=import.meta.env.VITE_API_BASE_URL||"http://127.0.0.1:8787/api/v1";
async function call(session,options={}){const response=await fetch(`${base}/admin/ads`,{...options,headers:{"content-type":"application/json",authorization:`Bearer ${session.access_token}`,...options.headers}}),data=await response.json();if(!response.ok)throw new Error(data.error||"Admin request failed");return data;}
export const adminApi={ads:session=>call(session),updateAds:(session,expectedVersion,config)=>call(session,{method:"PUT",body:JSON.stringify({expectedVersion,config})})};
