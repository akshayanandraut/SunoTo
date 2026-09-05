import { locationForRadius } from "./geolocation.js";
const base=import.meta.env?.VITE_API_BASE_URL||"http://127.0.0.1:8787/api/v1";
const WEATHER_CODES={0:"Clear",1:"Mostly clear",2:"Partly cloudy",3:"Overcast",45:"Fog",48:"Fog",51:"Drizzle",61:"Rain",63:"Rain",65:"Heavy rain",71:"Snow",73:"Snow",75:"Heavy snow",80:"Showers",95:"Thunderstorm"};
export function weatherLabel(weatherCode){return WEATHER_CODES[weatherCode]||"—";}
export async function ipWeather(fetcher=fetch){const response=await fetcher(`${base}/weather`),data=await response.json();if(!response.ok)throw new Error(data.error||"weather_unavailable");return data;}
export async function preciseWeather(fetcher=fetch){const location=await locationForRadius();const response=await fetcher(`${base}/weather?lat=${location.latitude}&lon=${location.longitude}`),data=await response.json();if(!response.ok)throw new Error(data.error||"weather_unavailable");return data;}
